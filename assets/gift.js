/* Gift Guide – vanilla JS quickview + cart rule (no jQuery). */
(function(){
  if (window.__giftLoaded) return; // avoid double load if section included twice
  window.__giftLoaded = true;

  const MONEY_FORMAT = window.Shopify && Shopify.currency && Shopify.currency.active ? Shopify.currency.active : 'USD';

  function formatMoney(cents){
    try{
      if (window.Shopify && typeof Shopify.formatMoney === 'function') {
        return Shopify.formatMoney(cents, window.theme && theme.moneyFormat ? theme.moneyFormat : '${{amount}}');
      }
    }catch(e){}
    // Fallback
    const v = (cents/100).toFixed(2);
    return (MONEY_FORMAT === 'EUR' ? '€' : (MONEY_FORMAT === 'INR' ? '₹' : '$')) + v;
  }

  const cache = {};

  async function fetchProduct(handle){
    if (cache[handle]) return cache[handle];
    const res = await fetch(`/products/${handle}.js`);
    if (!res.ok) throw new Error('Failed to fetch product');
    const data = await res.json();
    cache[handle] = data;
    return data;
  }

  function findVariantByOptions(product, selected){
    // selected is array of option values in order
    return product.variants.find(v=>{
      return selected.every((val, idx)=> (v[`option${idx+1}`] || '').toLowerCase() === String(val).toLowerCase());
    });
  }

  function buildSelect(name, values){
    const wrap = document.createElement('div');
    wrap.className = 'gift-options';
    const label = document.createElement('label');
    label.textContent = name;
    const select = document.createElement('select');
    values.forEach(v=>{
      const o = document.createElement('option');
      o.value = v; o.textContent = v;
      select.appendChild(o);
    });
    wrap.appendChild(label); wrap.appendChild(select);
    return {wrap, select};
  }

  function modalTemplate(){
    const backdrop = document.createElement('div');
    backdrop.className = 'gift-modal-backdrop'; backdrop.setAttribute('role','dialog'); backdrop.dataset.giftBackdrop = '1';
    backdrop.innerHTML = `
      <div class="gift-modal" role="document" aria-modal="true">
        <div class="gift-modal__head">
          <div class="gift-title" style="font-size:18px;margin:0;font-weight:700" data-gift="title"></div>
          <button class="gift-modal__close" aria-label="Close">×</button>
        </div>
        <div class="gift-modal__media"><img alt="" data-gift="image"></div>
        <div class="gift-modal__body">
          <div class="gift-price" data-gift="price"></div>
          <div class="gift-note" data-gift="desc"></div>
          <div class="gift-options-wrap" data-gift="options"></div>
          <button class="gift-atc" data-gift="atc"><span>Add to cart</span></button>
          <div class="gift-note gift-hidden" data-gift="status"></div>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    // Close handlers
    function close(){ backdrop.style.display='none'; document.removeEventListener('keydown', onEsc); }
    function onEsc(e){ if (e.key === 'Escape') close(); }
    backdrop.addEventListener('click', e=>{ if (e.target === backdrop) close(); });
    backdrop.querySelector('.gift-modal__close').addEventListener('click', close);
    return {backdrop, close};
  }
  const {backdrop, close} = modalTemplate();

  async function openQuickView(handle, opts){
    try{
      const p = await fetchProduct(handle);
      const imgEl = backdrop.querySelector('[data-gift=image]');
      const titleEl = backdrop.querySelector('[data-gift=title]');
      const priceEl = backdrop.querySelector('[data-gift=price]');
      const descEl = backdrop.querySelector('[data-gift=desc]');
      const optWrap = backdrop.querySelector('[data-gift=options]');
      const atcBtn = backdrop.querySelector('[data-gift=atc]');
      const statusEl = backdrop.querySelector('[data-gift=status]');

      imgEl.src = p.images && p.images.length ? p.images[0] : '';
      imgEl.alt = p.title;
      titleEl.textContent = p.title;
      priceEl.textContent = formatMoney(p.price);
      descEl.textContent = (p.description || '').replace(/<[^>]*>?/gm,'').slice(0,160);

      // Build options
      optWrap.innerHTML = '';
      const selects = [];
      p.options.forEach(opt=>{
        const {wrap, select} = buildSelect(opt.name, opt.values);
        optWrap.appendChild(wrap); selects.push(select);
      });

      function currentVariant(){
        const values = selects.map(s=>s.value);
        return findVariantByOptions(p, values) || p.variants[0];
      }
      function refreshPrice(){
        const v = currentVariant();
        priceEl.textContent = formatMoney(v.price);
        atcBtn.disabled = !v.available;
      }
      selects.forEach(s=> s.addEventListener('change', refreshPrice));
      refreshPrice();

      // ATC
      atcBtn.onclick = async ()=>{
        const v = currentVariant();
        atcBtn.disabled = true; statusEl.classList.add('gift-hidden'); statusEl.textContent = '';
        try{
          // Add chosen variant
          await fetch('/cart/add.js', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({items:[{id:v.id, quantity:1}]})});
          // Bundle rule: if options include Black & Medium -> also add Soft Winter Jacket (from data attribute on button)
          const optsLower = [v.option1, v.option2, v.option3].map(o => String(o || '').toLowerCase());
          const hasBlack = optsLower.includes('black');
          const hasMedium = optsLower.includes('medium');
          const jacketHandle = atcBtn.dataset.jacketHandle;
          if (hasBlack && hasMedium && jacketHandle){
            const pj = await fetchProduct(jacketHandle);
            const jacketVariant = pj.variants.find(x=>x.available) || pj.variants[0];
            if (jacketVariant) {
              await fetch('/cart/add.js', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({items:[{id:jacketVariant.id, quantity:1}]})});
            }
          }
          statusEl.textContent = 'Added to cart ✅'; statusEl.classList.remove('gift-hidden');
        }catch(e){
          statusEl.textContent = 'Could not add to cart. Please try again.'; statusEl.classList.remove('gift-hidden');
        }finally{
          atcBtn.disabled = false;
        }
      };

      // pass jacket handle from opener
      atcBtn.dataset.jacketHandle = (opts && opts.jacketHandle) || '';

      backdrop.style.display='flex';
      document.addEventListener('keydown', e=>{ if (e.key === 'Escape') close(); }, {once:true});
    }catch(e){
      console.error(e);
      alert('Unable to open quick view.');
    }
  }

  // Delegate click from all hotspots
  document.addEventListener('click', function(e){
    const btn = e.target.closest('[data-quickview-handle]');
    if (!btn) return;
    const handle = btn.getAttribute('data-quickview-handle');
    const jacketHandle = btn.getAttribute('data-jacket-handle') || '';
    openQuickView(handle, {jacketHandle});
  });
})();
