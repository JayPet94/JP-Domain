(() => {
  const button = document.getElementById('auth-toggle');
  if (!button) return;

  const returnUrl = () => `${location.pathname}${location.search}${location.hash}`;
  const navigateToLogin = () => {
    location.href = location.href = `https://jasonpetti.com/login`;
  };
  const navigateToLogout = () => {
    location.href = `/cdn-cgi/access/logout?redirect_url=${encodeURIComponent(returnUrl())}`;
  };

  const setState = (authenticated) => {
    button.textContent = authenticated ? 'Log out' : 'Log in';
    button.setAttribute('aria-label', authenticated ? 'Log out of Cloudflare Access' : 'Log in with Cloudflare Access');
    button.title = authenticated ? 'Log out of Cloudflare Access' : 'Log in with Cloudflare Access';
    button.dataset.authenticated = String(authenticated);
  };

  button.addEventListener('click', () => {
    if (button.dataset.authenticated === 'true') navigateToLogout();
    else navigateToLogin();
  });

  setState(false);
  fetch('/api/data', { credentials: 'same-origin' })
    .then(response => setState(response.ok))
    .catch(() => setState(false));
})();
