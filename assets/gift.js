/* Gift Guide – vanilla JS quickview + cart rule */
(function(){
  if (window.__giftLoaded) return; window.__giftLoaded = true;

  function formatMoney(cents){
    try{
      if (window.Shopify && typeof Shopify.formatMoney === 'function'){
        return Shopify.formatMoney(cents, (window.theme && theme.moneyFormat) || '${{amount}}');
      }
    }catch(e){}
    return '₹' + (cents/100).toFixed(2); // fallback for INR; adjust automatically by theme above
  }

  const cache = {};
  async function fetchProduct(handle){
    if (cache[handle]) return cache[handle];
    const r = await fetch(`/products/${handle}.js`);
    if (!r.ok) throw new Error('fetch product failed');
    const data = await r.json(); cache[handle] = data; return data;
  }
  function findVariantByOptions(product, selected){
    return product.variants.find(v => selected.every((val, i) => (v[`option${i+1}`]||'').toLowerCase() === String(val).toLowerCase()));
  }
  function buildSelect(name, values){
    const wrap = document.createElement('div'); wrap.className='gift-options';
    const label = document.createElement('label'); label.textContent = name;
    const select = document.createElement('select');
    values.forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent=v; select.appendChild(o); });
    wrap.appendChild(label); wrap.appendChild(select); return {wrap, select};
  }

  // Modal bootstrap (once)
  const backdrop = document.createElement('div');
  backdrop.className='gift-modal-backdrop';
  backdrop.innerHTML = `
    <div class="gift-modal" role="dialog" aria-modal="true">
      <div class="gift-modal__head">
        <div class="gift-title" style="font-size:18px;font-weight:700" data-gift="title"></div>
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
    </div>`;
  document.body.appendChild(backdrop);
  const close = ()=>{ backdrop.style.display='none'; document.removeEventListener('keydown', onEsc); };
  const onEsc = e=>{ if (e.key==='Escape') close(); };
  backdrop.addEventListener('click', e=>{ if (e.target===backdrop) close(); });
  backdrop.querySelector('.gift-modal__close').addEventListener('click', close);

  async function openQuickView(handle, opts){
    const p = await fetchProduct(handle);
    const imgEl = backdrop.querySelector('[data-gift=image]');
    const titleEl = backdrop.querySelector('[data-gift=title]');
    const priceEl = backdrop.querySelector('[data-gift=price]');
    const descEl = backdrop.querySelector('[data-gift=desc]');
    const optWrap = backdrop.querySelector('[data-gift=options]');
    const atcBtn  = backdrop.querySelector('[data-gift=atc]');
    const statusEl = backdrop.querySelector('[data-gift=status]');

    imgEl.src = p.images?.[0] || ''; imgEl.alt = p.title;
    titleEl.textContent = p.title;
    priceEl.textContent = formatMoney(p.price);
    descEl.textContent = (p.description || '').replace(/<[^>]*>?/gm,'').slice(0,160);

    optWrap.innerHTML=''; const selects=[];
    p.options.forEach(o=>{ const {wrap,select}=buildSelect(o.name,o.values); optWrap.appendChild(wrap); selects.push(select); });

    function currentVariant(){ const vals = selects.map(s=>s.value); return findVariantByOptions(p, vals) || p.variants[0]; }
    function refresh(){ const v=currentVariant(); priceEl.textContent=formatMoney(v.price); atcBtn.disabled=!v.available; }
    selects.forEach(s=>s.addEventListener('change', refresh)); refresh();

    atcBtn.onclick = async ()=>{
      const v = currentVariant();
      atcBtn.disabled = true; statusEl.classList.add('gift-hidden'); statusEl.textContent='';
      try{
        await fetch('/cart/add.js', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({items:[{id:v.id, quantity:1}]})});
        const optsLower = [v.option1,v.option2,v.option3].map(o=>String(o||'').toLowerCase());
        const jacketHandle = atcBtn.dataset.jacketHandle;
        if (optsLower.includes('black') && optsLower.includes('medium') && jacketHandle){
          const pj = await fetchProduct(jacketHandle);
          const jacketVariant = pj.variants.find(x=>x.available) || pj.variants[0];
          if (jacketVariant){
            await fetch('/cart/add.js',{method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({items:[{id:jacketVariant.id, quantity:1}]})});
          }
        }
        statusEl.textContent='Added to cart ✅'; statusEl.classList.remove('gift-hidden');
      }catch(e){
        statusEl.textContent='Could not add to cart. Please try again.'; statusEl.classList.remove('gift-hidden');
      }finally{ atcBtn.disabled=false; }
    };

    atcBtn.dataset.jacketHandle = (opts && opts.jacketHandle) || '';
    backdrop.style.display='flex'; document.addEventListener('keydown', onEsc);
  }

  // Delegate clicks for all hotspots
  document.addEventListener('click', (e)=>{
    const t = e.target.closest('[data-quickview-handle]');
    if (!t) return;
    openQuickView(t.getAttribute('data-quickview-handle'), {jacketHandle: t.getAttribute('data-jacket-handle')});
  });
})();
