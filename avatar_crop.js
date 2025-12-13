// avatar_crop.js - lightweight square cropping modal
(function(){
  if(window.openAvatarCrop) return; // avoid duplicate
  function injectStyles(){
    if(document.getElementById('avatarCropStyles')) return;
    const st = document.createElement('style'); st.id='avatarCropStyles'; st.textContent = `
      .ac-overlay{position:fixed;inset:0;background:rgba(0,0,0,.65);backdrop-filter:blur(3px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;}
      .ac-panel{background:#fff;border-radius:16px;max-width:520px;width:100%;padding:18px;box-shadow:0 20px 50px rgba(0,0,0,.5);font-family:'Prompt',system-ui;display:flex;flex-direction:column;gap:14px;}
      .ac-canvas-wrap{position:relative;width:360px;height:360px;margin:0 auto;border-radius:12px;overflow:hidden;background:#f2f2f2;border:1px solid #ddd;}
      .ac-canvas-wrap canvas{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);image-rendering:auto;}
      .ac-guide{position:absolute;inset:0;border:2px solid rgba(255,255,255,.9);box-shadow:0 0 0 999px rgba(0,0,0,.35);pointer-events:none;border-radius:0;}
      .ac-controls{display:flex;flex-direction:column;gap:10px}
      .ac-row{display:flex;align-items:center;gap:10px}
      .ac-range{flex:1}
      .ac-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:6px}
      .ac-btn{background:#ff9f43;border:0;color:#fff;font-weight:600;padding:10px 16px;border-radius:10px;cursor:pointer;font-family:inherit;box-shadow:0 4px 12px rgba(0,0,0,.25);transition:.18s}
      .ac-btn:hover{transform:translateY(-2px);}
      .ac-btn.cancel{background:#bbb;color:#222}
      @media (max-width:600px){.ac-canvas-wrap{width:260px;height:260px}}
    `; document.head.appendChild(st);
  }

  function openAvatarCrop(file, cb){
    if(!file || !file.type.match(/image\//)){ alert('ไฟล์ไม่ใช่รูปภาพ'); return; }
    injectStyles();
    const overlay = document.createElement('div'); overlay.className='ac-overlay';
    const panel = document.createElement('div'); panel.className='ac-panel';
    panel.innerHTML = `<h3 style="margin:0;font-size:18px">🖼️ ปรับรูปโปรไฟล์</h3><div style="font-size:12px;opacity:.7">ลากเพื่อจัดตำแหน่ง / เลื่อนเพื่อซูม</div>`;

    const wrap = document.createElement('div'); wrap.className='ac-canvas-wrap';
    const canvas = document.createElement('canvas'); canvas.width=800; canvas.height=800; wrap.appendChild(canvas);
    const guide = document.createElement('div'); guide.className='ac-guide'; wrap.appendChild(guide);

    const ctx = canvas.getContext('2d');

    const img = new Image();
    const reader = new FileReader();
    reader.onload = e => { img.src = e.target.result; };
    reader.readAsDataURL(file);

    let scale = 1, minScale=1, maxScale=4; // dynamic after image load
    let offsetX = 0, offsetY = 0; // center offsets
    let dragging=false, lastX=0, lastY=0;

    img.onload = () => {
      // compute initial scale to fit shorter side to crop box (wrap size)
      const boxSize = wrap.clientWidth; // square
      const scaleFit = boxSize / Math.min(img.width, img.height);
      scale = minScale = scaleFit;
      draw();
    };

    function draw(){
      const boxSize = wrap.clientWidth;
      canvas.width = boxSize; canvas.height = boxSize;
      ctx.clearRect(0,0,canvas.width,canvas.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const cx = canvas.width/2 + offsetX;
      const cy = canvas.height/2 + offsetY;
      ctx.drawImage(img, cx - drawW/2, cy - drawH/2, drawW, drawH);
    }

    wrap.addEventListener('mousedown', e=>{ dragging=true; lastX=e.clientX; lastY=e.clientY; });
    window.addEventListener('mouseup', ()=> dragging=false);
    window.addEventListener('mousemove', e=>{
      if(!dragging) return;
      offsetX += e.clientX - lastX; offsetY += e.clientY - lastY; lastX=e.clientX; lastY=e.clientY; draw();
    });

    const controls = document.createElement('div'); controls.className='ac-controls';
    const zoomRow = document.createElement('div'); zoomRow.className='ac-row';
    zoomRow.innerHTML = `<label style="font-size:13px">ซูม</label>`;
    const range = document.createElement('input'); range.type='range'; range.min='1'; range.max='4'; range.step='0.01'; range.value='1'; range.className='ac-range';
    range.addEventListener('input', ()=>{ scale = minScale * parseFloat(range.value); draw(); });
    zoomRow.appendChild(range); controls.appendChild(zoomRow);

    const actions = document.createElement('div'); actions.className='ac-actions';
    const btnOk = document.createElement('button'); btnOk.className='ac-btn'; btnOk.textContent='✅ ใช้รูปนี้';
    const btnCancel = document.createElement('button'); btnCancel.className='ac-btn cancel'; btnCancel.textContent='✕ ยกเลิก';
    actions.appendChild(btnCancel); actions.appendChild(btnOk);
    controls.appendChild(actions);

    panel.appendChild(wrap); panel.appendChild(controls); overlay.appendChild(panel); document.body.appendChild(overlay);

    btnCancel.addEventListener('click', ()=> document.body.removeChild(overlay));
    btnOk.addEventListener('click', ()=> {
      // export 256x256 square
      const outSize = 256;
      const out = document.createElement('canvas'); out.width=outSize; out.height=outSize; const octx = out.getContext('2d');
      const drawW = img.width * scale; const drawH = img.height * scale;
      const cx = canvas.width/2 + offsetX; const cy = canvas.height/2 + offsetY;
      const sx = cx - drawW/2; const sy = cy - drawH/2;
      octx.drawImage(img, sx, sy, drawW, drawH, 0,0,outSize,outSize);
      try{ cb(out.toDataURL('image/png')); }catch(e){ console.error(e); }
      document.body.removeChild(overlay);
    });
  }

  window.openAvatarCrop = openAvatarCrop;
})();
