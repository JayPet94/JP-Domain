/**
 * Multi-user auth + per-user data storage for jp-domain
 * Home page served from static assets (public/index.html)
 * Data app at /app, login at /login
 * Uses KV for users, sessions, and per-user data.
 * Passwords are hashed with Web Crypto (SHA-256 + salt).
 */

async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const data = enc.encode(salt + password);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateSalt() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return [...arr].map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return [...arr].map(b => b.toString(16).padStart(2, '0')).join('');
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function html(content, status = 200) {
  return new Response(content, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

async function getSession(request, kv) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return null;
  const token = match[1];
  const sessionData = await kv.get(`session:${token}`, 'json');
  if (!sessionData) return null;
  return { token, ...sessionData };
}

async function createSession(kv, username) {
  const token = generateToken();
  await kv.put(`session:${token}`, JSON.stringify({ username, created: Date.now() }), { expirationTtl: 86400 * 7 });
  return token;
}

async function destroySession(kv, token) {
  await kv.delete(`session:${token}`);
}

function setSessionCookie(token, maxAge = 86400 * 7) {
  return `session=${token}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

function clearSessionCookie() {
  return 'session=; HttpOnly; Path=/; Max-Age=0';
}

async function handleAuth(request, path, kv) {
  if (path === '/api/auth/register' && request.method === 'POST') {
    const { username, password } = await request.json();
    if (!username || !password) return json({ error: 'Username and password required' }, 400);
    if (username.length < 3) return json({ error: 'Username must be at least 3 characters' }, 400);
    if (password.length < 6) return json({ error: 'Password must be at least 6 characters' }, 400);
    const key = `user:${username.toLowerCase()}`;
    const existing = await kv.get(key, 'json');
    if (existing) return json({ error: 'Username already taken' }, 409);
    const salt = generateSalt();
    const hash = await hashPassword(password, salt);
    await kv.put(key, JSON.stringify({ username, salt, hash, created: Date.now() }));
    const token = await createSession(kv, username);
    return json({ ok: true, username }, 200, { 'Set-Cookie': setSessionCookie(token) });
  }
  if (path === '/api/auth/login' && request.method === 'POST') {
    const { username, password } = await request.json();
    if (!username || !password) return json({ error: 'Username and password required' }, 400);
    const key = `user:${username.toLowerCase()}`;
    const userData = await kv.get(key, 'json');
    if (!userData) return json({ error: 'Invalid username or password' }, 401);
    const hash = await hashPassword(password, userData.salt);
    if (hash !== userData.hash) return json({ error: 'Invalid username or password' }, 401);
    const token = await createSession(kv, username);
    return json({ ok: true, username }, 200, { 'Set-Cookie': setSessionCookie(token) });
  }
  if (path === '/api/auth/logout' && request.method === 'POST') {
    const session = await getSession(request, kv);
    if (session) await destroySession(kv, session.token);
    return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
  }
  if (path === '/api/auth/me' && request.method === 'GET') {
    const session = await getSession(request, kv);
    if (!session) return json({ authenticated: false }, 200);
    return json({ authenticated: true, username: session.username }, 200);
  }
  return json({ error: 'Not found' }, 404);
}

async function handleData(request, path, kv) {
  const session = await getSession(request, kv);
  if (!session) return json({ error: 'Unauthorized' }, 401);
  const userKey = `data:${session.username}`;
  const method = request.method;
  if (path === '/api/data' && method === 'GET') {
    const data = await kv.get(userKey, 'json');
    return json({ data: data || {} }, 200);
  }
  if (path === '/api/data' && method === 'PUT') {
    const body = await request.json();
    await kv.put(userKey, JSON.stringify(body));
    return json({ ok: true }, 200);
  }
  if (path === '/api/data' && method === 'PATCH') {
    const body = await request.json();
    const existing = await kv.get(userKey, 'json') || {};
    const merged = { ...existing, ...body };
    await kv.put(userKey, JSON.stringify(merged));
    return json({ ok: true, data: merged }, 200);
  }
  const singleKeyMatch = path.match(/^\/api\/data\/(.+)$/);
  if (singleKeyMatch && method === 'PUT') {
    const key = singleKeyMatch[1];
    const body = await request.json();
    const existing = await kv.get(userKey, 'json') || {};
    existing[key] = body.value;
    await kv.put(userKey, JSON.stringify(existing));
    return json({ ok: true }, 200);
  }
  if (singleKeyMatch && method === 'DELETE') {
    const key = singleKeyMatch[1];
    const existing = await kv.get(userKey, 'json') || {};
    delete existing[key];
    await kv.put(userKey, JSON.stringify(existing));
    return json({ ok: true }, 200);
  }
  return json({ error: 'Not found' }, 404);
}

const LOGIN_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Login</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; background: #1a1a2e; color: #eee; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
  .card { background: #16213e; padding: 2rem; border-radius: 12px; width: 100%; max-width: 380px; box-shadow: 0 8px 32px rgba(0,0,0,.3); }
  h1 { text-align: center; margin-bottom: 1.5rem; font-size: 1.5rem; }
  .tabs { display: flex; margin-bottom: 1.5rem; border-radius: 8px; overflow: hidden; }
  .tab { flex: 1; padding: .6rem; text-align: center; cursor: pointer; background: #0f3460; transition: .2s; font-size: .9rem; }
  .tab.active { background: #e94560; }
  .field { margin-bottom: 1rem; }
  label { display: block; margin-bottom: .3rem; font-size: .85rem; color: #aaa; }
  input { width: 100%; padding: .7rem; border: 1px solid #0f3460; border-radius: 6px; background: #1a1a2e; color: #eee; font-size: .9rem; }
  input:focus { outline: none; border-color: #e94560; }
  button { width: 100%; padding: .7rem; border: none; border-radius: 6px; background: #e94560; color: #fff; font-size: 1rem; cursor: pointer; transition: .2s; }
  button:hover { background: #c73e54; }
  button:disabled { opacity: .5; }
  .error { color: #e94560; font-size: .85rem; text-align: center; margin-top: .8rem; display: none; }
  .info { color: #53d769; font-size: .85rem; text-align: center; margin-top: .8rem; display: none; }
  .back { text-align: center; margin-top: 1rem; font-size: .85rem; }
  .back a { color: #aaa; text-decoration: none; }
  .back a:hover { color: #e94560; }
</style>
</head>
<body>
<div class="card">
  <h1>&#128272; My Site</h1>
  <div class="tabs">
    <div class="tab active" id="tab-login" onclick="switchTab('login')">Login</div>
    <div class="tab" id="tab-register" onclick="switchTab('register')">Register</div>
  </div>
  <form id="form" onsubmit="return submitForm(event)">
    <div class="field">
      <label for="username">Username</label>
      <input type="text" id="username" required minlength="3" autocomplete="username">
    </div>
    <div class="field">
      <label for="password">Password</label>
      <input type="password" id="password" required minlength="6" autocomplete="current-password">
    </div>
    <button type="submit" id="submitBtn">Login</button>
  </form>
  <div class="error" id="msg-error"></div>
  <div class="info" id="msg-info"></div>
  <div class="back"><a href="/">&#8592; Back to home</a></div>
</div>
<script>
  let mode = 'login';
  function switchTab(m) {
    mode = m;
    document.getElementById('tab-login').classList.toggle('active', m === 'login');
    document.getElementById('tab-register').classList.toggle('active', m === 'register');
    document.getElementById('submitBtn').textContent = m === 'login' ? 'Login' : 'Register';
    document.getElementById('msg-error').style.display = 'none';
    document.getElementById('msg-info').style.display = 'none';
  }
  async function submitForm(e) {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.textContent = '...';
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    try {
      const res = await fetch('/api/auth/' + mode, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        document.getElementById('msg-error').textContent = data.error || 'Something went wrong';
        document.getElementById('msg-error').style.display = 'block';
      } else {
        window.location.href = '/app';
      }
    } catch (err) {
      document.getElementById('msg-error').textContent = 'Network error';
      document.getElementById('msg-error').style.display = 'block';
    }
    btn.disabled = false;
    btn.textContent = mode === 'login' ? 'Login' : 'Register';
    return false;
  }
</script>
</body>
</html>`;

const APP_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>My Data &#8212; My Site</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; background: #1a1a2e; color: #eee; }
  .header { background: #16213e; padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; }
  .header h1 { font-size: 1.2rem; }
  .header h1 a { color: #eee; text-decoration: none; }
  .user-info { display: flex; align-items: center; gap: 1rem; font-size: .9rem; }
  .user-info button { background: #e94560; border: none; color: #fff; padding: .4rem .8rem; border-radius: 6px; cursor: pointer; font-size: .85rem; }
  .container { max-width: 700px; margin: 2rem auto; padding: 0 1rem; }
  .card { background: #16213e; border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; }
  .card h2 { font-size: 1.1rem; margin-bottom: 1rem; }
  .data-item { display: flex; justify-content: space-between; align-items: center; padding: .6rem 0; border-bottom: 1px solid #0f3460; }
  .data-item:last-child { border-bottom: none; }
  .data-key { font-weight: bold; color: #e94560; }
  .data-value { color: #aaa; }
  .add-row { display: flex; gap: .5rem; margin-top: 1rem; }
  .add-row input { flex: 1; padding: .5rem; border: 1px solid #0f3460; border-radius: 6px; background: #1a1a2e; color: #eee; }
  .add-row button { background: #e94560; border: none; color: #fff; padding: .5rem 1rem; border-radius: 6px; cursor: pointer; }
  .delete-btn { background: transparent; border: 1px solid #e94560; color: #e94560; padding: .2rem .5rem; border-radius: 4px; cursor: pointer; font-size: .8rem; }
  .status { font-size: .85rem; color: #aaa; margin-bottom: .5rem; }
  .guest-msg { color: #666; font-size: .9rem; }
  .guest-msg a { color: #e94560; text-decoration: none; }
  .guest-msg a:hover { text-decoration: underline; }
</style>
</head>
<body>
<div class="header">
  <h1><a href="/">&#127968; My Site</a></h1>
  <div class="user-info" id="user-info"></div>
</div>
<div class="container">
  <div class="card">
    <h2>&#128221; Your Stored Data</h2>
    <div class="status" id="status">Loading...</div>
    <div id="data-list"></div>
    <div id="add-row-wrapper" style="display:none">
      <div class="add-row">
        <input type="text" id="new-key" placeholder="Key (e.g. notes)">
        <input type="text" id="new-value" placeholder="Value">
        <button onclick="addData()">Add</button>
      </div>
    </div>
  </div>
</div>
<script>
  let userData = {};
  async function loadUser() {
    const res = await fetch('/api/auth/me');
    const info = await res.json();
    const userInfo = document.getElementById('user-info');
    const addRow = document.getElementById('add-row-wrapper');
    if (info.authenticated) {
      userInfo.innerHTML = '<span>Logged in as <strong>' + escapeHtml(info.username) + '</strong> <button onclick="logout()">Logout</button></span>';
      addRow.style.display = 'block';
      document.getElementById('status').textContent = 'Loading...';
      await loadData();
    } else {
      userInfo.innerHTML = '<button onclick="window.location.href=\'https://jasonpetti.com/login\'">Log in</button>';
      addRow.style.display = 'none';
      document.getElementById('status').innerHTML = '<span class="guest-msg">You are browsing as a guest. <a href="https://jasonpetti.com/login">Log in</a> to store your own data.</span>';
      document.getElementById('data-list').innerHTML = '';
    }
  }
  async function loadData() {
    const res = await fetch('/api/data');
    const { data } = await res.json();
    userData = data || {};
    renderData();
  }
  function renderData() {
    const list = document.getElementById('data-list');
    const keys = Object.keys(userData);
    if (keys.length === 0) {
      list.innerHTML = '<div style="color:#666;padding:.5rem 0">No data yet. Add some below.</div>';
    } else {
      list.innerHTML = keys.map(k =>
        '<div class="data-item"><span class="data-key">' + escapeHtml(k) +
        '</span><span class="data-value">' + escapeHtml(String(userData[k])) +
        '</span><button class="delete-btn" onclick="deleteData(\\'' + k + '\\')">Delete</button></div>'
      ).join('');
    }
    document.getElementById('status').textContent = keys.length + ' item(s) stored';
  }
  async function addData() {
    const key = document.getElementById('new-key').value.trim();
    const value = document.getElementById('new-value').value.trim();
    if (!key || !value) return;
    const res = await fetch('/api/data/' + encodeURIComponent(key), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    });
    if (res.ok) {
      userData[key] = value;
      renderData();
      document.getElementById('new-key').value = '';
      document.getElementById('new-value').value = '';
    }
  }
  async function deleteData(key) {
    const res = await fetch('/api/data/' + encodeURIComponent(key), { method: 'DELETE' });
    if (res.ok) { delete userData[key]; renderData(); }
  }
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  }
  function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
  loadUser();
</script>
</body>
</html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const kv = env.AUTH_KV;

    // API routes — handled by Worker
    if (path.startsWith('/api/auth/')) return handleAuth(request, path, kv);
    if (path.startsWith('/api/data')) return handleData(request, path, kv);

    // Canonical login page for the public site.
    if (path === '/login') {
      const session = await getSession(request, kv);
      if (session) return Response.redirect(url.origin + '/app', 302);
      return Response.redirect('https://jasonpetti.com/login', 302);
    }

    // Data app page — handled by Worker
    if (path === '/app') return html(APP_PAGE);

    // Everything else (including /) — serve from static assets
    return env.ASSETS.fetch(request);
  },
};
