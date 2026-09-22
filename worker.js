const MAX_DATA_BYTES = 200_000;
const MAX_USERNAME_BYTES = 128;
const SESSION_COOKIE = 'jp_session';
const BORISCHEN_ASSET_PATHS = {
  QB: '/borischen/QB.txt',
  K: '/borischen/K.txt',
  DST: '/borischen/DST.txt',
  RB: '/borischen/RB.txt',
  WR: '/borischen/WR.txt',
  TE: '/borischen/TE.txt',
  FLEX: '/borischen/FLEX.txt'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function sanitizeData(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const serialized = JSON.stringify(value);
  if (new TextEncoder().encode(serialized).length > MAX_DATA_BYTES) return null;
  return value;
}

function normalizeUsername(value) {
  const username = (value || '').trim();
  if (!username) return null;
  if (new TextEncoder().encode(username).length > MAX_USERNAME_BYTES) return null;
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) return null;
  return username;
}

function getCookieValue(headerValue, name) {
  if (!headerValue) return null;
  for (const part of headerValue.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function authCookie(token, origin) {
  const secure = origin.startsWith('https://') ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

async function hashPassword(password) {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function getSessionUser(request, env) {
  if (!env.AUTH_KV) return null;
  const token = getCookieValue(request.headers.get('Cookie'), SESSION_COOKIE);
  if (!token) return null;
  const session = await env.AUTH_KV.get(`session:${token}`, 'json');
  if (!session || !session.username) return null;
  const user = await env.AUTH_KV.get(`user:${session.username}`, 'json');
  if (!user) return null;
  return { username: session.username, data: user };
}

async function getUserData(env, username) {
  return (await env.AUTH_KV.get(`data:${username}`, 'json')) || {};
}

function loginPageHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Log in</title>
  <style>
    :root {
      --ink: #19211f;
      --muted: #687572;
      --paper: #f4f1e8;
      --surface: #e9eee3;
      --panel: #fffdf7;
      --line: #d8d8ca;
      --teal: #1a6b67;
      --button-dark: #19211f;
      --button-dark-ink: #fff;
      --error: #a33c2b;
      --success: #1a6b67;
      --shadow: rgba(57,71,50,0.08);
    }
    * { box-sizing: border-box; }
    html { min-height: 100%; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: radial-gradient(circle at 92% 4%, rgba(215,234,219,.28) 0, transparent 18%), linear-gradient(125deg, var(--paper) 0%, var(--surface) 100%);
      font-family: 'Space Grotesk', sans-serif;
      color: var(--ink);
    }
    .card {
      width: min(460px, calc(100vw - 32px));
      background: var(--panel);
      border: 1px solid var(--line);
      box-shadow: 0 14px 40px var(--shadow);
      padding: 30px 28px 26px;
    }
    .utility-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 18px;
    }
    .utility-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 36px;
      padding: 0 12px;
      border: 1px solid var(--line);
      background: transparent;
      color: var(--ink);
      font: 500 12px 'DM Mono', monospace;
      letter-spacing: .08em;
      text-transform: uppercase;
      text-decoration: none;
    }
    .utility-button:hover { border-color: var(--teal); color: var(--teal); }
    h1 {
      margin: 0 0 14px;
      font-size: clamp(2.1rem, 5vw, 3.1rem);
      line-height: 0.95;
      letter-spacing: -0.06em;
    }
    .eyebrow {
      margin: 0 0 12px;
      color: var(--teal);
      font: 500 12px 'DM Mono', monospace;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .panel {
      display: grid;
      gap: 16px;
      padding-top: 18px;
      border-top: 1px solid var(--line);
    }
    .form-panel + .form-panel { margin-top: 18px; }
    h2 {
      margin: 0 0 10px;
      font-size: 1.1rem;
      letter-spacing: -0.03em;
    }
    form {
      display: grid;
      gap: 12px;
    }
    label {
      display: grid;
      gap: 6px;
      color: var(--ink);
      font: 600 13px 'DM Mono', monospace;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    input {
      width: 100%;
      padding: 12px 14px;
      border: 1px solid var(--line);
      background: #fff;
      color: var(--ink);
      font: 16px 'Space Grotesk', sans-serif;
      outline: none;
      box-sizing: border-box;
    }
    input:focus {
      border-color: var(--teal);
      box-shadow: 0 0 0 3px rgba(26, 107, 103, 0.12);
    }
    button {
      border: 1px solid var(--button-dark);
      background: var(--button-dark);
      color: var(--button-dark-ink);
      padding: 12px 16px;
      font: 600 14px 'Space Grotesk', sans-serif;
      cursor: pointer;
      transition: transform 0.15s ease, opacity 0.15s ease;
    }
    button:hover { transform: translateY(-1px); }
    .muted {
      color: var(--muted);
      font: 13px 'DM Mono', monospace;
      line-height: 1.45;
      margin-top: 8px;
    }
    .message {
      min-height: 22px;
      margin-top: 8px;
      font: 13px 'DM Mono', monospace;
    }
    .error { color: var(--error); }
    .success { color: var(--success); }
    @media (max-width: 520px) {
      .card { padding: 22px 18px 20px; }
      .utility-row { margin-bottom: 12px; }
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="utility-row">
      <span class="eyebrow">JP-Domain</span>
      <a class="utility-button" href="/">Back to tools</a>
    </div>

    <h1>Welcome back</h1>

    <div class="panel">
      <div class="form-panel">
        <h2>Log in</h2>
        <form id="login-form">
          <label>
            Username
            <input name="username" type="text" autocomplete="username" required>
          </label>
          <label>
            Password
            <input name="password" type="password" autocomplete="current-password" required>
          </label>
          <button type="submit">Log in</button>
        </form>
      </div>

      <div class="form-panel">
        <h2>Create account</h2>
        <form id="register-form">
          <label>
            Username
            <input name="username" type="text" autocomplete="username" required>
          </label>
          <label>
            Password
            <input name="password" type="password" autocomplete="new-password" required>
          </label>
          <button type="submit">Create account</button>
        </form>
      </div>
    </div>

    <div id="message" class="message" aria-live="polite"></div>
  </div>

  <script>
    const showMessage = (text, kind) => {
      const el = document.getElementById('message');
      el.textContent = text;
      el.className = 'message ' + (kind === 'error' ? 'error' : 'success');
    };

    const handleSubmit = async (form, endpoint) => {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        const payload = Object.fromEntries(formData.entries());

        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          const result = await response.json().catch(() => ({}));

          if (!response.ok) {
            showMessage(result.error || 'Request failed.', 'error');
            return;
          }

          showMessage(result.message || 'Success.', 'success');
          if (endpoint.endsWith('/api/auth/login')) {
            window.location.href = '/';
          }
        } catch (error) {
          showMessage('Something went wrong. Please try again.', 'error');
        }
      });
    };

    handleSubmit(document.getElementById('login-form'), '/api/auth/login');
    handleSubmit(document.getElementById('register-form'), '/api/auth/register');
  </script>
</body>
</html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/login') {
      return new Response(loginPageHtml(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    if (url.pathname === '/api/auth/session') {
      if (!env.AUTH_KV) return json({ authenticated: false }, 503);
      const sessionUser = await getSessionUser(request, env);
      if (!sessionUser) return json({ authenticated: false }, 200);
      return json({ authenticated: true, username: sessionUser.username }, 200);
    }

    if (url.pathname === '/api/auth/logout') {
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
          'Cache-Control': 'no-store'
        }
      });
    }

    if (url.pathname === '/api/auth/login') {
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
      if (!env.AUTH_KV) return json({ error: 'KV is not configured.' }, 503);

      let body;
      try { body = await request.json(); } catch { return json({ error: 'Invalid JSON.' }, 400); }

      const username = normalizeUsername(body.username);
      const password = typeof body.password === 'string' ? body.password : '';
      if (!username || !password) return json({ error: 'Username and password are required.' }, 400);

      const user = await env.AUTH_KV.get(`user:${username}`, 'json');
      if (!user) return json({ error: 'Invalid username or password.' }, 401);

      const passwordHash = await hashPassword(password);
      if (user.passwordHash !== passwordHash) return json({ error: 'Invalid username or password.' }, 401);

      const token = crypto.randomUUID();
      await env.AUTH_KV.put(`session:${token}`, JSON.stringify({ username, createdAt: Date.now() }));

      return new Response(JSON.stringify({ ok: true, message: 'Logged in.' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': authCookie(token, url.origin),
          'Cache-Control': 'no-store'
        }
      });
    }

    if (url.pathname === '/api/auth/register') {
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
      if (!env.AUTH_KV) return json({ error: 'KV is not configured.' }, 503);

      let body;
      try { body = await request.json(); } catch { return json({ error: 'Invalid JSON.' }, 400); }

      const username = normalizeUsername(body.username);
      const password = typeof body.password === 'string' ? body.password.trim() : '';
      if (!username || password.length < 4) return json({ error: 'Use a username and a password with at least 4 characters.' }, 400);

      const existing = await env.AUTH_KV.get(`user:${username}`, 'json');
      if (existing) return json({ error: 'That username is already taken.' }, 409);

      const passwordHash = await hashPassword(password);
      await env.AUTH_KV.put(`user:${username}`, JSON.stringify({ username, passwordHash, createdAt: Date.now() }));
      return json({ ok: true, message: 'Account created. You can log in now.' }, 201);
    }

    if (url.pathname === '/api/data') {
      if (!env.AUTH_KV) return json({ error: 'KV is not configured.' }, 503);

      const sessionUser = await getSessionUser(request, env);
      if (!sessionUser) return json({ error: 'Authentication required.' }, 401);

      if (request.method === 'GET') return json({ data: await getUserData(env, sessionUser.username) });
      if (request.method !== 'PATCH') return json({ error: 'Method not allowed.' }, 405);

      let body;
      try { body = await request.json(); } catch { return json({ error: 'Invalid JSON.' }, 400); }
      const data = sanitizeData(body);
      if (!data) return json({ error: 'Data must be an object under 200 KB.' }, 413);

      await env.AUTH_KV.put(`data:${sessionUser.username}`, JSON.stringify(data));
      return json({ data });
    }

    if (url.pathname.startsWith('/api/borischen/')) {
      const position = url.pathname.split('/').pop();
      const assetPath = BORISCHEN_ASSET_PATHS[position];
      if (!assetPath) return json({ error: 'Unknown Borischen position.' }, 400);

      try {
        const assetResponse = await env.ASSETS.fetch(new Request(new URL(assetPath, request.url)));
        if (!assetResponse.ok) {
          return json({ error: `Borischen feed unavailable (${assetResponse.status}).` }, 502);
        }
        return new Response(assetResponse.body, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-store',
            'Access-Control-Allow-Origin': '*'
          }
        });
      } catch (error) {
        return json({ error: 'Borischen feed fetch failed.' }, 502);
      }
    }

    return env.ASSETS.fetch(request);
  }
};
