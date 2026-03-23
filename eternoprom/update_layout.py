#!/usr/bin/env python3
"""
update_layout.py — Берёт header и footer из index.html в корне проекта
и вставляет их во ВСЕ остальные .html файлы (рекурсивно).
Также подключает epm-header.css и epm-footer.css из корня.

Использование:
    python3 update_layout.py /путь/к/корню/сайта
    python3 update_layout.py /путь/к/корню/сайта --dry-run

Если путь не указан — работает в текущей директории.
--dry-run — показать что изменится, но не записывать.
"""

import os
import re
import sys


# ─── ШАГ 1: Извлечь эталоны из index.html ──────────────────────────

def extract_block(html: str, tag: str, class_name: str) -> str:
    """Вытащить блок <tag class="class_name">...</tag> из HTML."""
    pattern = rf'(<{tag}\s+class=["\'](?:[^"\']*\s)?{class_name}(?:\s[^"\']*)?["\'][^>]*>.*?</{tag}>)'
    match = re.search(pattern, html, flags=re.DOTALL)
    if not match:
        return None
    return match.group(1)


def extract_modal_and_script(html: str) -> str:
    """Вытащить последний блок <div id="epmModal">...</div> + скрипт после него."""
    # Ищем ВСЕ модалки, берём последнюю (она обычно с fetch API)
    # Модалка: <div id="epmModal" ...>...(вложенные div)...</div></div></div>
    # + скрипт epmCallbackForm после неё
    
    # Найдём позицию последнего epmModal
    matches = list(re.finditer(r'<div\s+id=["\']epmModal["\']', html))
    if not matches:
        return None
    
    last_pos = matches[-1].start()
    tail = html[last_pos:]
    
    # Берём от <div id="epmModal" до </body> (не включая)
    end = tail.find('</body>')
    if end == -1:
        end = len(tail)
    
    return tail[:end].strip()


# ─── ШАГ 2: Подстановка путей ──────────────────────────────────────

def get_relative_root(file_path: str, site_root: str) -> str:
    """Относительный путь от папки файла до корня сайта.
    
    index.html          → .
    catalog/page.html   → ..
    catalog/sub/p.html  → ../..
    """
    rel = os.path.relpath(site_root, os.path.dirname(file_path))
    return rel.replace('\\', '/')


def rebase_paths(html_block: str, from_root: str, to_root: str) -> str:
    """Пересчитать относительные пути в HTML-блоке.
    
    Заменяет href="./...", src="./..." на href="{to_root}/..."
    Работает с путями начинающимися на ./ (относительные от корня).
    """
    if from_root == to_root:
        return html_block
    
    # Заменяем ./ в начале путей на нужный корень
    # href="./catalog.html" → href="../catalog.html"  (если to_root="..")
    # src="./images/logo.png" → src="../../images/logo.png"
    
    def replace_path(match):
        attr = match.group(1)   # href= или src=
        quote = match.group(2)  # " или '
        path = match.group(3)   # остаток пути после ./
        return f'{attr}{quote}{to_root}/{path}'
    
    result = re.sub(
        r'((?:href|src|action)=["\'])\./([^"\']*["\'])',
        lambda m: f'{m.group(1)}{to_root}/{m.group(2)}',
        html_block
    )
    
    return result


# ─── ШАГ 3: Замена блоков в целевом файле ──────────────────────────

def replace_block(html: str, tag: str, class_name: str, new_block: str) -> tuple:
    """Заменить <tag class="class_name">...</tag> на new_block.
    Возвращает (новый_html, была_ли_замена).
    """
    pattern = rf'<{tag}\s+class=["\'](?:[^"\']*\s)?{class_name}(?:\s[^"\']*)?["\'][^>]*>.*?</{tag}>'
    if re.search(pattern, html, flags=re.DOTALL):
        result = re.sub(pattern, new_block, html, count=1, flags=re.DOTALL)
        return result, True
    return html, False


def remove_all_modals(html: str) -> str:
    """Удалить ВСЕ блоки <div id="epmModal"> и связанные скрипты.
    
    Стратегия: находим первое вхождение <div id="epmModal" и вырезаем
    всё от него до </body>. Потом вставляем </body> обратно.
    Это надёжнее, чем пытаться матчить вложенные div.
    """
    # Находим первое вхождение модалки
    match = re.search(r'<div\s+id=["\']epmModal["\']', html)
    if not match:
        return html
    
    pos = match.start()
    
    # Ищем </body> после модалки
    body_end = html.find('</body>', pos)
    if body_end == -1:
        body_end = len(html)
    
    # Вырезаем всё между позицией модалки и </body>
    html = html[:pos].rstrip() + '\n' + html[body_end:]
    
    return html


def inject_css_js(html: str, root: str) -> tuple:
    """Подключить epm-header.css, epm-footer.css перед </head>.
    Возвращает (html, было_ли_изменение).
    """
    changed = False
    
    # Удаляем старые подключения этих файлов (чтобы не дублировать)
    for pattern in [
        r'<link[^>]*epm-header\.css[^>]*/?>',
        r'<link[^>]*epm-footer\.css[^>]*/?>',
    ]:
        if re.search(pattern, html):
            html = re.sub(pattern, '', html)
            changed = True
    
    # Формируем строку подключения
    links = (
        f'<link href="{root}/epm-header.css" rel="stylesheet"/>'
        f'<link href="{root}/epm-footer.css" rel="stylesheet"/>'
    )
    
    # Вставляем перед </head>
    if '</head>' in html:
        html = html.replace('</head>', links + '</head>')
        changed = True
    
    return html, changed


# ─── ШАГ 4: Обработка одного файла ─────────────────────────────────

def process_file(file_path: str, site_root: str,
                 ref_header: str, ref_footer: str, ref_modal: str,
                 dry_run: bool = False) -> dict:
    """Обработать один HTML файл."""
    
    root = get_relative_root(file_path, site_root)
    
    with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
        original = f.read()
    
    html = original
    changes = []
    
    # Пересчитываем пути в эталонах под глубину этого файла
    header = rebase_paths(ref_header, '.', root)
    footer = rebase_paths(ref_footer, '.', root)
    modal = rebase_paths(ref_modal, '.', root) if ref_modal else None
    
    # 1. Header
    html, did = replace_block(html, 'header', 'epm-header', header)
    changes.append(f'header {"заменён" if did else "НЕ НАЙДЕН"}')
    
    # 2. Footer
    html, did = replace_block(html, 'footer', 'epm-footer', footer)
    changes.append(f'footer {"заменён" if did else "НЕ НАЙДЕН"}')
    
    # 3. Модалки — удалить все, вставить эталонную
    modal_count = len(re.findall(r'id=["\']epmModal["\']', html))
    if modal_count > 0 and modal:
        html = remove_all_modals(html)
        html = html.replace('</body>', modal + '\n</body>')
        changes.append(f'модалки: {modal_count} → 1')
    
    # 4. CSS подключение
    html, did = inject_css_js(html, root)
    if did:
        changes.append('CSS подключены')
    
    # Чистим лишние пустые строки
    html = re.sub(r'\n{3,}', '\n\n', html)
    
    if html != original:
        if not dry_run:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(html)
        return {'status': 'ОБНОВЛЁН', 'changes': changes}
    
    return {'status': 'без изменений', 'changes': changes}


# ─── ШАГ 5: Обход файлов и запуск ──────────────────────────────────

def find_html_files(root_dir: str) -> list:
    """Рекурсивно найти все .html."""
    result = []
    for dirpath, dirnames, filenames in os.walk(root_dir):
        dirnames[:] = [d for d in dirnames if not d.startswith('.') and d != 'node_modules']
        for f in sorted(filenames):
            if f.endswith('.html'):
                result.append(os.path.join(dirpath, f))
    return result


def main():
    site_root = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('-') else '.')
    dry_run = '--dry-run' in sys.argv
    
    index_path = os.path.join(site_root, 'index.html')
    
    # ── Проверки ──
    if not os.path.isfile(index_path):
        print(f'❌ Файл {index_path} не найден!')
        print(f'   Скрипт берёт header и footer из index.html в корне проекта.')
        sys.exit(1)
    
    # ── Читаем index.html ──
    with open(index_path, 'r', encoding='utf-8') as f:
        index_html = f.read()
    
    ref_header = extract_block(index_html, 'header', 'epm-header')
    ref_footer = extract_block(index_html, 'footer', 'epm-footer')
    ref_modal = extract_modal_and_script(index_html)
    
    if not ref_header:
        print('❌ В index.html не найден <header class="epm-header">!')
        sys.exit(1)
    if not ref_footer:
        print('❌ В index.html не найден <footer class="epm-footer">!')
        sys.exit(1)
    
    # ── Вывод ──
    print(f'╔══════════════════════════════════════════════╗')
    print(f'║  Обновление header/footer из index.html      ║')
    print(f'╚══════════════════════════════════════════════╝')
    print()
    print(f'Корень:        {site_root}')
    print(f'Эталон:        index.html')
    print(f'Header:        {len(ref_header)} символов')
    print(f'Footer:        {len(ref_footer)} символов')
    print(f'Модалка:       {"да" if ref_modal else "нет"}')
    if dry_run:
        print(f'Режим:         ПРОСМОТР (--dry-run)')
    print()
    
    # ── Ищем все HTML ──
    html_files = find_html_files(site_root)
    
    # Исключаем сам index.html — он эталон, его не трогаем
    html_files = [f for f in html_files if os.path.abspath(f) != os.path.abspath(index_path)]
    
    if not html_files:
        print('Других HTML файлов не найдено.')
        sys.exit(0)
    
    print(f'Файлов для обработки: {len(html_files)}')
    print(f'{"─" * 60}')
    
    updated = 0
    skipped = 0
    
    for fpath in html_files:
        rel = os.path.relpath(fpath, site_root)
        result = process_file(fpath, site_root, ref_header, ref_footer, ref_modal, dry_run)
        
        if result['status'] == 'ОБНОВЛЁН':
            updated += 1
            print(f'✅ {rel}')
        else:
            skipped += 1
            print(f'⏭️  {rel}')
        
        for c in result['changes']:
            print(f'   └─ {c}')
    
    print(f'{"─" * 60}')
    print(f'Итого: {updated} обновлено, {skipped} без изменений')
    print(f'index.html НЕ тронут (это эталон)')
    
    if dry_run:
        print(f'\nЗапустите без --dry-run чтобы применить.')


if __name__ == '__main__':
    main()
