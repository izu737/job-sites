// Sign in for the website (library and recorder).
// You sign in once with your access key (the same API token the extension
// uses). The cookie holds an expiry time signed with that key, so it cannot
// be forged and stops working if you change the key.
const COOKIE = 'vp_session';
export const SESSION_SECONDS = 30 * 24 * 3600;

const enc = new TextEncoder();

function b64url(buf) {
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(key, message) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', k, enc.encode(message)));
}

function equal(a, b) {
  const x = enc.encode(a), y = enc.encode(b);
  return x.length === y.length && crypto.subtle.timingSafeEqual(x, y);
}

export function keyMatches(env, given) {
  return !!env.API_TOKEN && equal(String(given || '').trim(), env.API_TOKEN);
}

export async function newSessionCookie(env) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const value = `${exp}.${await sign(env.API_TOKEN, `vidpitch-session:${exp}`)}`;
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_SECONDS}`;
}

export const clearSessionCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export async function hasSession(request, env) {
  if (!env.API_TOKEN) return false;
  const cookies = request.headers.get('Cookie') || '';
  const m = cookies.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [exp, sig] = m[1].split('.');
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  return equal(sig, await sign(env.API_TOKEN, `vidpitch-session:${exp}`));
}

/** Requests that change things must come from our own pages. */
export function sameOrigin(request) {
  const site = request.headers.get('Sec-Fetch-Site');
  if (site) return site === 'same-origin' || site === 'none';
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}

/** Only allow redirects to our own paths after sign in. */
export function safeNext(value) {
  const v = String(value || '/');
  return v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\') ? v : '/';
}
