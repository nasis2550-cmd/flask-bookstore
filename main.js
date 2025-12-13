// main.js - clean store rendering with fallback data
(function(){
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

  window.BookstoreAPI = window.BookstoreAPI || {};
  window.BookstoreAPI.base = API_BASE;
  window.BookstoreAPI.setBase = function(newBase=''){
    const clean = (newBase||'').trim().replace(/\/$/, '');
    if(clean){ localStorage.setItem('bookstore_api_base', clean); }
    else { localStorage.removeItem('bookstore_api_base'); }
    location.reload();
  };

  function apiUrl(path){
    if(/^https?:/i.test(path)) return path;
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return API_BASE ? `${API_BASE}${normalized}` : normalized;
  }

  function resolveMediaSrc(src){
    if(!src) return src;
    if(/^https?:/i.test(src)) return src;
    if(API_BASE){
      return `${API_BASE}/${src.replace(/^\//,'')}`;
    }
    return src;
  }

  // Expand a potential media path into multiple candidates:
  // - relative (as-is), absolute with leading '/', and API_BASE-prefixed when available
  function expandSrcCandidates(src){
    if(!src) return [];
    if(/^https?:/i.test(src)) return [src];
    const clean = String(src).replace(/^\//,'');
    const out = new Set();
    out.add(clean);              // images/foo.jpg
    out.add('/' + clean);        // /images/foo.jpg
    if(API_BASE){ out.add(`${API_BASE}/${clean}`); } // http://host/images/foo.jpg
    return Array.from(out);
  }

  // --- Server session greeting (replaces localStorage user) ---
  async function refreshAuthGreeting(){
    try {
      const r = await fetch(apiUrl('/api/me'));
      if(r.ok){
        const j = await r.json();
        if(j.authenticated){
          const el = document.getElementById('userGreeting');
          if(el) el.textContent = `👋 สวัสดี, ${j.username}!`;
          return;
        }
      }
    } catch(e) {}
    const el = document.getElementById('userGreeting');
    if(el) el.textContent = '👋 สวัสดี!';
  }
  // embedded fallback data (if API/JSON fails) - always shows stores
  const FALLBACK_STORES = [
  { "name": "SE-ED Book Store - Central Westgate", "category": "ทั่วไป", "books": "นิยาย, การพัฒนา, ธุรกิจ", "location": "เซ็นทรัล เวสต์เกต", "address": "VCH6+476 ตำบล เสาธงหิน อำเภอบางใหญ่ นนทบุรี 11110", "lat": 13.87783090709703, "lng": 100.41063110963587, "type": "ร้านหนังสือขนาดใหญ่", "phone": "02 194 2776", "hours": "10:00-22:00", "rating": 4.8 },
    { "name": "ร้านนนทบุรีบิ๊กบุ๊ค", "category": "ทั่วไป", "books": "นิยาย, การศึกษา, วรรณกรรม", "location": "ตรงข้ามสถานีรถไฟ", "address": "21 หมู่ 5 ซอยเทศบาล 7 ถ. บางกรวย - ไทรน้อย ตำบลโสนลอย อำเภอบางบัวทอง นนทบุรี 11110", "lat": 13.915582715119998, "lng": 100.42195843684675, "type": "ร้านหนังสือขนาดเล็ก", "phone": "02 920 2416", "hours": "09:00-17:00 (หยุด ส-อ)", "rating": 4.2 },
  { "name": "นายอินทร์ The Mall งามวงศ์วาน", "category": "นวนิยาย", "books": "วรรณกรรม, นวนิยายไทย", "location": "เดอะมอลล์ไลฟ์สโตร์ งามวงศ์วาน", "address": "ชั้น 4, แผนกเครื่องเขียน, เลขที่ 30/39 ถนน งามวงศ์วาน ตำบลบางเขน อำเภอเมืองนนทบุรี 11000", "lat": 13.855149242285885, "lng": 100.54209949183135, "type": "ร้านหนังสือขนาดใหญ่", "phone": "02 023 7955", "hours": "10:30-22:00", "rating": 4.6 },
  { "name": "นายอินทร์ ปตท.ราชพฤกษ์ 4", "category": "ทั่วไป", "books": "นิยาย, การศึกษา, ธุรกิจ", "location": "ปตท. ราชพฤกษ์", "address": "ปตท. ราชพฤกษ์ เลขที่ 97/5 หมู่ที่ 1 ตำบล ท่าอิฐ อำเภอปากเกร็ด นนทบุรี 11120", "lat": 13.890887324061127, "lng": 100.45114792883551, "type": "ร้านหนังสือขนาดกลาง", "phone": "02 195 2145", "hours": "09:00-19:00", "rating": 4.4 },
  { "name": "ร้าน หนอนหนังสือ ติวานนท์", "category": "นิยาย", "books": "นิยาย, การ์ตูน, วรรณกรรม", "location": "ติวานนท์", "address": "57 14/1 ถ. ติวานนท์ อำเภอเมืองนนทบุรี 11000", "lat": 13.848665530863663, "lng": 100.51443997116448, "type": "ร้านหนังสือขนาดเล็ก", "phone": "084 731 3157", "hours": "09:00-17:00", "rating": 4.3 },
    { "name": "ซีเอ็ดบุ๊คเซ็นเตอร์ @ เดอะมอลล์ งามวงศ์วาน", "category": "ทั่วไป", "books": "นิยาย, การศึกษา, ธุรกิจ", "location": "เดอะมอลล์ไลฟ์สโตร์ งามวงศ์วาน (ชั้น 3)", "address": "30/39-50 ถนน งามวงศ์วาน ตำบลบางเขน อำเภอเมืองนนทบุรี 11000", "lat": 13.857990550649248, "lng": 100.53703289639215, "type": "ร้านหนังสือขนาดใหญ่", "phone": "02 030 2590", "hours": "10:00-22:00", "rating": 4.7 },
      { "name": "นายอินทร์ เอสพรานาด รัตนาธิเบศร์", "category": "นวนิยาย", "books": "วรรณกรรม, นวนิยายไทย", "location": "เอสพลานาด ซีนีเพล็กซ์ งามวงศ์วาน-แคราย", "address": "Esplanade Ngamwongwan หมู่ที่ 8 ห้อง L3-06 เมืองนนทบุรี", "lat": 13.860565129741413, "lng": 100.51846006945577, "type": "ร้านหนังสือขนาดใหญ่", "phone": "02 591 2235", "hours": "10:30-20:00", "rating": 4.5 },
      { "name": "นิยายรัก", "category": "นิยาย", "books": "โรแมนติก, นวนิยายไทย", "location": "ซอย ติวานนท์ 18", "address": "33 ซอย ติวานนท์ 18 ตำบลตลาดขวัญ เมืองนนทบุรี", "lat": 13.857695966922385, "lng": 100.52311892473139, "type": "ร้านหนังสือขนาดเล็ก", "phone": "089 050 5713", "hours": "09:00-19:00", "rating": 4.1 },
      { "name": "นายอินทร์ เซ็นทรัล แจ้งวัฒนะ", "category": "ทั่วไป", "books": "นิยาย, การศึกษา", "location": "เซ็นทรัล แจ้งวัฒนะ (ชั้น G)", "address": "99/9 หมู่ที่ 2 ชั้น G ถ. แจ้งวัฒนะ อำเภอปากเกร็ด", "lat": 13.904270425595989, "lng": 100.52810157116448, "type": "ร้านหนังสือขนาดใหญ่", "phone": "02 101 0650", "hours": "10:00-21:00", "rating": 4.6 },
      { "name": "บีทูเอส เซ็นทรัลรัตนาธิเบศร์", "category": "ทั่วไป", "books": "นิยาย, การศึกษา, ธุรกิจ", "location": "เซ็นทรัลนอร์ธวิลล์", "address": "562 หมู่8 ถนน รัตนาธิเบศร์ ตำบลบางกระสอ เมืองนนทบุรี", "lat": 13.866769380620477, "lng": 100.4963812334449, "type": "ร้านหนังสือขนาดใหญ่", "phone": "063 323 1028", "hours": "10:00-21:00", "rating": 4.5 },
      { "name": "ซีเอ็ดบุ๊คเซ็นเตอร์ บิ๊กซีรัตนาธิเบศร์ 2", "category": "ทั่วไป", "books": "นิยาย, การศึกษา", "location": "บิ๊กซี รัตนาธิเบศร์", "address": "68/777 หมู่8 ถนน รัตนาธิเบศร์ ตำบลบางกระสอ เมืองนนทบุรี", "lat": 13.861253016163905, "lng": 100.5036484799283, "type": "ร้านหนังสือขนาดกลาง", "phone": "02 950 4852", "hours": "10:30-19:30", "rating": 4.3 },
      { "name": "59 เช่าหนังสือ", "category": "เช่าหนังสือ", "books": "นิยาย, การศึกษา", "location": "ท่าทราย", "address": "59 ซอย สามัคคี 23 ท่าทราย เมืองนนทบุรี", "lat": 13.88769664236593, "lng": 100.51839801349342, "type": "ร้านเช่าหนังสือ", "phone": "094 549 5419", "hours": "10:00-21:00", "rating": 4.2 },
      { "name": "B2S เซ็นทรัลเวสต์วิลล์ ราชพฤกษ์", "category": "ทั่วไป", "books": "นิยาย, การศึกษา, ธุรกิจ", "location": "เซ็นทรัล เวสต์วิลล์", "address": "999 ถ. ราชพฤกษ์ ตำบล มหาสวัสดิ์ อำเภอบางกรวย", "lat": 13.804564288293529, "lng": 100.44901524232895, "type": "ร้านหนังสือขนาดใหญ่", "phone": "064 587 6481", "hours": "10:00-22:00", "rating": 4.7 },
      { "name": "Katang books888", "category": "นิยาย", "books": "นิยาย, การ์ตูน, วรรณกรรม", "location": "ประชาราษฎร์ 16", "address": "11 ซอย ประชาราษฎร์ 16 ตำบลตลาดขวัญ เมืองนนทบุรี", "lat": 13.84459071727023, "lng": 100.50266272883553, "type": "ร้านหนังสือขนาดเล็ก", "phone": "089 122 4978", "hours": "10:00-19:00", "rating": 4.4 },
      { "name": "ร้านหนังสือก้าวบรรทัด พระนั่งเกล้า", "category": "ทั่วไป", "books": "นิยาย, การศึกษา", "location": "พระนั่งเกล้า", "address": "VFCF+628 ตำบล ไทรม้า เมืองนนทบุรี", "lat": 13.870740827536796, "lng": 100.4725892, "type": "ร้านหนังสือขนาดกลาง", "phone": "096 789 4645", "hours": "08:00-17:00", "rating": 4.4 },
      { "name": "ร้านนายอินทร์", "category": "ทั่วไป", "books": "นิยาย, การศึกษา, ธุรกิจ", "location": "บางตลาด", "address": "นบ.3019 ตำบลบางตลาด อำเภอปากเกร็ด นนทบุรี", "lat": 13.905322165841858, "lng": 100.51590462667139, "type": "ร้านหนังสือขนาดใหญ่", "phone": "", "hours": "10:00-20:00", "rating": 4.5 },
      { "name": "นายอินทร์ โฮมโปร ราชพฤกษ์", "category": "ทั่วไป", "books": "นิยาย, การศึกษา, ธุรกิจ", "location": "HOMEPRO ราชพฤกษ์", "address": "HOMEPRO ราชพฤกษ์ 82 หมู่ที่ 2 อาคาร A ห้อง RT-4/1 ตำบล บางขุนกอง อำเภอบางกรวย นนทบุรี", "lat": 13.82027129214267, "lng": 100.44740694232894, "type": "ร้านหนังสือขนาดกลาง", "phone": "+66 2 423 3261", "hours": "09:00-21:00", "rating": 4.3 },
      { "name": "นายอินทร์ สำนักงานใหญ่", "category": "ทั่วไป", "books": "ทั่วไป", "location": "บางกรวย", "address": "108 ถนน บางกรวย-กรุงนนท์ ตำบล มหาสวัสดิ์ อำเภอบางกรวย นนทบุรี 11130", "lat": 13.80277448993279, "lng": 100.43223735767103, "type": "สำนักงานใหญ่", "phone": "+66 2 423 9999", "hours": "08:00-17:30 (ปิด ส-อ)", "rating": 4.2 }
  , { "name": "บริษัท ศูนย์หนังสือ เมืองไทย จำกัด", "category": "ทั่วไป", "books": "ทั่วไป", "location": "ไทรม้า", "address": "ซอย หมู่บ้านมณียา 3 ซอย 10 ตำบล ไทรม้า อำเภอเมืองนนทบุรี นนทบุรี 11000", "lat": 13.884943345149907, "lng": 100.4627902711645, "type": "ร้านหนังสือขนาดกลาง", "phone": "02 924 6316", "hours": "08:00-17:00", "rating": 4.3 }
  , { "name": "ร้าน วุฒิชัย บุ๊คส์", "category": "ทั่วไป", "books": "ทั่วไป, นิยาย", "location": "บางสีทอง", "address": "119/21 หมู่ 5 ซอย 28 ถนน บางกรวย-ไทรน้อย ตำบล บางสีทอง อำเภอบางกรวย นนทบุรี 11130", "lat": 13.81380867982336, "lng": 100.42279920000003, "type": "ร้านหนังสือขนาดเล็ก", "phone": "081 345 4555", "hours": "09:00-20:30", "rating": 4.4 }
  , { "name": "นายอินทร์ สาขา The Jas บางบัวทอง", "category": "ทั่วไป", "books": "นิยาย, การศึกษา, ธุรกิจ", "location": "The Jas บางบัวทอง", "address": "บางบัวทอง ชั้น 1 ใกล้ Tops ซุปเปอร์มาร์เก็ต ตำบล พิมลราช อำเภอบางบัวทอง นนทบุรี 11110", "lat": 13.908385789262038, "lng": 100.39580801779111, "type": "ร้านหนังสือขนาดใหญ่", "phone": "098 258 0396", "hours": "10:00-21:00", "rating": 4.6 }
  , { "name": "ร้านหนังสือก้าวบรรทัด (บางใหญ่ซิตี้)", "category": "ทั่วไป", "books": "นิยาย, การศึกษา", "location": "บางใหญ่ซิตี้", "address": "เลขที่ 61/14 ถนน หมู่บ้านบางใหญ่ซิตี้ ตำบล เสาธงหิน อำเภอบางใหญ่ นนทบุรี 11140", "lat": 13.879686160369834, "lng": 100.40539509639183, "type": "ร้านหนังสือขนาดกลาง", "phone": "087 711 1968", "hours": "09:00-20:00", "rating": 4.4 }
  , { "name": "A BOOK with NO NAME", "category": "ทั่วไป", "books": "นิยาย, วรรณกรรม, ศิลปะ", "location": "สามเสน 17 ดุสิต", "address": "721, 723 ซอย สามเสน 17 แขวงถนนนครไชยศรี เขตดุสิต กรุงเทพมหานคร 10300 ไทย", "lat": 13.784049147487117, "lng": 100.5108455846579, "type": "ร้านหนังสือขนาดเล็ก", "phone": "+66 80 238 4284", "hours": "12:00-19:00 (จันทร์ปิด)", "rating": 4.5 }
  , { "name": "ห้องสมุดประชาชนจังหวัดนนทบุรี", "category": "ห้องสมุด", "books": "ทั่วไป, อ้างอิง, นิยาย", "location": "ท่าทราย", "address": "541 ถ. ติวานนท์ ท่าทราย อำเภอเมืองนนทบุรี นนทบุรี 11000 ไทย", "lat": 13.872049064231595, "lng": 100.51686183936798, "type": "ห้องสมุดประชาชน", "phone": "+66 2 525 3254", "hours": "08:30-16:30", "rating": 4.5 }
  , { "name": "ห้องสมุดประชาชน อำเภอไทรน้อย จังหวัดนนทบุรี", "category": "ห้องสมุด", "books": "ทั่วไป, อ้างอิง, นิยาย", "location": "อำเภอไทรน้อย", "address": "ซอย ถนนเทศบาล 1 ตำบลไทรน้อย อำเภอไทรน้อย นนทบุรี 11150 ไทย", "lat": 13.980839822888049, "lng": 100.31681152710532, "type": "ห้องสมุดประชาชน", "phone": "-", "hours": "เปิดทำการ", "rating": 4.4 }
  , { "name": "หอสมุดกาญจนาภิเษกวัดเขมาฯ", "category": "ห้องสมุด", "books": "ทั่วไป, อ้างอิง", "location": "วัดเขมาภิรตาราม", "address": "วัดเขมาภิรตารามราชวรวิหาร 45 ซ. พิบูลสงคราม 3 ตำบลสวนใหญ่ อำเภอเมืองนนทบุรี นนทบุรี 11000 ไทย", "lat": 13.821325322925459, "lng": 100.50290439296447, "type": "หอสมุดเฉพาะทาง", "phone": "+66 80 038 9011", "hours": "09:00-16:30", "rating": 4.6 }
  , { "name": "The WAKEUP Café(บอร์ดเกมส์ฟรี)", "category": "บอร์ดเกม", "books": "บอร์ดเกมฟรี, คาเฟ่", "location": "ละหาร บางบัวทอง", "address": "34 3 ตำบล ละหาร อำเภอบางบัวทอง นนทบุรี 11110 ไทย", "lat": 13.931039809516022, "lng": 100.43437499603569, "type": "คาเฟ่บอร์ดเกม", "phone": "+66 63 942 9362", "hours": "09:00-21:00", "rating": 4.5 }
  , { "name": "WarOx Board Games", "category": "บอร์ดเกม", "books": "บอร์ดเกม, คาเฟ่", "location": "ติวานนท์ ปากเกร็ด", "address": "100/3 ถ. ติวานนท์ ตำบล ปากเกร็ด อำเภอปากเกร็ด นนทบุรี 11120 ไทย", "lat": 13.912399127525008, "lng": 100.50982716755709, "type": "ร้านบอร์ดเกม", "phone": "+66 99 085 4700", "hours": "10:00-23:00", "rating": 4.6 }
  , { "name": "Siam Board Games Cafe ( Betrend ชั้น 4 เดอะมอลล์งามวงศ์วาน )", "category": "บอร์ดเกม", "books": "บอร์ดเกม, คาเฟ่", "location": "เดอะมอลล์ งามวงศ์วาน ชั้น 4", "address": "430 ถนน งามวงศ์วาน ตำบลบางเขน อำเภอเมืองนนทบุรี นนทบุรี 11000 ไทย", "lat": 13.855464743729717, "lng": 100.54203500655794, "type": "คาเฟ่บอร์ดเกม", "phone": "+66 64 941 7357", "hours": "10:00-21:00", "rating": 4.5 }
  , { "name": "Mystery Dungeon Board Game & Coffee Homey", "category": "บอร์ดเกม", "books": "บอร์ดเกม, คาเฟ่, กาแฟ", "location": "หมู่บ้านอินดี้เวสเกต", "address": "หมู่บ้านอินดี้เวสเกต 168/195 ตำบล บางรักพัฒนา อำเภอบางบัวทอง นนทบุรี 11110 ไทย", "lat": 13.89954802417384, "lng": 100.38799282584512, "type": "คาเฟ่บอร์ดเกม", "phone": "+66 99 321 7251", "hours": "11:00-22:00", "rating": 4.6 }
  , { "name": "Meanbook Board Game Store", "category": "บอร์ดเกม", "books": "บอร์ดเกม, ร้านหนังสือ", "location": "แจ้งวัฒนะ ปากเกร็ด", "address": "110, 15 หมู่ 2 ถ. แจ้งวัฒนะ ตำบล ปากเกร็ด อำเภอปากเกร็ด นนทบุรี 11120 ไทย", "lat": 13.913598825130173, "lng": 100.49577675540284, "type": "ร้านบอร์ดเกม", "phone": "+66 64 186 9998", "hours": "10:00-20:00", "rating": 4.5 }
  , { "name": "ฮอบบี้ บอร์ดเกมคาเฟ่", "category": "บอร์ดเกม", "books": "บอร์ดเกม, คาเฟ่", "location": "รัตนาธิเบศร์ บางบัวทอง", "address": "122, 39 หมู่ 1 ถนน รัตนาธิเบศร์ บางรักใหญ่, อำเภอบางบัวทอง นนทบุรี 11110 ไทย", "lat": 13.875448112261358, "lng": 100.43135852522784, "type": "คาเฟ่บอร์ดเกม", "phone": "+66 89 204 6782", "hours": "12:00-21:00", "rating": 4.5 }
  , { "name": "Siam Board Games Cafe (ชั้น G B2S Westgate)", "category": "บอร์ดเกม", "books": "บอร์ดเกม, คาเฟ่", "location": "B2S Westgate ชั้น G", "address": "199 199/1 199/2 ถ. กาญจนาภิเษก ตำบล เสาธงหิน อำเภอบางใหญ่ นนทบุรี 11140 ไทย", "lat": 13.876895114626404, "lng": 100.41134304526805, "type": "คาเฟ่บอร์ดเกม", "phone": "+66 64 941 8162", "hours": "12:00-21:00", "rating": 4.5 }
  , { "name": "Legendary Wargame (Warhammer Club)", "category": "บอร์ดเกม", "books": "วอร์เกม, บอร์ดเกม", "location": "กาญจนาภิเษก บางม่วง", "address": "RCQ2+8JF Legendary Wargame 55 ถนน กาญจนาภิเษก ตำบล บางม่วง อำเภอบางใหญ่ นนทบุรี 11140 ไทย", "lat": 13.838445917647364, "lng": 100.40158672522746, "type": "คลับวอร์เกม", "phone": "+66 86 174 2604", "hours": "10:00-00:00", "rating": 4.7 }
  , { "name": "30 Thirsty ร้านบอร์ดเกม คาเฟ่ นนทบุรี", "category": "บอร์ดเกม", "books": "บอร์ดเกม, คาเฟ่, เครื่องดื่ม", "location": "แจ้งวัฒนะ-ปากเกร็ด 33", "address": "164 8 แจ้งวัฒนะ-ปากเกร็ด 33 ตำบลบางพูด อำเภอปากเกร็ด นนทบุรี 11120 ไทย", "lat": 13.908362172231449, "lng": 100.53802842522818, "type": "คาเฟ่บอร์ดเกม", "phone": "+66 86 565 6426", "hours": "12:00-23:00", "rating": 4.6 }
  , { "name": "Legendary Wargame", "category": "บอร์ดเกม", "books": "วอร์เกม, บอร์ดเกม", "location": "บางม่วง", "address": "ตำบล บางม่วง อำเภอบางใหญ่ นนทบุรี 11140 ไทย", "lat": 13.838548369836948, "lng": 100.40156915406288, "type": "ร้านวอร์เกม", "phone": "+66 86 174 2604", "hours": "10:30-23:00", "rating": 4.6 }
  ];

  // Sponsor configuration
  const SPONSORS = new Set(['SE-ED Book Store - Central Westgate']);
  // Map overrides ensure specific stores open at precise coordinates (added ร้านนนทบุรีบิ๊กบุ๊ค high precision)
  const MAP_OVERRIDES = {
    'SE-ED Book Store - Central Westgate': { lat: 13.87783090709703, lng: 100.41063110963587 },
    'ร้านนนทบุรีบิ๊กบุ๊ค': { lat: 13.915582715119998, lng: 100.42195843684675 },
    'นายอินทร์ The Mall งามวงศ์วาน': { lat: 13.855149242285885, lng: 100.54209949183135 },
    'นายอินทร์ ปตท.ราชพฤกษ์ 4': { lat: 13.890887324061127, lng: 100.45114792883551 },
    'ร้าน หนอนหนังสือ ติวานนท์': { lat: 13.848665530863663, lng: 100.51443997116448 },
    'ซีเอ็ดบุ๊คเซ็นเตอร์ @ เดอะมอลล์ งามวงศ์วาน': { lat: 13.857990550649248, lng: 100.53703289639215 },
    'นายอินทร์ เอสพรานาด รัตนาธิเบศร์': { lat: 13.860565129741413, lng: 100.51846006945577 },
    'นิยายรัก': { lat: 13.857695966922385, lng: 100.52311892473139 },
    'นายอินทร์ เซ็นทรัล แจ้งวัฒนะ': { lat: 13.904270425595989, lng: 100.52810157116448 },
    'บีทูเอส เซ็นทรัลรัตนาธิเบศร์': { lat: 13.866769380620477, lng: 100.4963812334449 },
    'ซีเอ็ดบุ๊คเซ็นเตอร์ บิ๊กซีรัตนาธิเบศร์ 2': { lat: 13.861253016163905, lng: 100.5036484799283 },
    '59 เช่าหนังสือ': { lat: 13.88769664236593, lng: 100.51839801349342 },
    'Katang books888': { lat: 13.84459071727023, lng: 100.50266272883553 },
    'B2S เซ็นทรัลเวสต์วิลล์ ราชพฤกษ์': { lat: 13.804564288293529, lng: 100.44901524232895 },
    'ร้านหนังสือก้าวบรรทัด พระนั่งเกล้า': { lat: 13.870740827536796, lng: 100.4725892 },
    'ร้านนายอินทร์': { lat: 13.905322165841858, lng: 100.51590462667139 },
    'นายอินทร์ โฮมโปร ราชพฤกษ์': { lat: 13.82027129214267, lng: 100.44740694232894 },
    'นายอินทร์ สำนักงานใหญ่': { lat: 13.80277448993279, lng: 100.43223735767103 },
    'บริษัท ศูนย์หนังสือ เมืองไทย จำกัด': { lat: 13.884943345149907, lng: 100.4627902711645 },
    'ร้าน วุฒิชัย บุ๊คส์': { lat: 13.81380867982336, lng: 100.42279920000003 },
    'นายอินทร์ สาขา The Jas บางบัวทอง': { lat: 13.908385789262038, lng: 100.39580801779111 },
    'ร้านหนังสือก้าวบรรทัด (บางใหญ่ซิตี้)': { lat: 13.879686160369834, lng: 100.40539509639183 }
    ,'A BOOK with NO NAME': { lat: 13.784049147487117, lng: 100.5108455846579 }
    ,'ห้องสมุดประชาชนจังหวัดนนทบุรี': { lat: 13.872049064231595, lng: 100.51686183936798 }
    ,'ห้องสมุดประชาชน อำเภอไทรน้อย จังหวัดนนทบุรี': { lat: 13.980839822888049, lng: 100.31681152710532 }
    ,'หอสมุดกาญจนาภิเษกวัดเขมาฯ': { lat: 13.821325322925459, lng: 100.50290439296447 }
    ,'The WAKEUP Café(บอร์ดเกมส์ฟรี)': { lat: 13.931039809516022, lng: 100.43437499603569 }
    ,'WarOx Board Games': { lat: 13.912399127525008, lng: 100.50982716755709 }
    ,'Siam Board Games Cafe ( Betrend ชั้น 4 เดอะมอลล์งามวงศ์วาน )': { lat: 13.855464743729717, lng: 100.54203500655794 }
    ,'Mystery Dungeon Board Game & Coffee Homey': { lat: 13.89954802417384, lng: 100.38799282584512 }
    ,'Meanbook Board Game Store': { lat: 13.913598825130173, lng: 100.49577675540284 }
    ,'ฮอบบี้ บอร์ดเกมคาเฟ่': { lat: 13.875448112261358, lng: 100.43135852522784 }
    ,'Siam Board Games Cafe (ชั้น G B2S Westgate)': { lat: 13.876895114626404, lng: 100.41134304526805 }
    ,'Legendary Wargame (Warhammer Club)': { lat: 13.838445917647364, lng: 100.40158672522746 }
    ,'30 Thirsty ร้านบอร์ดเกม คาเฟ่ นนทบุรี': { lat: 13.908362172231449, lng: 100.53802842522818 }
    ,'Legendary Wargame': { lat: 13.838548369836948, lng: 100.40156915406288 }
  };

  const imageErrorLog = new Set();
  let currentSortKey = 'featured';
  window.userLocation = window.userLocation || null;

  async function fetchBookstores(options = {}){
    const params = new URLSearchParams();
    if(options.sort && options.sort !== 'featured') params.set('sort', options.sort);
    if(options.lat != null && options.lng != null){
      params.set('lat', options.lat);
      params.set('lng', options.lng);
      if(options.radius) params.set('radius', options.radius);
    }
  let base = [];
  const endpoint = params.toString() ? apiUrl(`/api/bookstores?${params}`) : apiUrl('/api/bookstores');
    try {
      const rs = await fetch(endpoint);
      if(rs.ok){
        const js = await rs.json();
        const arr = Array.isArray(js) ? js : (js.data || []);
        if(arr.length){
          base = arr.map(s => ({
            ...s,
            lat: s.lat ?? s.latitude,
            lng: s.lng ?? s.longitude
          }));
        }
      }
    } catch(e) {}
    if(base.length === 0){
      try {
        const fallbackRs = await fetch(apiUrl('/api/shops'));
        if(fallbackRs.ok){
          const js = await fallbackRs.json();
          const arr = Array.isArray(js) ? js : (js.data || []);
          if(arr.length){
            base = arr.map(s => ({
              ...s,
              lat: s.lat ?? s.latitude,
              lng: s.lng ?? s.longitude
            }));
          }
        }
      } catch(e) {}
    }
    if(base.length === 0){
      try {
        const r2 = await fetch('/data/bookstores.json');
        if(r2.ok){
          const j2 = await r2.json();
          base = Array.isArray(j2) ? j2 : (j2.data || []);
        }
      } catch(e) {}
    }
    if(base.length === 0){ base = FALLBACK_STORES.slice(); }

    // Enrich missing fields (category, type, books, location, lat/lng) from FALLBACK_STORES by name
    // This ensures on-page filters like มังงะ/ความรู้/ขนาดร้าน work even when API data is sparse.
    try {
      const byNameFallback = new Map(FALLBACK_STORES.map(s => [s.name, s]));
      base = base.map(s => {
        const f = byNameFallback.get(s.name);
        if(!f) return s;
        return {
          ...s,
          category: s.category || f.category || '',
          books: s.books || f.books || '',
          location: s.location || f.location || '',
          address: s.address || f.address || '',
          lat: (s.lat != null ? s.lat : (s.latitude != null ? s.latitude : f.lat)),
          lng: (s.lng != null ? s.lng : (s.longitude != null ? s.longitude : f.lng)),
          type: s.type || f.type || '',
          phone: s.phone || f.phone || '',
          hours: s.hours || f.hours || '',
          rating: (s.rating != null ? s.rating : f.rating)
        };
      });
    } catch(e) {}
    // Merge any offline stores saved by admin page
    let offline = [];
    try{ offline = JSON.parse(localStorage.getItem('offline_stores')||'[]'); }catch(e){}
    if(Array.isArray(offline) && offline.length){
      // Simple merge; if names duplicate, keep the one with explicit id (offline id is negative)
      const byName = new Map();
      base.forEach(s=> byName.set((s.name||'')+ '|' + (s.location||''), s));
      offline.forEach(s=>{ const key = (s.name||'') + '|' + (s.location||''); if(!byName.has(key)) byName.set(key, s); });
      base = Array.from(byName.values());
    }
    return base;
  }

  function recordImageFailure(storeName, src){
    const key = `${storeName||'unknown'}|${src}`;
    if(!imageErrorLog.has(key)){
      imageErrorLog.add(key);
    }
  }

  function showImageWarning(storeName, card){
    if(!card) return;
    if(card.querySelector('.image-warning')) return;
    const badge = document.createElement('div');
  badge.className = 'image-warning';
  badge.textContent = `⚠️ รูปไม่แสดง${storeName ? ` (${storeName})` : ''}`;
    const heading = card.querySelector('h3');
    if(heading) heading.insertAdjacentElement('afterend', badge);
  }

  function loadStoreImage(imgEl, store, card, opts = {}){
    if(!imgEl) return;
  const customRaw = [];
  if(store.image_url) customRaw.push(store.image_url);
  if(store.image_thumb_url) customRaw.push(store.image_thumb_url);
  const fallbackRaw = imageCandidatesFor(store.name);
  const cands = [...customRaw, ...fallbackRaw].flatMap(expandSrcCandidates).filter(Boolean);
    if(!cands.length){ imgEl.remove(); showImageWarning(store.name, card); return; }
    imgEl.style.display='none';
    let idx = 0;
    const tryNext = ()=>{
      if(idx >= cands.length){
        imgEl.remove();
        if(typeof opts.onFail === 'function'){ opts.onFail(); }
        else showImageWarning(store.name, card);
        return;
      }
      const src = cands[idx++];
      imgEl.src = src;
      imgEl.onload = ()=>{ imgEl.style.display='block'; };
      imgEl.onerror = ()=>{ recordImageFailure(store.name, src); tryNext(); };
    };
    tryNext();
  }

  function updateGeoStatus(state, coords){
    const el = document.getElementById('geoStatus');
    if(!el) return;
    let text = '';
    switch(state){
      case 'granted':
        if(coords){ text = `✅ แชร์ตำแหน่งแล้ว (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`; }
        else text = '✅ แชร์ตำแหน่งแล้ว';
        el.classList.remove('status-warning');
        el.classList.add('status-ok');
        break;
      case 'denied':
        text = '⚠️ ปฏิเสธการแชร์ตำแหน่ง — ตรวจสอบการตั้งค่าเบราว์เซอร์';
        el.classList.add('status-warning');
        el.classList.remove('status-ok');
        break;
      case 'unsupported':
        text = '🚫 เบราว์เซอร์ไม่รองรับการระบุตำแหน่ง';
        el.classList.add('status-warning');
        el.classList.remove('status-ok');
        break;
      default:
        text = '📍 ยังไม่ได้ขอใช้ตำแหน่ง';
        el.classList.remove('status-warning','status-ok');
    }
    el.textContent = text;
  }

  function initGeoPanel(){
    if(!navigator.geolocation){ updateGeoStatus('unsupported'); return; }
    if(navigator.permissions && navigator.permissions.query){
      navigator.permissions.query({ name:'geolocation' }).then(result => {
        updateGeoStatus(result.state);
        result.onchange = ()=> updateGeoStatus(result.state, window.userLocation);
      }).catch(()=> updateGeoStatus('prompt'));
    } else {
      updateGeoStatus('prompt');
    }
  }

  function requestUserLocation(){
    if(!navigator.geolocation) return Promise.reject(new Error('เบราว์เซอร์ไม่รองรับตำแหน่งที่ตั้ง'));
    return new Promise((resolve, reject)=>{
      navigator.geolocation.getCurrentPosition(pos => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        window.userLocation = coords;
        updateGeoStatus('granted', coords);
        resolve(coords);
      }, err => {
        updateGeoStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'prompt');
        reject(err);
      }, { enableHighAccuracy: true, timeout: 15000 });
    });
  }

  function buildFetchOptions(targetSort = currentSortKey){
    const opts = {};
    if(targetSort === 'latest') opts.sort = 'latest';
    else if(targetSort === 'rating') opts.sort = 'rating';
    else if(targetSort === 'distance' && window.userLocation){
      opts.sort = 'distance';
      opts.lat = window.userLocation.lat;
      opts.lng = window.userLocation.lng;
      opts.radius = 50;
    }
    return opts;
  }

  function imageCandidatesFor(name){
    const n = (name||'').toLowerCase();
    const cands = [];
    if(!name) return cands;
    // 1) exact store-name files in images/ with common extensions
    ['.jpg','.png','.webp','.jpeg'].forEach(ext => cands.push(`images/${name}${ext}`));
    // 1.1) tolerant variants: trim/multiple-space collapse/remove symbols
    try {
      const collapsed = name.replace(/\s+/g,' ').trim();
      const noSymbols = collapsed.replace(/[()@•·]/g,'').replace(/\s+/g,' ').trim();
      const variants = new Set([collapsed, noSymbols]);
      variants.forEach(v=> ['.jpg','.png','.webp','.jpeg'].forEach(ext => cands.push(`images/${v}${ext}`)));
      // also handle accidental space before extension (Windows filenames sometimes have it)
      variants.forEach(v=> ['.jpg','.png','.webp','.jpeg'].forEach(ext => cands.push(`images/${v} ${ext}`)));
    } catch(e){}

    // 2) aliases for known variations or different file names
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
      // Added mapping so a shared photo works for both branches
  'ร้านหนังสือก้าวบรรทัด พระนั่งเกล้า': ['images/ร้านหนังสือก้าวบรรทัด พระนั่งเกล้า.jpg','images/ร้านหนังสือก้าวบรรทัด.jpg'],
      'ร้านหนังสือก้าวบรรทัด (บางใหญ่ซิตี้)': ['images/ร้านหนังสือก้าวบรรทัด.jpg']
      ,'ห้องสมุดประชาชนจังหวัดนนทบุรี': ['images/ห้องสมุดประชาชนจังหวัดนนทบุรี.webp']
      ,'ห้องสมุดประชาชน อำเภอไทรน้อย จังหวัดนนทบุรี': ['images/ห้องสมุดประชาชน อำเภอไทรน้อย จังหวัดนนทบุรี.png']
      ,'หอสมุดกาญจนาภิเษกวัดเขมาฯ': ['images/หอสมุดกาญจนาภิเษกวัดเขมาฯ.png']
      ,'The WAKEUP Café(บอร์ดเกมส์ฟรี)': ['images/The WAKEUP Café(บอร์ดเกมส์ฟรี).webp']
      ,'WarOx Board Games': ['images/WarOx Board Games.webp']
      ,'Siam Board Games Cafe ( Betrend ชั้น 4 เดอะมอลล์งามวงศ์วาน )': ['images/Siam Board Games Cafe ( Betrend ชั้น 4 เดอะมอลล์งามวงศ์วาน ).webp']
      ,'Mystery Dungeon Board Game & Coffee Homey': ['images/Mystery Dungeon Board Game & Coffee Homey.webp']
      ,'Meanbook Board Game Store': ['images/Meanbook Board Game Store.webp']
      ,'ฮอบบี้ บอร์ดเกมคาเฟ่': ['images/ฮอบบี้ บอร์ดเกมคาเฟ่.webp']
      ,'Siam Board Games Cafe (ชั้น G B2S Westgate)': ['images/Siam Board Games Cafe (ชั้น G B2S Westgate).webp']
      ,'Legendary Wargame (Warhammer Club)': ['images/Legendary Wargame (Warhammer Club).webp','images/Legendary Wargame.webp']
      ,'30 Thirsty ร้านบอร์ดเกม คาเฟ่ นนทบุรี': ['images/30 Thirsty ร้านบอร์ดเกม คาเฟ่ นนทบุรี.webp']
      ,'Legendary Wargame': ['images/Legendary Wargame.webp']
    };
    if(alias[name]) cands.unshift(...alias[name]);

    // 3) brand fallbacks
    if(n.includes('se-ed') || n.includes('ซีเอ็ด')) cands.push('images/SE-ED.jpg','SE-ED.jpg');
    if(n.includes('b2s') || n.includes('บีทูเอส')) cands.push('images/B2S เซ็นทรัลรัตนาธิเบศร์.png','images/B2S.png');
    if(n.includes('นายอินทร์')) cands.push('images/นายอิน2.jpg','images/นายอิน.jpg');

    // de-duplicate while preserving order
    return [...new Set(cands)];
  }

  function createCard(s){
    const a = document.createElement('article');
    a.className = 'store-card clickable' + (SPONSORS.has(s.name)?' sponsor':'');
    // Assign variation classes for visual diversity
    const rating = s.rating || 0;
    const variations = [];
    if(rating >= 4.7){
      // Exclude specific stores from gold featured animation per user request
      const EXCLUDE_FEATURED = new Set([
        'ซีเอ็ดบุ๊คเซ็นเตอร์ @ เดอะมอลล์ งามวงศ์วาน',
        'B2S เซ็นทรัลเวสต์วิลล์ ราชพฤกษ์'
      ]);
      if(EXCLUDE_FEATURED.has(s.name)){
        variations.push('card--wide'); // preserve wide layout without shine
      } else {
        variations.push('card--featured','card--wide');
      }
    }
    else if(rating >= 4.6){ variations.push('card--wide'); }
    else {
      // probabilistic variety
      if(Math.random() < 0.18) variations.push('card--wide');
      if(Math.random() < 0.15) variations.push('card--tall');
    }
    variations.forEach(v=> a.classList.add(v));
    // mark for intersection observer animation
    a.classList.add('card-appear');
    a.setAttribute('tabindex','0');
    const candidates = imageCandidatesFor(s.name);
    const imgTop = (candidates.length || s.image_url)
      ? `<img class="store-img" alt="${escapeHtml(s.name)}" style="width:100%;height:130px;object-fit:cover;border-radius:10px;margin-bottom:8px;display:none">`
      : '';
    a.innerHTML = `
      ${SPONSORS.has(s.name)?'<div class="sponsor-ribbon">ผู้สนับสนุน</div>':''}
      ${imgTop}
      <h3>${escapeHtml(s.name)}</h3>
      <div class="meta">${escapeHtml(s.location || '')} • ${escapeHtml(s.type || '')}</div>
      <p class="address">${escapeHtml(s.address || '')}</p>
      <p class="phone">📞 ${escapeHtml(s.phone || '-')}</p>
      <p class="hours">🕒 ${escapeHtml(s.hours || '')}</p>
      <div class="tags">${escapeHtml(s.category || '')} · ${escapeHtml(s.books || '')}</div>
      <div class="rating">⭐ ${s.rating ?? '–'}</div>
      ${typeof s.distance_km === 'number' ? `<div class="distance" style="margin-top:4px;font-size:12px;opacity:.8">📍 ~${formatDistanceKm(s.distance_km)}</div>` : ''}
      <div style="margin-top:10px;display:flex;gap:8px">
        <button class="btn" data-action="comments">💬 คอมเม้นต์</button>
        <button class="btn" data-action="map">🗺️ แผนที่</button>
      </div>
    `;
    // clicking anywhere on card (except buttons) opens detail modal
    const openDetail = (e)=>{ if(e.target.closest('button')) return; openStoreInfo(s); };
    a.addEventListener('click', openDetail);
    a.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); openStoreInfo(s); }});
    // เปลี่ยนให้ปุ่มคอมเม้นต์พาไปหน้า Comment.html พร้อมระบุร้าน
    a.querySelector('[data-action="comments"]').addEventListener('click',()=>{
      const store = s.name || '';
      location.href = `Comment.html?store=${encodeURIComponent(store)}`;
    });
    a.querySelector('[data-action="map"]').addEventListener('click',()=> openMapFor(s));
    // โหลดรูปจาก mapping (ลองหลายพาธ) และซ่อนหากไม่พบ
    const imgEl = a.querySelector('.store-img');
    loadStoreImage(imgEl, s, a);
    return a;
  }

  // แปลงระยะทางเป็นข้อความสั้น (km หรือ m)
  function formatDistanceKm(km){
    if(km < 1){
      const m = Math.round(km * 1000);
      return m + ' เมตร';
    }
    return km.toFixed(1) + ' กม.';
  }

  function escapeHtml(str){ if(!str) return ''; return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function renderStores(list){
    const parent = document.getElementById('storeList');
    if(!parent) return;
    imageErrorLog.clear();
    parent.innerHTML = '';
    // Bring sponsors to top
    const sponsors = list.filter(s=> SPONSORS.has(s.name));
    const others = list.filter(s=> !SPONSORS.has(s.name));
    [...sponsors, ...others].forEach(s=> parent.appendChild(createCard(s)));
    // update summary label if available
    const sum = document.getElementById('categorySummary');
    if(sum && typeof renderStores.currentLabel === 'string'){
      sum.textContent = `${renderStores.currentLabel} — ${list.length} ร้าน`;
    }
    // Apply intersection observer & variations styling
    applyCardAnimation();
    // Highlight search matches if a query is active
    if(window.searchCurrentQuery){
      const q = window.searchCurrentQuery.trim();
      if(q.length){
        // Escape regex special chars
        const pattern = q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        const regex = new RegExp(pattern,'gi');
        parent.querySelectorAll('h3, .address, .meta, .tags').forEach(el => {
          const txt = el.textContent;
            el.innerHTML = txt.replace(regex, m => `<mark style="background:#ffe38a;color:#000;border-radius:4px;padding:0 2px">${m}</mark>`);
        });
      }
    }
  }

  // IntersectionObserver to animate cards on entering viewport
  let cardObserver;
  function ensureCardObserver(){
    if(cardObserver) return cardObserver;
    cardObserver = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if(e.isIntersecting){
          e.target.classList.add('card-visible');
          e.target.classList.remove('card-appear');
          cardObserver.unobserve(e.target);
        }
      });
    }, {threshold:0.15, rootMargin:'0px 0px -10% 0px'});
    return cardObserver;
  }
  function applyCardAnimation(){
    const obs = ensureCardObserver();
    document.querySelectorAll('#storeList .store-card.card-appear').forEach(card => obs.observe(card));
  }

  // Debounce utility for live search filtering
  function debounce(fn, wait=160){ let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), wait); }; }

  function filterByCategory(cat){
    toggleActiveCategoryBtn(cat);
    // clear type selection when choosing book category
    document.querySelectorAll('button[data-type]')?.forEach(b=> b.classList.remove('active'));
    if(!window.bookstores) return;
    if(cat==='ทั้งหมด') { renderStores.currentLabel = 'ทั้งหมด'; renderStores(window.bookstores); return; }
    const MAP = {
      'มังงะ': ['มังงะ','การ์ตูน','manga','comic','อนิเมะ','ไลท์โนเวล','light novel'],
      'นิยาย': ['นิยาย','นวนิยาย','วรรณกรรม','โรแมนติก','แฟนตาซี','กำลังภายใน','นายอินทร์','naiin','b2s','บีทูเอส','se-ed','ซีเอ็ด'],
      'ความรู้': [
        'ความรู้','การศึกษา','วิชาการ','สารคดี','ประวัติศาสตร์','ธุรกิจ','การพัฒนา','พัฒนา','how to','คู่มือ',
        'วิทยาศาสตร์','เทคโนโลยี','คอมพิวเตอร์','โปรแกรม','เขียนโปรแกรม','coding','ai','data','ภาษาอังกฤษ','ภาษาจีน',
        'สุขภาพ','จิตวิทยา','การเงิน','ลงทุน','บริหาร','บัญชี','เศรษฐศาสตร์','กฎหมาย','การตลาด','งานอดิเรก','DIY'
      ],
      'เช่าหนังสือ': ['เช่าหนังสือ','เช่า'],
      'บอร์ดเกม': ['บอร์ดเกม','board game','boardgame','เกมกระดาน','tabletop']
    };
    const keys = MAP[cat] || [cat.toLowerCase()];
    const out = (window.bookstores||[]).filter(s=>{
      const hay = ((s.category||'') + ' ' + (s.books||'') + ' ' + (s.type||'') + ' ' + (s.name||'')).toLowerCase();
      return keys.some(k=> hay.includes(k));
    });
    renderStores.currentLabel = `หมวดหนังสือ: ${cat}`;
    renderStores(out);
  }

  // แยกตามประเภทร้าน (ขนาด/เช่า/สำนักงานใหญ่)
  function filterByStoreType(t){
    toggleActiveTypeBtn(t);
    // clear book category when choosing store type
    document.querySelectorAll('button[data-cat]')?.forEach(b=> b.classList.remove('active'));
    if(!window.bookstores) return;
    if(t==='all'){ renderStores.currentLabel = 'ประเภทร้าน: ทั้งหมด'; renderStores(window.bookstores); return; }
    const MAP = {
      'ใหญ่': ['ขนาดใหญ่'],
      'กลาง': ['ขนาดกลาง'],
      'เล็ก': ['ขนาดเล็ก'],
      'เช่า': ['เช่าหนังสือ','ร้านเช่าหนังสือ'],
      'สำนักงานใหญ่': ['สำนักงานใหญ่']
    };
    const keys = MAP[t] || [t.toLowerCase()];
    const out = (window.bookstores||[]).filter(s=>{
      const hay = ((s.type||'') + ' ' + (s.category||'')).toLowerCase();
      return keys.some(k=> hay.includes(k));
    });
    renderStores.currentLabel = `ประเภทร้าน: ${t}`;
    renderStores(out);
  }

  function filterAndRender(){
    const qRaw = (document.getElementById('searchInput')?.value || '').trim();
    const q = qRaw.toLowerCase();
    window.searchCurrentQuery = qRaw; // keep original case for highlight
    if(!q){ renderStores.currentLabel = 'ทั้งหมด'; return renderStores(window.bookstores || []); }
    const scored = (window.bookstores || []).map(s => {
      const name = (s.name||'').toLowerCase();
      const cat = (s.category||'').toLowerCase();
      const books = (s.books||'').toLowerCase();
      let score = -1;
      if(name === q) score = 1200; // exact match
      else if(name.startsWith(q)) score = 1000 - (name.length - q.length);
      else if(name.includes(q)) score = 800 - name.indexOf(q);
      else if(cat.includes(q)) score = 500 - cat.indexOf(q);
      else if(books.includes(q)) score = 400 - books.indexOf(q);
      if(score > 0 && s.rating) score += s.rating; // slight rating bonus
      return {s, score};
    }).filter(x => x.score > 0).sort((a,b) => b.score - a.score).map(x => x.s);
    renderStores.currentLabel = `ผลการค้นหา: "${qRaw}"`;
    renderStores(scored);
  }

  // Basic search trigger referenced by button/Enter
  function goToSearchPage(){
    try {
      const val = (document.getElementById('searchInput')?.value || '').trim();
      if(val.length){
  fetch(apiUrl('/api/inputs'), {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({type:'search', page:'home', value: val, user: (localStorage.getItem('currentUser') ? JSON.parse(localStorage.getItem('currentUser')).username : 'ผู้ใช้ทั่วไป') })});
      }
    } catch(e){}
    filterAndRender();
    document.getElementById('storeList')?.scrollIntoView({behavior:'smooth'});
  }

  async function applySort(sortKey, opts = {}){
    if(sortKey === currentSortKey && window.bookstores?.length && !opts.force){
      const selectEl = document.getElementById('sortSelect');
      if(selectEl) selectEl.value = sortKey;
      return;
    }
    if(sortKey === 'distance' && !window.userLocation){
      try {
        await requestUserLocation();
      } catch(err){
        alert('ต้องอนุญาตการเข้าถึงตำแหน่งเพื่อเรียงตามระยะทาง');
        const selectEl = document.getElementById('sortSelect');
        if(selectEl) selectEl.value = currentSortKey;
        return;
      }
    }
    currentSortKey = sortKey;
  const selectEl = document.getElementById('sortSelect');
  if(selectEl) selectEl.value = sortKey;
    if(!opts.skipSkeleton) renderSkeletons(6);
    try {
      const data = await fetchBookstores(buildFetchOptions(sortKey));
      window.bookstores = data;
      const labelMap = {
        featured: 'ทั้งหมด',
        latest: 'ร้านมาใหม่',
        rating: 'คะแนนสูงสุด',
        distance: 'เรียงตามระยะทาง'
      };
      renderStores.currentLabel = labelMap[sortKey] || 'ทั้งหมด';
      renderStores(window.bookstores);
      updateButtonCounts();
    } catch(e){
      console.error('applySort failed', e);
      alert('ไม่สามารถเรียงข้อมูลได้');
    }
  }


  async function findNearby(){
    // Active state for the nearby button
    toggleActiveNearbyBtn();
    try{
      const coords = await requestUserLocation();
  const r = await fetch(apiUrl(`/api/bookstores/nearby?lat=${coords.lat}&lng=${coords.lng}&radius=10`));
      if(r.ok){
        const json = await r.json();
        const arr = Array.isArray(json) ? json : (Array.isArray(json.data) ? json.data : []);
        if(arr.length){
          renderStores.currentLabel = 'ใกล้ฉัน (≤10 กม. จากตำแหน่งคุณ)';
          renderStores(arr.map(x => ({...x}))); 
          document.getElementById('googleMap')?.scrollIntoView({behavior:'smooth'});
          return;
        }
      }
      if(Array.isArray(window.bookstores)){
        const withDist = window.bookstores
          .filter(s=> typeof s.lat==='number' && typeof s.lng==='number')
          .map(s=> ({...s, distance_km: haversineKm(coords.lat, coords.lng, s.lat, s.lng)}))
          .filter(s=> s.distance_km <= 10)
          .sort((a,b)=> a.distance_km - b.distance_km);
        renderStores.currentLabel = 'ใกล้ฉัน (≤10 กม. จากตำแหน่งคุณ)';
        renderStores(withDist);
        document.getElementById('googleMap')?.scrollIntoView({behavior:'smooth'});
      }
    }catch(err){
      alert('ไม่สามารถค้นหาร้านใกล้คุณได้: ' + (err.message || 'Unknown error'));
    }
  }

  // small helpers for distance and active states
  function haversineKm(lat1,lon1,lat2,lon2){
    const R=6371; const dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
    const c = 2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R*c;
  }
  function toRad(d){ return d*Math.PI/180; }
  function toggleActiveCategoryBtn(cat){
    const btns = document.querySelectorAll('button[data-cat]');
    btns.forEach(b=> b.classList.toggle('active', b.getAttribute('data-cat')===cat));
    // If a category is selected, ensure nearby button is not active
    document.querySelectorAll('button[data-nearby]')?.forEach(b=> b.classList.remove('active'));
  }
  function toggleActiveNearbyBtn(){
    const near = document.querySelector('button[data-nearby]');
    if(near){
      near.classList.add('active');
      document.querySelectorAll('button[data-cat]')?.forEach(b=> b.classList.remove('active'));
      document.querySelectorAll('button[data-type]')?.forEach(b=> b.classList.remove('active'));
    }
  }

  function toggleActiveTypeBtn(t){
    const btns = document.querySelectorAll('button[data-type]');
    btns.forEach(b=> b.classList.toggle('active', b.getAttribute('data-type')===t));
    document.querySelectorAll('button[data-nearby]')?.forEach(b=> b.classList.remove('active'));
  }

  // แสดงจำนวนบนปุ่ม
  function updateButtonCounts(){
    const list = window.bookstores || [];
    const countAll = list.length;
    const countManga = list.filter(s=> ((s.category||'') + ' ' + (s.books||'')).toLowerCase().match(/มังงะ|การ์ตูน|manga|comic|อนิเมะ/)).length;
    const countNovel = list.filter(s=> ((s.category||'') + ' ' + (s.books||'') + ' ' + (s.name||'')).toLowerCase().match(/นิยาย|นวนิยาย|วรรณกรรม|นายอินทร์|b2s|se-ed|ซีเอ็ด|naiin|บีทูเอส/)).length;
    const countKnowledge = list.filter(s=> ((s.category||'') + ' ' + (s.books||'') + ' ' + (s.name||'') + ' ' + (s.type||''))
      .toLowerCase()
      .match(/ความรู้|การศึกษา|วิชาการ|สารคดี|ประวัติศาสตร์|ธุรกิจ|การพัฒนา|คู่มือ|วิทยาศาสตร์|เทคโนโลยี|คอมพิวเตอร์|โปรแกรม|เขียนโปรแกรม|coding|ai|data|การเงิน|ลงทุน|บริหาร|บัญชี|เศรษฐศาสตร์|กฎหมาย|การตลาด|สุขภาพ|จิตวิทยา/)).length;
    const countRent = list.filter(s=> ((s.category||'') + ' ' + (s.type||'')).toLowerCase().match(/เช่าหนังสือ/)).length;
    const countBoardGame = list.filter(s=> ((s.category||'') + ' ' + (s.books||'') + ' ' + (s.name||''))
      .toLowerCase().match(/บอร์ดเกม|board ?game|boardgame|เกมกระดาน|tabletop/)).length;

    const countTypeBig = list.filter(s=> (s.type||'').includes('ขนาดใหญ่')).length;
    const countTypeMid = list.filter(s=> (s.type||'').includes('ขนาดกลาง')).length;
    const countTypeSmall = list.filter(s=> (s.type||'').includes('ขนาดเล็ก')).length;
    const countTypeOffice = list.filter(s=> (s.type||'').includes('สำนักงานใหญ่')).length;

    setBtnCount('button[data-cat="ทั้งหมด"]', countAll);
    setBtnCount('button[data-cat="มังงะ"]', countManga);
    setBtnCount('button[data-cat="นิยาย"]', countNovel);
    setBtnCount('button[data-cat="ความรู้"]', countKnowledge);
    setBtnCount('button[data-cat="เช่าหนังสือ"]', countRent);
  setBtnCount('button[data-cat="บอร์ดเกม"]', countBoardGame);

    setBtnCount('button[data-type="all"]', countAll);
    setBtnCount('button[data-type="ใหญ่"]', countTypeBig);
    setBtnCount('button[data-type="กลาง"]', countTypeMid);
    setBtnCount('button[data-type="เล็ก"]', countTypeSmall);
    setBtnCount('button[data-type="เช่า"]', countRent);
    setBtnCount('button[data-type="สำนักงานใหญ่"]', countTypeOffice);
  }

  function setBtnCount(selector, count){
    const btn = document.querySelector(selector);
    if(!btn) return;
    let badge = btn.querySelector('.count-badge');
    if(!badge){ badge = document.createElement('span'); badge.className = 'count-badge'; btn.appendChild(badge); }
    badge.textContent = count;
  }

  async function openComments(storeName){
    // Create a modal overlay first
    let overlay = document.createElement('div');
    overlay.id = 'comments-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:999;backdrop-filter:blur(2px)';
    overlay.onclick = closeCommentModal;
    document.body.appendChild(overlay);
    
    // Create modal
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:linear-gradient(180deg,rgba(10,31,63,0.98),rgba(26,58,107,0.98));border-radius:12px;padding:24px;min-width:450px;max-width:90vw;max-height:80vh;z-index:1000;box-shadow:0 10px 40px rgba(0,0,0,0.8);border:1px solid rgba(255,255,255,0.04);overflow-y:auto';
    modal.innerHTML = `
      <div style="color:#fff">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h3 style="margin:0;font-size:18px">💬 คอมเม้นต์ — ${escapeHtml(storeName)}</h3>
          <button onclick="closeCommentModal()" style="background:none;border:none;color:#fff;font-size:24px;cursor:pointer;padding:0;width:30px;height:30px;display:flex;align-items:center;justify-content:center">×</button>
        </div>
        <div id="comments-list" style="max-height:300px;overflow-y:auto;margin-bottom:16px;padding:12px;background:rgba(0,0,0,0.3);border-radius:8px;border:1px solid rgba(255,255,255,0.04)"></div>
        <textarea id="comments-input" placeholder="พิมพ์คอมเม้นต์..." style="width:100%;min-height:70px;padding:10px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.02);color:#fff;font-family:inherit;font-size:13px;resize:vertical;box-sizing:border-box"></textarea>
        <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">
          <button class="btn" onclick="postNewComment('${escapeHtml(storeName).replace(/'/g, "\\'")}'); return false;">📤 ส่งคอมเม้นต์</button>
          <button class="btn" onclick="closeCommentModal()" style="background:linear-gradient(90deg,#6c757d,#a0a8b0)">✕ ปิด</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    window.currentCommentModal = modal;
    window.currentCommentOverlay = overlay;
    
    // Load existing comments
    try{
      let comments = [];
      // Try API first
      try{
  const r = await fetch(apiUrl(`/api/comments?store=${encodeURIComponent(storeName)}`));
        if(r.ok){
          const json = await r.json();
          comments = Array.isArray(json) ? json : (json.data || []);
        }
      }catch(e){}
      
      // Try localStorage fallback
      if(comments.length === 0){
        const stored = localStorage.getItem('comments_' + storeName);
        if(stored) comments = JSON.parse(stored);
      }
      
      const list = document.getElementById('comments-list');
      if(comments.length === 0){
        list.innerHTML = '<div style="color:rgba(255,255,255,0.6);font-size:13px;padding:12px;text-align:center">ยังไม่มีคอมเม้นต์ — เป็นคนแรกที่ให้ความเห็น!</div>';
      }else{
        list.innerHTML = comments.map(c => `
          <div style="padding:10px;border-bottom:1px solid rgba(255,255,255,0.1);font-size:13px;margin-bottom:4px">
            <div style="display:flex;justify-content:space-between">
              <strong style="color:#ffd166">${escapeHtml(c.user||c.username||'ผู้ใช้')}</strong>
              <span style="opacity:0.5;font-size:12px">${new Date(c.ts||c.timestamp).toLocaleString('th-TH')}</span>
            </div>
            <div style="margin-top:6px;opacity:0.95;word-wrap:break-word">${escapeHtml(c.text)}</div>
          </div>
        `).join('');
      }
    }catch(e){ 
      console.error('Load comments error:', e);
      document.getElementById('comments-list').innerHTML = '<div style="color:#ff6b6b">❌ ไม่สามารถโหลดคอมเม้นต์</div>';
    }
  }
  
  function closeCommentModal(){
    if(window.currentCommentModal){
      window.currentCommentModal.remove();
      window.currentCommentModal = null;
    }
    if(window.currentCommentOverlay){
      window.currentCommentOverlay.remove();
      window.currentCommentOverlay = null;
    }
  }
  
  async function postNewComment(storeName){
    const input = document.getElementById('comments-input');
    if(!input) return;
    const text = input.value.trim();
    if(!text) return alert('❌ กรุณาพิมพ์คอมเม้นต์');
    // Require server auth
    let authUser = null;
    try {
  const me = await fetch(apiUrl('/api/me'));
      if(me.ok){ const j = await me.json(); if(j.authenticated) authUser = j.username; }
    } catch(e) {}
    if(!authUser){ alert('⚠️ กรุณาเข้าสู่ระบบก่อนแสดงความคิดเห็น'); return; }
    // Resolve shop_id from loaded stores
    let shopId = null;
    if(Array.isArray(window.bookstores)){
      const match = window.bookstores.find(s=> s.name === storeName);
      if(match && match.id) shopId = match.id;
    }
    try {
      const payload = { text, ts: new Date().toISOString() };
      if(shopId != null) payload.shop_id = shopId; else payload.store = storeName;
  const r = await fetch(apiUrl('/api/comments'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if(!r.ok){ alert('❌ ส่งคอมเม้นต์ไม่สำเร็จ'); return; }
      alert('✅ ส่งคอมเม้นต์สำเร็จ!');
      input.value='';
      closeCommentModal();
      location.href = `Comment.html?store=${encodeURIComponent(storeName)}`;
    } catch(e){
      console.error('Post comment error:', e);
      alert('❌ ไม่สามารถส่งคอมเม้นต์');
    }
  }

  function openMapFor(store){
    // Open Google Maps prioritizing store's own coordinates, then overrides, else address/name
    const lat = store && store.lat != null ? parseFloat(store.lat) : NaN;
    const lng = store && store.lng != null ? parseFloat(store.lng) : NaN;
    if(Number.isFinite(lat) && Number.isFinite(lng)){
      window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,'_blank');
      return;
    }
    const ov = store ? MAP_OVERRIDES[store.name] : undefined;
    if(ov && Number.isFinite(ov.lat) && Number.isFinite(ov.lng)){
      window.open(`https://www.google.com/maps/search/?api=1&query=${ov.lat},${ov.lng}`,'_blank');
      return;
    }
    const q = encodeURIComponent((store && (store.address || store.name)) || '');
    if(q) window.open(`https://www.google.com/maps/search/?api=1&query=${q}`,'_blank');
  }

  // Simple modal for store info with small pop animation (CSS-driven) + image & color animation
  function openStoreInfo(s){
    const ov = document.createElement('div'); ov.className='overlay-sheet';
    ov.addEventListener('click', ()=>{ document.body.removeChild(ov); });
    const panel = document.createElement('div'); panel.className='modal-panel'; panel.addEventListener('click', e=> e.stopPropagation());
    // build modal with optional image slot and animated head background
    panel.innerHTML = `
      <div class="modal-head color-animate">
        <h3 style="margin:0;font-size:18px">${escapeHtml(s.name||'ร้าน')}</h3>
        <button class="modal-close" aria-label="ปิด" title="ปิด">×</button>
      </div>
      <div class="modal-body">
        <div class="store-detail-img-wrap"><img class="store-detail-img" alt="${escapeHtml(s.name||'ร้าน')}"></div>
        <div class="meta" style="margin-bottom:6px">${escapeHtml(s.location||'')} • ${escapeHtml(s.type||'')}</div>
        <div style="margin:6px 0">📍 ${escapeHtml(s.address||'-')}</div>
        <div>📞 ${escapeHtml(s.phone||'-')} • 🕒 ${escapeHtml(s.hours||'-')}</div>
        <div style="opacity:.9;margin-top:8px">${escapeHtml(s.category||'')} · ${escapeHtml(s.books||'')}</div>
        <div class="modal-actions">
          <button class="btn" data-act="comment">💬 คอมเม้นต์</button>
          <button class="btn" data-act="map">🗺️ แผนที่</button>
        </div>
      </div>`;
    panel.querySelector('.modal-close').addEventListener('click', ()=>{ document.body.removeChild(ov); });
    panel.querySelector('[data-act="comment"]').addEventListener('click', ()=>{ location.href = `Comment.html?store=${encodeURIComponent(s.name||'')}`; });
    panel.querySelector('[data-act="map"]').addEventListener('click', ()=> openMapFor(s));
    // attempt to load image candidates
    const imgEl = panel.querySelector('.store-detail-img');
    if(imgEl){
      const wrapper = panel.querySelector('.store-detail-img-wrap');
      loadStoreImage(imgEl, s, null, { onFail: ()=> wrapper?.remove() });
    } else {
      panel.querySelector('.store-detail-img-wrap')?.remove();
    }
    ov.appendChild(panel); document.body.appendChild(ov);
  }

  // wire UI
  document.addEventListener('DOMContentLoaded', async ()=>{
    // show skeletons while loading
    renderSkeletons(8);
    initGeoPanel();
    await refreshAuthGreeting();
    window.bookstores = await fetchBookstores(buildFetchOptions('featured'));
    currentSortKey = 'featured';
    const sortEl = document.getElementById('sortSelect');
    if(sortEl) sortEl.value = 'featured';
    renderStores.currentLabel = 'ทั้งหมด';
    renderStores(window.bookstores);
    // render sponsor hero banner
    renderSponsorHero();
    // ปรับให้ปุ่มค้นหาพาไปอีกหน้าที่สวยงามแทนการกรองในหน้านี้
    document.getElementById('btnSearch')?.addEventListener('click', goToSearchPage);
    document.getElementById('searchInput')?.addEventListener('keydown', e=>{ if(e.key==='Enter') goToSearchPage(); });
     window.filterByCategory = filterByCategory; // expose for inline onclicks
     window.findNearby = findNearby;
     window.filterByStoreType = filterByStoreType;
     // expose comment helpers for inline onclicks in modal
     window.postNewComment = postNewComment;
     window.closeCommentModal = closeCommentModal;
     window.openComments = openComments;
  window.openStoreInfo = openStoreInfo;

    // Also wire active state if data attributes exist
    document.querySelectorAll('button[data-cat]')?.forEach(btn=>{
      btn.addEventListener('click', ()=> toggleActiveCategoryBtn(btn.getAttribute('data-cat')));
    });
    document.querySelector('button[data-nearby]')?.addEventListener('click', toggleActiveNearbyBtn);
    document.getElementById('geoRequest')?.addEventListener('click', ()=> requestUserLocation().catch(()=>{}));
    sortEl?.addEventListener('change', e=> applySort(e.target.value));
    updateButtonCounts();
    // Live in-page filtering (real-time) while preserving search page navigation on Enter / button
    const liveInput = document.getElementById('searchInput');
    if(liveInput){
      const handler = debounce(()=>{
        const val = liveInput.value.trim();
        if(val.length === 0){ renderStores(window.bookstores || []); liveInput.classList.remove('live-filtering'); return; }
        liveInput.classList.add('live-filtering');
        filterAndRender();
      }, 220);
      liveInput.addEventListener('input', handler);
    }
    // Initial observe pass (cards may already be in view)
    applyCardAnimation();
    // Listen for store additions from admin page (cross-tab via localStorage event)
    window.addEventListener('storage', async (ev)=>{
      if(ev.key === 'new_store_added'){
        try{
          const latest = await fetchBookstores(buildFetchOptions());
          if(Array.isArray(latest) && latest.length){
            window.bookstores = latest;
            renderStores.currentLabel = 'ทั้งหมด';
            renderStores(window.bookstores);
            updateButtonCounts();
          }
        }catch(e){/* ignore */}
      }
    });
  });

  // Render skeleton placeholder cards
  function renderSkeletons(n){
    const parent = document.getElementById('storeList');
    if(!parent) return;
    parent.innerHTML = '';
    for(let i=0;i<n;i++){
      const sk = document.createElement('div');
      sk.className = 'skeleton-card';
      sk.innerHTML = `
        <div class="skeleton-line" style="height:16px;width:70%"></div>
        <div class="skeleton-line" style="width:60%"></div>
        <div class="skeleton-line" style="width:90%"></div>
        <div class="skeleton-line" style="width:50%"></div>
        <div class="skeleton-badge" style="margin-top:8px"></div>
      `;
      parent.appendChild(sk);
    }
  }

  // Render sponsor hero banner if container exists
  function renderSponsorHero(){
    const box = document.getElementById('sponsorHero');
    if(!box) return;
    const sponsor = (window.bookstores||[]).find(s=> SPONSORS.has(s.name));
    if(!sponsor) return;
    const cands = imageCandidatesFor(sponsor.name);
    box.style.display = '';
    box.innerHTML = `
      <div class="hero-box">
        <div class="img-wrap">
          <img id="sponsorImg" alt="${escapeHtml(sponsor.name)}" style="display:none">
          <div class="badge">ผู้สนับสนุน</div>
        </div>
        <div class="txt">
          <h3>SE-ED Book Store - Central Westgate</h3>
          <div class="meta">${escapeHtml(sponsor.location||'')} • ${escapeHtml(sponsor.type||'')}</div>
          <div style="margin-top:6px">📍 ${escapeHtml(sponsor.address||'-')} • 📞 ${escapeHtml(sponsor.phone||'-')} • 🕒 ${escapeHtml(sponsor.hours||'-')}</div>
          <div class="cta">
            
            <button class="btn" onclick="location.href='Comment.html?store='+encodeURIComponent('SE-ED Book Store - Central Westgate')">💬 คอมเม้นต์</button>
            <button class="btn" onclick="window.open('https://www.google.com/maps/search/?api=1&query=13.87783090709703,100.41063110963587','_blank')">🗺️ แผนที่</button>
          </div>
        </div>
      </div>`;
    // lazy load image
    const img = document.getElementById('sponsorImg');
    if(img && cands.length){
      const loadNext = (i)=>{
        if(i>=cands.length){ img.remove(); return; }
        img.src = cands[i];
        img.onload = ()=> img.style.display='block';
        img.onerror = ()=> loadNext(i+1);
      };
      loadNext(0);
    }
  }

})();



