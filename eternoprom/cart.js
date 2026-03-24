/**
 * Единый ресурс металла — Cart Module
 * In-memory корзина + drawer (2 режима: список / форма) + badge (sandbox-compatible)
 */

(function () {
  'use strict';

  const API_BASE = window.EPM_API || 'http://localhost:8000';
  const ADMIN_TOKEN_KEY = 'epm_admin_token';

  function isAdminSession() {
    try { return !!localStorage.getItem(ADMIN_TOKEN_KEY); } catch (e) { return false; }
  }

  function showMaintenanceOverlay(message) {
    if (document.getElementById('epmMaintenanceOverlay')) return;
    var overlay = document.createElement('div');
    overlay.id = 'epmMaintenanceOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,25,82,.92);color:#fff;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;';
    overlay.innerHTML = '<div style="max-width:680px;"><div style="font-size:14px;letter-spacing:.12em;text-transform:uppercase;color:#93c5fd;margin-bottom:12px;">Технический режим</div><div style="font-size:34px;font-weight:800;margin-bottom:14px;">Сайт временно недоступен</div><div style="font-size:16px;line-height:1.7;color:rgba(255,255,255,.84);">' + (message || 'Мы обновляем каталог и скоро вернёмся.') + '</div></div>';
    document.body.appendChild(overlay);
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
  }

  function loadSiteState() {
    if (/\/admin\/?$/.test(location.pathname || '') || isAdminSession()) return;
    fetch(API_BASE + '/api/site-state')
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(data){ if (data && data.maintenance_mode) showMaintenanceOverlay(data.maintenance_message); })
      .catch(function(){});
  }

  function loadCatalogAdminEnhancements() {
    var path = (location.pathname || '').replace(/\/index\.html$/, '/');
    var isCatalogLike = /\/services\/?$/.test(path) || /\/catalog(\/|\.html|$)/.test(path);
    if (!isCatalogLike || document.querySelector('script[data-epm-catalog-admin]')) return;
    var script = document.createElement('script');
    script.defer = true;
    script.src = '/eternoprom/catalog-admin.js';
    script.setAttribute('data-epm-catalog-admin', '1');
    document.head.appendChild(script);
  }

  function loadInlineCatalogEditor() {
    var path = (location.pathname || '').replace(/\/index\.html$/, '/');
    var isCatalogLike = /\/catalog(\/|\.html|$)/.test(path);
    if (!isCatalogLike || document.querySelector('script[data-epm-inline-editor]')) return;
    var script = document.createElement('script');
    script.defer = true;
    script.src = '/eternoprom/epm-editor.js';
    script.setAttribute('data-epm-inline-editor', '1');
    document.head.appendChild(script);
  }

  loadCatalogAdminEnhancements();
  loadInlineCatalogEditor();
  loadSiteState();

  // ─── Модель (in-memory) ──────────────────────────────────────────────────────
  // ─── Модель (localStorage) ──────────────────────────────────────────────────

var CART_KEY = 'epm_cart';

var _cartData = (function () {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch (e) {
    return [];
  }
})();

function getCart() { return _cartData.slice(); }

function saveCart(cart) {
  _cartData = cart;
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  } catch (e) {}
  updateBadge();
  renderDrawer();
}


  function addItem(item) {
    const cart = getCart();
    const idx = cart.findIndex(c => c.sku === item.sku);
    if (idx >= 0) {
      cart[idx].qty = (cart[idx].qty || 1) + (item.qty || 1);
    } else {
      cart.push({ ...item, qty: item.qty || 1 });
    }
    saveCart(cart);
    showCartToast(item.title);
  }

  function removeItem(sku) { saveCart(getCart().filter(c => c.sku !== sku)); }

  function changeQty(sku, delta) {
    const cart = getCart();
    const idx = cart.findIndex(c => c.sku === sku);
    if (idx < 0) return;
    cart[idx].qty = Math.max(1, (cart[idx].qty || 1) + delta);
    saveCart(cart);
  }

  function setQty(sku, val) {
    const cart = getCart();
    const idx = cart.findIndex(c => c.sku === sku);
    if (idx < 0) return;
    cart[idx].qty = Math.max(1, parseInt(val) || 1);
    saveCart(cart);
  }

  function clearCart() { saveCart([]); }

  function cartTotal(cart) {
    return cart.reduce((s, i) => s + (i.priceNum || 0) * (i.qty || 1), 0);
  }

  // ─── Режим drawer ────────────────────────────────────────────────────────────
  // 'cart' = список товаров, 'checkout' = форма оформления
  var _drawerMode = 'cart';

  function setDrawerMode(mode) {
    _drawerMode = mode;
    renderDrawer();
  }

  // ─── Badge ───────────────────────────────────────────────────────────────────
  function updateBadge() {
    const count = getCart().reduce((s, i) => s + (i.qty || 1), 0);
    document.querySelectorAll('.epm-cart-badge').forEach(el => {
      el.textContent = count;
      el.style.display = count > 0 ? 'flex' : 'none';
    });
  }

  // ─── Toast ───────────────────────────────────────────────────────────────────
  function showCartToast(name) {
    let t = document.getElementById('epmCartToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'epmCartToast';
      t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
        'background:#001952;color:#fff;padding:12px 20px;border-radius:10px;' +
        'font-size:13px;font-family:Inter,sans-serif;z-index:9999;box-shadow:0 4px 16px rgba(0,25,82,.25);' +
        'display:flex;align-items:center;gap:10px;pointer-events:none;transition:opacity .3s;';
      document.body.appendChild(t);
    }
    const short = name.length > 40 ? name.slice(0, 40) + '…' : name;
    t.innerHTML = `<svg width="16" height="16" fill="none" stroke="#4ade80" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Добавлено: <strong>${short}</strong>`;
    t.style.opacity = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.style.opacity = '0'; }, 2500);
  }

  // ─── Drawer — структура ──────────────────────────────────────────────────────
  function buildDrawer() {
    if (document.getElementById('epmCartDrawer')) return;

    const overlay = document.createElement('div');
    overlay.id = 'epmCartOverlay';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1100;';
    overlay.addEventListener('click', closeDrawer);

    const drawer = document.createElement('div');
    drawer.id = 'epmCartDrawer';
    drawer.style.cssText =
      'position:fixed;top:0;right:-460px;width:440px;max-width:100vw;height:100%;' +
      'background:#fff;z-index:1101;box-shadow:-4px 0 32px rgba(0,25,82,.15);' +
      'display:flex;flex-direction:column;transition:right .28s cubic-bezier(.4,0,.2,1);' +
      'font-family:Inter,sans-serif;';

    drawer.innerHTML = `
      <div id="epmDrawerHeader" style="padding:18px 20px 14px;border-bottom:1px solid #e8ecf4;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
        <div style="display:flex;align-items:center;gap:10px;">
          <button id="epmDrawerBack" onclick="window.EPMCart.showCart()" style="display:none;background:none;border:none;cursor:pointer;padding:4px;color:#8a96ae;margin-right:2px;">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div id="epmDrawerTitle" style="font-size:17px;font-weight:700;color:#001952;">Корзина</div>
        </div>
        <button onclick="window.EPMCart.close()" style="background:none;border:none;cursor:pointer;padding:4px;color:#8a96ae;">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div id="epmCartItems" style="flex:1;overflow-y:auto;padding:16px 20px;"></div>
      <div id="epmCartFooter" style="padding:16px 20px;border-top:1px solid #e8ecf4;flex-shrink:0;"></div>`;

    document.body.appendChild(overlay);
    document.body.appendChild(drawer);
  }

  function openDrawer() {
    _drawerMode = 'cart';
    buildDrawer();
    renderDrawer();
    document.getElementById('epmCartOverlay').style.display = 'block';
    setTimeout(() => { document.getElementById('epmCartDrawer').style.right = '0'; }, 10);
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    const d = document.getElementById('epmCartDrawer');
    const o = document.getElementById('epmCartOverlay');
    if (d) d.style.right = '-460px';
    if (o) setTimeout(() => { o.style.display = 'none'; }, 280);
    document.body.style.overflow = '';
    _drawerMode = 'cart';
  }

  // ─── Drawer — рендер ─────────────────────────────────────────────────────────
  function renderDrawer() {
    if (_drawerMode === 'checkout') {
      renderCheckoutForm();
    } else {
      renderCartList();
    }
  }

  // ── Режим 1: список товаров ──────────────────────────────────────────────────
  function renderCartList() {
    const el = document.getElementById('epmCartItems');
    const footer = document.getElementById('epmCartFooter');
    const title = document.getElementById('epmDrawerTitle');
    const backBtn = document.getElementById('epmDrawerBack');
    if (!el) return;

    if (title) title.textContent = 'Корзина';
    if (backBtn) backBtn.style.display = 'none';

    const cart = getCart();

    if (cart.length === 0) {
      el.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:16px;color:#8a96ae;text-align:center;padding:40px 0;">
          <svg width="52" height="52" fill="none" stroke="#c8d4ec" stroke-width="1.5" viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" x2="21" y1="6" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
          <div>
            <div style="font-size:15px;font-weight:600;color:#001952;margin-bottom:6px;">Корзина пуста</div>
            <div style="font-size:13px;">Добавьте товары из каталога</div>
          </div>
          <button onclick="window.EPMCart.close()" style="padding:10px 22px;background:#001952;color:#fff;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;">Перейти в каталог</button>
        </div>`;
      if (footer) footer.innerHTML = '';
      return;
    }

    const total = cartTotal(cart);

    el.innerHTML = cart.map(item => {
      const subtotal = (item.priceNum || 0) * (item.qty || 1);
      return `
        <div class="epm-cart-item" data-sku="${item.sku}" style="display:grid;grid-template-columns:60px 1fr;gap:12px;padding:12px 0;border-bottom:1px solid #f0f3f9;">
          <div style="width:60px;height:60px;border-radius:8px;overflow:hidden;background:#f5f7fa;flex-shrink:0;">
            ${item.image ? `<img src="${item.image}" alt="${item.title}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'">` : ''}
          </div>
          <div style="display:flex;flex-direction:column;gap:5px;min-width:0;">
            <div style="font-size:12px;font-weight:600;color:#001952;line-height:1.3;">${item.title}</div>
            ${item.variant ? `<div style="font-size:11px;color:#8a96ae;">${item.variant}</div>` : ''}
            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px;">
              <div style="display:flex;align-items:center;gap:6px;">
                <button onclick="window.EPMCart.changeQty('${item.sku}', -1)" style="width:24px;height:24px;border:1px solid #dde3f0;border-radius:5px;background:#fff;cursor:pointer;font-size:15px;color:#001952;display:flex;align-items:center;justify-content:center;">−</button>
                <input type="number" min="1" value="${item.qty || 1}" onchange="window.EPMCart.setQty('${item.sku}', this.value)"
                  style="width:40px;height:24px;text-align:center;border:1px solid #dde3f0;border-radius:5px;font-size:12px;font-family:inherit;color:#001952;">
                <button onclick="window.EPMCart.changeQty('${item.sku}', 1)" style="width:24px;height:24px;border:1px solid #dde3f0;border-radius:5px;background:#fff;cursor:pointer;font-size:15px;color:#001952;display:flex;align-items:center;justify-content:center;">+</button>
              </div>
              <div style="display:flex;align-items:center;gap:10px;">
                ${subtotal > 0
                  ? `<span style="font-size:13px;font-weight:700;color:#001952;">${subtotal.toLocaleString('ru')} ₽</span>`
                  : `<span style="font-size:12px;color:#8a96ae;">Договорная</span>`}
                <button onclick="window.EPMCart.remove('${item.sku}')" style="background:none;border:none;cursor:pointer;color:#b0bbd4;padding:2px;" title="Удалить">
                  <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                </button>
              </div>
            </div>
          </div>
        </div>`;
    }).join('');

    if (footer) {
      footer.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <span style="font-size:14px;color:#8a96ae;">Итого:</span>
          <span style="font-size:18px;font-weight:700;color:#001952;">${total > 0 ? total.toLocaleString('ru') + ' ₽' : 'По запросу'}</span>
        </div>
        <button onclick="window.EPMCart.showCheckout()"
          style="display:block;width:100%;padding:14px;background:#001952;color:#fff;border:none;border-radius:10px;text-align:center;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:8px;">
          Оформить заказ →
        </button>
        <button onclick="if(confirm('Очистить корзину?')) window.EPMCart.clear()"
          style="display:block;width:100%;padding:10px;background:none;border:1px solid #e8ecf4;border-radius:10px;color:#8a96ae;font-size:13px;cursor:pointer;font-family:inherit;">
          Очистить корзину
        </button>`;
    }
  }

  // ── Режим 2: форма оформления ────────────────────────────────────────────────
  var INP = 'width:100%;padding:10px 14px;border:1px solid #dde3f0;border-radius:8px;font-size:13px;font-family:inherit;color:#001952;box-sizing:border-box;outline:none;background:#fff;';

  function renderCheckoutForm() {
    const el = document.getElementById('epmCartItems');
    const footer = document.getElementById('epmCartFooter');
    const title = document.getElementById('epmDrawerTitle');
    const backBtn = document.getElementById('epmDrawerBack');
    if (!el) return;

    if (title) title.textContent = 'Оформление заказа';
    if (backBtn) backBtn.style.display = 'flex';

    const cart = getCart();
    const total = cartTotal(cart);
    const count = cart.reduce((s, i) => s + (i.qty || 1), 0);

    // Мини-список товаров
    const itemsSummary = cart.map(item => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f5f7fa;">
        <div style="width:36px;height:36px;border-radius:6px;overflow:hidden;background:#f5f7fa;flex-shrink:0;">
          ${item.image ? `<img src="${item.image}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'">` : ''}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:11px;font-weight:600;color:#001952;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.title}</div>
          <div style="font-size:11px;color:#8a96ae;">${item.qty || 1} шт. ${item.priceNum > 0 ? '· ' + ((item.priceNum*(item.qty||1)).toLocaleString('ru')) + ' ₽' : '· Договорная'}</div>
        </div>
      </div>`).join('');

    el.innerHTML = `
      <!-- Итог -->
      <div style="background:#f5f7fa;border-radius:10px;padding:14px 16px;margin-bottom:20px;">
        <div style="font-size:12px;font-weight:600;color:#001952;margin-bottom:10px;text-transform:uppercase;letter-spacing:.04em;">Ваш заказ</div>
        ${itemsSummary}
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:10px;border-top:1px solid #e8ecf4;">
          <span style="font-size:12px;color:#8a96ae;">${count} позиций</span>
          <span style="font-size:15px;font-weight:700;color:#001952;">${total > 0 ? total.toLocaleString('ru') + ' ₽' : 'По запросу'}</span>
        </div>
      </div>

      <!-- Форма -->
      <form id="epmOrderForm" autocomplete="on" style="display:flex;flex-direction:column;gap:14px;">

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div>
            <label style="font-size:11px;color:#8a96ae;display:block;margin-bottom:5px;">Имя *</label>
            <input name="name" required placeholder="Иван Иванов" style="${INP}" autocomplete="name">
          </div>
          <div>
            <label style="font-size:11px;color:#8a96ae;display:block;margin-bottom:5px;">Компания</label>
            <input name="company" placeholder="ООО «Металл»" style="${INP}" autocomplete="organization">
          </div>
        </div>

        <div>
          <label style="font-size:11px;color:#8a96ae;display:block;margin-bottom:5px;">Телефон *</label>
          <input name="phone" type="tel" required placeholder="+7 (___) ___-__-__" style="${INP}" autocomplete="tel">
        </div>

        <div>
          <label style="font-size:11px;color:#8a96ae;display:block;margin-bottom:5px;">Email</label>
          <input name="email" type="email" placeholder="mail@company.ru" style="${INP}" autocomplete="email">
        </div>

        <div>
          <label style="font-size:11px;color:#8a96ae;display:block;margin-bottom:5px;">Адрес доставки</label>
          <input name="address" placeholder="Город, улица, дом" style="${INP}" autocomplete="street-address">
        </div>

        <div>
          <label style="font-size:11px;color:#8a96ae;display:block;margin-bottom:5px;">Комментарий</label>
          <textarea name="comment" rows="2" placeholder="ИНН, реквизиты, пожелания..." style="${INP}resize:vertical;"></textarea>
        </div>

        <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;">
          <input type="checkbox" name="agree" required style="margin-top:3px;flex-shrink:0;accent-color:#001952;">
          <span style="font-size:11px;color:#8a96ae;line-height:1.5;">Согласен с <a href="policy.html" target="_blank" style="color:#001952;text-decoration:underline;">политикой конфиденциальности</a></span>
        </label>

        <div id="epmOrderMsg" style="display:none;"></div>

        <button type="submit" id="epmOrderSubmit"
          style="padding:14px;background:#8B1A1A;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;transition:background .15s;"
          onmouseover="this.style.background='#a02020'" onmouseout="this.style.background='#8B1A1A'">
          Отправить заказ
        </button>
      </form>`;

    if (footer) footer.innerHTML = '';

    // Обработчик формы
    const form = document.getElementById('epmOrderForm');
    if (form) {
      form.addEventListener('submit', async function(e) {
        e.preventDefault();
        const btn = document.getElementById('epmOrderSubmit');
        const msg = document.getElementById('epmOrderMsg');
        btn.disabled = true;
        btn.textContent = 'Отправляем...';

        const payload = {
          type: 'order',
          name: form.name.value.trim(),
          company: (form.company ? form.company.value.trim() : ''),
          phone: form.phone.value.trim(),
          email: (form.email ? form.email.value.trim() : ''),
          address: (form.address ? form.address.value.trim() : ''),
          comment: (form.comment ? form.comment.value.trim() : ''),
          items: getCart(),
          total: cartTotal(getCart()),
          page_url: location.href
        };

        try {
          const res = await fetch(API_BASE + '/api/order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (res.ok) {
            clearCart();
            showSuccess(msg, btn);
          } else {
            throw new Error('server error');
          }
        } catch (err) {
          // Нет бэкенда — показываем успех (demo-режим)
          if (API_BASE === '' || API_BASE === 'http://localhost:8000') {
            clearCart();
            showSuccess(msg, btn);
          } else {
            btn.disabled = false;
            btn.textContent = 'Отправить заказ';
            msg.style.cssText = 'display:block;padding:12px;background:#fff0f0;border:1px solid #fca5a5;border-radius:8px;color:#991b1b;font-size:12px;text-align:center;';
            msg.innerHTML = 'Ошибка. Позвоните нам: <a href="tel:+74992262325" style="color:#991b1b;">+7 (933) 993 87 77</a>';
          }
        }
      });
    }
  }

  function showSuccess(msg, btn) {
    if (btn) btn.style.display = 'none';
    const el = document.getElementById('epmCartItems');
    if (el) el.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:16px;text-align:center;padding:40px 20px;">
        <div style="width:64px;height:64px;background:#f0fdf4;border-radius:50%;display:flex;align-items:center;justify-content:center;">
          <svg width="32" height="32" fill="none" stroke="#16a34a" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div>
          <div style="font-size:17px;font-weight:700;color:#001952;margin-bottom:8px;">Заказ принят!</div>
          <div style="font-size:13px;color:#8a96ae;line-height:1.6;">Наш менеджер свяжется с вами<br>в ближайшее время</div>
        </div>
        <button onclick="window.EPMCart.close()" style="padding:11px 28px;background:#001952;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">
          Закрыть
        </button>
      </div>`;
    const footer = document.getElementById('epmCartFooter');
    if (footer) footer.innerHTML = '';
  }

  // ─── Кнопка корзины в хедере ─────────────────────────────────────────────────
  function injectCartButton() {
    const headerRight = document.querySelector('.epm-header__right');
    if (!headerRight || document.querySelector('.epm-cart-btn')) return;

    const btn = document.createElement('button');
    btn.className = 'epm-cart-btn';
    btn.title = 'Корзина';
    btn.style.cssText =
      'position:relative;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);' +
      'border-radius:8px;padding:8px 12px;cursor:pointer;color:#fff;display:flex;align-items:center;gap:8px;' +
      'font-family:inherit;font-size:13px;font-weight:600;transition:background .15s;';
    btn.innerHTML = `
      <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" x2="21" y1="6" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>
      </svg>
      Корзина
      <span class="epm-cart-badge" style="display:none;position:absolute;top:-6px;right:-6px;width:18px;height:18px;
        background:#8B1A1A;color:#fff;border-radius:50%;font-size:10px;font-weight:700;
        align-items:center;justify-content:center;"></span>`;
    btn.addEventListener('click', openDrawer);
    btn.addEventListener('mouseover', () => btn.style.background = 'rgba(255,255,255,.2)');
    btn.addEventListener('mouseout', () => btn.style.background = 'rgba(255,255,255,.12)');

    const callBtn = headerRight.querySelector('.epm-call-btn');
    if (callBtn) headerRight.insertBefore(btn, callBtn);
    else headerRight.appendChild(btn);
  }

  // ─── Кнопки "В корзину" на L3 ───────────────────────────────────────────────
  function initAddToCartButtons() {
    document.querySelectorAll('[data-add-cart]').forEach(btn => {
      if (btn._cartInit) return;
      btn._cartInit = true;
      btn.addEventListener('click', function () {
        const sku = this.dataset.sku || 'unknown';
        const title = this.dataset.title || document.title;
        const price = this.dataset.price || '';
        const priceNum = parseFloat(price.replace(/[^0-9.]/g, '')) || 0;
        const image = this.dataset.image || '';
        const variant = this.dataset.variant || '';
        const qty = parseInt(this.closest('[data-variant-row]')?.querySelector('input[type=number]')?.value || 1);
        addItem({ sku, title, price, priceNum, image, variant, qty });
      });
    });
  }

  // ─── Фильтры L2 ─────────────────────────────────────────────────────────────
  function initL2Filters() {
    const grid = document.getElementById('epmProductGrid');
    if (!grid) return;
    const cards = Array.from(grid.querySelectorAll('[data-prod-card]'));
    if (!cards.length) return;

    document.addEventListener('click', function(e) {
      if (!e.target.closest('.epm-filter-dropdown'))
        document.querySelectorAll('.epm-filter-dd-list').forEach(el => el.style.display = 'none');
    });

    function getActiveFilters() {
      const r = {};
      document.querySelectorAll('.epm-filter-cb:checked').forEach(cb => {
        if (!r[cb.dataset.fname]) r[cb.dataset.fname] = [];
        r[cb.dataset.fname].push(cb.dataset.fval);
      });
      return r;
    }

    function applyFiltersSort() {
      const filters = getActiveFilters();
      const sort = (document.getElementById('epmSortSelect') || {}).value || 'default';
      const hasFilters = Object.keys(filters).length > 0;

      let visible = cards.filter(card => {
        if (!hasFilters) return true;
        const cf = JSON.parse(card.dataset.filters || '{}');
        return Object.entries(filters).every(([n, vals]) => vals.includes(cf[n]));
      });

      if (sort === 'price_asc') visible.sort((a,b) => (parseFloat(a.dataset.price)||Infinity)-(parseFloat(b.dataset.price)||Infinity));
      else if (sort === 'price_desc') visible.sort((a,b) => (parseFloat(b.dataset.price)||0)-(parseFloat(a.dataset.price)||0));
      else if (sort === 'name_asc') visible.sort((a,b) => a.dataset.name.localeCompare(b.dataset.name,'ru'));

      cards.forEach(c => c.style.display = 'none');
      visible.forEach(c => { c.style.display = ''; grid.appendChild(c); });

      const counter = document.getElementById('epmProductCount');
      if (counter) counter.textContent = visible.length;
    }

    document.querySelectorAll('.epm-filter-cb').forEach(cb => cb.addEventListener('change', applyFiltersSort));
    const sortSel = document.getElementById('epmSortSelect');
    if (sortSel) sortSel.addEventListener('change', applyFiltersSort);
    document.querySelectorAll('.epm-filter-reset').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.epm-filter-cb:checked').forEach(cb => cb.checked = false);
        applyFiltersSort();
      });
    });
  }

  // ─── Фильтры L3 ─────────────────────────────────────────────────────────────
  function initL3Filters() {
    const container = document.getElementById('epmVariantsList');
    if (!container) return;
    const rows = Array.from(container.querySelectorAll('[data-variant-row]'));
    if (!rows.length) return;

    document.addEventListener('click', function(e) {
      if (!e.target.closest('.epm-filter-dropdown'))
        document.querySelectorAll('.epm-filter-dd-list').forEach(el => el.style.display = 'none');
    });

    function apply() {
      const r = {};
      document.querySelectorAll('.epm-filter-cb:checked').forEach(cb => {
        if (!r[cb.dataset.fname]) r[cb.dataset.fname] = [];
        r[cb.dataset.fname].push(cb.dataset.fval);
      });
      const hasFilters = Object.keys(r).length > 0;
      let count = 0;
      rows.forEach(row => {
        if (!hasFilters) { row.style.display = ''; count++; return; }
        const chars = JSON.parse(row.dataset.chars || '{}');
        const match = Object.entries(r).every(([n, vals]) => vals.includes(chars[n]));
        row.style.display = match ? '' : 'none';
        if (match) count++;
      });
      const counter = document.getElementById('epmVariantCount');
      if (counter) counter.textContent = count;
    }

    document.querySelectorAll('.epm-filter-cb').forEach(cb => cb.addEventListener('change', apply));
    document.querySelectorAll('.epm-filter-reset').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.epm-filter-cb:checked').forEach(cb => cb.checked = false);
        apply();
      });
    });
  }

  // ─── Init ─────────────────────────────────────────────────────────────────────
  function init() {
    injectCartButton();
    updateBadge();
    buildDrawer();
    initAddToCartButtons();
    initL2Filters();
    initL3Filters();

    document.addEventListener('click', function(e) {
      const btn = e.target.closest('[data-add-cart]');
      if (btn && !btn._cartInit) { initAddToCartButtons(); btn.click(); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // ─── Публичный API ───────────────────────────────────────────────────────────
  window.EPMCart = {
    add: addItem,
    remove: removeItem,
    changeQty: changeQty,
    setQty: setQty,
    clear: clearCart,
    open: openDrawer,
    close: closeDrawer,
    showCart: () => setDrawerMode('cart'),
    showCheckout: () => setDrawerMode('checkout'),
    getCart: getCart,
    getTotal: () => cartTotal(getCart())
  };

})();
