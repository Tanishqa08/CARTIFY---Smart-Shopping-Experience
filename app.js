// Amazon site JS: sidebar + cart functionality
console.log('Amazon/app.js loaded');

/* Sidebar control functions */
function openSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('overlay');
  if (sb && ov) {
    sb.classList.add('open');
    ov.classList.add('show');
    document.body.style.overflow = 'hidden';
    console.log('Sidebar opened');
  }
}
function closeSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('overlay');
  if (sb && ov) {
    sb.classList.remove('open');
    ov.classList.remove('show');
    document.body.style.overflow = '';
    console.log('Sidebar closed');
  }
}
// expose to global so inline handlers work
window.openSidebar = openSidebar;
window.closeSidebar = closeSidebar;

/* LOCATION selector */
const LOCATION_KEY = 'amazon_delivery_location';
const DEFAULT_LOCATION = 'India';

function getStoredLocation() {
  const stored = localStorage.getItem(LOCATION_KEY);
  return stored ? stored : DEFAULT_LOCATION;
}

function saveStoredLocation(location) {
  if (!location) return;
  localStorage.setItem(LOCATION_KEY, location);
}

function applyLocationToPage() {
  const location = getStoredLocation();
  document.querySelectorAll('a.add-sec').forEach(el => {
    el.textContent = location;
    el.title = `Deliver to ${location}`;
  });
}

function openLocationModal() {
  const overlay = document.getElementById('location-modal-overlay');
  if (!overlay) return;
  overlay.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeLocationModal() {
  const overlay = document.getElementById('location-modal-overlay');
  if (!overlay) return;
  overlay.classList.remove('show');
  document.body.style.overflow = '';
}

function createLocationModal() {
  if (document.getElementById('location-modal-overlay')) return;
  const container = document.createElement('div');
  container.id = 'location-modal-overlay';
  container.className = 'location-modal-overlay';
  container.innerHTML = `
    <div class="location-modal" role="dialog" aria-modal="true" aria-labelledby="location-modal-title">
      <button type="button" class="location-modal-close" aria-label="Close location selector">✕</button>
      <h3 id="location-modal-title">Choose your delivery location</h3>
      <p class="location-note">Select a country or enter a postal code to update where items can be delivered.</p>
      <div class="location-location-list"></div>
      <input type="text" id="location-search" class="location-input" placeholder="Enter pin code or city" aria-label="Delivery location" />
      <button type="button" class="location-save">Save location</button>
      <p class="location-note">Your choice will be remembered for future visits.</p>
    </div>
  `;
  document.body.appendChild(container);

  container.addEventListener('click', (event) => {
    if (event.target === container) closeLocationModal();
  });

  const closeBtn = container.querySelector('.location-modal-close');
  if (closeBtn) closeBtn.addEventListener('click', closeLocationModal);

  const list = container.querySelector('.location-location-list');
  const options = ['Andhra Pradesh', 'Bihar', 'Karnataka', 'Maharashtra', 'Tamil Nadu', 'Uttar Pradesh', 'West Bengal', 'Delhi', 'Gujarat', 'Rajasthan'];
  options.forEach(location => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'location-option';
    btn.innerHTML = `<span>${location}</span><span>Deliver here</span>`;
    btn.addEventListener('click', () => {
      saveStoredLocation(location);
      applyLocationToPage();
      closeLocationModal();
    });
    list.appendChild(btn);
  });

  const searchInput = container.querySelector('#location-search');
  const saveBtn = container.querySelector('.location-save');
  if (saveBtn && searchInput) {
    saveBtn.addEventListener('click', () => {
      const value = searchInput.value.trim();
      if (!value) return;
      saveStoredLocation(value);
      applyLocationToPage();
      closeLocationModal();
    });
    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        saveBtn.click();
      }
    });
  }
}

function attachLocationHandlers() {
  document.querySelectorAll('a.add-sec').forEach(el => {
    el.addEventListener('click', (event) => {
      event.preventDefault();
      createLocationModal();
      openLocationModal();
    });
  });
}

function initLocationFeature() {
  applyLocationToPage();
  attachLocationHandlers();
}

/* CART (localStorage) */
const CART_KEY = 'amazon_cart_v1';

function getCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Error reading cart', e);
    return [];
  }
}
function saveCart(cart) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  } catch (e) {
    console.error('Error saving cart', e);
  }
}
function updateCartCount() {
  const cart = getCart();
  const count = cart.reduce((s, it) => s + (it.quantity || 0), 0);
  let badge = document.getElementById('cart-count');
  if (!badge) {
    const navCart = document.querySelector('.nav-cart');
    if (navCart) {
      badge = document.createElement('span');
      badge.id = 'cart-count';
      badge.className = 'cart-count';
      navCart.appendChild(badge);
    }
  }
  if (badge) badge.textContent = count;
}
function addToCart(product) {
  if (!product || !product.id) return;
  const cart = getCart();
  const idx = cart.findIndex(i => i.id === product.id);
  if (idx > -1) {
    cart[idx].quantity = (cart[idx].quantity || 0) + (product.quantity || 1);
  } else {
    cart.push({ ...product, quantity: product.quantity || 1 });
  }
  saveCart(cart);
  updateCartCount();
  // try to sync to backend (best-effort)
  try { syncAddToBackend(product); } catch (e) { /* no-op */ }
  console.log('Added to cart', product);
}
function removeFromCart(id) {
  let cart = getCart();
  cart = cart.filter(i => i.id !== id);
  saveCart(cart);
  updateCartCount();
  try { syncRemoveFromBackend(id); } catch (e) { /* no-op */ }
}
function changeQuantity(id, qty) {
  const cart = getCart();
  const idx = cart.findIndex(i => i.id === id);
  if (idx > -1) {
    cart[idx].quantity = qty;
    if (cart[idx].quantity <= 0) cart.splice(idx, 1);
    saveCart(cart);
    updateCartCount();
    try { syncUpdateQuantity(id, qty); } catch (e) { /* no-op */ }
  }
}

// --- Hybrid sync helpers: sync local changes to backend and keep a retry queue ---
const SYNC_QUEUE_KEY = 'amazon_cart_sync_queue';

function queueSync(op) {
  try {
    const raw = localStorage.getItem(SYNC_QUEUE_KEY) || '[]';
    const q = JSON.parse(raw);
    q.push(op);
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(q));
  } catch (e) {
    console.warn('queueSync failed', e);
  }
}

async function processSyncQueue() {
  try {
    const raw = localStorage.getItem(SYNC_QUEUE_KEY) || '[]';
    const q = JSON.parse(raw);
    if (!Array.isArray(q) || q.length === 0) return;
    const remaining = [];
    for (const op of q) {
      try {
        if (op.type === 'add' || op.type === 'post') {
          await fetch('/api/cart', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(op.item) });
        } else if (op.type === 'put') {
          await fetch(`/api/cart/${encodeURIComponent(op.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quantity: op.qty }) });
        } else if (op.type === 'delete') {
          await fetch(`/api/cart/${encodeURIComponent(op.id)}`, { method: 'DELETE' });
        }
        // success -> continue
      } catch (e) {
        // keep for retry
        remaining.push(op);
      }
    }
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(remaining));
  } catch (e) {
    console.warn('processSyncQueue failed', e);
  }
}

async function syncAddToBackend(item) {
  try {
    await fetch('/api/cart', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item) });
  } catch (e) {
    console.warn('syncAddToBackend failed, queued', e);
    queueSync({ type: 'add', item });
  }
}

async function syncUpdateQuantity(id, qty) {
  try {
    await fetch(`/api/cart/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quantity: qty }) });
  } catch (e) {
    console.warn('syncUpdateQuantity failed, queued', e);
    queueSync({ type: 'put', id, qty });
  }
}

async function syncRemoveFromBackend(id) {
  try {
    await fetch(`/api/cart/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch (e) {
    console.warn('syncRemoveFromBackend failed, queued', e);
    queueSync({ type: 'delete', id });
  }
}

// On startup, merge server cart with local cart (take max quantity per id) and push merged to server
async function syncOnStartup() {
  try {
    const res = await fetch('/api/cart');
    if (!res.ok) return;
    const serverCart = await res.json();
    if (!Array.isArray(serverCart)) return;
    const local = getCart();
    const map = new Map();
    // add local
    local.forEach(it => map.set(String(it.id), { ...it }));
    // merge server: prefer max quantity
    serverCart.forEach(it => {
      const key = String(it.id);
      if (map.has(key)) {
        const localIt = map.get(key);
        localIt.quantity = Math.max(localIt.quantity || 0, it.quantity || 0);
        map.set(key, localIt);
      } else {
        map.set(key, { ...it });
      }
    });
    const merged = Array.from(map.values());
    saveCart(merged);
    updateCartCount();
    // push merged to server (ensure server has all items)
    for (const it of merged) {
      try { await fetch('/api/cart', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(it) }); }
      catch (e) { queueSync({ type: 'add', item: it }); }
    }
    // finally process any queued ops
    await processSyncQueue();
  } catch (e) {
    // offline or server not available
    console.warn('syncOnStartup skipped', e);
  }
}

// retry when back online
window.addEventListener('online', () => {
  processSyncQueue().catch(() => {});
});

// run startup sync after DOM ready
document.addEventListener('DOMContentLoaded', () => {
  // attempt startup sync but don't block UI
  setTimeout(() => { syncOnStartup().catch(() => {}); processSyncQueue().catch(() => {}); }, 500);
});

/* Render cart page if present */
function renderCartPage() {
  const root = document.getElementById('cart-root');
  if (!root) return;
  const cart = getCart();

  if (cart.length === 0) {
    root.innerHTML = `<div class="cart-empty"><h2>Your cart is empty</h2><a href="index.html" class="btn">Continue shopping</a></div>`;
    return;
  }

  let total = 0;
  const rows = cart.map(item => {
    const price = Number(item.price) || 0;
    const line = price * (item.quantity || 1);
    total += line;
    return `
      <div class="cart-item" data-id="${item.id}">
        <img src="${item.image || ''}" alt="" />
        <div class="cart-info">
          <h4>${item.name}</h4>
          <p class="cart-price">₹${price.toFixed(2)}</p>
          <div class="cart-qty">
            <button class="qty-decrease">-</button>
            <input class="qty-input" type="number" min="1" value="${item.quantity}" />
            <button class="qty-increase">+</button>
            <button class="remove-item">Remove</button>
          </div>
        </div>
      </div>`;
  }).join('');

  root.innerHTML = `
    <div class="cart-page">
      <h2>Your Cart</h2>
      <div class="cart-grid">
        <main class="cart-main">
          <div class="cart-list">${rows}</div>
        </main>
        <aside class="cart-sidebar">
          <div class="cart-summary">
            <p>Total: <strong>₹${total.toFixed(2)}</strong></p>
            <a href="index.html" class="btn">Continue Shopping</a>
            <button class="btn checkout">Checkout</button>
          </div>
        </aside>
      </div>
    </div>
  `;

  // attach listeners
  root.querySelectorAll('.remove-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.closest('.cart-item').dataset.id;
      removeFromCart(id);
      renderCartPage();
    });
  });
  root.querySelectorAll('.qty-increase').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const el = e.target.closest('.cart-item');
      const id = el.dataset.id;
      const input = el.querySelector('.qty-input');
      const newQty = Number(input.value) + 1;
      input.value = newQty;
      changeQuantity(id, newQty);
      renderCartPage();
    });
  });
  root.querySelectorAll('.qty-decrease').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const el = e.target.closest('.cart-item');
      const id = el.dataset.id;
      const input = el.querySelector('.qty-input');
      const newQty = Math.max(1, Number(input.value) - 1);
      input.value = newQty;
      changeQuantity(id, newQty);
      renderCartPage();
    });
  });
  root.querySelectorAll('.qty-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const el = e.target.closest('.cart-item');
      const id = el.dataset.id;
      const newQty = Math.max(1, Number(e.target.value) || 1);
      e.target.value = newQty;
      changeQuantity(id, newQty);
      renderCartPage();
    });
  });
}

/* DOM ready: attach add-to-cart buttons and other listeners */
document.addEventListener('DOMContentLoaded', () => {
  console.log('Amazon/app.js: DOMContentLoaded');

  // Ensure cart count element exists
  updateCartCount();

  // Initialize delivery location label and modal behavior
  if (typeof initLocationFeature === 'function') initLocationFeature();

  // Add 'Add to cart' buttons to each product .item if not already present
  ensureAddToCartButtons();

  // If on cart page, render cart
  if (document.getElementById('cart-root')) renderCartPage();

  // Attach fallback handlers for sidebar and overlay
  const pannelBtn = document.querySelector('.pannel-icon');
  if (pannelBtn) pannelBtn.addEventListener('click', openSidebar);
  const overlay = document.getElementById('overlay');
  if (overlay) overlay.addEventListener('click', closeSidebar);

  // Ensure clicking the cart area opens the cart page (defensive)
  const navCartEl = document.querySelector('.nav-cart');
  if (navCartEl) {
    navCartEl.addEventListener('click', (e) => {
      // allow default for anchor, but force navigation to correct page anyway
      window.location.href = './cart.html';
    });
  }

  // ESC to close sidebar or location modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSidebar();
      if (typeof closeLocationModal === 'function') closeLocationModal();
    }
  });

  // Search / filter: filter all .item products by header input and category select
  (function() {
    const searchInput = document.querySelector('.nav-input');
    const categorySelect = document.querySelector('.nav-select');
    if (!searchInput) return;

    // ensure a no-results placeholder exists (insert before footer)
    let noResults = document.getElementById('no-results');
    if (!noResults) {
      noResults = document.createElement('div');
      noResults.id = 'no-results';
      noResults.style.padding = '18px';
      noResults.style.textAlign = 'center';
      noResults.style.color = '#666';
      noResults.style.display = 'none';
      const footer = document.querySelector('footer');
      if (footer && footer.parentNode) footer.parentNode.insertBefore(noResults, footer);
      else document.body.appendChild(noResults);
    }

    let debounceTimer = null;
    function filterProducts() {
      const q = (searchInput.value || '').trim().toLowerCase();
      const cat = categorySelect ? (categorySelect.value || '').trim().toLowerCase() : '';
      const items = Array.from(document.querySelectorAll('.item'));
      let visible = 0;

      items.forEach(it => {
        const texts = Array.from(it.querySelectorAll('p')).map(p => p.innerText).join(' ').toLowerCase();
        const img = it.querySelector('img');
        const src = img ? (img.getAttribute('src') || '').toLowerCase() : '';
        const priceEl = it.querySelector('.price');
        const priceText = priceEl ? priceEl.innerText.toLowerCase() : '';

        const matchesQuery = !q || texts.includes(q) || src.includes(q) || priceText.includes(q);
        const matchesCategory = !cat || cat === 'all' || texts.includes(cat) || src.includes(cat);
        const show = matchesQuery && matchesCategory;
        it.style.display = show ? '' : 'none';
        if (show) visible++;
      });

      if (visible === 0) {
        noResults.textContent = 'No results found';
        noResults.style.display = '';
      } else {
        noResults.style.display = 'none';
      }
    }

    const schedule = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(filterProducts, 200);
    };

    searchInput.addEventListener('input', schedule);
    if (categorySelect) categorySelect.addEventListener('change', schedule);

    // run once to normalize view
    filterProducts();
  })();

  attachSecondShopInfo();

  // Fetch and render products from API
  fetchAndRenderProducts();
});

// make functions available if other pages/scripts need them
window.addToCart = addToCart;
window.getCart = getCart;
window.removeFromCart = removeFromCart;
window.changeQuantity = changeQuantity;
window.renderCartPage = renderCartPage;

// Ensure add-to-cart buttons exist for any .item elements (safe to call multiple times)
function ensureAddToCartButtons(rootDocument = document) {
  rootDocument.querySelectorAll('.item').forEach((it, i) => {
    if (!it.querySelector('.add-to-cart')) {
      const btn = document.createElement('button');
      btn.className = 'add-to-cart';
      btn.type = 'button';
      btn.textContent = 'Add to cart';
      const img = it.querySelector('img');
      const nameEl = it.querySelector('p');
      const id = img ? (img.getAttribute('src') || `item-${i}`) : `item-${i}`;

      // Detect price: prefer data-price, then .price text, otherwise generate a demo price
      async function fetchAndRenderProducts() {
  const res = await fetch("http://localhost:3000/products");
  const products = await res.json();
}
      let price = 0;
      if (it.dataset && it.dataset.price) {
        price = Number(it.dataset.price) || 0;
      } else {
        const priceEl = it.querySelector('.price');
        if (priceEl) {
          const txt = priceEl.innerText.replace(/[^0-9.]/g, '');
          price = Number(txt) || 0;
        } else {
          price = Math.floor(199 + (i * 37) % 9800);
          const pEl = document.createElement('p');
          pEl.className = 'price';
          pEl.style.fontWeight = '700';
          pEl.style.marginTop = '6px';
          pEl.textContent = '₹' + price.toFixed(2);
          it.appendChild(pEl);
        }
      }

      btn.addEventListener('click', () => {
        const product = {
          id: id,
          name: nameEl ? nameEl.innerText.trim() : 'Product',
          price: Number(price) || 0,
          image: img ? img.getAttribute('src') : '',
          quantity: 1
        };
        addToCart(product);
        btn.textContent = 'Added';
        setTimeout(() => btn.textContent = 'Add to cart', 800);
      });
      it.appendChild(btn);
    }
  });
}

function attachSecondShopInfo() {
  const infoTitle = document.getElementById('second-shop-info-title');
  const infoText = document.getElementById('second-shop-info-text');
  if (!infoTitle || !infoText) return;

  document.querySelectorAll('.second-shop .product-list').forEach(item => {
    item.style.cursor = 'pointer';
    item.addEventListener('click', () => {
      const title = item.dataset.title || 'Product information';
      const description = item.dataset.description || 'More details about this item are available here.';
      infoTitle.textContent = title;
      infoText.textContent = description;
    });
  });
}

// Fetch products from public API and render three API-driven sections near the bottom of the page
async function fetchAndRenderProducts() {
  // remove previously existing product sections to replace with API results
  document.querySelectorAll('.more-products').forEach(el => el.remove());

  // target insertion point: before footer if present, otherwise at end of body
  const footer = document.querySelector('footer');
  const insertBefore = footer && footer.parentNode ? footer : null;

  // try to fetch a larger set of products
  let products = [];
  try {
    // prefer local dev backend if available
    const localRes = await fetch('/api/products');
    if (localRes.ok) {
      products = await localRes.json();
    } else {
      const res = await fetch('https://fakestoreapi.com/products?limit=24');
      if (res.ok) products = await res.json();
    }
  } catch (e) {
    console.warn('Could not fetch remote products, will generate demo items.', e);
  }

  // if (!products || products.length === 0) {
  //   products = Array.from({ length: 24 }).map((_, idx) => ({
  //     id: `demo-${idx+1}`,
  //     title: `Demo Product ${idx+1}`,
  //     // price: Math.floor(299 + idx * 50),
  //     image: `box${(idx % 4) + 1}.jpg`,
  //     category: 'demo'
  //   }));
  // }

  // render into #api-grid if present, otherwise fall back to three-column wrapper
  const apiRoot = document.getElementById('api-grid');
  if (apiRoot) {
    apiRoot.innerHTML = '';
    products.slice(0, 12).forEach((p, idx) => {
      const priceInr = p.price ? Number(p.price) : Math.floor(199 + idx * 37);
      const item = document.createElement('div');
      item.className = 'item api-item';
      item.dataset.price = priceInr;

      const img = document.createElement('img'); img.src = p.image || ''; img.alt = p.title || '';
      item.appendChild(img);
      const titleP = document.createElement('p'); titleP.innerText = p.title || 'Product'; item.appendChild(titleP);
      const priceEl = document.createElement('p'); priceEl.className = 'price'; priceEl.innerText = '₹' + (Number(priceInr)).toFixed(2);
      item.appendChild(priceEl);

      apiRoot.appendChild(item);
    });

    ensureAddToCartButtons();
    const searchInput = document.querySelector('.nav-input');
    if (searchInput) searchInput.dispatchEvent(new Event('input'));
    return;
  }

  // normalize: ensure at least 24 items by repeating if necessary
  while (products.length < 24) products = products.concat(products.slice(0, 24 - products.length));

  // helper to build a section with given title and items array
  function buildSection(title, items, extraClass) {
    const section = document.createElement('section');
    section.className = 'more-products' + (extraClass ? ' ' + extraClass : '');
    const inner = document.createElement('div'); inner.className = 'container';
    const box = document.createElement('div'); box.className = 'box';
    const h2 = document.createElement('h2'); h2.innerText = title; box.appendChild(h2);
    const grid = document.createElement('div'); grid.className = 'grid';

    items.forEach((p, idx) => {
      const priceInr = p.price ? Number(p.price) : Math.floor(199 + idx * 37);
      const item = document.createElement('div');
      item.className = 'item';
      item.dataset.price = priceInr;

      const img = document.createElement('img'); img.src = p.image || ''; img.alt = p.title || '';
      item.appendChild(img);
      const titleP = document.createElement('p'); titleP.innerText = p.title || 'Product'; item.appendChild(titleP);
      const priceEl = document.createElement('p'); priceEl.className = 'price'; priceEl.innerText = '₹' + (Number(priceInr)).toFixed(2);
      item.appendChild(priceEl);
      grid.appendChild(item);
    });

    box.appendChild(grid); inner.appendChild(box); section.appendChild(inner);
    return section;
  }

  // split into three groups of 8
  const groupSize = 8;
  const groupA = products.slice(0, groupSize);
  const groupB = products.slice(groupSize, groupSize * 2);
  const groupC = products.slice(groupSize * 2, groupSize * 3);

  const secA = buildSection('Top Deals', groupA, 'api-products');

//build only one group for now to keep it simple and avoid overwhelming the user with too many items at once. Can easily add more sections later if needed.
  const threeCol = buildSection('Top Deals', groupA, 'api-products');

  if (insertBefore) {
    insertBefore.parentNode.insertBefore(threeCol, insertBefore);
  } else {
    document.body.appendChild(threeCol);
  }

  // attach add-to-cart buttons to new items and trigger search filter update
  ensureAddToCartButtons();
  const searchInput = document.querySelector('.nav-input');
  if (searchInput) {
    searchInput.dispatchEvent(new Event('input'));
  }
}
