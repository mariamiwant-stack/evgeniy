(function(){
  'use strict';

  var API = (window.EPM_API || 'http://localhost:8000') + '/api/catalog-structure';

  function pathFromLocation() {
    var path = location.pathname.replace(/^\/eternoprom\/?/, '/').replace(/index\.html$/, '');
    if (!path.endsWith('/')) path += '/';
    return path;
  }

  function text(s){ return (s || '').toString(); }
  function esc(s){ return text(s).replace(/[&<>"']/g, function(ch){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]); }); }

  function injectStyles(){
    if (document.getElementById('epm-dynamic-styles')) return;
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
    .epm-admin-note{font-size:12px;color:#8a96ae;margin-bottom:16px;}';
    document.head.appendChild(style);
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
    var items = (group.items||[]).map(function(item){ return '<a class="service-list-item" href="#'+esc(group.slug)+'">'+esc(item.title)+'</a>'; }).join('');
    return '<div class="services-cat-section epm-dynamic-service-group" id="'+esc(group.slug)+'"><h2 class="services-cat-title">'+esc(group.title)+'</h2><div class="services-list-grid">'+items+'</div></div>';
  }

  function mountSection(title, html, container){
    if (!container || !html) return;
    var wrap=document.createElement('section');
    wrap.className='epm-dynamic-section';
    wrap.innerHTML='<h2>'+esc(title)+'</h2><div class="epm-admin-note">Раздел наполняется из админ-панели.</div><div class="epm-dynamic-grid">'+html+'</div>';
    container.appendChild(wrap);
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
      if (extras.length) {
        var block=document.createElement('div');
        block.innerHTML=extras.map(renderServiceGroup).join('');
        groupsContainer.appendChild(block);
      }
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
      if (countEl) {
        var current=parseInt(countEl.textContent,10) || 0;
        var existingProductLinks = Array.from(main2.querySelectorAll('a[href]')).map(function(a){ return a.getAttribute('href'); });
        var extrasProducts=(subcategory.products||[]).filter(function(product){ return existingProductLinks.indexOf('../../../catalog/'+category2.slug+'/'+subcategory.slug+'/'+product.slug+'/') === -1 && existingProductLinks.indexOf(product.url) === -1; });
        countEl.textContent = current + extrasProducts.length;
        mountSection('Новые карточки товаров', extrasProducts.map(renderProductCard).join(''), main2);
      }
    }
  }

  fetch(API).then(function(r){ return r.ok ? r.json() : null; }).then(function(data){ if(data) renderCatalogPage(data); }).catch(function(){});
})();
