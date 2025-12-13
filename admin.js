(function(){
  let IS_OFFLINE_MODE = false;
  async function ensureServerImageUrl(imageValue){
    try{
      const v = (imageValue||'').trim();
      if(!v) return v;
      if(!v.startsWith('data:')) return v; // already a URL
      // Convert data URL -> Blob -> upload to server -> return URL
      const blob = await (await fetch(v)).blob();
      const filename = `upload-${Date.now()}.${(blob.type||'image/jpeg').split('/').pop()||'jpg'}`;
      const fd = new FormData();
      fd.append('file', new File([blob], filename, { type: blob.type||'image/jpeg' }));
      const r = await fetch('/api/upload-image', { method:'POST', body: fd });
      const j = await r.json().catch(()=>({}));
      if(r.ok && j && j.url){ return j.url; }
      // fallthrough: keep original if upload fails
      console.warn('Upload image failed, keep data URL', j);
      return v;
    }catch(e){ console.warn('ensureServerImageUrl error', e); return imageValue; }
  }
  function readForm(){
    const get = id => (document.getElementById(id)?.value || '').trim();
    const name = get('f_name');
    const description = get('f_desc');
    const address = get('f_address');
    const image_url = get('f_image');
    const ratingRaw = get('f_rating');
    const latRaw = get('f_lat');
    const lngRaw = get('f_lng');
    let rating = undefined; try{ rating = ratingRaw.length ? parseFloat(ratingRaw) : undefined; }catch(e){ rating = undefined; }
    let lat = undefined; try{ lat = latRaw.length ? parseFloat(latRaw) : undefined; }catch(e){ lat = undefined; }
    let lng = undefined; try{ lng = lngRaw.length ? parseFloat(lngRaw) : undefined; }catch(e){ lng = undefined; }
    return { name, description, address, rating, image_url, lat, lng };
  }
  async function fetchJSON(url, opts){
    try{
      const r = await fetch(url, opts);
      const j = await r.json().catch(()=>({}));
      return {ok:r.ok, status:r.status, data:j};
    }catch(err){
      return {ok:false, status:0, data:{}, error: (err && err.message) ? err.message : String(err)};
    }
  }

  function el(tag, attrs={}, children=[]){
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v])=>{
      if(k==='class') e.className=v; else if(k==='style') e.style.cssText=v; else e.setAttribute(k,v);
    });
    children.forEach(c=>{ if(typeof c==='string') e.innerHTML += c; else e.appendChild(c); });
    return e;
  }

  function getOfflineStores(){
    try{ return JSON.parse(localStorage.getItem('offline_stores')||'[]'); }catch(e){ return []; }
  }
  function setOfflineStores(arr){
    try{ localStorage.setItem('offline_stores', JSON.stringify(arr||[])); }catch(e){}
  }

  async function loadStores(){
    // Prefer new SQLite shops API
    const res = await fetchJSON('/api/shops');
    const list = Array.isArray(res.data) ? res.data : (res.data.data || []);
    const box = document.getElementById('storesTable');
    box.innerHTML='';
    if(!res.ok){
      IS_OFFLINE_MODE = true;
      const offline = getOfflineStores();
      if(!offline.length){
        box.innerHTML = `<div class=\"muted\">โหมดออฟไลน์ — ยังไม่มีร้านที่บันทึกไว้ในเครื่อง<br>ปุ่ม \"เพิ่มร้าน\" จะบันทึกลงเครื่องและไปแสดงในหน้า Home</div>`;
        return;
      }
      renderTable(offline, box, true);
      return;
    } else {
      IS_OFFLINE_MODE = false;
    }
    if(!list.length){ box.innerHTML = '<div class=\"muted\">ยังไม่มีข้อมูลร้าน — เพิ่มด้านบน</div>'; return; }
    renderTable(list, box, false);
  }

  function renderTable(list, box, isOffline){
    const table = el('table', {style:'width:100%;border-collapse:collapse'});
    const thead = el('thead',{},[ el('tr',{},[
      el('th',{},['ID']), el('th',{},['ชื่อร้าน']), el('th',{},['คำอธิบาย']), el('th',{},['ที่อยู่']), el('th',{},['คะแนน']), el('th',{},['การจัดการ'])
    ])]);
    table.appendChild(thead);
    const tbody = el('tbody');
    list.forEach(s=>{
      const tr = el('tr',{'data-id': String(s.id||''), class:'shop-row', draggable:'true'},[
        el('td',{},['<span class="drag-handle" title="ลากเรียงลำดับ">☰</span> ' + String(s.id||'')]),
        el('td',{},[String(s.name||'')]),
        el('td',{},[String(s.description||'')]),
        el('td',{},[String(s.address||'')]),
        el('td',{},[String(s.rating||'')]),
        el('td',{},[ '<button class="btn" data-id="'+s.id+'" data-action="edit">✏️ แก้ไข</button> <button class="btn" data-id="'+s.id+'" data-action="delete">🗑️ ลบ</button>' ])
      ]);
      tr.addEventListener('dragstart', (e)=>{ e.dataTransfer.effectAllowed = 'move'; tr.classList.add('dragging'); });
      tr.addEventListener('dragend', ()=> tr.classList.remove('dragging'));
      tbody.appendChild(tr);
      // Inline edit row (hidden by default)
      const editRow = el('tr', { 'data-edit-for': String(s.id) }, [
        el('td', {colspan:'6', style:'background:#faf7f2;padding:10px;border:1px solid #eee;border-radius:8px'}, [
          (()=>{
            const wrap = el('div', {style:'display:grid;grid-template-columns:repeat(3,minmax(180px,1fr));gap:8px;align-items:center'});
            const name = el('input', {type:'text', placeholder:'ชื่อร้าน', value: String(s.name||'')});
            const desc = el('input', {type:'text', placeholder:'คำอธิบาย', value: String(s.description||'')});
            const addr = el('input', {type:'text', placeholder:'ที่อยู่', value: String(s.address||'')});
            const rating = el('input', {type:'number', step:'0.1', min:'0', max:'5', placeholder:'คะแนน', value: (s.rating!=null? String(s.rating):'')});
            const phone = el('input', {type:'text', placeholder:'เบอร์โทร', value: String(s.phone||'')});
            const hours = el('input', {type:'text', placeholder:'เวลาเปิดปิด', value: String(s.hours||'')});
            const image = el('input', {type:'text', placeholder:'รูปภาพ URL', value: String(s.image_url||'')});
            const preview = el('img', {alt:'ตัวอย่างรูปภาพ', style:'max-height:90px;border-radius:6px;display:' + (s.image_url?'inline-block':'none')});
            try{ if(s.image_url){ preview.src = s.image_url; } }catch(e){}
            const lat = el('input', {type:'text', placeholder:'ละติจูด', value: (s.latitude!=null? String(s.latitude):'')});
            const lng = el('input', {type:'text', placeholder:'ลองจิจูด', value: (s.longitude!=null? String(s.longitude):'')});
            wrap.appendChild(name);
            wrap.appendChild(desc);
            wrap.appendChild(addr);
            wrap.appendChild(rating);
            wrap.appendChild(phone);
            wrap.appendChild(hours);
            wrap.appendChild(image);
            wrap.appendChild(preview);
            wrap.appendChild(lat);
            wrap.appendChild(lng);
            const actions = el('div', {style:'grid-column:1/-1;display:flex;gap:8px;align-items:center;margin-top:6px'}, [
              el('button', {class:'btn', 'data-action':'save-edit', 'data-id': String(s.id)}, ['💾 บันทึกการแก้ไข']),
              el('button', {class:'btn', 'data-action':'cancel-edit', 'data-id': String(s.id)}, ['✖️ ยกเลิก'])
            ]);
            wrap.appendChild(actions);
            // live preview update
            image.addEventListener('input', ()=>{
              const v = (image.value||'').trim();
              if(!v){ preview.style.display='none'; preview.src=''; return; }
              preview.style.display='inline-block'; preview.src = v;
            });
            // attach refs for later
            wrap.querySelector('[data-action="save-edit"]')._refs = { name, desc, addr, rating, phone, hours, image, lat, lng, preview };
            return wrap;
          })()
        ])
      ]);
      editRow.style.display = 'none';
      tbody.appendChild(editRow);
    });
    table.appendChild(tbody);
    box.appendChild(table);
    // Drag-sort behavior
    tbody.addEventListener('dragover', (e)=>{
      e.preventDefault();
      const dragging = tbody.querySelector('tr.dragging');
      if(!dragging) return;
      const rows = [...tbody.querySelectorAll('tr.shop-row')].filter(r=> r!==dragging);
      const y = e.clientY;
      let nearest = null;
      let nearestOffset = Number.NEGATIVE_INFINITY;
      rows.forEach(r=>{
        const rect = r.getBoundingClientRect();
        const offset = y - rect.top - rect.height/2;
        if(offset < 0 && offset > nearestOffset){ nearestOffset = offset; nearest = r; }
      });
      if(nearest){ tbody.insertBefore(dragging, nearest); } else { tbody.appendChild(dragging); }
    });
    // Save order controls (only online)
    const controls = el('div',{style:'margin:8px 0;display:flex;gap:8px'},[]);
    const saveBtn = el('button',{class:'btn','data-action':'save-order'},['💾 บันทึกลำดับ']);
    const refreshBtn = el('button',{class:'btn'},['↻ รีเฟรช']);
    controls.appendChild(saveBtn);
    controls.appendChild(refreshBtn);
    if(!isOffline) box.appendChild(controls);
    refreshBtn.addEventListener('click', ()=> loadStores());
    saveBtn.addEventListener('click', async ()=>{
      const orderIds = [...tbody.querySelectorAll('tr.shop-row')].map(r=> r.getAttribute('data-id')).filter(Boolean);
      if(isOffline){
        // reorder localStorage array to match DOM
        const arr = getOfflineStores();
        const byId = new Map(arr.map(s=> [String(s.id), s]));
        const newArr = [];
        orderIds.forEach(id=>{ const s = byId.get(String(id)); if(s) newArr.push(s); });
        // append any missing
        arr.forEach(s=>{ if(!newArr.find(x=> String(x.id)===String(s.id))) newArr.push(s); });
        setOfflineStores(newArr);
        alert('บันทึกลำดับ (ออฟไลน์) สำเร็จ');
        loadStores();
        return;
      }
      saveBtn.disabled = true;
      const res = await fetchJSON('/api/shops/reorder', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({order: orderIds})});
      saveBtn.disabled = false;
      if(res.ok){ alert('บันทึกลำดับสำเร็จ'); loadStores(); } else { alert('บันทึกลำดับไม่สำเร็จ'); }
    });
    // Wire edit/delete buttons
    box.querySelectorAll('button[data-action="delete"]').forEach(btn=>{
      btn.addEventListener('click', async (e)=>{
        const id = e.currentTarget.getAttribute('data-id');
        if(isOffline){
          const arr = getOfflineStores();
          setOfflineStores(arr.filter(x=> String(x.id)!==String(id)));
          alert('ลบสำเร็จ (ออฟไลน์)');
          loadStores();
        } else {
          const res = await fetchJSON(`/api/shops/${id}`, {method:'DELETE'});
          if(res.ok){ alert('ลบสำเร็จ'); loadStores(); } else { alert('ลบไม่สำเร็จ'); }
        }
      });
    });
    box.querySelectorAll('button[data-action="edit"]').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        const id = e.currentTarget.getAttribute('data-id');
        const row = box.querySelector('tr[data-edit-for="'+id+'"]');
        if(row){ row.style.display = (row.style.display==='none' || !row.style.display) ? '' : 'none'; }
      });
    });
    box.querySelectorAll('button[data-action="save-edit"]').forEach(btn=>{
      btn.addEventListener('click', async (e)=>{
        const id = e.currentTarget.getAttribute('data-id');
        const refs = e.currentTarget._refs || {};
        // basic validation
        const nm = (refs.name?.value||'').trim();
        if(!nm){ alert('กรุณากรอกชื่อร้าน'); refs.name?.focus(); return; }
        // prevent multiple submits
        e.currentTarget.disabled = true;
        const payload = {
          name: nm,
          description: (refs.desc?.value||'').trim(),
          address: (refs.addr?.value||'').trim(),
          rating: (refs.rating?.value||'').trim(),
          phone: (refs.phone?.value||'').trim(),
          hours: (refs.hours?.value||'').trim(),
          image_url: (refs.image?.value||'').trim(),
          lat: (refs.lat?.value||'').trim(),
          lng: (refs.lng?.value||'').trim()
        };
        // If image_url is a data: URL, upload it first and replace with /images/... URL
        if(payload.image_url && payload.image_url.startsWith('data:')){
          try{
            const newUrl = await ensureServerImageUrl(payload.image_url);
            payload.image_url = newUrl;
            if(refs.image) refs.image.value = newUrl;
            if(refs.preview){ refs.preview.src = newUrl; refs.preview.style.display = 'inline-block'; }
          }catch(_u){}
        }
        // Clean empty strings to nulls
        Object.keys(payload).forEach(k=>{ if(payload[k]==='') payload[k]=null; });
        if(isOffline){
          const arr = getOfflineStores();
          const idx = arr.findIndex(x=> String(x.id)===String(id));
          if(idx>=0){ arr[idx] = {...arr[idx], ...payload}; setOfflineStores(arr); alert('บันทึกสำเร็จ (ออฟไลน์)'); }
          const row = box.querySelector('tr[data-edit-for="'+id+'"]'); if(row) row.style.display='none';
          loadStores();
        } else {
          const res = await fetchJSON(`/api/shops/${id}`, {method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
          if(res.ok){ alert('บันทึกการแก้ไขสำเร็จ'); const row = box.querySelector('tr[data-edit-for="'+id+'"]'); if(row) row.style.display='none'; loadStores(); }
          else { const msg = (res.data && (res.data.message||res.data.error)) || 'แก้ไขไม่สำเร็จ'; alert(msg); }
        }
        e.currentTarget.disabled = false;
      });
    });
    box.querySelectorAll('button[data-action="cancel-edit"]').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        const id = e.currentTarget.getAttribute('data-id');
        const row = box.querySelector('tr[data-edit-for="'+id+'"]');
        if(row){ row.style.display='none'; }
      });
    });
  }

  async function loadInputs(){
    const res = await fetchJSON('/api/inputs');
    const arr = Array.isArray(res.data) ? res.data : (res.data.data || []);
    const box = document.getElementById('inputsBox');
    if(!res.ok){ box.innerHTML = '<div class="muted">เชื่อมต่อ API ไม่ได้ — แสดงผลไม่ได้</div>'; return; }
    if(!arr.length){ box.innerHTML = '<div class="muted">ยังไม่มีบันทึกอินพุต</div>'; return; }
    box.innerHTML = arr.slice().reverse().map(i => `
      <div style="border-bottom:1px solid rgba(0,0,0,0.08);padding:8px 0;font-size:13px">
        <strong>${i.type}</strong> · <span style="opacity:.7">${new Date(i.ts).toLocaleString('th-TH')}</span><br>
        <span style="opacity:.9">${(i.user||'ผู้ใช้')} @ ${(i.page||'')}</span><br>
        <div style="opacity:.9;word-wrap:break-word">${(i.value||'')}</div>
      </div>
    `).join('');
  }

  const Admin = {
    async autoGeocode(){
      const name = (document.getElementById('f_name')?.value || '').trim();
      const addr = (document.getElementById('f_address')?.value || '').trim();
      const desc = (document.getElementById('f_desc')?.value || '').trim();
      // ใช้หลายช่องรวมกันเพื่อความแม่นยำมากขึ้น
      const query = [name, addr, desc].filter(Boolean).join(' ');
      if(!query){ alert('กรอกชื่อร้าน/ทำเล/ที่อยู่ อย่างน้อยหนึ่งช่องเพื่อค้นหาพิกัด'); return; }
      const btns = document.querySelectorAll('button'); btns.forEach(b=> b.disabled=true);
      try{
        // Try Google Geocoder if available
        if(window.google && google.maps && google.maps.Geocoder){
          const geocoder = new google.maps.Geocoder();
          const result = await new Promise((resolve, reject)=>{
            geocoder.geocode({ address: query, componentRestrictions:{ country:'TH' } }, (res, status)=>{
              if(status==='OK' && res && res.length){ resolve(res[0]); } else { reject(status); }
            });
          });
          const lat = result.geometry.location.lat();
          const lng = result.geometry.location.lng();
          document.getElementById('f_lat').value = lat;
          document.getElementById('f_lng').value = lng;
          // เติมที่อยู่จากผลลัพธ์ถ้าช่องว่างอยู่
          try{
            const formatted = result.formatted_address || '';
            const addrEl = document.getElementById('f_address');
            if(addrEl && !addrEl.value.trim() && formatted){ addrEl.value = formatted; }
          }catch(e){}
          alert('✅ ดึงพิกัดสำเร็จ');
          return;
        }
      }catch(e){ /* fallthrough to OSM */ }
      try{
        // Fallback: OpenStreetMap Nominatim (public)
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&countrycodes=th&q=${encodeURIComponent(query)}`;
        const r = await fetch(url, { headers: { 'Accept':'application/json' } });
        const j = await r.json();
        if(Array.isArray(j) && j.length){
          document.getElementById('f_lat').value = j[0].lat;
          document.getElementById('f_lng').value = j[0].lon;
          try{
            const addrEl = document.getElementById('f_address');
            const disp = j[0].display_name || '';
            if(addrEl && !addrEl.value.trim() && disp){ addrEl.value = disp; }
          }catch(e){}
          alert('✅ ดึงพิกัดสำเร็จ');
        }else{
          alert('ไม่พบพิกัดจากที่อยู่/ชื่อร้านที่ระบุ');
        }
      }catch(e){ alert('ดึงพิกัดไม่สำเร็จ'); }
      finally{ btns.forEach(b=> b.disabled=false); }
    },

    async useMyLocation(){
      const statusEl = document.getElementById('geoStatus');
      if(!navigator.geolocation){
        if(statusEl) statusEl.textContent = 'เบราว์เซอร์ไม่รองรับตำแหน่งที่ตั้ง';
        return;
      }
      const btns = document.querySelectorAll('button'); btns.forEach(b=> b.disabled=true);
      if(statusEl) statusEl.textContent = 'กำลังดึงตำแหน่ง...';
      navigator.geolocation.getCurrentPosition(pos => {
        document.getElementById('f_lat').value = pos.coords.latitude.toFixed(8);
        document.getElementById('f_lng').value = pos.coords.longitude.toFixed(8);
        if(statusEl) statusEl.textContent = '✅ ใช้ตำแหน่งปัจจุบันแล้ว';
        btns.forEach(b=> b.disabled=false);
      }, async err => {
        const msg = String(err && err.message ? err.message : err && err.code ? err.code : 'Unknown error');
        // PermissionDenied -> try approximate IP-based location as fallback
        if(err && err.code === 1){
          if(statusEl) statusEl.textContent = 'ไม่ได้รับอนุญาตตำแหน่ง — กำลังลองระบุตำแหน่งโดยประมาณจาก IP...';
          try{
            const r = await fetch('https://ipapi.co/json/');
            const j = await r.json();
            if(j && j.latitude && j.longitude){
              document.getElementById('f_lat').value = Number(j.latitude).toFixed(6);
              document.getElementById('f_lng').value = Number(j.longitude).toFixed(6);
              // แจ้งเตือนหากประเทศไม่ใช่ TH เพื่อหลีกเลี่ยงที่อยู่ผิดประเทศ
              const country = (j.country || j.country_name || '').toString();
              const warn = country && country.toUpperCase()!=='TH' ? `⚠️ ผลจาก IP ระบุประเทศ ${country} — อาจคลาดเคลื่อนมาก โปรดกรอกพิกัด/ที่อยู่เองหรือใช้ปุ่ม "ดึงพิกัดอัตโนมัติ"` : '✅ ระบุตำแหน่งโดยประมาณจาก IP แล้ว (อาจคลาดเคลื่อน)';
              if(statusEl) statusEl.textContent = warn;
              btns.forEach(b=> b.disabled=false);
              return;
            }
          }catch(_e){ /* ignore and fallthrough */ }
          if(statusEl) statusEl.innerHTML = 'ต้องอนุญาตตำแหน่งสำหรับเว็บไซต์นี้ หรือกรอกพิกัดเอง';
        } else {
          if(statusEl) statusEl.textContent = 'ไม่สามารถรับตำแหน่งได้: ' + msg;
        }
        btns.forEach(b=> b.disabled=false);
      }, { enableHighAccuracy:true, timeout:8000 });
    },

    async create(){
      const payload = readForm();
      // include username for auto-provision if session missing
      try{ const cur = JSON.parse(localStorage.getItem('currentUser')||'null'); if(cur && (cur.username||cur.email)) payload.username = cur.username||cur.email; }catch{}
      // If added via Data URL (offline or upload failed), try uploading now
      if(payload.image_url && payload.image_url.startsWith('data:')){
        try{
          payload.image_url = await ensureServerImageUrl(payload.image_url);
          const pre = document.getElementById('preview_new_image'); if(pre){ pre.src = payload.image_url; pre.style.display='inline-block'; }
          const fimg = document.getElementById('f_image'); if(fimg) fimg.value = payload.image_url;
        }catch(_e){}
      }
      const res = await fetchJSON('/api/shops', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
      if(res.ok){
        alert('เพิ่มร้านสำเร็จ');
        try{ localStorage.setItem('new_store_added', Date.now().toString()); }catch(e){}
        try{ window.location.href = 'home.html#added'; }catch(e){ loadStores(); }
      } else {
        if(res.status===0){
          // Offline fallback: save to localStorage
          const arr = getOfflineStores();
          const offlineId = -Date.now();
          arr.push({ id: offlineId, name: payload.name, description: payload.description, address: payload.address, rating: payload.rating, image_url: payload.image_url });
          setOfflineStores(arr);
          alert('✅ บันทึกสำเร็จ (ออฟไลน์): ร้านถูกเพิ่มในเครื่อง และจะแสดงในหน้า Home');
          try{ localStorage.setItem('new_store_added', Date.now().toString()); }catch(e){}
          try{ window.location.href = 'home.html#added'; }catch(e){ loadStores(); }
        } else {
          const msg = (res.data && (res.data.message||res.data.error)) || 'ตรวจสอบข้อมูลที่จำเป็น';
          alert('เพิ่มร้านไม่สำเร็จ: ' + msg);
        }
      }
    }
  };

  function insertFileModeBanner(){
    const banner = document.createElement('div');
    banner.style.cssText = 'background:#fff3cd;color:#664d03;border:1px solid #ffecb5;padding:8px 12px;border-radius:8px;margin:10px 0;';
    banner.innerHTML = 'คุณกำลังเปิดไฟล์แบบโดยตรง (file://) ทำให้เรียก API ไม่ได้ — โปรดรันเซิร์ฟเวอร์แล้วเปิดผ่าน <code>http://localhost:3001/admin.html</code>';
    const header = document.querySelector('header');
    (header?.parentNode||document.body).insertBefore(banner, header?.nextSibling||document.body.firstChild);
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    if(location.protocol === 'file:') insertFileModeBanner();
    loadStores();
    loadInputs();
    window.Admin = Admin;
  });
})();
