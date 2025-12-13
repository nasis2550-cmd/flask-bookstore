(function(){
  const form = document.getElementById('bookstoreForm');
  if(!form) return;
  const API_BASE = (()=>{
    const attr = document.documentElement?.getAttribute('data-api-base');
    if(attr) return attr.replace(/\/$/, '');
    const stored = localStorage.getItem('bookstore_api_base');
    if(stored) return stored.replace(/\/$/, '');
    if(location.protocol === 'file:' || location.origin === 'null'){
      return 'http://localhost:8080';
    }
    return '';
  })();
  window.BookstoreAPI = {
    get base(){ return API_BASE; },
    setBase(newBase=''){
      const clean = newBase.trim().replace(/\/$/, '');
      if(clean){ localStorage.setItem('bookstore_api_base', clean); }
      else { localStorage.removeItem('bookstore_api_base'); }
      location.reload();
    }
  };
  function apiUrl(path){
    if(!path.startsWith('/')) path = '/' + path;
    return API_BASE ? `${API_BASE}${path}` : path;
  }

  function resolveMediaSrc(src){
    if(!src) return '';
    if(/^https?:/i.test(src)) return src;
    const clean = src.replace(/^\//,'');
    return API_BASE ? `${API_BASE}/${clean}` : clean;
  }

  // Expand one path into multiple tryable candidates (relative, absolute, and API_BASE)
  function expandSrcCandidates(src){
    if(!src) return [];
    if(/^https?:/i.test(src)) return [src];
    const clean = String(src).replace(/^\//,'');
    const out = new Set();
    out.add(clean);
    out.add('/' + clean);
    if(API_BASE){ out.add(`${API_BASE}/${clean}`); }
    return Array.from(out);
  }

  function imageCandidatesFor(name){
    const n = (name||'').toLowerCase();
    const cands = [];
    if(!name) return cands;
    ['.jpg','.png','.webp','.jpeg'].forEach(ext => cands.push(`images/${name}${ext}`));
    try {
      const collapsed = name.replace(/\s+/g,' ').trim();
      const noSymbols = collapsed.replace(/[()@•·]/g,'').replace(/\s+/g,' ').trim();
      const variants = new Set([collapsed, noSymbols]);
      variants.forEach(v=> ['.jpg','.png','.webp','.jpeg'].forEach(ext => cands.push(`images/${v}${ext}`)));
      variants.forEach(v=> ['.jpg','.png','.webp','.jpeg'].forEach(ext => cands.push(`images/${v} ${ext}`)));
    } catch(e){}
    const alias = {
      'นายอินทร์ ปตท.ราชพฤกษ์ 4': ['images/นายอินทร์ สาขา ปตท.ราชพฤกษ์ 4.jpg'],
      'นายอินทร์ The Mall งามวงศ์วาน': ['images/นายอินทร์ The Mall งามวงศ์วาน.jpg','images/นายอินทร์ สาขา The Mall งามวงศ์วาน ชั้น 4_n.jpg'],
      'ซีเอ็ดบุ๊คเซ็นเตอร์ @ เดอะมอลล์ งามวงศ์วาน': ['images/ซีเอ็ดบุ๊คเซ็นเตอร์ @ เดอะมอลล์ งามวงศ์วาน.jpg'],
      'ซีเอ็ดบุ๊คเซ็นเตอร์ บิ๊กซีรัตนาธิเบศร์ 2': ['images/ซีเอ็ดบุ๊คเซ็นเตอร์ บิ๊กซีรัตนาธิเบศร์ 2.jpg','images/ซีเอ็ดบุ๊คเซ็นเตอร์ บิ๊กซีรัตนาธิเบศร์2.jpg'],
      'บีทูเอส เซ็นทรัลรัตนาธิเบศร์': ['images/บีทูเอส เซ็นทรัลรัตนาธิเบศร์.jpg','images/B2S เซ็นทรัลรัตนาธิเบศร์.png'],
      'B2S เซ็นทรัลเวสต์วิลล์ ราชพฤกษ์': ['images/B2S เซ็นทรัลเวสต์วิลล์ ราชพฤกษ์.jpg','images/B2S เซ็นทรัลเวสต์วิลล์ ราชพฤกษ์.png'],
      'ร้าน หนอนหนังสือ ติวานนท์': ['images/ร้าน หนอนหนังสือ ติวานนท์.jpg'],
      'ร้านนนทบุรีบิ๊กบุ๊ค': ['images/ร้านนนทบุรีบิ๊กบุ๊ค.webp'],
      'นายอินทร์ เซ็นทรัล แจ้งวัฒนะ': ['images/นายอินทร์ เซ็นทรัล แจ้งวัฒนะ.jpg','images/นายอินทร์ เซ็นทรัล แจ้งวัฒนะ 4.webp'],
      'นิยายรัก': ['images/นิยายรัก.webp'],
      'ร้านหนังสือก้าวบรรทัด พระนั่งเกล้า': ['images/ร้านหนังสือก้าวบรรทัด พระนั่งเกล้า.jpg','images/ร้านหนังสือก้าวบรรทัด.jpg'],
      'ร้านหนังสือก้าวบรรทัด (บางใหญ่ซิตี้)': ['images/ร้านหนังสือก้าวบรรทัด.jpg'],
      'ห้องสมุดประชาชนจังหวัดนนทบุรี': ['images/ห้องสมุดประชาชนจังหวัดนนทบุรี.webp'],
      'ห้องสมุดประชาชน อำเภอไทรน้อย จังหวัดนนทบุรี': ['images/ห้องสมุดประชาชน อำเภอไทรน้อย จังหวัดนนทบุรี.png'],
      'หอสมุดกาญจนาภิเษกวัดเขมาฯ': ['images/หอสมุดกาญจนาภิเษกวัดเขมาฯ.png'],
      'The WAKEUP Café(บอร์ดเกมส์ฟรี)': ['images/The WAKEUP Café(บอร์ดเกมส์ฟรี).webp'],
      'WarOx Board Games': ['images/WarOx Board Games.webp'],
      'Siam Board Games Cafe ( Betrend ชั้น 4 เดอะมอลล์งามวงศ์วาน )': ['images/Siam Board Games Cafe ( Betrend ชั้น 4 เดอะมอลล์งามวงศ์วาน ).webp'],
      'Mystery Dungeon Board Game & Coffee Homey': ['images/Mystery Dungeon Board Game & Coffee Homey.webp'],
      'Meanbook Board Game Store': ['images/Meanbook Board Game Store.webp'],
      'ฮอบบี้ บอร์ดเกมคาเฟ่': ['images/ฮอบบี้ บอร์ดเกมคาเฟ่.webp'],
      'Siam Board Games Cafe (ชั้น G B2S Westgate)': ['images/Siam Board Games Cafe (ชั้น G B2S Westgate).webp'],
      'Legendary Wargame (Warhammer Club)': ['images/Legendary Wargame (Warhammer Club).webp','images/Legendary Wargame.webp'],
      '30 Thirsty ร้านบอร์ดเกม คาเฟ่ นนทบุรี': ['images/30 Thirsty ร้านบอร์ดเกม คาเฟ่ นนทบุรี.webp'],
      'Legendary Wargame': ['images/Legendary Wargame.webp']
    };
    if(alias[name]) cands.unshift(...alias[name]);
    if(n.includes('se-ed') || n.includes('ซีเอ็ด')) cands.push('images/SE-ED.jpg','SE-ED.jpg');
    if(n.includes('b2s') || n.includes('บีทูเอส')) cands.push('images/B2S เซ็นทรัลรัตนาธิเบศร์.png','images/B2S.png');
    if(n.includes('นายอินทร์')) cands.push('images/นายอิน2.jpg','images/นายอิน.jpg');
    return [...new Set(cands)];
  }
  function explainNetworkError(err){
    const msg = err?.message || '';
    if(/Failed to fetch/i.test(msg)) return 'เชื่อมต่อ API ไม่ได้ (ตรวจสอบว่าเซิร์ฟเวอร์รันอยู่หรือไม่)';
    if(/NetworkError/i.test(msg)) return 'เชื่อมต่อเครือข่ายไม่ได้หรือถูกบล็อก';
    return msg || 'เกิดข้อผิดพลาดขณะเชื่อมต่อเซิร์ฟเวอร์';
  }
  const mode = form.dataset.mode || 'create';
  const statusBox = document.getElementById('formStatus');
  const previewImg = document.getElementById('imagePreview');
  const locationPreview = document.getElementById('locationPreview');
  const uploadInput = document.getElementById('imageInput');
  const autoLocationBtn = document.getElementById('autoLocation');
  const storePicker = document.getElementById('storePicker');
  const managerKeyField = document.getElementById('editManagerKey');
  const DEFAULT_MANAGER_KEY = 'dev-manager';
  let managerKey = sessionStorage.getItem('manager_key') || '';
  if(mode === 'edit' && !managerKey){
    managerKey = DEFAULT_MANAGER_KEY;
    sessionStorage.setItem('manager_key', managerKey);
  }
  if(managerKeyField){
    managerKeyField.value = managerKey;
    managerKeyField.addEventListener('input', e => {
      managerKey = e.target.value.trim();
      sessionStorage.setItem('manager_key', managerKey);
    });
  }
  let currentStoreId = null;
  let uploadMeta = null;
  let localPreviewUrl = null;

  function setStatus(message, kind='ok', persistMs=5500){
    if(!statusBox) return;
    const cls = kind === 'err' ? 'msg err' : (kind === 'info' ? 'msg info' : 'msg ok');
    statusBox.innerHTML = `<div class="${cls}">${message}</div>`;
    if(persistMs){
      clearTimeout(setStatus.timer);
      setStatus.timer = setTimeout(()=>{ statusBox.innerHTML=''; }, persistMs);
    }
  }

  function toNumber(value){
    if(value === undefined || value === null || value === '') return undefined;
    const num = Number(value);
    return Number.isNaN(num) ? undefined : num;
  }

  function collectPayload(){
    const data = new FormData(form);
    const payload = {};
    data.forEach((v,k)=>{ payload[k] = typeof v === 'string' ? v.trim() : v; });
    if(uploadMeta){
      payload.image_url = uploadMeta.variants?.medium || uploadMeta.variants?.large || uploadMeta.original;
      payload.image_thumb_url = uploadMeta.variants?.thumb || uploadMeta.variants?.medium;
    }
    if(payload.rating !== undefined && payload.rating !== ''){
      const ratingNum = toNumber(payload.rating);
      payload.rating = ratingNum !== undefined ? Number(ratingNum.toFixed(1)) : undefined;
    } else {
      delete payload.rating;
    }
    const lat = toNumber(payload.latitude ?? payload.lat);
    const lng = toNumber(payload.longitude ?? payload.lng);
    if(lat !== undefined) payload.latitude = lat;
    if(lng !== undefined) payload.longitude = lng;
    if(!payload.tags && payload.category) payload.tags = payload.category;
    ['description','address','phone','hours','tags','image_url','image_thumb_url'].forEach(key=>{
      if(payload[key] === '') payload[key] = null;
    });
    return payload;
  }

  function updatePreview(url){
    if(!previewImg) return;
    if(url){
      previewImg.src = url;
      previewImg.style.display = 'block';
    } else {
      previewImg.removeAttribute('src');
      previewImg.style.display = 'none';
    }
  }

  function updateLocationPreview(lat, lng){
    if(!locationPreview) return;
    if(lat && lng){
      locationPreview.textContent = `📍 ${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
    } else {
      locationPreview.textContent = '📍 ยังไม่กำหนดพิกัด';
    }
  }

  function showLocalPreview(file){
    if(!previewImg || !file) return;
    if(localPreviewUrl){ URL.revokeObjectURL(localPreviewUrl); }
    localPreviewUrl = URL.createObjectURL(file);
    updatePreview(localPreviewUrl);
  }

  function clearLocalPreview(){
    if(localPreviewUrl){
      URL.revokeObjectURL(localPreviewUrl);
      localPreviewUrl = null;
    }
  }

  function buildPreviewCandidates(shop){
    if(!shop) return [];
    const customRaw = [];
    if(shop.image_url) customRaw.push(shop.image_url);
    if(shop.image_thumb_url) customRaw.push(shop.image_thumb_url);
    const fallbackRaw = imageCandidatesFor(shop.name);
    const merged = [...customRaw, ...fallbackRaw].flatMap(expandSrcCandidates).filter(Boolean);
    return [...new Set(merged)];
  }

  function loadExistingPreview(shop){
    if(!previewImg){ return; }
    const sources = buildPreviewCandidates(shop);
    if(!sources.length){
      updatePreview('');
      return;
    }
    let idx = 0;
    const tryNext = ()=>{
      if(idx >= sources.length){
        updatePreview('');
        return;
      }
      const src = sources[idx++];
      previewImg.onload = ()=>{
        previewImg.style.display = 'block';
        previewImg.onload = null;
        previewImg.onerror = null;
      };
      previewImg.onerror = ()=>{
        previewImg.onload = null;
        previewImg.onerror = null;
        tryNext();
      };
      previewImg.src = src;
    };
    tryNext();
  }

  async function uploadImage(file){
    const data = new FormData();
    data.append('image', file);
    setStatus('กำลังอัปโหลดรูป...', 'info');
    const res = await fetch(apiUrl('/api/bookstores/upload'), { method:'POST', body: data });
    const json = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(json.error || 'อัปโหลดรูปไม่สำเร็จ');
    uploadMeta = json;
    updatePreview(json.variants?.large || json.variants?.medium || json.original);
    setStatus('อัปโหลดรูปสำเร็จ', 'ok');
  }

  uploadInput?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if(!file) return;
    showLocalPreview(file);
    uploadImage(file).catch(err => setStatus(explainNetworkError(err), 'err'));
  });

  autoLocationBtn?.addEventListener('click', ()=>{
    if(!navigator.geolocation) return setStatus('อุปกรณ์ไม่รองรับการระบุตำแหน่ง', 'err');
    setStatus('กำลังขอตำแหน่ง...', 'info');
    navigator.geolocation.getCurrentPosition(pos => {
      const lat = pos.coords.latitude.toFixed(6);
      const lng = pos.coords.longitude.toFixed(6);
      form.latitude.value = lat;
      form.longitude.value = lng;
      updateLocationPreview(lat, lng);
      setStatus('ดึงตำแหน่งสำเร็จ', 'ok');
    }, err => {
      setStatus('ใช้ตำแหน่งไม่ได้: ' + (err.message || err.code), 'err');
    }, { enableHighAccuracy:true, timeout:15000 });
  });

  function fillForm(shop){
    if(!shop) return;
    clearLocalPreview();
    form.name.value = shop.name || '';
    form.description.value = shop.description || '';
    form.address.value = shop.address || '';
    form.phone.value = shop.phone || '';
    form.hours.value = shop.hours || '';
    form.tags.value = shop.tags || '';
    form.rating.value = shop.rating ?? '';
    form.latitude.value = shop.latitude ?? '';
    form.longitude.value = shop.longitude ?? '';
  if(form.image_url) form.image_url.value = shop.image_url || '';
  if(form.image_thumb_url) form.image_thumb_url.value = shop.image_thumb_url || '';
    updateLocationPreview(form.latitude.value, form.longitude.value);
    loadExistingPreview(shop);
    uploadMeta = null;
  }

  async function submitForm(e){
    e.preventDefault();
    try{
      if(mode === 'edit' && !currentStoreId){
        setStatus('กรุณาเลือกร้านที่ต้องการแก้ไข', 'err');
        return;
      }
      if(mode === 'edit' && !managerKey){
        setStatus('ต้องใส่ Manager Key เพื่อบันทึก', 'err');
        return;
      }
      const payload = collectPayload();
      if(!payload.name){
        setStatus('กรุณากรอกชื่อร้าน', 'err');
        return;
      }
      if(mode === 'create' && (payload.latitude === undefined || payload.longitude === undefined)){
        setStatus('เพิ่มร้านใหม่ต้องระบุพิกัด (Lat/Lng)', 'err');
        return;
      }
      if(payload.rating !== undefined && (payload.rating < 0 || payload.rating > 5)){
        setStatus('คะแนนต้องอยู่ระหว่าง 0-5', 'err');
        return;
      }
      const endpointPath = mode === 'edit' ? `/api/bookstores/${currentStoreId}` : '/api/bookstores';
      const endpoint = apiUrl(endpointPath);
      const method = mode === 'edit' ? 'PUT' : 'POST';
      const headers = { 'Content-Type': 'application/json' };
      if(mode === 'edit' && managerKey) headers['x-manager-key'] = managerKey;
      setStatus('กำลังบันทึก...', 'info');
      const res = await fetch(endpoint, { method, headers, body: JSON.stringify(payload) });
      const json = await res.json().catch(()=>({}));
      if(!res.ok){
        setStatus(json.error || 'บันทึกไม่สำเร็จ', 'err');
        return;
      }
      setStatus(mode === 'edit' ? 'อัปเดตร้านเรียบร้อย' : 'เพิ่มร้านสำเร็จ', 'ok');
      if(mode === 'create'){
        form.reset();
        uploadMeta = null;
        clearLocalPreview();
        updatePreview('');
        updateLocationPreview();
        localStorage.setItem('new_store_added', Date.now().toString());
      } else {
        const shop = json.shop || json;
        if(shop && typeof shop === 'object'){
          fillForm(shop);
        }
      }
    }catch(err){
      setStatus(explainNetworkError(err), 'err');
    }
  }

  async function loadStorePicker(){
    if(!storePicker) return;
    try{
      storePicker.innerHTML = '<option value="">เลือกชื่อร้านเพื่อแก้ไข</option>';
      const res = await fetch(apiUrl('/api/bookstores?sort=latest'));
      const json = await res.json().catch(()=>[]);
      const list = Array.isArray(json) ? json : (json.data || []);
      storePicker.innerHTML = '<option value="">เลือกชื่อร้านเพื่อแก้ไข</option>' + list.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    }catch(e){
      setStatus(explainNetworkError(e) || 'โหลดรายการร้านไม่สำเร็จ', 'err');
    }
  }

  storePicker?.addEventListener('change', async e => {
    const id = e.target.value;
    if(!id){
      currentStoreId = null;
      form.reset();
      uploadMeta = null;
      clearLocalPreview();
      updatePreview('');
      updateLocationPreview();
      return;
    }
    try{
  const res = await fetch(apiUrl(`/api/bookstores/${id}`));
      const json = await res.json();
      if(!res.ok) throw new Error(json.error || 'โหลดข้อมูลร้านไม่สำเร็จ');
      currentStoreId = json.shop?.id || Number(id);
      fillForm(json.shop);
      setStatus(`กำลังแก้ไข: ${json.shop?.name || ''}`, 'info', 3200);
    }catch(err){
      setStatus(explainNetworkError(err), 'err');
    }
  });

  form.addEventListener('submit', submitForm);

  if(storePicker){
    loadStorePicker();
  }
})();
