import os
import re

def replace_zaglushka(root_dir: str, old_src: str = "./zagl.jpg", new_src: str = "/zagl.jpg"):
    pattern = re.compile(re.escape(f'src="{old_src}"'), re.IGNORECASE)
    replacement = f'src="{new_src}"'

    html_files_found = 0
    replacements_made = 0

    for dirpath, _, filenames in os.walk(root_dir):
        for filename in filenames:
            if filename.lower().endswith(".html"):
                filepath = os.path.join(dirpath, filename)

                with open(filepath, "r", encoding="utf-8") as f:
                    content = f.read()

                matches = pattern.findall(content)
                if matches:
                    new_content = pattern.sub(replacement, content)
                    with open(filepath, "w", encoding="utf-8") as f:
                        f.write(new_content)

                    html_files_found += 1
                    replacements_made += len(matches)
                    print(f"[OK] {filepath} — заменено: {len(matches)} вхождений")

    print(f"\nГотово. Файлов изменено: {html_files_found}, замен всего: {replacements_made}")

if __name__ == "__main__":
    root_dir = input("Введите путь к корневой папке: ").strip()
    replace_zaglushka(root_dir)
