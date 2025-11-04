(function(){
  const qs = new URLSearchParams(location.search);
  const state = {
    pattern: qs.get('pattern') || '',
    since: qs.get('since') || '',
    until: qs.get('until') || '',
    min_size: qs.get('min_size') || '',
    max_size: qs.get('max_size') || '',
    sort: qs.get('sort') || 'date',
    order: qs.get('order') || 'desc',
    limit: qs.get('limit') || '200'
  };

  const els = {
    pattern: document.getElementById('pattern'),
    since: document.getElementById('since'),
    until: document.getElementById('until'),
    min_size: document.getElementById('min_size'),
    max_size: document.getElementById('max_size'),
    sort: document.getElementById('sort'),
    order: document.getElementById('order'),
    limit: document.getElementById('limit'),
    apply: document.getElementById('apply'),
    reset: document.getElementById('reset'),
    stats: document.getElementById('stats'),
    tableBody: document.getElementById('resultsBody'),
    downloadAll: document.getElementById('downloadAll'),
    previewPanel: document.getElementById('previewPanel'),
    previewTitle: document.getElementById('previewTitle'),
    previewJson: document.getElementById('previewJson'),
    closePreview: document.getElementById('closePreview'),
    login: document.getElementById('login'),
    logout: document.getElementById('logout')
  };

  function setInputsFromState(){
    els.pattern.value = state.pattern;
    els.since.value = state.since;
    els.until.value = state.until;
    els.min_size.value = state.min_size;
    els.max_size.value = state.max_size;
    els.sort.value = state.sort;
    els.order.value = state.order;
    els.limit.value = state.limit;
  }

  function readInputs(){
    state.pattern = els.pattern.value.trim();
    state.since = els.since.value;
    state.until = els.until.value;
    state.min_size = els.min_size.value;
    state.max_size = els.max_size.value;
    state.sort = els.sort.value;
    state.order = els.order.value;
    state.limit = els.limit.value || '200';
  }

  function buildQuery(){
    const u = new URL(location.href);
    const params = new URLSearchParams();
    const entries = Object.entries(state).filter(([,v]) => v !== '' && v != null);
    for (const [k,v] of entries) params.set(k, v);
    // force JSON extension by default
    if (!params.has('ext')) params.set('ext', '.json');
    u.search = params.toString();
    return u;
  }

  function updateUrlAndDownload(){
    const u = buildQuery();
    history.replaceState(null, '', u.toString());
    els.downloadAll.href = '/api/results/zip?' + u.searchParams.toString();
  }

  async function load(){
    updateUrlAndDownload();
    const isLoggedIn = await checkSession();
    if (!isLoggedIn){
      els.stats.textContent = 'Please log in to view results';
      els.tableBody.innerHTML = '';
      return;
    }
    const url = '/api/results/list?' + new URLSearchParams(location.search).toString();
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('Failed to load list');
    const data = await res.json();
    render(data.files || []);
  }

  function formatBytes(n){
    const num = Number(n||0);
    if (num < 1024) return num + ' B';
    if (num < 1024*1024) return (num/1024).toFixed(1) + ' KB';
    return (num/1024/1024).toFixed(1) + ' MB';
  }

  function render(files){
    // stats
    const total = files.reduce((a,f)=>a+Number(f.size||0),0);
    els.stats.textContent = `Matched: ${files.length} • Size: ${formatBytes(total)}`;

    // table
    els.tableBody.innerHTML = '';
    for (const f of files){
      const tr = document.createElement('tr');
      const name = document.createElement('td');
      const size = document.createElement('td');
      const mtime = document.createElement('td');
      const actions = document.createElement('td');

      name.textContent = f.name;
      size.textContent = f.size;
      size.className = 'num';
      mtime.textContent = f.mtime;

      const previewBtn = document.createElement('button');
      previewBtn.className = 'btn';
      previewBtn.textContent = 'Preview';
      previewBtn.addEventListener('click', (e)=>{ e.stopPropagation(); preview(f.name); });

      const openLink = document.createElement('a');
      openLink.href = f.url;
      openLink.className = 'btn link';
      openLink.target = '_blank';
      openLink.rel = 'noopener';
      openLink.textContent = 'Open';

      actions.append(previewBtn, document.createTextNode(' '), openLink);
      tr.append(name, size, mtime, actions);
      tr.addEventListener('click', ()=> preview(f.name));
      els.tableBody.appendChild(tr);
    }
  }

  async function preview(name){
    els.previewTitle.textContent = name;
    els.previewPanel.setAttribute('aria-hidden', 'false');
    els.previewJson.textContent = 'Loading...';
    try{
      const res = await fetch('/api/results/file/' + encodeURIComponent(name), { credentials: 'same-origin' });
      if (!res.ok) throw new Error('Failed to fetch file');
      const txt = await res.text();
      // pretty-print if valid JSON; else show raw
      try {
        const obj = JSON.parse(txt);
        els.previewJson.textContent = JSON.stringify(obj, null, 2);
      } catch {
        els.previewJson.textContent = txt;
      }
    }catch(err){
      els.previewJson.textContent = String(err);
    }
  }

  function toggleAuthButtons(isLoggedIn){
    if (!els.login || !els.logout) return;
    els.login.style.display = isLoggedIn ? 'none' : 'inline-block';
    els.logout.style.display = isLoggedIn ? 'inline-block' : 'none';
  }

  async function checkSession(){
    try{
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (!res.ok) { toggleAuthButtons(false); return false; }
      toggleAuthButtons(true);
      return true;
    }catch{
      toggleAuthButtons(false);
      return false;
    }
  }

  function attach(){
    setInputsFromState();
    els.apply.addEventListener('click', ()=>{ readInputs(); load().catch(console.error); });
    els.reset.addEventListener('click', ()=>{
      Object.assign(state, { pattern:'', since:'', until:'', min_size:'', max_size:'', sort:'date', order:'desc', limit:'200' });
      setInputsFromState();
      load().catch(console.error);
    });
    els.closePreview.addEventListener('click', ()=>{
      els.previewPanel.setAttribute('aria-hidden','true');
    });
    if (els.login){ els.login.addEventListener('click', ()=>{ window.location.href = '/api/auth/login'; }); }
    if (els.logout){ els.logout.addEventListener('click', ()=>{ window.location.href = '/api/auth/logout'; }); }
    // We can't know login state from the client without a ping; keep buttons visible for now
    toggleAuthButtons(true); // assume logged in after redirect
  }

  attach();
  load().catch(err=>{
    console.error(err);
    els.stats.textContent = 'Error loading results';
  });
})();


