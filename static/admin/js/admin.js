(function(){
  const els = {
    login: document.getElementById('login'),
    logout: document.getElementById('logout'),
    whoami: document.getElementById('whoami'),
    adminPanel: document.getElementById('adminPanel'),
    email: document.getElementById('email'),
    search: document.getElementById('search'),
    status: document.getElementById('status'),
    results: document.getElementById('results'),
  };

  function toggleAuthButtons(isLoggedIn){
    if (!els.login || !els.logout) return;
    els.login.style.display = isLoggedIn ? 'none' : 'inline-block';
    els.logout.style.display = isLoggedIn ? 'inline-block' : 'none';
  }

  function setWhoami(user){
    if (!els.whoami) return;
    if (!user){ els.whoami.textContent = ''; return; }
    const name = user.name || user.email || user.sub || '';
    els.whoami.textContent = name ? `Logged in as ${name}` : '';
  }

  async function checkSession(){
    try{
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (!res.ok){ toggleAuthButtons(false); setWhoami(null); return false; }
      const data = await res.json();
      toggleAuthButtons(Boolean(data && data.authenticated));
      setWhoami(data && data.user);
      return Boolean(data && data.authenticated);
    }catch{
      toggleAuthButtons(false);
      setWhoami(null);
      return false;
    }
  }

  function renderUsers(users){
    els.results.innerHTML = '';
    for (const u of (users||[])){
      const tr = document.createElement('tr');
      const tdEmail = document.createElement('td'); tdEmail.textContent = u.email || '';
      const tdName = document.createElement('td'); tdName.textContent = u.name || '';
      const tdConn = document.createElement('td'); tdConn.textContent = u.connection || '';
      const tdAct = document.createElement('td');
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = 'Grant read:results';
      btn.addEventListener('click', ()=> grantByUserId(u.user_id || '', u.email || ''));
      tdAct.appendChild(btn);
      tr.append(tdEmail, tdName, tdConn, tdAct);
      els.results.appendChild(tr);
    }
  }

  async function search(){
    els.status.textContent = '';
    els.results.innerHTML = '';
    const email = (els.email.value || '').trim();
    if (!email){ els.status.textContent = 'Enter an email'; return; }
    try{
      const res = await fetch('/api/admin/search_user?email=' + encodeURIComponent(email), { credentials: 'same-origin' });
      if (res.status === 403){ els.status.textContent = 'You do not have access.'; return; }
      if (!res.ok){ els.status.textContent = 'Search failed'; return; }
      const data = await res.json();
      renderUsers(data.users || []);
      els.status.textContent = (data.users||[]).length ? '' : 'No users found';
    }catch(err){ els.status.textContent = 'Search error'; }
  }

  async function grantByUserId(user_id, fallbackEmail){
    els.status.textContent = '';
    try{
      const res = await fetch('/api/admin/grant_read_results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(user_id ? { user_id } : { email: fallbackEmail })
      });
      if (res.status === 403){ els.status.textContent = 'You do not have access.'; return; }
      if (!res.ok){ els.status.textContent = 'Grant failed'; return; }
      els.status.textContent = 'Granted read:results';
      await loadReaders();
    }catch{ els.status.textContent = 'Grant error'; }
  }

  async function loadReaders(){
    try{
      const res = await fetch('/api/admin/users_with_permission?permission=read:results&per_page=25', { credentials: 'same-origin' });
      if (res.status === 403){ els.status.textContent = 'You do not have access.'; return; }
      if (!res.ok){ return; }
      const data = await res.json();
      if (Array.isArray(data.users) && data.users.length){
        renderUsers(data.users);
      }
    }catch{}
  }

  function attach(){
    if (els.login){ els.login.addEventListener('click', ()=>{ window.location.href = '/api/auth/login'; }); }
    if (els.logout){ els.logout.addEventListener('click', ()=>{ window.location.href = '/api/auth/logout'; }); }
    if (els.search){ els.search.addEventListener('click', search); }
  }

  attach();
  checkSession().then(async ok=>{
    if (ok && els.adminPanel){
      els.adminPanel.style.display = '';
      await loadReaders();
    }
  });
})();


