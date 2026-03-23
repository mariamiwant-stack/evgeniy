(function(){
  'use strict';

  var API_BASE = window.EPM_API || 'http://localhost:8000';
  var JSON_URL = (window.EPM_CATALOG_JSON || '/eternoprom/catalog-data.json');
  var API = API_BASE + '/api/catalog-structure';
  var ADMIN_TOKEN_KEY = 'epm_admin_token';
  var state = { data:null, snapshots:[], pending:[], context:null, mode:false };

  function text(v){ return (v == null ? '' : String(v)); }
  function esc(v){ return text(v).replace(/[&<>"']/g, function(ch){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]); }); }
  function token(){ try { return localStorage.getItem(ADMIN_TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function isAdmin(){ return !!token(); }
  function authHeaders(extra){ var out = extra || {}; out.Authorization = 'Bearer ' + token(); return out; }
  function pathFromLocation(){ var path=(location.pathname||'').replace(/^\/eternoprom\/?/,'/').replace(/index\.html$/,''); if(!path.endsWith('/')) path+='/'; return path; }
  function getJsonUrl(){ return JSON_URL.indexOf('http') === 0 ? JSON_URL : JSON_URL.replace(/\/\/+/g,'/'); }

  function injectStyles(){
    if (document.getElementById('epm-dynamic-styles')) return;
    var style = document.createElement('style');
    style.id = 'epm-dynamic-styles';
    style.textContent = '\
      .epm-dynamic-section{margin-top:26px;padding-top:10px;}\
      .epm-dynamic-section h2{font-size:24px;color:#001952;margin:0 0 14px;}\
      .epm-admin-note{font-size:12px;color:#8a96ae;line-height:1.6;margin-bottom:14px;}\
      .epm-dynamic-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px;}\
      .epm-dynamic-card{background:#fff;border:1px solid #e8ecf4;border-radius:12px;padding:20px;text-decoration:none;color:inherit;display:flex;flex-direction:column;gap:12px;transition:box-shadow .2s,transform .2s;}\
      .epm-dynamic-card:hover{box-shadow:0 12px 28px rgba(0,25,82,.08);transform:translateY(-2px);}\
      .epm-dynamic-card__title{font-size:15px;font-weight:600;color:#001952;}\
      .epm-dynamic-card__meta{display:flex;flex-direction:column;gap:5px;flex:1;font-size:12px;color:#8a96ae;line-height:1.5;}\
      .epm-dynamic-card__badge{font-size:12px;font-weight:600;color:#8B1A1A;}\
      .epm-dynamic-prod-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;}\
      .epm-dynamic-prod-card{background:#fff;border:1px solid #e8ecf4;border-radius:12px;overflow:hidden;text-decoration:none;color:inherit;display:flex;flex-direction:column;transition:box-shadow .18s;}\
      .epm-dynamic-prod-card:hover{box-shadow:0 4px 20px rgba(0,25,82,.1);}\
      .epm-dynamic-prod-image{width:100%;aspect-ratio:4/3;overflow:hidden;background:#f5f7fa;display:flex;align-items:center;justify-content:center;}\
      .epm-dynamic-prod-image img{width:100%;height:100%;object-fit:cover;}\
      .epm-dynamic-prod-image span{padding:16px;text-align:center;font-size:12px;color:#8a96ae;}\
      .epm-dynamic-prod-body{padding:12px;flex:1;display:flex;flex-direction:column;gap:6px;}\
      .epm-dynamic-prod-title{font-size:13px;font-weight:600;color:#001952;line-height:1.35;}\
      .epm-dynamic-prod-desc{font-size:11px;color:#8a96ae;line-height:1.45;min-height:32px;}\
      .epm-dynamic-prod-footer{margin-top:auto;padding-top:8px;display:flex;align-items:center;justify-content:space-between;gap:10px;}\
      .epm-god-toggle{position:fixed;right:22px;bottom:22px;z-index:99990;border:none;border-radius:999px;padding:14px 18px;background:#001952;color:#fff;font:700 13px Inter,sans-serif;box-shadow:0 14px 34px rgba(0,25,82,.24);cursor:pointer;}\
      .epm-god-panel{position:fixed;top:18px;right:18px;bottom:18px;width:min(470px,calc(100vw - 36px));z-index:99991;background:#fff;border-radius:22px;box-shadow:0 24px 70px rgba(0,25,82,.28);border:1px solid #dfe7f5;display:none;flex-direction:column;overflow:hidden;font-family:Inter,sans-serif;}\
      .epm-god-panel.open{display:flex;}\
      .epm-god-head{padding:18px 18px 14px;background:#001952;color:#fff;}\
      .epm-god-head h3{margin:0 0 8px;font-size:18px;}\
      .epm-god-head p{margin:0;color:rgba(255,255,255,.8);font-size:12px;line-height:1.55;}\
      .epm-god-body{padding:16px;overflow:auto;display:flex;flex-direction:column;gap:14px;background:#f8fbff;}\
      .epm-god-card{background:#fff;border:1px solid #e3ebf7;border-radius:16px;padding:14px;}\
      .epm-god-card h4{margin:0 0 12px;font-size:14px;color:#001952;}\
      .epm-god-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}\
      .epm-god-card input,.epm-god-card textarea{width:100%;padding:10px 12px;border:1px solid #d9e2f0;border-radius:10px;font:500 13px Inter,sans-serif;}\
      .epm-god-card textarea{min-height:90px;resize:vertical;}\
      .epm-god-btns{display:flex;flex-wrap:wrap;gap:8px;}\
      .epm-god-btn{border:none;border-radius:10px;padding:10px 12px;font:700 12px Inter,sans-serif;cursor:pointer;text-decoration:none;}\
      .epm-god-btn.primary{background:#001952;color:#fff;}\
      .epm-god-btn.warn{background:#fff7ed;color:#9a3412;}\
      .epm-god-btn.danger{background:#fff1f2;color:#9f1239;}\
      .epm-god-btn.ghost{background:#fff;border:1px solid #d9e2f0;color:#334155;}\
      .epm-god-item{border:1px solid #e2e8f0;border-radius:14px;padding:12px;background:#fff;}\
      .epm-god-list{display:flex;flex-direction:column;gap:10px;}\
      .epm-god-row{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;}\
      .epm-god-msg{display:none;padding:10px 12px;border-radius:12px;font-size:12px;line-height:1.5;}\
      .epm-god-preview{height:120px;border-radius:14px;background:linear-gradient(135deg,#eaf0ff,#f8fafc);background-size:cover;background-position:center;display:flex;align-items:center;justify-content:center;text-align:center;color:#64748b;font-size:12px;padding:12px;}\
      .epm-god-meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}\
      .epm-god-meta span{padding:5px 8px;border-radius:999px;background:#eef2ff;color:#274690;font-size:11px;font-weight:700;}\
      @media(max-width:767px){.epm-god-grid{grid-template-columns:1fr;}}';
    document.head.appendChild(style);
  }

  function showMsg(message, ok){
    var el = document.getElementById('epmGodMsg');
    if (!el) return;
    el.style.display = 'block';
    el.style.background = ok === false ? '#fff1f2' : '#f0fdf4';
    el.style.color = ok === false ? '#9f1239' : '#166534';
    el.textContent = message;
  }

  function renderCategoryCard(item, kind){
    var count = kind === 'category' ? (item.subcategory_count || 0) + ' подкатегорий' : (item.product_count || 0) + ' карточек';
    return '<a class="epm-dynamic-card" href="' + esc(item.url) + '"><div class="epm-dynamic-card__title">' + esc(item.name) + '</div><div class="epm-dynamic-card__meta"><span>' + esc(item.description || 'Новая карточка добавлена через режим бога.') + '</span></div><span class="epm-dynamic-card__badge">' + esc(count) + ' →</span></a>';
  }

  function renderProductCard(item){
    var image = item.image ? '<img alt="' + esc(item.name) + '" loading="lazy" src="' + esc(item.image) + '">' : '<span>Добавьте фото товара</span>';
    return '<a class="epm-dynamic-prod-card" data-name="' + esc(item.name) + '" data-price="Договорная" data-prod-card="" href="' + esc(item.url) + '"><div class="epm-dynamic-prod-image">' + image + '</div><div class="epm-dynamic-prod-body"><div class="epm-dynamic-prod-title">' + esc(item.name) + '</div><div class="epm-dynamic-prod-desc">' + esc(item.description || 'Пустая карточка создана. Заполните фото и описание через режим бога.') + '</div><div class="epm-dynamic-prod-footer"><span style="font-size:12px;font-weight:700;color:#001952;">Договорная</span><span style="font-size:12px;font-weight:600;color:#8B1A1A;">Смотреть →</span></div></div></a>';
  }

  function mountSection(title, html, container, productMode){
    if (!container || !html) return;
    var wrap = document.createElement('section');
    wrap.className = 'epm-dynamic-section';
    wrap.innerHTML = '<h2>' + esc(title) + '</h2><div class="epm-admin-note">Карточки из JSON-хранилища. Их можно добавлять, редактировать и удалять в режиме бога без правки кода.</div><div class="' + (productMode ? 'epm-dynamic-prod-grid' : 'epm-dynamic-grid') + '">' + html + '</div>';
    container.appendChild(wrap);
  }

  function findContext(data){
    var path = pathFromLocation();
    if (path === '/catalog.html/' || path === '/catalog/' || path === '/') return { pageType:'catalog-root', label:'Главная → Каталог', entityType:'category', parentId:null, items:data.categories || [] };
    if (path.indexOf('/catalog/') !== 0) return null;
    var parts = path.replace(/^\/catalog\//,'').replace(/\/$/,'').split('/').filter(Boolean);
    var cat = (data.categories || []).find(function(item){ return item.slug === parts[0]; });
    if (parts.length === 1 && cat) return { pageType:'category', label:'Каталог → ' + cat.name, entityType:'subcategory', parentId:cat.id, items:cat.subcategories || [], category:cat };
    if (parts.length === 2 && cat) {
      var sub = (cat.subcategories || []).find(function(item){ return item.slug === parts[1]; });
      if (sub) return { pageType:'subcategory', label:'Каталог → ' + cat.name + ' → ' + sub.name, entityType:'product', parentId:sub.id, items:sub.products || [], category:cat, subcategory:sub };
    }
    if (parts.length === 3 && cat) {
      var sub2 = (cat.subcategories || []).find(function(item){ return item.slug === parts[1]; });
      var prod = sub2 && (sub2.products || []).find(function(item){ return item.slug === parts[2]; });
      if (prod) return { pageType:'product', label:'Карточка → ' + prod.name, entityType:'product', parentId:sub2.id, items:[prod], category:cat, subcategory:sub2, product:prod };
    }
    return null;
  }

  function renderCatalogPage(data){
    injectStyles();
    var path = pathFromLocation();
    if (path === '/catalog.html/' || path === '/catalog/' || path === '/') {
      var grid = document.querySelector('.catalog-grid');
      var existing = new Set(Array.from(document.querySelectorAll('.catalog-cat-header')).map(function(a){ return a.getAttribute('href'); }));
      var extras = (data.categories || []).filter(function(cat){ return !existing.has('.' + cat.url) && !existing.has(cat.url); });
      mountSection('Новые категории', extras.map(function(cat){ return renderCategoryCard(cat, 'category'); }).join(''), grid && grid.parentElement, false);
      return;
    }
    if (path.indexOf('/catalog/') !== 0) return;
    var parts = path.replace(/^\/catalog\//,'').replace(/\/$/,'').split('/').filter(Boolean);
    if (parts.length === 1) {
      var category = (data.categories || []).find(function(cat){ return cat.slug === parts[0]; });
      var main = document.querySelector('main');
      if (!category || !main) return;
      var existingLinks = new Set(Array.from(main.querySelectorAll('a[href]')).map(function(a){ return a.getAttribute('href'); }));
      var extrasSub = (category.subcategories || []).filter(function(sub){ return !existingLinks.has(sub.url) && !existingLinks.has('../../catalog/' + category.slug + '/' + sub.slug + '/'); });
      mountSection('Новые подкатегории', extrasSub.map(function(sub){ return renderCategoryCard(sub, 'subcategory'); }).join(''), main, false);
      return;
    }
    if (parts.length === 2) {
      var category2 = (data.categories || []).find(function(cat){ return cat.slug === parts[0]; });
      var subcategory = category2 && (category2.subcategories || []).find(function(sub){ return sub.slug === parts[1]; });
      var main2 = document.querySelector('main');
      if (!category2 || !subcategory || !main2) return;
      var existingProductLinks = Array.from(main2.querySelectorAll('a[href]')).map(function(a){ return a.getAttribute('href'); });
      var extrasProd = (subcategory.products || []).filter(function(product){ return existingProductLinks.indexOf(product.url) === -1 && existingProductLinks.indexOf('../../../catalog/' + category2.slug + '/' + subcategory.slug + '/' + product.slug + '/') === -1; });
      var countEl = document.getElementById('epmProductCount');
      var countMainEl = document.getElementById('epmProductCountMain');
      if (countEl) countEl.textContent = String((parseInt(countEl.textContent || '0', 10) || 0) + extrasProd.length);
      if (countMainEl) countMainEl.textContent = String((parseInt(countMainEl.textContent || '0', 10) || 0) + extrasProd.length);
      mountSection('Новые карточки товаров', extrasProd.map(renderProductCard).join(''), main2, true);
    }
  }

  function ensureGodUi(){
    if (!isAdmin() || document.getElementById('epmGodToggle')) return;
    document.body.insertAdjacentHTML('beforeend',
      '<button id="epmGodToggle" class="epm-god-toggle">Режим бога</button>' +
      '<aside id="epmGodPanel" class="epm-god-panel">' +
      '<div class="epm-god-head"><h3>Режим бога</h3><p>Откройте нужный раздел каталога, создайте пустую карточку, заполните название, фото и описание, затем нажмите «Сохранить всё». Данные сохраняются в JSON на хостинге.</p></div>' +
      '<div class="epm-god-body">' +
      '<div id="epmGodMsg" class="epm-god-msg"></div>' +
      '<section class="epm-god-card"><h4>Что можно сделать</h4><div style="font-size:12px;color:#64748b;line-height:1.65;">1) Откройте нужную страницу каталога. 2) Добавьте карточку или нажмите «Изменить» у существующей. 3) Сохраните все изменения одной кнопкой. Старые и новые карточки можно удалять без знания кода.</div><div class="epm-god-btns" style="margin-top:12px;"><a class="epm-god-btn ghost" href="/eternoprom/admin/index.html" target="_blank" rel="noopener">Открыть админку</a></div></section>' +
      '<section class="epm-god-card"><h4>Контекст страницы</h4><div id="epmGodContext"></div></section>' +
      '<section class="epm-god-card"><h4>Изменения в очереди</h4><div id="epmGodPending"></div><div class="epm-god-btns" style="margin-top:10px;"><button class="epm-god-btn primary" id="epmSaveAll">Сохранить всё</button><button class="epm-god-btn ghost" id="epmDiscardAll">Сбросить черновик</button></div></section>' +
      '<section class="epm-god-card"><h4>Карточки текущего уровня</h4><div id="epmGodItems" class="epm-god-list"></div></section>' +
      '<section class="epm-god-card"><h4>Форма карточки</h4><input type="hidden" id="epmEditId"><div class="epm-god-grid"><input id="epmName" placeholder="Название карточки"><input id="epmSlug" placeholder="Slug / URL часть (можно пусто)"></div><div class="epm-god-grid" style="margin-top:10px;"><input id="epmSort" type="number" placeholder="Порядок" value="0"><input id="epmImage" placeholder="Ссылка на фото"></div><div id="epmPreview" class="epm-god-preview" style="margin-top:10px;">Фото пока не добавлено</div><textarea id="epmDesc" placeholder="Короткое описание или подсказка для менеджера" style="margin-top:10px;"></textarea><div class="epm-god-btns" style="margin-top:10px;"><button class="epm-god-btn primary" id="epmQueueItem">Добавить в черновик</button><button class="epm-god-btn ghost" id="epmResetForm">Очистить форму</button></div></section>' +
      '<section class="epm-god-card"><h4>Точки сохранения</h4><div class="epm-god-btns" style="margin-bottom:10px;"><button class="epm-god-btn warn" id="epmMakeSnapshot">Создать точку сохранения</button></div><div id="epmSnapshots" class="epm-god-list"></div></section>' +
      '</div></aside>'
    );
    document.getElementById('epmGodToggle').onclick = function(){ state.mode = !state.mode; document.getElementById('epmGodPanel').classList.toggle('open', state.mode); };
    document.getElementById('epmResetForm').onclick = resetForm;
    document.getElementById('epmQueueItem').onclick = queueUpsert;
    document.getElementById('epmDiscardAll').onclick = function(){ if (confirm('Сбросить все несохранённые изменения?')) { state.pending = []; renderGodMode(); } };
    document.getElementById('epmSaveAll').onclick = saveAll;
    document.getElementById('epmMakeSnapshot').onclick = createSnapshot;
    document.getElementById('epmImage').addEventListener('input', syncPreviewFromInput);
  }

  function syncPreviewFromInput(){
    var input = document.getElementById('epmImage');
    var preview = document.getElementById('epmPreview');
    if (!input || !preview) return;
    var value = input.value.trim();
    preview.style.backgroundImage = value ? 'linear-gradient(rgba(255,255,255,.08),rgba(255,255,255,.08)),url("' + value.replace(/"/g, '') + '")' : 'linear-gradient(135deg,#eaf0ff,#f8fafc)';
    preview.textContent = value ? 'Предпросмотр фото карточки' : 'Фото пока не добавлено';
  }

  function resetForm(){
    ['epmEditId','epmName','epmSlug','epmImage','epmDesc'].forEach(function(id){ var el = document.getElementById(id); if (el) el.value = ''; });
    var sort = document.getElementById('epmSort'); if (sort) sort.value = '0';
    syncPreviewFromInput();
  }

  function queueUpsert(){
    if (!state.context) return showMsg('Откройте страницу каталога, где должны отображаться карточки.', false);
    var name = document.getElementById('epmName').value.trim();
    if (!name) return showMsg('Введите название карточки.', false);
    var editId = document.getElementById('epmEditId').value;
    state.pending.push({
      action: editId ? 'update' : 'create',
      id: editId ? Number(editId) : null,
      entity_type: state.context.entityType,
      parent_id: state.context.parentId,
      name: name,
      slug: document.getElementById('epmSlug').value.trim(),
      image: document.getElementById('epmImage').value.trim(),
      description: document.getElementById('epmDesc').value.trim(),
      sort_order: Number(document.getElementById('epmSort').value || 0),
      is_active: true
    });
    resetForm();
    renderGodMode();
    showMsg('Черновик подготовлен. Нажмите «Сохранить всё».', true);
  }

  function editItem(id){
    var item = (state.context && state.context.items || []).find(function(entry){ return entry.id === id; });
    if (!item) return;
    document.getElementById('epmEditId').value = item.id;
    document.getElementById('epmName').value = item.name || '';
    document.getElementById('epmSlug').value = item.slug || '';
    document.getElementById('epmImage').value = item.image || '';
    document.getElementById('epmDesc').value = item.description || '';
    document.getElementById('epmSort').value = item.sort_order || 0;
    syncPreviewFromInput();
  }

  function queueDelete(id, name){
    if (!confirm('Удалить «' + (name || 'элемент') + '»? Для разделов вложенные карточки тоже будут удалены.')) return;
    state.pending.push({ action:'delete', id:id, name:name });
    renderGodMode();
  }

  async function createSnapshot(){
    try {
      var label = prompt('Название точки сохранения:', 'Ручная точка сохранения');
      if (label === null) return;
      var res = await fetch(API_BASE + '/api/admin/snapshots', { method:'POST', headers:authHeaders({'Content-Type':'application/json'}), body:JSON.stringify({ label:label }) });
      if (!res.ok) throw new Error();
      showMsg('Точка сохранения создана.', true);
      await loadSnapshots();
    } catch (e) { showMsg('Не удалось создать точку сохранения.', false); }
  }

  async function restoreSnapshot(id){
    if (!confirm('Откатить каталог к выбранной точке сохранения?')) return;
    try {
      var res = await fetch(API_BASE + '/api/admin/snapshots/' + id + '/restore', { method:'POST', headers:authHeaders({}) });
      if (!res.ok) throw new Error();
      showMsg('Каталог восстановлен. Страница перезагрузится.', true);
      setTimeout(function(){ location.reload(); }, 900);
    } catch (e) { showMsg('Не удалось восстановить точку сохранения.', false); }
  }

  async function saveAll(){
    try {
      for (var i = 0; i < state.pending.length; i++) {
        var item = state.pending[i];
        var res;
        if (item.action === 'create') {
          res = await fetch(API_BASE + '/api/admin/catalog/entities', { method:'POST', headers:authHeaders({'Content-Type':'application/json'}), body:JSON.stringify(item) });
        } else if (item.action === 'update') {
          res = await fetch(API_BASE + '/api/admin/catalog/entities/' + item.id, { method:'PUT', headers:authHeaders({'Content-Type':'application/json'}), body:JSON.stringify(item) });
        } else {
          res = await fetch(API_BASE + '/api/admin/catalog/entities/' + item.id, { method:'DELETE', headers:authHeaders({}) });
        }
        if (!res.ok) throw new Error();
      }
      state.pending = [];
      showMsg('Все изменения сохранены в JSON. Страница будет обновлена.', true);
      setTimeout(function(){ location.reload(); }, 900);
    } catch (e) { showMsg('Не удалось сохранить изменения.', false); }
  }

  async function loadSnapshots(){
    if (!isAdmin()) return;
    try {
      var res = await fetch(API_BASE + '/api/admin/snapshots', { headers:authHeaders({}) });
      state.snapshots = res.ok ? await res.json() : [];
    } catch (e) { state.snapshots = []; }
    renderGodMode();
  }

  function renderGodMode(){
    ensureGodUi();
    if (!isAdmin() || !state.context) return;
    var ctx = document.getElementById('epmGodContext');
    if (ctx) ctx.innerHTML = '<strong>' + esc(state.context.label) + '</strong><div class="epm-god-meta"><span>Уровень: ' + esc(state.context.pageType) + '</span><span>Карточек: ' + (state.context.items || []).length + '</span><span>Черновик: ' + state.pending.length + '</span></div>';
    var pending = document.getElementById('epmGodPending');
    if (pending) pending.innerHTML = state.pending.length ? '<div class="epm-god-list">' + state.pending.map(function(item, index){ return '<div class="epm-god-item"><div class="epm-god-row"><strong>' + (item.action === 'delete' ? 'Удаление' : (item.action === 'update' ? 'Редактирование' : 'Новая карточка')) + '</strong><span style="font-size:12px;color:#64748b;">#' + (index + 1) + '</span></div><div style="margin-top:6px;font-size:12px;color:#475569;">' + esc(item.name || item.entity_type) + '</div></div>'; }).join('') + '</div>' : '<small style="color:#64748b;">Изменений пока нет.</small>';
    var items = document.getElementById('epmGodItems');
    if (items) items.innerHTML = (state.context.items || []).map(function(item){ return '<div class="epm-god-item"><div class="epm-god-row"><div><strong>' + esc(item.name) + '</strong><small style="display:block;color:#64748b;margin-top:4px;line-height:1.5;">' + esc(item.description || item.url || 'Описание пока не заполнено') + '</small></div><div class="epm-god-btns"><button class="epm-god-btn ghost" data-edit="' + item.id + '">Изменить</button><button class="epm-god-btn danger" data-del="' + item.id + '">Удалить</button></div></div></div>'; }).join('') || '<small style="color:#64748b;">На этом уровне пока нет карточек.</small>';
    Array.from(document.querySelectorAll('[data-edit]')).forEach(function(btn){ btn.onclick = function(){ editItem(Number(this.getAttribute('data-edit'))); }; });
    Array.from(document.querySelectorAll('[data-del]')).forEach(function(btn){ btn.onclick = function(){ var id = Number(this.getAttribute('data-del')); var current = (state.context.items || []).find(function(x){ return x.id === id; }); queueDelete(id, current && current.name); }; });
    var snaps = document.getElementById('epmSnapshots');
    if (snaps) snaps.innerHTML = state.snapshots.map(function(item){ return '<div class="epm-god-item"><div class="epm-god-row"><div><strong>' + esc(item.label) + '</strong><small style="display:block;color:#64748b;margin-top:4px;">' + esc(item.created_at) + '</small></div><button class="epm-god-btn warn" data-snap="' + item.id + '">Откатить</button></div></div>'; }).join('') || '<small style="color:#64748b;">Точек сохранения пока нет.</small>';
    Array.from(document.querySelectorAll('[data-snap]')).forEach(function(btn){ btn.onclick = function(){ restoreSnapshot(Number(this.getAttribute('data-snap'))); }; });
  }

  async function loadAdminState(){ if (isAdmin()) await loadSnapshots(); }

  function fetchCatalogData(){
    return fetch(getJsonUrl(), { cache:'no-store' }).then(function(r){ return r.ok ? r.json() : Promise.reject(new Error('json')); }).catch(function(){ return fetch(API, { cache:'no-store' }).then(function(r){ return r.ok ? r.json() : null; }); });
  }

  fetchCatalogData().then(function(data){
    if (!data) return;
    state.data = data;
    state.context = findContext(data);
    renderCatalogPage(data);
    loadAdminState();
    renderGodMode();
  }).catch(function(){});
})();
