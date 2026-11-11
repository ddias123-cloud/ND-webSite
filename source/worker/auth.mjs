// The enclosing Sites deployment remains owner-private. The account is bound
// to the platform-authenticated identity, never an ID submitted by the browser.
const COOKIE = '__Host-nd-session';
const SESSION_SECONDS = 8 * 60 * 60;
const ITERATIONS = 100000; // Supported by the Workers Web Crypto runtime.
const encoder = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
const random = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha = async text => hex(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
const error = (status, code) => Object.assign(new Error(code), {status, code});
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: {'content-type':'application/json; charset=utf-8','cache-control':'no-store', ...headers}
});
const cookie = (value, seconds) => `${COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${seconds}`;

export function identity(request) {
  const subject = request.headers.get('oai-authenticated-user-id');
  const email = request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
  return subject && email ? {subject, email} : null;
}

export async function derive(password, salt) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({name:'PBKDF2', hash:'SHA-256', salt:encoder.encode(salt), iterations:ITERATIONS}, key, 256));
}

function equal(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function token(request) {
  const part = (request.headers.get('cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='));
  const value = part?.slice(COOKIE.length + 1);
  return /^[a-f0-9]{64}$/.test(value || '') ? value : null;
}

export async function session(request, db, user) {
  const value = token(request);
  if (!value || !user) return null;
  return db.prepare('SELECT subject FROM nd_sessions WHERE token_hash = ? AND subject = ? AND expires_at > ?')
    .bind(await sha(value), user.subject, Date.now()).first();
}

async function body(request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) throw error(403, 'invalid_origin');
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw error(403, 'invalid_origin');
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw error(415, 'json_required');
  if (Number(request.headers.get('content-length')) > 4096) throw error(413, 'body_too_large');
  if (!request.body) throw error(400, 'invalid_request');
  const reader = request.body.getReader();
  const chunks = []; let size = 0;
  while (true) {
    const {done,value} = await reader.read(); if (done) break;
    size += value.length;
    if (size > 4096) { await reader.cancel(); throw error(413, 'body_too_large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { const parsed = JSON.parse(new TextDecoder().decode(bytes)); if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw 0; return parsed; }
  catch { throw error(400, 'invalid_request'); }
}

async function throttle(db, subject) {
  const now = Date.now();
  const row = await db.prepare(`INSERT INTO nd_auth_attempts(subject, attempts, window_start) VALUES (?, 1, ?)
    ON CONFLICT(subject) DO UPDATE SET
    attempts = CASE WHEN window_start < ? THEN 1 ELSE attempts + 1 END,
    window_start = CASE WHEN window_start < ? THEN ? ELSE window_start END
    RETURNING attempts`).bind(subject, now, now - 900000, now - 900000, now).first();
  if (row.attempts > 8) throw error(429, 'too_many_attempts');
}

async function startSession(db, user) {
  const value = random(32);
  await db.batch([
    db.prepare('DELETE FROM nd_sessions WHERE expires_at <= ?').bind(Date.now()),
    db.prepare('INSERT INTO nd_sessions(token_hash, subject, expires_at) VALUES (?, ?, ?)').bind(await sha(value), user.subject, Date.now() + SESSION_SECONDS * 1000),
    db.prepare('DELETE FROM nd_auth_attempts WHERE subject = ?').bind(user.subject)
  ]);
  return json({ok:true}, 200, {'set-cookie':cookie(value, SESSION_SECONDS)});
}

export async function auth(request, db) {
  const user = identity(request);
  if (!user) return json({error:'platform_signin_required'}, 401);
  if (!db) return json({error:'service_unavailable'}, 503);
  const pathname = new URL(request.url).pathname;
  try {
    if (pathname === '/api/auth/status' && request.method === 'GET') {
      const account = await db.prepare('SELECT email FROM nd_accounts WHERE subject = ?').bind(user.subject).first();
      return json({authenticated:!!(await session(request, db, user)), needsSetup:!account, email:user.email});
    }
    if (request.method !== 'POST') return json({error:'not_found'}, 404);
    const data = await body(request);
    if (pathname === '/api/auth/logout') {
      const value = token(request);
      if (value) await db.prepare('DELETE FROM nd_sessions WHERE token_hash = ? AND subject = ?').bind(await sha(value), user.subject).run();
      return json({ok:true}, 200, {'set-cookie':cookie('',0)});
    }
    if (!['/api/auth/setup','/api/auth/login'].includes(pathname)) return json({error:'not_found'},404);
    await throttle(db, user.subject);
    const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
    const password = typeof data.password === 'string' ? data.password : '';
    const account = await db.prepare('SELECT * FROM nd_accounts WHERE subject = ?').bind(user.subject).first();
    if (pathname.endsWith('/setup')) {
      if (account) throw error(409,'already_configured');
      if (email !== user.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw error(400,'owner_email_required');
      if (password.length < 15 || password.length > 128) throw error(400,'password_length');
      const salt = random(16);
      const hash = await derive(password,salt);
      try { await db.prepare('INSERT INTO nd_accounts(subject,email,password_hash,password_salt,created_at) VALUES (?,?,?,?,?)').bind(user.subject,email,hash,salt,Date.now()).run(); }
      catch (err) { if (String(err).includes('UNIQUE')) throw error(409,'already_configured'); throw err; }
    } else {
      if (password.length > 128) throw error(401,'invalid_credentials');
      const candidate = await derive(password, account?.password_salt || '00000000000000000000000000000000');
      if (!account || !equal(candidate,account.password_hash) || email !== account.email) throw error(401,'invalid_credentials');
    }
    return await startSession(db,user);
  } catch (err) {
    // Never log passwords, request bodies, hashes or cookie tokens.
    return json({error:err.code || 'service_unavailable'},err.status || 503,err.status === 429 ? {'retry-after':'900'} : {});
  }
}
