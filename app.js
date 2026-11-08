const fallbackMenu=[
{id:1,name:'Карбонара',category:'Паста',price:390,description:'Макароны с сыром и беконом',photo_url:'assets/products/01-carbonara.jpeg',available:1},
{id:2,name:'Картошка с рыбой',category:'Горячее',price:420,description:'Картофель, зелень, рыбный стейк и лимон',photo_url:'assets/products/02-fish-potato.jpeg',available:1},
{id:3,name:'Диетический ужин',category:'Диетическое',price:310,description:'Курица и овощи',photo_url:'assets/products/03-diet-dinner.jpeg',available:1},
{id:4,name:'Суп с сухариками',category:'Супы',price:370,description:'Куриный бульон, зелень и сухари',photo_url:'assets/products/04-chicken-soup.jpeg',available:1},
{id:5,name:'Рис с овощами',category:'Гарниры',price:390,description:'Отварной рис и овощи',photo_url:'assets/products/05-rice-vegetables.jpeg',available:1},
{id:6,name:'Суп рамен',category:'Супы',price:450,description:'Куриный бульон, варёное яйцо, куриная грудка, овощи и лапша',photo_url:'assets/products/06-ramen.jpeg',available:1},
{id:7,name:'Кока-кола',category:'Напитки',price:90,description:'Охладительный напиток',photo_url:'assets/products/07-coca-cola.jpeg',available:1},
{id:8,name:'Клубничный милкшейк',category:'Милкшейки',price:120,description:'Молоко с топингом и клубникой',photo_url:'assets/products/08-strawberry-milkshake.jpeg',available:1},
{id:9,name:'Вино красное полусухое',category:'Алкогольные напитки',price:2100,description:'Алкогольный напиток',photo_url:'assets/products/09-red-wine.jpeg',available:1},
{id:10,name:'Виски со льдом',category:'Алкогольные напитки',price:2300,description:'Алкогольный напиток',photo_url:'assets/products/10-whiskey-ice.jpeg',available:1}
];
const tg=window.Telegram?.WebApp; if(tg){tg.ready();tg.expand();tg.setHeaderColor('#f7f6f2');tg.setBackgroundColor('#f7f6f2')}
const $=s=>document.querySelector(s);let products=[],categories=[],cart=JSON.parse(localStorage.getItem('dolce_cart')||'{}'),activeCategory='Все',config={},userId=(tg?.initData?tg?.initDataUnsafe?.user?.id:null)||null;
const emojiByCategory={'Паста':'🍝','Горячее':'🐟','Диетическое':'🥗','Супы':'🍲','Гарниры':'🍚','Напитки':'🥤','Милкшейки':'🥤','Алкогольные напитки':'🥃'};
function money(n){return new Intl.NumberFormat('ru-RU').format(n)+' ₽'}
async function api(url,opts={}){const r=await fetch(url,{headers:{'Content-Type':'application/json'},...opts});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.detail||'Ошибка запроса');return d}
async function init(){try{config=await api('/api/config');$('#brandName').textContent=(config.restaurant_name||'DOLCE').toUpperCase();$('#restaurantDesc').textContent=config.description;$('#footerInfo').textContent=`${config.address||''} ${config.phone||''}`;categories=['Все',...await api('/api/categories')];products=await api('/api/products')}catch(e){products=fallbackMenu;categories=['Все',...new Set(products.map(p=>p.category))];config={restaurant_name:'DOLCE',delivery_fee:0};$('#brandName').textContent='DOLCE';$('#footerInfo').textContent='Вкусная еда, приготовленная с заботой.';$('#restaurantDesc').textContent='Выбирайте любимые блюда — мы позаботимся об остальном.'}renderCategories();renderProducts();renderCartCount()}
function renderCategories(){$('#categories').innerHTML=categories.map(c=>`<button class="category ${c===activeCategory?'active':''}" data-cat="${esc(c)}"><span class="emoji">${emojiByCategory[c]||'🍽️'}</span><b>${esc(c)}</b></button>`).join('')}
function renderProducts(){let search=$('#searchInput').value.toLowerCase();let list=products.filter(p=>(activeCategory==='Все'||p.category===activeCategory)&&(`${p.name} ${p.description}`.toLowerCase().includes(search)));$('#productCount').textContent=`${list.length} блюд`;$('#menuTitle').textContent=activeCategory==='Все'?'Популярное':activeCategory;$('#products').innerHTML=list.length?list.map(p=>`<article class="product-card"><div class="product-photo">${p.photo_url?`<img src="${esc(p.photo_url.startsWith("/")&&!location.protocol.startsWith("http")?p.photo_url.slice(1):p.photo_url)}" alt="${esc(p.name)}" loading="lazy">`:`<span class="product-placeholder">${emojiByCategory[p.category]||'🍽️'}</span>`}</div><div class="product-info"><span class="product-category">${esc(p.category)}</span><h3>${esc(p.name)}</h3><p>${esc(p.description||'Вкусное блюдо от нашего шефа')}</p><div class="product-bottom"><b class="price">${p.price>0?money(p.price):'Цена уточняется'}</b><button class="add-btn" data-add="${p.id}" ${p.price>0?'':'disabled title="Укажите цену в панели администратора"'}>${p.price>0?'＋ В корзину':'Ожидает цену'}</button></div></div></article>`).join(''):'<div class="empty">Ничего не найдено. Попробуйте изменить запрос.</div>'}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function saveCart(){localStorage.setItem('dolce_cart',JSON.stringify(cart));renderCartCount();renderCart()}
function renderCartCount(){let n=Object.values(cart).reduce((a,b)=>a+b,0);$('#cartCount').textContent=n}
function renderCart(){let entries=Object.entries(cart).map(([id,q])=>({p:products.find(p=>p.id===Number(id)),q})).filter(x=>x.p);let total=entries.reduce((s,x)=>s+x.p.price*x.q,0);$('#cartTotal').textContent=money(total+(config.delivery_fee||0));$('#cartItems').innerHTML=entries.length?entries.map(({p,q})=>`<div class="cart-line"><div><b>${esc(p.name)}</b><br><small>${money(p.price)} · ${money(p.price*q)}</small></div><div class="qty"><button data-qty="${p.id}" data-delta="-1">−</button><b>${q}</b><button data-qty="${p.id}" data-delta="1">+</button></div></div>`).join(''):'<div class="empty">🛒 Корзина пока пуста.<br>Добавьте что-нибудь вкусное!</div>'}
function showDrawer(id){$('#shade').classList.add('open');$(id).classList.add('open')}
function closeAll(){ $('#shade').classList.remove('open');document.querySelectorAll('.drawer').forEach(x=>x.classList.remove('open'));document.querySelectorAll('.modal').forEach(x=>x.classList.remove('open'))}
document.addEventListener('click',e=>{let cat=e.target.closest('[data-cat]');if(cat){activeCategory=cat.dataset.cat;renderCategories();renderProducts()}let add=e.target.closest('[data-add]');if(add){let id=add.dataset.add;cart[id]=(cart[id]||0)+1;saveCart();add.textContent='✓ Добавлено';setTimeout(()=>add.textContent='＋ В корзину',900)}let qty=e.target.closest('[data-qty]');if(qty){let id=qty.dataset.qty;cart[id]=(cart[id]||0)+Number(qty.dataset.delta);if(cart[id]<=0)delete cart[id];saveCart()}if(e.target.closest('[data-close]'))closeAll()});
$('#searchInput').addEventListener('input',renderProducts);$('#cartOpen').onclick=()=>{renderCart();showDrawer('#cartDrawer')};$('#ordersOpen').onclick=loadOrders;$('#shade').onclick=closeAll;$('#checkoutOpen').onclick=()=>{if(!Object.keys(cart).length)return alert('Корзина пуста');if(location.protocol==='file:')return alert('Для оформления заказа запустите backend: ./run_backend.command и откройте http://127.0.0.1:8000');$('#checkoutModal').classList.add('open')};
$('#checkoutForm').onsubmit=async e=>{e.preventDefault();let f=new FormData(e.target);try{let result=await api('/api/orders',{method:'POST',body:JSON.stringify({user_id:userId,init_data:tg?.initData||'',customer_name:f.get('customer_name'),phone:f.get('phone'),address:f.get('address'),comment:f.get('comment'),promo_code:f.get('promo_code'),items:Object.entries(cart).map(([product_id,quantity])=>({product_id:Number(product_id),quantity}))})});cart={};saveCart();closeAll();$('#successText').textContent=`Заказ №${result.order_id} на сумму ${money(result.total)} принят.${result.discount?` Скидка по промокоду: ${money(result.discount)}.`:''} Менеджер свяжется с вами.`;$('#successModal').classList.add('open');e.target.reset()}catch(err){alert(err.message)}};
async function loadOrders(){if(!userId){alert('История заказов доступна после запуска Mini App из Telegram.');return}try{let orders=await api('/api/orders/'+userId+'?init_data='+encodeURIComponent(tg?.initData||''));$('#ordersList').innerHTML=orders.length?orders.map(o=>`<div class="order-card"><b>Заказ №${o.id} · ${esc(o.status)}</b><small>${o.items.map(i=>`${esc(i.name)} × ${i.quantity}`).join(', ')}<br>${money(o.total)}</small></div>`).join(''):'<div class="empty">📦 У вас пока нет заказов.</div>';showDrawer('#ordersDrawer')}catch(e){alert(e.message)}}
$('#aiOpen').onclick=()=>{if(location.protocol==='file:')alert('ИИ-консультант работает после запуска backend и подключения AITunnel.');$('#aiModal').classList.add('open')};
$('#aiForm').onsubmit=async e=>{e.preventDefault();let msg=$('#aiInput').value.trim();if(!msg)return;addBubble(msg,'user');$('#aiInput').value='';try{let d=await api('/api/ai',{method:'POST',body:JSON.stringify({user_id:userId,init_data:tg?.initData||'',message:msg})});addBubble(d.answer,'bot')}catch(err){addBubble(err.message,'bot')}}
function addBubble(text,role){let el=document.createElement('div');el.className='bubble '+role;el.textContent=text;$('#aiMessages').append(el);$('#aiMessages').scrollTop=$('#aiMessages').scrollHeight}

function setupScrollReveal(){
  const targets = [
    '.category-section .section-title',
    '.category',
    '.menu-section .section-title',
    '.product-card',
    '.info-item',
    '.about-copy > *',
    '.about-image',
    '.about-stats > div',
    '.location-heading > *',
    '.map-frame',
    '.map-disclaimer'
  ].join(',');
  const reveal = (scope=document) => {
    scope.querySelectorAll(targets).forEach((el,index)=>{
      if(el.classList.contains('scroll-reveal')) return;
      el.classList.add('scroll-reveal');
      if(el.matches('.category,.product-card,.info-item,.about-stats > div')) {
        el.style.transitionDelay = `${(index % 4) * 90}ms`;
      }
      observer.observe(el);
    });
  };
  const observer = new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  },{threshold:0.12,rootMargin:'0px 0px -45px 0px'});
  reveal();
  const productsGrid=document.querySelector('#products');
  if(productsGrid){
    new MutationObserver(()=>reveal(productsGrid)).observe(productsGrid,{childList:true});
  }
}
init().then(setupScrollReveal);
