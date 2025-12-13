// profile.js - inject small profile widget site-wide after login
(function(){
  // โหมดออฟไลน์: อ่านผู้ใช้จาก localStorage เท่านั้น
  async function resolveUser(){
    const raw = localStorage.getItem('currentUser');
    if(!raw) return null;
    try { const u = JSON.parse(raw); return (u && u.username) ? u : null; } catch { return null; }
  }
  document.addEventListener('DOMContentLoaded', async () => {
    const user = await resolveUser();
    if(!user) return; // not logged in

    // Avoid duplicate injection
    if(document.getElementById('profileMini')) return;

    // Target header if available else body
    const host = document.querySelector('.header-actions') || document.body;

    const wrap = document.createElement('div');
    wrap.id = 'profileMini';
    wrap.className = 'profile-mini';
    const initial = (user.username && user.username.trim()[0] || 'U').toUpperCase();
    const avatarHtml = user.avatar ? `<img src="${user.avatar}" class="pm-avatar-img" alt="avatar">` : `<span class="pm-avatar" aria-hidden="true">${initial}</span>`;
    wrap.innerHTML = `
      <button type="button" class="pm-core" aria-label="โปรไฟล์ผู้ใช้">
        ${avatarHtml}
        <span class="pm-name">${user.username}</span>
      </button>
      <div class="pm-menu" role="menu">
        <div class="pm-menu-header">👤 ${user.username}</div>
        <button class="pm-menu-item" data-act="avatar" role="menuitem">🖼️ เปลี่ยนรูปโปรไฟล์</button>
        <button class="pm-menu-item" data-act="comments" role="menuitem">💬 คอมเม้นต์ของฉัน</button>
        <button class="pm-menu-item" data-act="logout" role="menuitem">🚪 ออกจากระบบ</button>
      </div>
    `;
    host.appendChild(wrap);

    const core = wrap.querySelector('.pm-core');
    const menu = wrap.querySelector('.pm-menu');
    core.addEventListener('click', () => {
      menu.classList.toggle('open');
    });
    document.addEventListener('click', e => {
      if(!wrap.contains(e.target)) menu.classList.remove('open');
    });
    menu.addEventListener('click', e => {
      const actBtn = e.target.closest('.pm-menu-item');
      if(!actBtn) return;
      const act = actBtn.getAttribute('data-act');
      if(act === 'logout'){
        // local-only logout
        localStorage.removeItem('currentUser');
        menu.classList.remove('open');
        location.href = 'login_red.html';
      } else if(act === 'comments') {
        // Navigate to comment page (could filter by store later)
        location.href = 'Comment.html';
      } else if(act === 'avatar') {
        // open file picker
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display='none';
        document.body.appendChild(fileInput);
        fileInput.addEventListener('change', () => {
          const f = fileInput.files[0];
          if(!f){ fileInput.remove(); return; }
          openAvatarCrop(f, dataUrl => {
            try {
              const cuRaw = localStorage.getItem('currentUser');
              let cu = cuRaw ? JSON.parse(cuRaw) : null;
              if(cu){ cu.avatar = dataUrl; localStorage.setItem('currentUser', JSON.stringify(cu)); }
              const usersRaw = localStorage.getItem('users');
              if(usersRaw && cu && cu.email){
                const users = JSON.parse(usersRaw);
                if(users[cu.email]){ users[cu.email].avatar = dataUrl; localStorage.setItem('users', JSON.stringify(users)); }
              }
              const imgExisting = wrap.querySelector('.pm-avatar-img');
              if(imgExisting){ imgExisting.src = dataUrl; }
              else {
                const spanAvatar = wrap.querySelector('.pm-avatar');
                if(spanAvatar){
                  const img = document.createElement('img');
                  img.src = dataUrl; img.className='pm-avatar-img'; img.alt='avatar';
                  spanAvatar.replaceWith(img);
                }
              }
              alert('✅ เปลี่ยนรูปโปรไฟล์แล้ว');
            }catch(err){ console.error(err); alert('❌ ไม่สามารถบันทึกรูป'); }
            fileInput.remove();
          });
        });
        fileInput.click();
      }
    });

    // Hide login button if present
    const loginBtn = Array.from(document.querySelectorAll('button, a'))
      .find(el => /เข้าสู่ระบบ/.test(el.textContent) && /login_red\.html/.test(el.getAttribute('onclick')||'') || /login_red\.html/.test(el.getAttribute('href')||''));
    if(loginBtn){ loginBtn.style.display='none'; }

    // Replace greeting with username if element exists
    const greetEl = document.getElementById('userGreeting');
    if(greetEl){ greetEl.textContent = `👋 สวัสดี, ${user.username}!`; }
  });
})();
