const fallbackMenu = [
  { id: 1, name: 'Карбонара', category: 'Паста', price: 390, description: 'Макароны с сыром и беконом', photo_url: 'assets/products/01-carbonara.jpeg' },
  { id: 2, name: 'Картошка с рыбой', category: 'Горячее', price: 420, description: 'Картофель, зелень, рыбный стейк и лимон', photo_url: 'assets/products/02-fish-potato.jpeg' },
  { id: 3, name: 'Диетический ужин', category: 'Диетическое', price: 310, description: 'Курица и овощи', photo_url: 'assets/products/03-diet-dinner.jpeg' },
  { id: 4, name: 'Суп с сухариками', category: 'Супы', price: 370, description: 'Куриный бульон, зелень и сухари', photo_url: 'assets/products/04-chicken-soup.jpeg' },
  { id: 5, name: 'Рис с овощами', category: 'Гарниры', price: 390, description: 'Отварной рис и овощи', photo_url: 'assets/products/05-rice-vegetables.jpeg' },
  { id: 6, name: 'Суп рамен', category: 'Супы', price: 450, description: 'Куриный бульон, варёное яйцо, куриная грудка, овощи и лапша', photo_url: 'assets/products/06-ramen.jpeg' },
  { id: 7, name: 'Кока-кола', category: 'Напитки', price: 90, description: 'Объём: 200 мл', photo_url: 'assets/products/07-coca-cola.jpeg' },
  { id: 8, name: 'Клубничный милкшейк', category: 'Милкшейки', price: 120, description: 'Объём: 200 мл · молоко и клубника', photo_url: 'assets/products/08-strawberry-milkshake.jpeg' },
  { id: 9, name: 'Вино красное полусухое', category: 'Алкогольные напитки', price: 500, description: 'Объём: 150 мл', photo_url: 'assets/products/09-red-wine.jpeg' },
  { id: 10, name: 'Виски со льдом', category: 'Алкогольные напитки', price: 700, description: 'Объём: 125 мл', photo_url: 'assets/products/10-whiskey-ice.jpeg' },
];

const $ = (selector) => document.querySelector(selector);
const tg = window.Telegram?.WebApp;
const initData = tg?.initData || '';
const userId = initData ? tg.initDataUnsafe?.user?.id ?? null : null;
const isLocalFile = location.protocol === 'file:';
const maxQuantity = 30;
const pluralRules = new Intl.PluralRules('ru-RU');
const emptyCart = '<p class="empty">Корзина пуста. Добавьте блюда из меню.</p>';

let products = [];
let categories = [];
let activeCategory = null;
let config = {};
let currencyFormatter = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
let catalogState = 'loading';
let cart = {};
let activeOverlay = null;
let overlayOpener = null;
let placingOrder = false;
let loadingOrders = false;
let waitingForAi = false;
let toastTimer;
const addTimers = new WeakMap();

if (tg) {
  tg.ready();
  tg.expand();
  if (tg.isVersionAtLeast('6.1')) {
    tg.setBackgroundColor('#f8f4ed');
    tg.BackButton.onClick(goBack);
  }
  if (tg.isVersionAtLeast('6.9')) tg.setHeaderColor('#f8f4ed');
}

function escapeHtml(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value ?? '').replace(/[&<>"']/g, (character) => entities[character]);
}

function setMessage(selector, message) {
  const element = $(selector);
  if (!element) return;
  element.textContent = message;
  element.hidden = !message;
}

function formatCount(count) {
  const words = { one: 'позиция', few: 'позиции', many: 'позиций' };
  return `${count} ${words[pluralRules.select(count)] ?? 'позиции'}`;
}

function money(amount) {
  return currencyFormatter.format(amount);
}

function normalizeSearch(value) {
  return String(value ?? '').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
}

async function api(url, { timeout, ...options } = {}) {
  const controller = timeout ? new AbortController() : null;
  const timer = controller && setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller?.signal,
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data === null) {
      const detail = data?.detail;
      if (detail === 'Invalid Telegram session' || detail === 'Telegram session is required') {
        throw new Error('Сессия истекла. Откройте мини-приложение заново из Telegram.');
      }
      if (detail === 'Telegram auth is not configured') {
        throw new Error('История заказов сейчас недоступна.');
      }
      if (typeof detail === 'string' && detail.startsWith('ИИ-консультант пока не подключён')) {
        throw new Error('Консультант сейчас недоступен.');
      }
      if (Array.isArray(detail)) {
        throw new Error('Проверьте заполнение полей и попробуйте снова.');
      }
      throw new Error(typeof detail === 'string' ? detail : 'Сервис временно недоступен.');
    }
    return data;
  } catch (error) {
    if (error instanceof TypeError || error.name === 'AbortError') {
      throw new Error('Нет связи с сервером. Проверьте подключение к интернету.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function loadMenu() {
  if (isLocalFile) {
    catalogState = 'preview';
  } else {
    const [menuResult, configResult] = await Promise.allSettled([
      api('/api/products', { timeout: 7000 }),
      api('/api/config', { timeout: 7000 }),
    ]);
    if (configResult.status === 'fulfilled') applyConfig(configResult.value);
    if (menuResult.status === 'fulfilled' && Array.isArray(menuResult.value)) {
      products = [...menuResult.value].sort((left, right) => left.id - right.id);
      catalogState = 'ready';
    } else {
      catalogState = 'preview';
    }
  }

  if (catalogState === 'preview') {
    products = fallbackMenu;
    const previewMessage = isLocalFile
      ? 'Демонстрационное меню. Для оформления заказа откройте приложение через сервер.'
      : 'Каталог временно недоступен. Показано демонстрационное меню.';
    setMessage('#menuStatus', previewMessage);
  } else {
    setMessage('#menuStatus', '');
  }
  categories = [...new Set(products.map((product) => product.category))];
  cart = readCart();
  renderCategories();
  renderProducts();
  renderCart();
  updateAiAvailability();
}

function applyConfig(settings) {
  config = settings;
  const name = settings.restaurant_name?.trim();
  if (name && !/^(?:dolce(?: restaurant)?|lvcs restaurant)$/i.test(name)) {
    $('#brandName').textContent = name;
    if ($('#footerBrandName')) $('#footerBrandName').textContent = name;
  }
  const description = settings.description?.trim();
  if (description && description !== 'Вкусная еда, приготовленная с заботой') {
    $('#restaurantDesc').textContent = description;
  }
  const contacts = [settings.address, settings.phone, settings.working_hours].filter(Boolean);
  setMessage('#footerInfo', contacts.join(' · '));
  if (/^[a-z]{3}$/i.test(settings.currency)) {
    currencyFormatter = new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: settings.currency,
      maximumFractionDigits: 0,
    });
  }
}

function renderCategories() {
  $('#categories').innerHTML = [null, ...categories].map((category, index) => {
    const selected = category === activeCategory;
    return `<button type="button" class="category${selected ? ' active' : ''}" data-cat="${index}" aria-pressed="${selected}">${escapeHtml(category ?? 'Все')}</button>`;
  }).join('');
}

function selectCategory(button) {
  activeCategory = categories[Number(button.dataset.cat) - 1] ?? null;
  const previous = $('#categories .active');
  previous?.classList.remove('active');
  previous?.setAttribute('aria-pressed', 'false');
  button.classList.add('active');
  button.setAttribute('aria-pressed', 'true');
  renderProducts();
}

function productPhoto(url) {
  const placeholder = '<span class="product-placeholder" aria-hidden="true"';
  if (!url) return `${placeholder}>Фото пока нет</span>`;
  const imageUrl = isLocalFile && /^\/[^/]/.test(url) ? url.slice(1) : url;
  return `<img src="${escapeHtml(imageUrl)}" alt="" loading="lazy" decoding="async">${placeholder} hidden>Фото пока нет</span>`;
}

function renderProducts() {
  if (catalogState === 'loading') return;

  const search = normalizeSearch($('#searchInput').value).trim();
  const terms = search.split(/\s+/);
  const matches = products.filter((product) => {
    if (activeCategory && product.category !== activeCategory) return false;
    const searchable = normalizeSearch([product.name, product.description, product.category].join(' '));
    return terms.every((term) => searchable.includes(term));
  });
  $('#productCount').textContent = formatCount(matches.length);
  $('#menuTitle').textContent = activeCategory ?? 'Все блюда';
  const grid = $('#products');
  grid.removeAttribute('aria-busy');
  grid.innerHTML = matches.length ? matches.map((product) => `
    <article class="product-card">
      <div class="product-photo">${productPhoto(product.photo_url)}</div>
      <div class="product-info">
        <span class="product-category">${escapeHtml(product.category)}</span>
        <h3>${escapeHtml(product.name)}</h3>
        <p>${escapeHtml(product.description || '')}</p>
        <div class="product-bottom">
          <b class="price">${product.price > 0 ? money(product.price) : 'Цена уточняется'}</b>
          <button type="button" class="add-btn" data-add="${product.id}"
            aria-label="Добавить в корзину: ${escapeHtml(product.name)}" ${product.price > 0 ? '' : 'disabled'}>
            <span aria-hidden="true">+</span>
          </button>
        </div>
      </div>
    </article>`).join('') : `<p class="empty">${search ? 'Ничего не найдено. Попробуйте изменить запрос.' : 'В этом разделе пока нет позиций.'}</p>`;
}

function cartStorageKey() {
  return catalogState === 'ready' ? 'dolce_cart' : 'dolce_preview_cart';
}

function readCart() {
  try {
    const stored = JSON.parse(localStorage.getItem(cartStorageKey()) || '{}');
    return Object.fromEntries(products.flatMap((product) => {
      const quantity = Number(stored?.[product.id]);
      return Number.isInteger(quantity) && quantity > 0 && product.price > 0
        ? [[product.id, Math.min(quantity, maxQuantity)]]
        : [];
    }));
  } catch {
    return {};
  }
}

function saveCart() {
  try {
    localStorage.setItem(cartStorageKey(), JSON.stringify(cart));
  } catch {
    // Keep the cart usable for this visit when storage is blocked.
  }
  renderCart();
}

function cartEntries() {
  return products.filter((product) => cart[product.id]).map((product) => ({
    product,
    quantity: cart[product.id],
  }));
}

function renderCart() {
  const entries = cartEntries();
  const count = entries.reduce((sum, { quantity }) => sum + quantity, 0);
  const subtotal = entries.reduce((sum, { product, quantity }) => sum + product.price * quantity, 0);
  const delivery = count ? config.delivery_fee || 0 : 0;
  const total = money(subtotal + delivery);

  const badge = $('#cartCount');
  badge.textContent = count;
  badge.hidden = !count;
  $('#cartOpen').setAttribute('aria-label', count ? `Корзина, ${formatCount(count)}` : 'Корзина');
  const cartBar = $('#cartBar');
  if (cartBar) {
    cartBar.hidden = !count;
    setMessage('#cartBarCount', formatCount(count));
    setMessage('#cartBarTotal', total);
  }
  $('#cartTotal').textContent = total;
  setMessage('#cartDelivery', delivery ? `Доставка · ${money(delivery)}` : '');
  const checkout = $('#checkoutOpen');
  checkout.disabled = !count || catalogState !== 'ready';
  setMessage('#cartNotice', count && catalogState === 'preview' ? 'Для оформления заказа нужен доступ к серверу.' : '');

  const focused = document.activeElement;
  const cartItems = $('#cartItems');
  cartItems.innerHTML = entries.length ? entries.map(({ product, quantity }) => `
    <div class="cart-line">
      <div><b>${escapeHtml(product.name)}</b><br><small>${money(product.price * quantity)}</small></div>
      <div class="qty">
        <button type="button" data-qty="${product.id}" data-delta="-1"
          aria-label="Уменьшить количество: ${escapeHtml(product.name)}">−</button>
        <b>${quantity}</b>
        <button type="button" data-qty="${product.id}" data-delta="1"
          aria-label="Увеличить количество: ${escapeHtml(product.name)}" ${quantity >= maxQuantity ? 'disabled' : ''}>+</button>
      </div>
    </div>`).join('') : emptyCart;

  if (focused?.matches('[data-qty]')) {
    const quantityButtons = [...cartItems.querySelectorAll('[data-qty]:not(:disabled)')];
    const matchingButton = quantityButtons.find((button) => button.dataset.qty === focused.dataset.qty && button.dataset.delta === focused.dataset.delta);
    const sameProduct = quantityButtons.find((button) => button.dataset.qty === focused.dataset.qty);
    (matchingButton ?? sameProduct ?? quantityButtons[0] ?? $('#cartDrawer [data-close]'))?.focus();
  }
}

function notify(message) {
  clearTimeout(toastTimer);
  setMessage('#toast', message);
  toastTimer = setTimeout(() => setMessage('#toast', ''), 2300);
}

function addProduct(button) {
  const product = products.find(({ id }) => String(id) === button.dataset.add);
  if (!product || product.price <= 0) return;

  const quantity = cart[product.id] || 0;
  if (quantity >= maxQuantity) {
    notify(`До ${maxQuantity} порций одной позиции в заказе.`);
    return;
  }
  cart[product.id] = quantity + 1;
  saveCart();

  const icon = button.querySelector('span');
  clearTimeout(addTimers.get(button));
  button.classList.add('is-added');
  icon.textContent = '✓';
  addTimers.set(button, setTimeout(() => {
    button.classList.remove('is-added');
    icon.textContent = '+';
  }, 850));
  notify(`${product.name} в корзине × ${cart[product.id]}`);
}

function changeQuantity(button) {
  const id = button.dataset.qty;
  const quantity = (cart[id] || 0) + Number(button.dataset.delta);
  if (quantity > maxQuantity) return;
  if (quantity > 0) cart[id] = quantity;
  else delete cart[id];
  saveCart();
}

function setOverlayState(overlay, open) {
  overlay.classList.toggle('open', open);
  overlay.setAttribute('aria-hidden', String(!open));
  overlay.toggleAttribute('inert', !open);
}

function setPageInert(inert) {
  document.body.classList.toggle('overlay-open', inert);
  document.querySelectorAll('[data-overlay-inert]').forEach((region) => region.toggleAttribute('inert', inert));
  $('#shade').classList.toggle('open', inert);
}

function showOverlay(selector, opener = document.activeElement) {
  const next = $(selector);
  if (activeOverlay === next) return;
  if (!activeOverlay) overlayOpener = opener;
  const previous = activeOverlay;
  activeOverlay = next;
  setOverlayState(next, true);
  (next.querySelector('[data-close]') ?? next).focus({ preventScroll: true });
  if (previous) setOverlayState(previous, false);
  setPageInert(true);
  if (tg?.isVersionAtLeast('6.1')) tg.BackButton.show();
}

function closeOverlay() {
  if (!activeOverlay) return;
  setPageInert(false);
  if (tg?.isVersionAtLeast('6.1')) tg.BackButton.hide();
  if (overlayOpener?.getClientRects().length) overlayOpener.focus({ preventScroll: true });
  else $('#cartOpen').focus({ preventScroll: true });
  setOverlayState(activeOverlay, false);
  activeOverlay = null;
  overlayOpener = null;
}

function goBack() {
  if (activeOverlay?.id === 'checkoutModal') showOverlay('#cartDrawer');
  else closeOverlay();
}

function containFocus(event) {
  if (!activeOverlay) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    goBack();
    return;
  }
  if (event.key !== 'Tab') return;
  const targets = [...activeOverlay.querySelectorAll('button, a[href], input, textarea, select, [tabindex]')]
    .filter((element) => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length);
  if (!targets.length) {
    event.preventDefault();
    return;
  }
  const first = targets[0];
  const last = targets[targets.length - 1];
  const focused = document.activeElement;
  if (event.shiftKey && (focused === first || !targets.includes(focused))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (focused === last || !targets.includes(focused))) {
    event.preventDefault();
    first.focus();
  }
}

async function placeOrder(event) {
  event.preventDefault();
  if (placingOrder || catalogState !== 'ready') return;

  const form = event.currentTarget;
  const formData = new FormData(form);
  const submit = form.querySelector('button[type="submit"], button:not([type])');
  const items = cartEntries().map(({ product, quantity }) => ({ product_id: product.id, quantity }));
  if (!items.length) return;
  const label = submit.textContent;

  placingOrder = true;
  submit.disabled = true;
  submit.textContent = 'Отправляем…';
  setMessage('#checkoutError', '');
  try {
    const result = await api('/api/orders', {
      method: 'POST',
      body: JSON.stringify({ ...Object.fromEntries(formData), user_id: userId, init_data: initData, items }),
    });

    for (const { product_id: id, quantity } of items) {
      const remaining = (cart[id] || 0) - quantity;
      if (remaining > 0) cart[id] = remaining;
      else delete cart[id];
    }
    saveCart();
    const discount = result.discount ? ` Скидка по промокоду · ${money(result.discount)}.` : '';
    $('#successText').textContent = `Заказ №${result.order_id} на сумму ${money(result.total)} принят.${discount} Менеджер свяжется с вами.`;
    form.reset();
    showOverlay('#successModal');
  } catch (error) {
    setMessage('#checkoutError', error.message);
    if (activeOverlay?.id !== 'checkoutModal') notify(error.message);
  } finally {
    placingOrder = false;
    submit.disabled = false;
    submit.textContent = label;
  }
}

const orderStatuses = {
  new: 'Принят',
  confirmed: 'Подтверждён',
  cooking: 'Готовится',
  ready: 'Готов',
  delivering: 'В пути',
  completed: 'Выполнен',
  cancelled: 'Отменён',
};

async function loadOrders(event) {
  showOverlay('#ordersDrawer', event.currentTarget);
  const list = $('#ordersList');
  if (!userId) {
    list.innerHTML = '<p class="empty">Откройте мини-приложение из Telegram, чтобы посмотреть историю заказов.</p>';
    return;
  }
  if (loadingOrders) return;

  loadingOrders = true;
  list.innerHTML = '<p class="empty">Загружаем заказы…</p>';
  try {
    const orders = await api(`/api/orders/${encodeURIComponent(userId)}?init_data=${encodeURIComponent(initData)}`, { timeout: 10000 });
    list.innerHTML = orders.length ? orders.map((order) => `
      <div class="order-card">
        <b>Заказ №${escapeHtml(order.id)} · ${escapeHtml(orderStatuses[order.status] ?? order.status)}</b>
        <small>${order.items.map((item) => `${escapeHtml(item.name)} × ${escapeHtml(item.quantity)}`).join(', ')}<br>${money(order.total)}</small>
      </div>`).join('') : '<p class="empty">У вас пока нет заказов.</p>';
  } catch (error) {
    list.innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`;
  } finally {
    loadingOrders = false;
  }
}

function updateAiAvailability() {
  const available = !isLocalFile && catalogState !== 'preview' && config.ai_enabled !== false;
  $('#aiForm button').disabled = !available || waitingForAi;
  $('#aiInput').disabled = !available;
  setMessage('#aiNotice', available ? '' : 'Консультант сейчас недоступен.');
}

function addBubble(message, role) {
  const messages = $('#aiMessages');
  const bubble = document.createElement('div');
  bubble.className = `bubble ${role}`;
  bubble.textContent = message;
  messages.append(bubble);
  messages.scrollTop = messages.scrollHeight;
  return bubble;
}

async function sendAiMessage(event) {
  event.preventDefault();
  const input = $('#aiInput');
  const message = input.value.trim();
  if (!message || input.disabled || waitingForAi) return;

  const submit = event.currentTarget.querySelector('button');
  waitingForAi = true;
  submit.disabled = true;
  input.value = '';
  addBubble(message, 'user');
  const response = addBubble('Подбираем блюда…', 'bot');
  try {
    const result = await api('/api/ai', {
      method: 'POST',
      timeout: 40000,
      body: JSON.stringify({ user_id: userId, init_data: initData, message }),
    });
    response.textContent = result.answer;
  } catch (error) {
    response.textContent = error.message;
  } finally {
    waitingForAi = false;
    updateAiAvailability();
    const messages = $('#aiMessages');
    messages.scrollTop = messages.scrollHeight;
  }
}

document.addEventListener('click', (event) => {
  const target = event.target;
  const category = target.closest('[data-cat]');
  const add = target.closest('[data-add]');
  const quantity = target.closest('[data-qty]');

  if (category) selectCategory(category);
  else if (add) addProduct(add);
  else if (quantity) changeQuantity(quantity);
  else if (target.closest('[data-close]') || target === activeOverlay || target === $('#shade')) goBack();
});

$('#products').addEventListener('error', (event) => {
  if (event.target.matches('.product-photo img')) {
    event.target.hidden = true;
    event.target.nextElementSibling.hidden = false;
  }
}, true);

document.addEventListener('keydown', containFocus);
$('#searchInput').addEventListener('input', renderProducts);
$('#cartOpen').addEventListener('click', (event) => showOverlay('#cartDrawer', event.currentTarget));
$('#cartBar')?.addEventListener('click', (event) => showOverlay('#cartDrawer', event.currentTarget));
$('#ordersOpen').addEventListener('click', loadOrders);
$('#aiOpen').addEventListener('click', (event) => showOverlay('#aiModal', event.currentTarget));
$('#checkoutOpen').addEventListener('click', () => showOverlay('#checkoutModal'));
$('#checkoutForm').addEventListener('submit', placeOrder);
$('#aiForm').addEventListener('submit', sendAiMessage);

document.querySelectorAll('.drawer, .modal').forEach((overlay) => setOverlayState(overlay, false));
renderCart();
updateAiAvailability();
loadMenu();
