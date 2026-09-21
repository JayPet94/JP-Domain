const MAX_DATA_BYTES = 200_000;
const MAX_USER_KEY_BYTES = 256;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function userKey(request) {
  const subject = request.headers.get('Cf-Access-Authenticated-User-Id');
  const email = request.headers.get('Cf-Access-Authenticated-User-Email');
  const key = subject || email;
  if (!key || new TextEncoder().encode(key).length > MAX_USER_KEY_BYTES) return null;
  return key;
}

function sanitizeData(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const serialized = JSON.stringify(value);
  if (new TextEncoder().encode(serialized).length > MAX_DATA_BYTES) return null;
  return value;
}

async function getData(env, key) {
  return await env.AUTH_KV.get(`user:${key}`, 'json') || {};
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/data') return env.ASSETS.fetch(request);
    if (!env.AUTH_KV) return json({ error: 'KV is not configured.' }, 503);
    const key = userKey(request);
    if (!key) return json({ error: 'Cloudflare Access authentication is required.' }, 401);

    if (request.method === 'GET') return json({ data: await getData(env, key) });
    if (request.method !== 'PATCH') return json({ error: 'Method not allowed.' }, 405);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON.' }, 400); }
    const data = sanitizeData(body);
    if (!data) return json({ error: 'Data must be an object under 200 KB.' }, 413);
    await env.AUTH_KV.put(`user:${key}`, JSON.stringify(data));
    return json({ data });
  }
};
