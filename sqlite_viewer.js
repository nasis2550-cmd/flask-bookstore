(function(){
  const fileInput = document.getElementById('fileInput');
  const loadBtn = document.getElementById('loadBtn');
  const statusEl = document.getElementById('status');
  const tablesEl = document.getElementById('tables');
  const previewBtn = document.getElementById('previewBtn');
  const schemaBtn = document.getElementById('schemaBtn');
  const resultEl = document.getElementById('result');
  const panelTitle = document.getElementById('panelTitle');

  let db = null;
  let SQLModule = null;

  async function initSqlJs(){
    SQLModule = await initSqlJs({ locateFile: (f) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.9.0/${f}` });
  }

  async function loadDbFromFile(file){
    statusEl.textContent = 'กำลังโหลดไฟล์...';
    const buf = await file.arrayBuffer();
    try {
      db = new SQLModule.Database(new Uint8Array(buf));
      statusEl.textContent = `โหลดฐานข้อมูลสำเร็จ: ${file.name}`;
      listTables();
    } catch(e){
      console.error(e);
      statusEl.textContent = 'โหลดไฟล์ล้มเหลว';
    }
  }

  function listTables(){
    tablesEl.innerHTML = '';
    const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    const names = [];
    while(stmt.step()){
      const row = stmt.getAsObject();
      names.push(row.name);
    }
    stmt.free();
    names.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n; opt.textContent = n;
      tablesEl.appendChild(opt);
    });
    if(names.length === 0){
      const opt = document.createElement('option');
      opt.textContent = '(ไม่มีตาราง)';
      tablesEl.appendChild(opt);
    }
  }

  function renderTable(headers, rows){
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    headers.forEach(h => {
      const th = document.createElement('th'); th.textContent = h; trh.appendChild(th);
    });
    thead.appendChild(trh);
    const tbody = document.createElement('tbody');
    rows.forEach(r => {
      const tr = document.createElement('tr');
      headers.forEach(h => {
        const td = document.createElement('td');
        const val = r[h];
        td.textContent = (val === null || val === undefined) ? '' : String(val);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(thead);
    table.appendChild(tbody);
    return table;
  }

  function previewSelected(){
    const table = tablesEl.value;
    if(!table){
      resultEl.textContent = 'กรุณาเลือกตาราง';
      return;
    }
    panelTitle.textContent = `ข้อมูล: ${table}`;
    try{
      const res = db.exec(`SELECT * FROM ${table} LIMIT 200`);
      resultEl.innerHTML = '';
      if(!res || res.length === 0){ resultEl.textContent = 'ไม่มีข้อมูล'; return; }
      const { columns, values } = res[0];
      const rows = values.map(v => Object.fromEntries(v.map((val, i) => [columns[i], val])));
      resultEl.appendChild(renderTable(columns, rows));
    }catch(e){
      console.error(e);
      resultEl.textContent = 'อ่านข้อมูลล้มเหลว';
    }
  }

  function showSchema(){
    const table = tablesEl.value;
    if(!table){
      resultEl.textContent = 'กรุณาเลือกตาราง';
      return;
    }
    panelTitle.textContent = `โครงสร้าง: ${table}`;
    try{
      const res = db.exec(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${table}'`);
      resultEl.innerHTML = '';
      if(!res || res.length === 0){ resultEl.textContent = 'ไม่พบโครงสร้าง'; return; }
      const sql = res[0].values[0][0];
      const pre = document.createElement('pre');
      pre.textContent = sql;
      resultEl.appendChild(pre);
    }catch(e){
      console.error(e);
      resultEl.textContent = 'อ่านโครงสร้างล้มเหลว';
    }
  }

  loadBtn.addEventListener('click', async () => {
    if(!fileInput.files || fileInput.files.length === 0){
      statusEl.textContent = 'กรุณาเลือกไฟล์ก่อน';
      return;
    }
    if(!SQLModule){ await initSqlJs(); }
    loadDbFromFile(fileInput.files[0]);
  });
  previewBtn.addEventListener('click', previewSelected);
  schemaBtn.addEventListener('click', showSchema);
})();
