(function(){
  'use strict';

  var API_BASE = window.EPM_API || 'http://localhost:8000';
  var API = API_BASE + '/api/catalog-structure';
  var ADMIN_TOKEN_KEY = 'epm_admin_token';
  var state = { data:null, snapshots:[], pending:[], context:null, mode:false };

  function text(s){ return (s || '').toString(); }
  function esc(s){ return text(s).replace(/[&<>"']/g, function(ch){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]); }); }
  function token(){ try { return localStorage.getItem(ADMIN_TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function isAdmin(){ return !!token(); }
  function pathFromLocation(){ var path=(location.pathname||'').replace(/^\/eternoprom\/?/,'/').replace(/index\.html$/,''); if(!path.endsWith('/')) path+='/'; return path; }
  function authHeaders(extra){ var out=extra||{}; out.Authorization='Bearer '+token(); return out; }

  function injectStyles(){
    if(document.getElementById('epm-dynamic-styles')) return;
    var style=document.createElement('style');
    style.id='epm-dynamic-styles';
    style.textContent='\
    .epm-dynamic-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px;}\
    .epm-dynamic-card{background:#fff;border:1px solid #e8ecf4;border-radius:12px;padding:20px;text-decoration:none;color:inherit;display:flex;flex-direction:column;gap:10px;transition:transform .18s,box-shadow .18s;}\
    .epm-dynamic-card:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(0,25,82,.08);}\
    .epm-dynamic-card__title{font-size:16px;font-weight:700;color:#001952;}\
    .epm-dynamic-card__meta{font-size:13px;color:#8a96ae;line-height:1.5;}\
    .epm-dynamic-card__badge{margin-top:auto;font-size:12px;font-weight:700;color:#8B1A1A;}\
    .epm-dynamic-section{margin-top:24px;padding-top:8px;}\
    .epm-dynamic-section h2{font-size:24px;color:#001952;margin:0 0 16px;}\
    .epm-admin-note{font-size:12px;color:#8a96ae;margin-bottom:16px;}\
    .epm-god-toggle{position:fixed;right:22px;bottom:22px;z-index:99990;border:none;border-radius:999px;padding:14px 18px;background:#001952;color:#fff;font:700 13px Inter,sans-serif;box-shadow:0 14px 34px rgba(0,25,82,.24);cursor:pointer;}\
    .epm-god-panel{position:fixed;top:18px;right:18px;bottom:18px;width:min(430px,calc(100vw - 36px));z-index:99991;background:#fff;border-radius:22px;box-shadow:0 24px 70px rgba(0,25,82,.28);border:1px solid #dfe7f5;display:none;flex-direction:column;overflow:hidden;font-family:Inter,sans-serif;}\
    .epm-god-panel.open{display:flex;}\
    .epm-god-head{padding:18px 18px 14px;background:#001952;color:#fff;}\
    .epm-god-head h3{margin:0 0 8px;font-size:18px;}\
    .epm-god-head p{margin:0;color:rgba(255,255,255,.8);font-size:12px;line-height:1.5;}\
    .epm-god-body{padding:16px;overflow:auto;display:flex;flex-direction:column;gap:14px;background:#f8fbff;}\
    .epm-god-card{background:#fff;border:1px solid #e3ebf7;border-radius:16px;padding:14px;}\
    .epm-god-card h4{margin:0 0 12px;font-size:14px;color:#001952;}\
    .epm-god-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}\
    .epm-god-card input,.epm-god-card textarea,.epm-god-card select{width:100%;padding:10px 12px;border:1px solid #d9e2f0;border-radius:10px;font:500 13px Inter,sans-serif;}\
    .epm-god-card textarea{min-height:90px;resize:vertical;}\
    .epm-god-btns{display:flex;flex-wrap:wrap;gap:8px;}\
    .epm-god-btn{border:none;border-radius:10px;padding:10px 12px;font:700 12px Inter,sans-serif;cursor:pointer;}\
    .epm-god-btn.primary{background:#001952;color:#fff;}\
    .epm-god-btn.warn{background:#fff7ed;color:#9a3412;}\
    .epm-god-btn.danger{background:#fff1f2;color:#9f1239;}\
    .epm-god-btn.ghost{background:#fff;border:1px solid #d9e2f0;color:#334155;}\
    .epm-god-list{display:flex;flex-direction:column;gap:10px;}\
    .epm-god-item{border:1px solid #e2e8f0;border-radius:14px;padding:12px;background:#fff;}\
    .epm-god-item small{display:block;color:#64748b;margin-top:4px;line-height:1.5;}\
    .epm-god-row{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;}\
    .epm-god-msg{display:none;padding:10px 12px;border-radius:12px;font-size:12px;line-height:1.5;}\
    .epm-god-preview{height:120px;border-radius:14px;background:linear-gradient(135deg,#eaf0ff,#f8fafc);background-size:cover;background-position:center;display:flex;align-items:center;justify-content:center;text-align:center;color:#64748b;font-size:12px;padding:12px;}\
    .epm-god-meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}\
    .epm-god-meta span{padding:5px 8px;border-radius:999px;background:#eef2ff;color:#274690;font-size:11px;font-weight:700;}';
    document.head.appendChild(style);
  }

  function showMsg(textValue, ok){
    var el=document.getElementById('epmGodMsg'); if(!el) return;
    el.style.display='block'; el.style.background=ok===false?'#fff1f2':'#f0fdf4'; el.style.color=ok===false?'#9f1239':'#166534'; el.textContent=textValue;
  }

  function renderCategoryCard(item, kind){
    var desc = item.description ? '<div class="epm-dynamic-card__meta">'+esc(item.description)+'</div>' : '';
    var count = kind === 'category' ? (item.subcategory_count || 0) + ' подкатегорий' : (item.product_count || 0) + ' позиций';
    return '<a class="epm-dynamic-card" href="'+esc(item.url)+'"><div class="epm-dynamic-card__title">'+esc(item.name)+'</div>'+desc+'<div class="epm-dynamic-card__badge">'+count+' →</div></a>';
  }
  function renderProductCard(item){
    var desc = item.description ? '<div class="epm-dynamic-card__meta">'+esc(item.description)+'</div>' : '<div class="epm-dynamic-card__meta">Новая позиция добавлена через админ-панель.</div>';
    return '<a class="epm-dynamic-card" href="'+esc(item.url)+'"><div class="epm-dynamic-card__title">'+esc(item.name)+'</div>'+desc+'<div class="epm-dynamic-card__badge">Открыть карточку →</div></a>';
  }
  function renderServiceGroup(group){
    var items=(group.items||[]).map(function(item){ return '<a class="service-list-item" href="#'+esc(group.slug)+'">'+esc(item.title)+'</a>'; }).join('');
    return '<div class="services-cat-section epm-dynamic-service-group" id="'+esc(group.slug)+'"><h2 class="services-cat-title">'+esc(group.title)+'</h2><div class="services-list-grid">'+items+'</div></div>';
  }
  function mountSection(title, html, container){
    if(!container||!html) return;
    var wrap=document.createElement('section');
    wrap.className='epm-dynamic-section';
    wrap.innerHTML='<h2>'+esc(title)+'</h2><div class="epm-admin-note">Раздел наполняется из админ-панели.</div><div class="epm-dynamic-grid">'+html+'</div>';
    container.appendChild(wrap);
  }

  function findContext(data){
    var path=pathFromLocation();
    if(path === '/catalog.html/' || path === '/catalog/' || path === '/'){
      return { pageType:'catalog-root', label:'Главная → Каталог', entityType:'category', parentId:null, items:data.categories||[] };
    }
    if(path === '/services/'){
      return { pageType:'services', label:'Услуги', entityType:'service', parentId:null, items:data.service_groups||[] };
    }
    if(path.indexOf('/catalog/') !== 0) return null;
    var parts=path.replace(/^\/catalog\//,'').replace(/\/$/,'').split('/').filter(Boolean);
    var cat=(data.categories||[]).find(function(item){ return item.slug===parts[0]; });
    if(parts.length===1 && cat) return { pageType:'category', label:'Каталог → '+cat.name, entityType:'subcategory', parentId:cat.id, items:cat.subcategories||[], category:cat };
    if(parts.length===2 && cat){
      var sub=(cat.subcategories||[]).find(function(item){ return item.slug===parts[1]; });
      if(sub) return { pageType:'subcategory', label:'Каталог → '+cat.name+' → '+sub.name, entityType:'product', parentId:sub.id, items:sub.products||[], category:cat, subcategory:sub };
    }
    if(parts.length===3 && cat){
      var sub2=(cat.subcategories||[]).find(function(item){ return item.slug===parts[1]; });
      var prod=sub2 && (sub2.products||[]).find(function(item){ return item.slug===parts[2]; });
      if(prod) return { pageType:'product', label:'Карточка → '+prod.name, entityType:'product-single', parentId:sub2.id, items:[prod], category:cat, subcategory:sub2, product:prod };
    }
    return null;
  }

  function renderCatalogPage(data){
    var path=pathFromLocation();
    injectStyles();
    if (path === '/catalog.html/' || path === '/catalog/' || path === '/') {
      var grid=document.querySelector('.catalog-grid');
      var existingLinks = new Set(Array.from(document.querySelectorAll('.catalog-cat-header')).map(function(a){ return a.getAttribute('href'); }));
      var extras=(data.categories||[]).filter(function(cat){ return !existingLinks.has('.'+cat.url) && !existingLinks.has(cat.url); });
      mountSection('Новые категории', extras.map(function(cat){ return renderCategoryCard(cat,'category'); }).join(''), grid && grid.parentElement);
      return;
    }
    if (path === '/services/') {
      var groupsContainer=document.querySelector('.services-cats-grid');
      if (!groupsContainer) return;
      var existingIds = new Set(Array.from(document.querySelectorAll('.services-cat-section')).map(function(el){ return el.id; }));
      var extras = (data.service_groups||[]).filter(function(group){ return !existingIds.has(group.slug); });
      if (extras.length) { var block=document.createElement('div'); block.innerHTML=extras.map(renderServiceGroup).join(''); groupsContainer.appendChild(block); }
      return;
    }
    if (path.indexOf('/catalog/') !== 0) return;
    var clean=path.replace(/^\/catalog\//,'').replace(/\/$/,'');
    var parts=clean.split('/').filter(Boolean);
    if (parts.length === 1) {
      var category=(data.categories||[]).find(function(cat){ return cat.slug===parts[0]; });
      var main=document.querySelector('main');
      if (!category || !main) return;
      var existing=new Set(Array.from(main.querySelectorAll('a[href]')).map(function(a){ return a.getAttribute('href'); }));
      var extras=(category.subcategories||[]).filter(function(sub){ return !existing.has('../../catalog/'+category.slug+'/'+sub.slug+'/') && !existing.has(sub.url); });
      mountSection('Новые подкатегории', extras.map(function(sub){ return renderCategoryCard(sub,'subcategory'); }).join(''), main);
      return;
    }
    if (parts.length === 2) {
      var category2=(data.categories||[]).find(function(cat){ return cat.slug===parts[0]; });
      if (!category2) return;
      var subcategory=(category2.subcategories||[]).find(function(sub){ return sub.slug===parts[1]; });
      var main2=document.querySelector('main');
      if (!subcategory || !main2) return;
      var countEl=document.getElementById('epmProductCount');
      var current=parseInt((countEl&&countEl.textContent)||'0',10) || 0;
      var existingProductLinks = Array.from(main2.querySelectorAll('a[href]')).map(function(a){ return a.getAttribute('href'); });
      var extrasProducts=(subcategory.products||[]).filter(function(product){ return existingProductLinks.indexOf('../../../catalog/'+category2.slug+'/'+subcategory.slug+'/'+product.slug+'/') === -1 && existingProductLinks.indexOf(product.url) === -1; });
      if (countEl) countEl.textContent = current + extrasProducts.length;
      mountSection('Новые карточки товаров', extrasProducts.map(renderProductCard).join(''), main2);
    }
  }

  function ensureGodUi(){
    if(!isAdmin() || document.getElementById('epmGodToggle')) return;
    document.body.insertAdjacentHTML('beforeend',
      '<button id="epmGodToggle" class="epm-god-toggle">Режим бога</button>\
       <aside id="epmGodPanel" class="epm-god-panel">\
         <div class="epm-god-head"><h3>Режим бога</h3><p>Редактируйте текущую ветку каталога, загружайте фото без путей и сохраняйте изменения одной кнопкой.</p></div>\
         <div class="epm-god-body">\
           <div id="epmGodMsg" class="epm-god-msg"></div>\
           <section class="epm-god-card"><h4>Контекст страницы</h4><div id="epmGodContext"></div></section>\
           <section class="epm-god-card"><h4>Техрежим сайта</h4><div class="epm-god-grid"><label><input id="epmMaintToggle" type="checkbox"> Включить блокировку сайта</label><input id="epmMaintMessage" placeholder="Сообщение для посетителей"></div></section>\
           <section class="epm-god-card"><h4>Изменения в очереди</h4><div id="epmGodPending"></div><div class="epm-god-btns" style="margin-top:10px;"><button class="epm-god-btn primary" id="epmSaveAll">Сохранить всё</button><button class="epm-god-btn ghost" id="epmDiscardAll">Сбросить черновик</button></div></section>\
           <section class="epm-god-card"><h4>Карточки текущего уровня</h4><div id="epmGodItems" class="epm-god-list"></div></section>\
           <section class="epm-god-card"><h4>Добавить / изменить карточку</h4><input type="hidden" id="epmEditId"><div class="epm-god-grid"><input id="epmName" placeholder="Название"><input id="epmSlug" placeholder="Slug (необязательно)"></div><div class="epm-god-grid" style="margin-top:10px;"><input id="epmSort" type="number" placeholder="Порядок" value="0"><input id="epmFile" type="file" accept=\"image/*\"></div><div id="epmPreview" class="epm-god-preview" style="margin-top:10px;">Фото пока не выбрано</div><input id="epmImage" placeholder="Фото загрузится автоматически" readonly style="margin-top:10px;"><textarea id="epmDesc" placeholder="Описание карточки" style="margin-top:10px;"></textarea><div class="epm-god-btns" style="margin-top:10px;"><button class="epm-god-btn primary" id="epmQueueItem">Добавить в черновик</button><button class="epm-god-btn ghost" id="epmResetForm">Очистить форму</button></div></section>\
           <section class="epm-god-card"><h4>Точки сохранения</h4><div class="epm-god-btns" style="margin-bottom:10px;"><button class="epm-god-btn warn" id="epmMakeSnapshot">Создать точку сохранения</button></div><div id="epmSnapshots" class="epm-god-list"></div></section>\
         </div>\
       </aside>');
    document.getElementById('epmGodToggle').onclick=function(){ state.mode=!state.mode; document.getElementById('epmGodPanel').classList.toggle('open', state.mode); };
    document.getElementById('epmResetForm').onclick=resetForm;
    document.getElementById('epmQueueItem').onclick=queueUpsert;
    document.getElementById('epmDiscardAll').onclick=function(){ if(confirm('Сбросить все несохранённые изменения?')){ state.pending=[]; renderGodMode(); } };
    document.getElementById('epmSaveAll').onclick=saveAll;
    document.getElementById('epmMakeSnapshot').onclick=createSnapshot;
    document.getElementById('epmFile').addEventListener('change', uploadImage);
  }

  function resetForm(){
    ['epmEditId','epmName','epmSlug','epmImage','epmDesc'].forEach(function(id){ var el=document.getElementById(id); if(el) el.value=''; });
    var sort=document.getElementById('epmSort'); if(sort) sort.value='0';
    var preview=document.getElementById('epmPreview'); if(preview){ preview.style.backgroundImage='linear-gradient(135deg,#eaf0ff,#f8fafc)'; preview.textContent='Фото пока не выбрано'; }
  }

  async function uploadImage(ev){
    var file=(ev.target.files||[])[0];
    if(!file) return;
    try{
      var base64 = await new Promise(function(resolve, reject){
        var reader = new FileReader();
        reader.onload = function(){ resolve(String(reader.result || '').split(',').pop() || ''); };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      var res=await fetch(API_BASE + '/api/admin/upload-image', {
        method:'POST',
        headers:authHeaders({'Content-Type':'application/json'}),
        body:JSON.stringify({ filename:file.name, content_base64:base64 })
      });
      if(!res.ok) throw new Error();
      var data=await res.json();
      document.getElementById('epmImage').value=data.url;
      var preview=document.getElementById('epmPreview');
      preview.style.backgroundImage='linear-gradient(rgba(255,255,255,.08),rgba(255,255,255,.08)),url("'+data.url.replace(/"/g,'')+'")';
      preview.textContent='Фото загружено на сервер';
      showMsg('Фото загружено. Путь подставлен автоматически.', true);
    }catch(e){ showMsg('Не удалось загрузить фото на сервер.', false); }
  }

  function queueUpsert(){
    if(!state.context || state.context.pageType==='services') return showMsg('Для услуг оставлена админ-панель CRM. На этой странице режим редактирует каталог.', false);
    var name=document.getElementById('epmName').value.trim();
    if(!name) return showMsg('Введите название карточки.', false);
    var editId=document.getElementById('epmEditId').value;
    state.pending.push({
      action: editId ? 'update' : 'create',
      id: editId ? Number(editId) : null,
      entity_type: state.context.pageType === 'catalog-root' ? 'category' : 'product-single' === state.context.entityType ? 'product' : state.context.entityType,
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
    showMsg('Изменение добавлено в черновик. Нажмите «Сохранить всё».', true);
  }

  function editItem(id){
    var items=state.context && state.context.items || [];
    var item=items.find(function(x){ return x.id===id; });
    if(!item) return;
    document.getElementById('epmEditId').value=item.id;
    document.getElementById('epmName').value=item.name || '';
    document.getElementById('epmSlug').value=item.slug || '';
    document.getElementById('epmImage').value=item.image || '';
    document.getElementById('epmDesc').value=item.description || '';
    document.getElementById('epmSort').value=item.sort_order || 0;
    var preview=document.getElementById('epmPreview');
    if(item.image){ preview.style.backgroundImage='linear-gradient(rgba(255,255,255,.08),rgba(255,255,255,.08)),url("'+item.image.replace(/"/g,'')+'")'; preview.textContent='Текущее фото карточки'; }
  }

  function queueDelete(id, name){
    if(!confirm('Подтвердите удаление «'+(name||'элемента')+'». Будут удалены и вложенные карточки.')) return;
    state.pending.push({ action:'delete', id:id, name:name });
    renderGodMode();
  }

  async function createSnapshot(){
    try{
      var label=prompt('Название точки сохранения:', 'Ручная точка сохранения');
      if(label===null) return;
      var res=await fetch(API_BASE + '/api/admin/snapshots', { method:'POST', headers:authHeaders({'Content-Type':'application/json'}), body:JSON.stringify({ label:label }) });
      if(!res.ok) throw new Error();
      showMsg('Точка сохранения создана.', true);
      await loadSnapshots();
    }catch(e){ showMsg('Не удалось создать точку сохранения.', false); }
  }

  async function restoreSnapshot(id){
    if(!confirm('Откатить каталог и услуги к выбранной точке сохранения?')) return;
    try{
      var res=await fetch(API_BASE + '/api/admin/snapshots/' + id + '/restore', { method:'POST', headers:authHeaders({}) });
      if(!res.ok) throw new Error();
      showMsg('Точка сохранения восстановлена. Страница будет обновлена.', true);
      setTimeout(function(){ location.reload(); }, 900);
    }catch(e){ showMsg('Не удалось восстановить точку сохранения.', false); }
  }

  async function saveAll(){
    try{
      var maintenanceMode=document.getElementById('epmMaintToggle').checked;
      var maintenanceMessage=document.getElementById('epmMaintMessage').value.trim();
      var lockRes=await fetch(API_BASE + '/api/admin/site-lock', { method:'POST', headers:authHeaders({'Content-Type':'application/json'}), body:JSON.stringify({ maintenance_mode:maintenanceMode, maintenance_message:maintenanceMessage }) });
      if(!lockRes.ok) throw new Error();
      for(var i=0;i<state.pending.length;i++){
        var item=state.pending[i];
        if(item.action==='create'){
          var createRes=await fetch(API_BASE + '/api/admin/catalog/entities', { method:'POST', headers:authHeaders({'Content-Type':'application/json'}), body:JSON.stringify(item) });
          if(!createRes.ok) throw new Error();
        } else if(item.action==='update'){
          var updateRes=await fetch(API_BASE + '/api/admin/catalog/entities/' + item.id, { method:'PUT', headers:authHeaders({'Content-Type':'application/json'}), body:JSON.stringify(item) });
          if(!updateRes.ok) throw new Error();
        } else if(item.action==='delete'){
          var deleteRes=await fetch(API_BASE + '/api/admin/catalog/entities/' + item.id, { method:'DELETE', headers:authHeaders({}) });
          if(!deleteRes.ok) throw new Error();
        }
      }
      state.pending=[];
      showMsg('Все изменения сохранены. Страница обновится.', true);
      setTimeout(function(){ location.reload(); }, 900);
    }catch(e){ showMsg('Не удалось сохранить пакет изменений.', false); }
  }

  async function loadSnapshots(){
    if(!isAdmin()) return;
    try{
      var res=await fetch(API_BASE + '/api/admin/snapshots', { headers:authHeaders({}) });
      state.snapshots = res.ok ? await res.json() : [];
    }catch(e){ state.snapshots=[]; }
    renderGodMode();
  }

  function renderGodMode(){
    ensureGodUi();
    if(!isAdmin() || !state.context) return;
    var ctx=document.getElementById('epmGodContext');
    if(ctx) ctx.innerHTML='<strong>'+esc(state.context.label)+'</strong><div class="epm-god-meta"><span>Текущий уровень: '+esc(state.context.pageType)+'</span><span>Элементов: '+((state.context.items||[]).length)+'</span><span>Черновик: '+state.pending.length+'</span></div>';
    var pending=document.getElementById('epmGodPending');
    if(pending) pending.innerHTML = state.pending.length ? '<div class="epm-god-list">'+state.pending.map(function(item, idx){ return '<div class="epm-god-item"><div class="epm-god-row"><strong>'+(item.action==='delete'?'Удаление':'Изменение')+'</strong><span style="font-size:12px;color:#64748b;">Черновик #'+(idx+1)+'</span></div><small>'+esc(item.name || item.entity_type || 'Элемент')+'</small></div>'; }).join('')+'</div>' : '<small style="color:#64748b;">Изменений пока нет.</small>';
    var items=document.getElementById('epmGodItems');
    if(items) items.innerHTML = (state.context.items||[]).map(function(item){
      return '<div class="epm-god-item"><div class="epm-god-row"><div><strong>'+esc(item.name || item.title)+'</strong><small>'+esc(item.description || item.url || 'Без описания')+'</small></div><div class="epm-god-btns"><button class="epm-god-btn ghost" data-edit="'+item.id+'">Изменить</button><button class="epm-god-btn danger" data-del="'+item.id+'">Удалить</button></div></div></div>';
    }).join('') || '<small style="color:#64748b;">На этом уровне пока нет карточек.</small>';
    Array.from(document.querySelectorAll('[data-edit]')).forEach(function(btn){ btn.onclick=function(){ editItem(Number(this.getAttribute('data-edit'))); }; });
    Array.from(document.querySelectorAll('[data-del]')).forEach(function(btn){ btn.onclick=function(){ var id=Number(this.getAttribute('data-del')); var current=(state.context.items||[]).find(function(x){ return x.id===id; }); queueDelete(id, current && (current.name || current.title)); }; });
    var snaps=document.getElementById('epmSnapshots');
    if(snaps) snaps.innerHTML = state.snapshots.map(function(item){ return '<div class="epm-god-item"><div class="epm-god-row"><div><strong>'+esc(item.label)+'</strong><small>'+esc(item.created_at)+'</small></div><button class="epm-god-btn warn" data-snap="'+item.id+'">Откатить</button></div></div>'; }).join('') || '<small style="color:#64748b;">Точек сохранения пока нет.</small>';
    Array.from(document.querySelectorAll('[data-snap]')).forEach(function(btn){ btn.onclick=function(){ restoreSnapshot(Number(this.getAttribute('data-snap'))); }; });
  }

  async function loadAdminState(){
    if(!isAdmin()) return;
    ensureGodUi();
    try{
      var lock=await fetch(API_BASE + '/api/admin/site-lock', { headers:authHeaders({}) }).then(function(r){ return r.ok ? r.json() : null; });
      if(lock){
        document.getElementById('epmMaintToggle').checked=!!lock.maintenance_mode;
        document.getElementById('epmMaintMessage').value=lock.maintenance_message || '';
      }
    }catch(e){}
    loadSnapshots();
  }

  fetch(API).then(function(r){ return r.ok ? r.json() : null; }).then(function(data){ if(data){ state.data=data; state.context=findContext(data); renderCatalogPage(data); loadAdminState(); renderGodMode(); } }).catch(function(){});
})();
