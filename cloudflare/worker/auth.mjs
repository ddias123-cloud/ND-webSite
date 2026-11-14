// N&D accounts use their own email addresses. Sessions bind to a trusted
// platform identity or, on Cloudflare, the server-supplied installation realm.
const COOKIE = '__Host-nd-session';
const SESSION_SECONDS = 8 * 60 * 60;
const ITERATIONS = 100000; // Supported by the Workers Web Crypto runtime.
const encoder = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
export const random = n => hex(crypto.getRandomValues(new Uint8Array(n)));
export const sha = async text => hex(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
export const error = (status, code) => Object.assign(new Error(code), {status, code});
export const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
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
  const tokenHash = await sha(value);
  const member = await db.prepare(`SELECT m.id, m.email FROM nd_member_sessions s
    JOIN nd_members m ON m.id = s.member_id
    WHERE s.token_hash = ? AND s.platform_subject = ? AND s.expires_at > ?`)
    .bind(tokenHash, user.subject, Date.now()).first();
  if (member) return member;
  // Preserve existing owner sessions and passwords during the transition.
  const legacy = await db.prepare(`SELECT a.* FROM nd_sessions s
    JOIN nd_accounts a ON a.subject = s.subject
    WHERE s.token_hash = ? AND s.subject = ? AND s.expires_at > ?`)
    .bind(tokenHash, user.subject, Date.now()).first();
  if(!legacy)return null;
  await db.prepare(`INSERT INTO nd_members(id,email,password_hash,password_salt,legacy_subject,created_at)
    VALUES (?,?,?,?,?,?) ON CONFLICT(email) DO NOTHING`).bind(crypto.randomUUID(),legacy.email,legacy.password_hash,legacy.password_salt,legacy.subject,legacy.created_at).run();
  return db.prepare('SELECT id,email FROM nd_members WHERE email = ?').bind(legacy.email).first();
}

export function validEmail(email) {
  if (email.length > 254) return false;
  const parts = email.split('@');
  if (parts.length !== 2 || !parts[0] || parts[0].length > 64) return false;
  if (!/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+$/i.test(parts[0]) || parts[0].startsWith('.') || parts[0].endsWith('.') || parts[0].includes('..')) return false;
  const labels = parts[1].split('.');
  return labels.length >= 2 && labels.every(s => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(s)) && /^[a-z]{2,63}$/i.test(labels.at(-1));
}

export function validPassword(password) {
  return password.length >= 8 && password.length <= 128 && /[A-Za-z]/.test(password) && /^[\x21-\x7e]+$/.test(password);
}

export async function body(request) {
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

export async function throttle(db, subject) {
  const now = Date.now();
  const row = await db.prepare(`INSERT INTO nd_auth_attempts(subject, attempts, window_start) VALUES (?, 1, ?)
    ON CONFLICT(subject) DO UPDATE SET
    attempts = CASE WHEN window_start < ? THEN 1 ELSE attempts + 1 END,
    window_start = CASE WHEN window_start < ? THEN ? ELSE window_start END
    RETURNING attempts`).bind(subject, now, now - 900000, now - 900000, now).first();
  if (row.attempts > 8) throw error(429, 'too_many_attempts');
}

async function startSession(db, user, memberId,attemptSubject=user.subject) {
  const value = random(32);
  await db.batch([
    db.prepare('DELETE FROM nd_sessions WHERE expires_at <= ?').bind(Date.now()),
    db.prepare('DELETE FROM nd_member_sessions WHERE expires_at <= ?').bind(Date.now()),
    db.prepare('INSERT INTO nd_member_sessions(token_hash, member_id, platform_subject, expires_at) VALUES (?, ?, ?, ?)').bind(await sha(value), memberId, user.subject, Date.now() + SESSION_SECONDS * 1000),
    db.prepare('DELETE FROM nd_auth_attempts WHERE subject = ?').bind(attemptSubject)
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
      const current = await session(request, db, user);
      return json({authenticated:!!current, email:current?.email || null, canRegister:true});
    }
    if (request.method !== 'POST') return json({error:'not_found'}, 404);
    const data = await body(request);
    if (pathname === '/api/auth/logout') {
      const value = token(request);
      if (value) {
        const tokenHash = await sha(value);
        await db.batch([
          db.prepare('DELETE FROM nd_sessions WHERE token_hash = ? AND subject = ?').bind(tokenHash, user.subject),
          db.prepare('DELETE FROM nd_member_sessions WHERE token_hash = ? AND platform_subject = ?').bind(tokenHash, user.subject)
        ]);
      }
      return json({ok:true}, 200, {'set-cookie':cookie('',0)});
    }
    if (!['/api/auth/register','/api/auth/setup','/api/auth/login'].includes(pathname)) return json({error:'not_found'},404);
    // Cloudflare supplies CF-Connecting-IP at its edge. Hash the value rather
    // than retaining a raw visitor IP in the login-attempt table.
    const attemptSubject=user.subject.startsWith('cf-owner:')?user.subject+':ip:'+await sha(request.headers.get('cf-connecting-ip')||'unknown'):user.subject;
    await throttle(db, attemptSubject);
    const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
    const password = typeof data.password === 'string' ? data.password : '';
    const registering = pathname.endsWith('/register') || pathname.endsWith('/setup');
    if (!validEmail(email)) throw error(registering ? 400 : 401,registering ? 'invalid_email' : 'invalid_credentials');
    let account = await db.prepare('SELECT * FROM nd_members WHERE email = ?').bind(email).first();
    if (registering) {
      const legacy = await db.prepare('SELECT email FROM nd_accounts WHERE email = ? LIMIT 1').bind(email).first();
      if (account || legacy) throw error(409,'email_registered');
      if (password.length < 8 || password.length > 128) throw error(400,'password_length');
      if (!validPassword(password)) throw error(400,'password_characters');
      const salt = random(16);
      const hash = await derive(password,salt);
      account = {id:crypto.randomUUID()};
      try { await db.prepare('INSERT INTO nd_members(id,email,password_hash,password_salt,created_at) VALUES (?,?,?,?,?)').bind(account.id,email,hash,salt,Date.now()).run(); }
      catch (err) { if (String(err).includes('UNIQUE')) throw error(409,'email_registered'); throw err; }
    } else {
      if (password.length > 128) throw error(401,'invalid_credentials');
      const legacy = account ? null : await db.prepare('SELECT * FROM nd_accounts WHERE email = ? AND subject = ?').bind(email,user.subject).first();
      const credentials = account || legacy;
      const candidate = await derive(password, credentials?.password_salt || '00000000000000000000000000000000');
      if (!credentials || !equal(candidate,credentials.password_hash)) throw error(401,'invalid_credentials');
      if (!account) {
        // Backfill only after the existing password is verified; migrations stay schema-only.
        await db.prepare(`INSERT INTO nd_members(id,email,password_hash,password_salt,legacy_subject,created_at)
          VALUES (?,?,?,?,?,?) ON CONFLICT(email) DO NOTHING`).bind(crypto.randomUUID(),email,legacy.password_hash,legacy.password_salt,legacy.subject,legacy.created_at).run();
        account = await db.prepare('SELECT id FROM nd_members WHERE email = ?').bind(email).first();
      }
    }
    return await startSession(db,user,account.id,attemptSubject);
  } catch (err) {
    // Never log passwords, request bodies, hashes or cookie tokens.
    return json({error:err.code || 'service_unavailable'},err.status || 503,err.status === 429 ? {'retry-after':'900'} : {});
  }
}
