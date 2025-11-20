(function () {
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
    copyPreview: document.getElementById('copyPreview'),
    downloadPreview: document.getElementById('downloadPreview'),
    wrapToggle: document.getElementById('wrapToggle'),
    login: document.getElementById('login'),
    logout: document.getElementById('logout'),
    filters: document.getElementById('filters'),
    guestBanner: document.getElementById('guestBanner'),
    resultsSection: document.querySelector('.results')
  };

  function setWhoami(user) {
    const el = document.getElementById('whoami');
    if (!el) return;
    if (!user) { el.textContent = ''; return; }
    const name = user.name || user.email || user.sub || '';
    el.textContent = name ? `Logged in as ${name}` : '';
  }

  function setInputsFromState() {
    els.pattern.value = state.pattern;
    els.since.value = state.since;
    els.until.value = state.until;
    els.min_size.value = state.min_size;
    els.max_size.value = state.max_size;
    els.sort.value = state.sort;
    els.order.value = state.order;
    els.limit.value = state.limit;
  }

  function readInputs() {
    state.pattern = els.pattern.value.trim();
    state.since = els.since.value;
    state.until = els.until.value;
    state.min_size = els.min_size.value;
    state.max_size = els.max_size.value;
    state.sort = els.sort.value;
    state.order = els.order.value;
    state.limit = els.limit.value || '200';
  }

  function buildQuery() {
    const u = new URL(location.href);
    const params = new URLSearchParams();
    const entries = Object.entries(state).filter(([, v]) => v !== '' && v != null);
    for (const [k, v] of entries) params.set(k, v);
    // force JSON extension by default
    if (!params.has('ext')) params.set('ext', '.json');
    u.search = params.toString();
    return u;
  }

  function updateUrlAndDownload() {
    const u = buildQuery();
    history.replaceState(null, '', u.toString());
    els.downloadAll.href = '/api/results/zip?' + u.searchParams.toString();
  }

  function updateUI(isLoggedIn) {
    if (els.guestBanner) els.guestBanner.style.display = isLoggedIn ? 'none' : 'block';
    if (els.filters) els.filters.style.display = isLoggedIn ? 'block' : 'none';
    if (els.resultsSection) els.resultsSection.style.display = isLoggedIn ? 'block' : 'none';
    if (els.stats) els.stats.style.display = isLoggedIn ? 'block' : 'none';
    if (els.downloadAll) els.downloadAll.style.display = isLoggedIn ? 'inline-block' : 'none';
  }

  async function load() {
    updateUrlAndDownload();
    const isLoggedIn = await checkSession();
    updateUI(isLoggedIn);

    if (!isLoggedIn) {
      // Do not redirect, just show banner (handled by updateUI)
      return;
    }

    const url = '/api/results/list?' + new URLSearchParams(location.search).toString();
    const res = await fetch(url, { credentials: 'same-origin' });
    if (res.status === 403) {
      els.stats.textContent = 'You do not have access.';
      els.tableBody.innerHTML = '';
      if (els.filters) els.filters.style.display = 'none';
      return;
    }
    if (!res.ok) throw new Error('Failed to load list');
    const data = await res.json();
    render(data.files || []);
  }

  function formatBytes(n) {
    const num = Number(n || 0);
    if (num < 1024) return num + ' B';
    if (num < 1024 * 1024) return (num / 1024).toFixed(1) + ' KB';
    return (num / 1024 / 1024).toFixed(1) + ' MB';
  }

  function render(files) {
    // stats
    const total = files.reduce((a, f) => a + Number(f.size || 0), 0);
    els.stats.textContent = `Matched: ${files.length} • Size: ${formatBytes(total)}`;

    // table
    els.tableBody.innerHTML = '';
    for (const f of files) {
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
      previewBtn.addEventListener('click', (e) => { e.stopPropagation(); preview(f.name); });

      const openLink = document.createElement('a');
      openLink.href = f.url;
      openLink.className = 'btn link';
      openLink.target = '_blank';
      openLink.rel = 'noopener';
      openLink.textContent = 'Open';

      actions.append(previewBtn, document.createTextNode(' '), openLink);
      tr.append(name, size, mtime, actions);
      tr.addEventListener('click', () => preview(f.name));
      els.tableBody.appendChild(tr);
    }
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch] || ch));
  }

  function syntaxHighlightJson(obj) {
    const json = JSON.stringify(obj, null, 2);
    const escaped = escapeHtml(json);
    // Highlight keys, strings, numbers, booleans, null
    return escaped
      // keys
      .replace(/(^|\s|{|,)\s*"(.*?)"\s*:/g, (m, p1, key) => `${p1}<span class="key">"${key}"</span>:`)
      // strings
      .replace(/"(?:\\.|[^"\\])*"/g, (m) => {
        // if already wrapped as key above, skip; otherwise string value
        if (m.startsWith('<span class="key">')) return m;
        return `<span class="string">${m}</span>`;
      })
      // numbers
      .replace(/\b-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+\-]?\d+)?\b/g, (m) => `<span class="number">${m}</span>`)
      // booleans & null
      .replace(/\b(true|false)\b/g, '<span class="boolean">$1</span>')
      .replace(/\b(null)\b/g, '<span class="null">$1</span>');
  }

  async function preview(name) {
    els.previewTitle.textContent = name;
    els.previewPanel.setAttribute('aria-hidden', 'false');
    els.previewJson.textContent = 'Loading...';
    try {
      const res = await fetch('/api/results/file/' + encodeURIComponent(name), { credentials: 'same-origin' });
      if (!res.ok) throw new Error('Failed to fetch file');
      const txt = await res.text();
      // pretty-print if valid JSON; else show raw
      try {
        const obj = JSON.parse(txt);
        els.previewJson.classList.remove('error');
        els.previewJson.innerHTML = syntaxHighlightJson(obj);
        // set download href
        if (els.downloadPreview) {
          const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          els.downloadPreview.href = url;
          els.downloadPreview.download = name || 'result.json';
        }
        // remember plain text for copy
        els.previewJson.dataset.raw = JSON.stringify(obj, null, 2);
      } catch {
        els.previewJson.textContent = txt;
        els.previewJson.dataset.raw = txt;
        if (els.downloadPreview) {
          const blob = new Blob([txt], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          els.downloadPreview.href = url;
          els.downloadPreview.download = name || 'result.txt';
        }
      }
    } catch (err) {
      els.previewJson.textContent = String(err);
    }
  }

  function toggleAuthButtons(isLoggedIn) {
    if (!els.login || !els.logout) return;
    els.login.style.display = isLoggedIn ? 'none' : 'inline-block';
    els.logout.style.display = isLoggedIn ? 'inline-block' : 'none';
  }

  async function checkSession() {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (!res.ok) { toggleAuthButtons(false); setWhoami(null); return false; }
      const data = await res.json();
      toggleAuthButtons(Boolean(data && data.authenticated));
      setWhoami(data && data.user);
      return Boolean(data && data.authenticated);
    } catch {
      toggleAuthButtons(false);
      setWhoami(null);
      return false;
    }
  }

  function attach() {
    setInputsFromState();
    els.apply.addEventListener('click', () => { readInputs(); load().catch(console.error); });
    els.reset.addEventListener('click', () => {
      Object.assign(state, { pattern: '', since: '', until: '', min_size: '', max_size: '', sort: 'date', order: 'desc', limit: '200' });
      setInputsFromState();
      load().catch(console.error);
    });
    els.closePreview.addEventListener('click', () => {
      els.previewPanel.setAttribute('aria-hidden', 'true');
    });
    if (els.copyPreview) {
      els.copyPreview.addEventListener('click', async () => {
        const raw = els.previewJson.dataset.raw || els.previewJson.textContent || '';
        try {
          await navigator.clipboard.writeText(raw);
          els.copyPreview.textContent = 'Copied';
          setTimeout(() => { els.copyPreview.textContent = 'Copy'; }, 1200);
        } catch {
          // fallback
          const ta = document.createElement('textarea');
          ta.value = raw;
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); } catch (e) { }
          document.body.removeChild(ta);
        }
      });
    }
    if (els.wrapToggle) {
      els.wrapToggle.addEventListener('click', () => {
        const wrapped = els.previewJson.classList.toggle('wrap');
        els.wrapToggle.textContent = wrapped ? 'No wrap' : 'Wrap';
      });
    }
    if (els.login) { els.login.addEventListener('click', () => { window.location.href = '/api/auth/login'; }); }
    if (els.logout) { els.logout.addEventListener('click', () => { window.location.href = '/api/auth/logout'; }); }
    // We can't know login state from the client without a ping; keep buttons visible for now
    toggleAuthButtons(true); // assume logged in after redirect
  }

  attach();
  load().catch(err => {
    console.error(err);
    els.stats.textContent = 'Error loading results';
  });
})();


