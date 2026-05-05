(function () {
  const els = {
    login: document.getElementById('login'),
    logout: document.getElementById('logout'),
    whoami: document.getElementById('whoami'),
    adminLink: document.getElementById('adminLink'),
    guestBanner: document.getElementById('guestBanner'),
    researchApp: document.getElementById('researchApp')
  };

  function setWhoami(user) {
    if (!els.whoami) return;
    if (!user) {
      els.whoami.textContent = '';
      return;
    }
    const name = user.name || user.email || user.sub || '';
    els.whoami.textContent = name ? `Logged in as ${name}` : '';
  }

  function toggleAuthButtons(isLoggedIn) {
    if (els.login) els.login.style.display = isLoggedIn ? 'none' : 'inline-block';
    if (els.logout) els.logout.style.display = isLoggedIn ? 'inline-block' : 'none';
  }

  function setAdminLink(permissions) {
    if (!els.adminLink) return;
    const perms = Array.isArray(permissions) ? permissions : [];
    els.adminLink.style.display =
      perms.includes('read:users') || perms.includes('schema:read:users')
        ? 'inline-block'
        : 'none';
  }

  async function checkSession() {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (!res.ok) {
        toggleAuthButtons(false);
        setWhoami(null);
        setAdminLink([]);
        if (els.guestBanner) els.guestBanner.style.display = 'block';
        if (els.researchApp) els.researchApp.style.display = 'none';
        return false;
      }
      const data = await res.json();
      const isLoggedIn = Boolean(data && data.authenticated);
      toggleAuthButtons(isLoggedIn);
      setWhoami(data && data.user);
      setAdminLink(data && data.permissions);
      if (els.guestBanner) els.guestBanner.style.display = isLoggedIn ? 'none' : 'block';
      if (els.researchApp) els.researchApp.style.display = isLoggedIn ? '' : 'none';
      return isLoggedIn;
    } catch {
      toggleAuthButtons(false);
      setWhoami(null);
      setAdminLink([]);
      return false;
    }
  }

  if (els.login) {
    els.login.addEventListener('click', () => {
      window.location.href = '/api/auth/login?next=' + encodeURIComponent(window.location.pathname + window.location.search);
    });
  }
  if (els.logout) {
    els.logout.addEventListener('click', () => {
      window.location.href = '/api/auth/logout?next=' + encodeURIComponent(window.location.pathname);
    });
  }

  window.researchAuth = { checkSession };
  checkSession();
})();
