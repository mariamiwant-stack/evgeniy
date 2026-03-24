(function () {
  'use strict';

  var EDIT_FLAG_KEY = 'epm_edit_mode';
  var ADMIN_TOKEN_KEY = 'epm_admin_token';
  var STORAGE_KEY = 'epm_page_' + (location.pathname || '/');

  function isEnabled() {
    try {
      var flag = localStorage.getItem(EDIT_FLAG_KEY);
      if (flag === '1') return true;
      if (flag === '0') return false;
      if (localStorage.getItem(ADMIN_TOKEN_KEY)) return true;
    } catch (e) {}
    return /(?:\?|&)epm_edit=1(?:&|$)/.test(location.search || '');
  }

  function saveMarkup(container) {
    if (!container) return;
    try { localStorage.setItem(STORAGE_KEY, container.innerHTML); } catch (e) {}
  }

  function restoreMarkup(container) {
    if (!container) return;
    try {
      var html = localStorage.getItem(STORAGE_KEY);
      if (html) container.innerHTML = html;
    } catch (e) {}
  }

  function pageConfig() {
    var catalogGrid = document.querySelector('.catalog-grid');
    if (catalogGrid && catalogGrid.querySelector('.catalog-cat-card')) {
      return {
        type: 'root',
        container: catalogGrid,
        itemSelector: '.catalog-cat-card',
        makeNewCard: function () {
          var tpl = catalogGrid.querySelector('.catalog-cat-card');
          if (!tpl) return null;
          var card = tpl.cloneNode(true);
          var head = card.querySelector('.catalog-cat-header');
          if (head) head.href = '#';
          var title = card.querySelector('.catalog-cat-name');
          if (title) title.textContent = 'Новая категория';
          var list = card.querySelector('.catalog-sublist');
          if (list) list.innerHTML = '';
          return card;
        },
        readCard: function (card) {
          var head = card.querySelector('.catalog-cat-header');
          var title = card.querySelector('.catalog-cat-name');
          var links = Array.from(card.querySelectorAll('.catalog-sublist a')).map(function (a) {
            return (a.textContent || '').trim() + '|' + (a.getAttribute('href') || '');
          }).join('\n');
          return {
            title: title ? (title.textContent || '').trim() : '',
            href: head ? (head.getAttribute('href') || '') : '',
            details: links
          };
        },
        writeCard: function (card, data) {
          var head = card.querySelector('.catalog-cat-header');
          var title = card.querySelector('.catalog-cat-name');
          var list = card.querySelector('.catalog-sublist');
          if (head) head.setAttribute('href', data.href || '#');
          if (title) title.textContent = data.title || 'Без названия';
          if (list) {
            list.innerHTML = '';
            (data.details || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (line) {
              var parts = line.split('|');
              var text = (parts[0] || '').trim();
              var href = (parts[1] || '#').trim() || '#';
              var li = document.createElement('li');
              var a = document.createElement('a');
              a.href = href;
              a.textContent = text || href;
              li.appendChild(a);
              list.appendChild(li);
            });
          }
        }
      };
    }

    var productGrid = document.getElementById('epmProductGrid');
    if (productGrid && productGrid.querySelector('a')) {
      return {
        type: 'product',
        container: productGrid,
        itemSelector: 'a',
        makeNewCard: function () {
          var tpl = productGrid.querySelector('a');
          if (!tpl) return null;
          var card = tpl.cloneNode(true);
          card.href = '#';
          var img = card.querySelector('img');
          if (img) {
            img.src = '';
            img.alt = 'Новый товар';
          }
          var title = card.querySelector('div[style*="font-size:13px"][style*="font-weight:600"]');
          if (title) title.textContent = 'Новый товар';
          var desc = card.querySelector('div[style*="font-size:11px"][style*="#8a96ae"]');
          if (desc) desc.textContent = 'Описание';
          return card;
        },
        readCard: function (card) {
          var title = card.querySelector('div[style*="font-size:13px"][style*="font-weight:600"]');
          var desc = card.querySelector('div[style*="font-size:11px"][style*="#8a96ae"]');
          var img = card.querySelector('img');
          return {
            title: title ? (title.textContent || '').trim() : '',
            href: card.getAttribute('href') || '',
            details: desc ? (desc.textContent || '').trim() : '',
            image: img ? (img.getAttribute('src') || '') : ''
          };
        },
        writeCard: function (card, data) {
          card.setAttribute('href', data.href || '#');
          var title = card.querySelector('div[style*="font-size:13px"][style*="font-weight:600"]');
          var desc = card.querySelector('div[style*="font-size:11px"][style*="#8a96ae"]');
          var img = card.querySelector('img');
          if (title) title.textContent = data.title || 'Без названия';
          if (desc) desc.textContent = data.details || '';
          if (img && data.image != null) {
            img.setAttribute('src', data.image || '');
            img.setAttribute('alt', data.title || 'Товар');
          }
          card.setAttribute('data-name', data.title || '');
        }
      };
    }

    var subGrid = document.querySelector('main > div[style*="display:grid"]');
    if (subGrid && subGrid.querySelector('a')) {
      return {
        type: 'branch',
        container: subGrid,
        itemSelector: 'a',
        makeNewCard: function () {
          var tpl = subGrid.querySelector('a');
          if (!tpl) return null;
          var card = tpl.cloneNode(true);
          card.href = '#';
          var title = card.querySelector('div[style*="font-size:15px"][style*="font-weight:600"]');
          if (title) title.textContent = 'Новая ветка';
          var meta = card.querySelector('div[style*="flex-direction:column"]');
          if (meta) meta.innerHTML = '';
          var cta = card.querySelector('span[style*="font-size:12px"][style*="#8B1A1A"]');
          if (cta) cta.textContent = 'Смотреть →';
          return card;
        },
        readCard: function (card) {
          var title = card.querySelector('div[style*="font-size:15px"][style*="font-weight:600"]');
          var meta = card.querySelector('div[style*="flex-direction:column"]');
          var lines = meta ? Array.from(meta.querySelectorAll('span')).map(function (s) { return (s.textContent || '').trim(); }).filter(Boolean).join('\n') : '';
          return {
            title: title ? (title.textContent || '').trim() : '',
            href: card.getAttribute('href') || '',
            details: lines
          };
        },
        writeCard: function (card, data) {
          card.setAttribute('href', data.href || '#');
          var title = card.querySelector('div[style*="font-size:15px"][style*="font-weight:600"]');
          var meta = card.querySelector('div[style*="flex-direction:column"]');
          var cta = card.querySelector('span[style*="font-size:12px"][style*="#8B1A1A"]');
          if (title) title.textContent = data.title || 'Без названия';
          if (meta) {
            meta.innerHTML = '';
            (data.details || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (line) {
              var span = document.createElement('span');
              span.style.cssText = 'font-size:12px;color:#8a96ae;display:flex;align-items:center;gap:6px;';
              var dot = document.createElement('span');
              dot.style.cssText = 'width:4px;height:4px;border-radius:50%;background:#c8d4ec;flex-shrink:0;display:inline-block;';
              span.appendChild(dot);
              span.appendChild(document.createTextNode(line));
              meta.appendChild(span);
            });
          }
          if (cta) cta.textContent = (data.details || '').trim() ? ((data.details || '').split('\n').filter(Boolean).length + ' позиций →') : 'Смотреть →';
        }
      };
    }
    return null;
  }

  function injectStyles() {
    if (document.getElementById('epmEditorStyles')) return;
    var style = document.createElement('style');
    style.id = 'epmEditorStyles';
    style.textContent = '.epm-edit-toggle{position:fixed;right:18px;bottom:18px;z-index:100001;border:none;border-radius:999px;background:#001952;color:#fff;padding:12px 16px;font:700 12px Inter,sans-serif;box-shadow:0 10px 30px rgba(0,25,82,.3);cursor:pointer}.epm-edit-panel{position:fixed;inset:16px 16px auto auto;width:min(420px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;background:#fff;border:1px solid #dce6f5;border-radius:14px;z-index:100002;box-shadow:0 20px 60px rgba(0,25,82,.25);padding:14px;display:none;font-family:Inter,sans-serif}.epm-edit-panel.open{display:block}.epm-edit-panel h3{margin:0 0 10px;color:#001952}.epm-edit-row{display:flex;gap:8px;margin:8px 0}.epm-edit-row input,.epm-edit-row textarea{width:100%;padding:8px 10px;border:1px solid #d4deef;border-radius:8px;font:500 12px Inter,sans-serif}.epm-edit-row textarea{min-height:84px}.epm-edit-list{display:flex;flex-direction:column;gap:6px;margin-top:10px}.epm-edit-item{border:1px solid #e5ebf7;border-radius:10px;padding:8px}.epm-edit-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.epm-edit-btn{border:none;border-radius:8px;padding:7px 10px;font:700 11px Inter,sans-serif;cursor:pointer}.epm-edit-btn.main{background:#001952;color:#fff}.epm-edit-btn.ghost{background:#f1f5fb;color:#243b68}.epm-edit-btn.danger{background:#fff1f2;color:#9f1239}';
    document.head.appendChild(style);
  }

  function bootEditor() {
    var cfg = pageConfig();
    if (!cfg) return;
    restoreMarkup(cfg.container);
    if (!isEnabled()) return;

    injectStyles();

    var selected = -1;

    var toggle = document.createElement('button');
    toggle.className = 'epm-edit-toggle';
    toggle.textContent = '✏ Редактировать';

    var panel = document.createElement('aside');
    panel.className = 'epm-edit-panel';
    panel.innerHTML = [
      '<h3>Редактор карточек</h3>',
      '<div class="epm-edit-row"><input id="epmEditTitle" placeholder="Название"></div>',
      '<div class="epm-edit-row"><input id="epmEditHref" placeholder="URL / путь"></div>',
      '<div class="epm-edit-row" id="epmImgRow" style="display:' + (cfg.type === 'product' ? 'flex' : 'none') + ';"><input id="epmEditImg" placeholder="Ссылка на изображение"></div>',
      '<div class="epm-edit-row"><textarea id="epmEditDetails" placeholder="Подпункты/описание. Каждая строка — новый пункт"></textarea></div>',
      '<div class="epm-edit-actions"><button class="epm-edit-btn main" id="epmApply">Сохранить карточку</button><button class="epm-edit-btn ghost" id="epmAdd">+ Добавить</button><button class="epm-edit-btn ghost" id="epmUp">↑</button><button class="epm-edit-btn ghost" id="epmDown">↓</button><button class="epm-edit-btn danger" id="epmDel">Удалить</button></div>',
      '<div class="epm-edit-list" id="epmEditList"></div>'
    ].join('');

    function cards() { return Array.from(cfg.container.querySelectorAll(cfg.itemSelector)); }

    function refreshList() {
      var list = panel.querySelector('#epmEditList');
      list.innerHTML = '';
      cards().forEach(function (card, idx) {
        var d = cfg.readCard(card);
        var item = document.createElement('button');
        item.type = 'button';
        item.className = 'epm-edit-item';
        item.style.cssText = 'text-align:left;background:' + (selected === idx ? '#eef4ff' : '#fff') + ';cursor:pointer';
        item.textContent = (idx + 1) + '. ' + (d.title || 'Без названия');
        item.onclick = function () { selected = idx; fillForm(); refreshList(); };
        list.appendChild(item);
      });
    }

    function fillForm() {
      var cs = cards();
      if (selected < 0 || !cs[selected]) return;
      var d = cfg.readCard(cs[selected]);
      panel.querySelector('#epmEditTitle').value = d.title || '';
      panel.querySelector('#epmEditHref').value = d.href || '';
      panel.querySelector('#epmEditDetails').value = d.details || '';
      var imgInput = panel.querySelector('#epmEditImg');
      if (imgInput) imgInput.value = d.image || '';
    }

    function applyForm() {
      var cs = cards();
      if (selected < 0 || !cs[selected]) return;
      cfg.writeCard(cs[selected], {
        title: panel.querySelector('#epmEditTitle').value.trim(),
        href: panel.querySelector('#epmEditHref').value.trim(),
        details: panel.querySelector('#epmEditDetails').value,
        image: panel.querySelector('#epmEditImg') ? panel.querySelector('#epmEditImg').value.trim() : ''
      });
      saveMarkup(cfg.container);
      refreshList();
    }

    panel.querySelector('#epmApply').onclick = applyForm;
    panel.querySelector('#epmAdd').onclick = function () {
      var card = cfg.makeNewCard();
      if (!card) return;
      cfg.container.appendChild(card);
      selected = cards().length - 1;
      fillForm();
      saveMarkup(cfg.container);
      refreshList();
    };
    panel.querySelector('#epmDel').onclick = function () {
      var cs = cards();
      if (selected < 0 || !cs[selected]) return;
      if (!confirm('Удалить карточку?')) return;
      cs[selected].remove();
      selected = Math.min(selected, cards().length - 1);
      if (selected >= 0) fillForm();
      saveMarkup(cfg.container);
      refreshList();
    };
    panel.querySelector('#epmUp').onclick = function () {
      var cs = cards();
      if (selected <= 0 || !cs[selected]) return;
      cfg.container.insertBefore(cs[selected], cs[selected - 1]);
      selected -= 1;
      saveMarkup(cfg.container);
      refreshList();
    };
    panel.querySelector('#epmDown').onclick = function () {
      var cs = cards();
      if (selected < 0 || selected >= cs.length - 1) return;
      cfg.container.insertBefore(cs[selected + 1], cs[selected]);
      selected += 1;
      saveMarkup(cfg.container);
      refreshList();
    };

    toggle.onclick = function () {
      panel.classList.toggle('open');
      if (panel.classList.contains('open')) {
        if (selected === -1 && cards().length) selected = 0;
        fillForm();
        refreshList();
      }
    };

    document.body.appendChild(toggle);
    document.body.appendChild(panel);

    window.addEventListener('storage', function (evt) {
      if (evt && evt.key === EDIT_FLAG_KEY) location.reload();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootEditor);
  } else {
    bootEditor();
  }
})();
