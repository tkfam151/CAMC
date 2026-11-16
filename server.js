'use strict';

/*
 * CAMC Seating server.
 *
 *   /            Public viewer: search events and see their seating plans.
 *   /teacher     Sign-in for teachers (edit seating charts, classes and VIP
 *                groups) and the administrator (create teacher accounts only).
 *
 * Storage: Supabase when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set,
 * otherwise a local JSON file (data/db.json) for development.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

loadEnvFile(path.join(__dirname, '.env'));

const { createFileStore, httpError } = require('./lib/store-file');
const { DEFAULT_GROUPS } = require('./lib/defaults');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY = 15 * 1024 * 1024; // photos are stored inline as small JPEGs
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const SESSION_REFRESH_MS = 1000 * 60 * 30; // extend at most every 30 minutes

const ADMIN_USERNAME = 'camcadmin';
const ADMIN_DEFAULT_PASSWORD = 'sisbcamc';

/** Minimal .env reader so no extra package is needed. Existing env vars win. */
function loadEnvFile(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return; }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

function createStore() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const { createSupabaseStore } = require('./lib/store-supabase');
    return createSupabaseStore(url, key);
  }
  if (url || key) {
    throw new Error('Set both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to use Supabase.');
  }
  return createFileStore(DATA_DIR);
}

const store = createStore();

/* ------------------------------------------------------------------ */
/* Passwords and sessions                                              */
/* ------------------------------------------------------------------ */

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') };
}

function verifyPassword(password, user) {
  const a = Buffer.from(hashPassword(password, user.salt).hash, 'hex');
  const b = Buffer.from(user.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

async function currentUser(req) {
  const token = parseCookies(req).camc_session;
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const key = sha256(token);
  const s = await store.getSession(key);
  if (!s) return null;
  const now = Date.now();
  if (s.expiresAt < now) {
    await store.deleteSession(key);
    return null;
  }
  if (s.expiresAt - now < SESSION_TTL_MS - SESSION_REFRESH_MS) {
    await store.extendSession(key, now + SESSION_TTL_MS);
  }
  return store.getUserById(s.userId);
}

function sessionCookie(req, token, maxAgeSec) {
  const secure = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted;
  return [`camc_session=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`, secure ? 'Secure' : '']
    .filter(Boolean)
    .join('; ');
}

// Simple login throttling per IP.
const loginAttempts = new Map();
function tooManyAttempts(ip) {
  const rec = loginAttempts.get(ip);
  return !!rec && rec.resetAt > Date.now() && rec.count >= 10;
}
function recordFailedAttempt(ip) {
  const now = Date.now();
  const rec = loginAttempts.get(ip);
  if (!rec || rec.resetAt < now) loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
  else rec.count += 1;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(httpError(413, 'Request too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(httpError(400, 'Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

const publicUser = (u) => ({ id: u.id, username: u.username, name: u.name, role: u.role, createdAt: u.createdAt });
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

const SEAT_ID_RE = /^([A-P]([1-9]|1\d|2\d)|EX\d{1,4}|[LR]BAL\d{1,4}|W[12]-([1-9]|1\d|2\d))$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const GROUP_ID_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._&+-]{0,19}$/u;

// Normalise an event layout sent by a teacher so only known fields are stored.
function sanitizeLayout(input) {
  const seatData = {};
  const src = input && typeof input.seatData === 'object' && input.seatData ? input.seatData : {};
  for (const [id, s] of Object.entries(src)) {
    if (!SEAT_ID_RE.test(id) || !s || typeof s !== 'object') continue;
    const photo = str(s.photoUrl, 400000);
    seatData[id] = {
      classId: str(s.classId, 40),
      className: str(s.className, 120),
      color: /^#[0-9a-fA-F]{3,8}$/.test(s.color || '') ? s.color : '#0071e3',
      personName: str(s.personName, 120),
      photoUrl: photo.startsWith('data:image/') ? photo : null,
    };
  }
  const ids = (arr, re) => [...new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === 'string' && re.test(x)) : [])];
  const bal = (input && input.balconySeatList) || {};
  return {
    seatData,
    extraSeatList: ids(input && input.extraSeatList, /^EX\d{1,4}$/),
    balconySeatList: { L: ids(bal.L, /^LBAL\d{1,4}$/), R: ids(bal.R, /^RBAL\d{1,4}$/) },
    walkwaySeatList: ids(input && input.walkwaySeatList, /^W[12]-([1-9]|1\d|2\d)$/),
  };
}

function sanitizeGroup(body, { requireId }) {
  const g = {};
  if (requireId) {
    g.id = str(body.id, 40).trim();
    if (!GROUP_ID_RE.test(g.id)) throw httpError(400, 'Code must be 1–20 letters or numbers (e.g. 7A or VIP-Board).');
  }
  if ('name' in body || requireId) {
    g.name = str(body.name, 120).trim();
    if (!g.name) throw httpError(400, 'Name is required.');
  }
  if ('color' in body || requireId) {
    g.color = str(body.color, 7);
    if (!COLOR_RE.test(g.color)) throw httpError(400, 'Choose a colour.');
    g.color = g.color.toLowerCase();
  }
  if ('kind' in body || requireId) {
    g.kind = body.kind === 'vip' ? 'vip' : 'class';
  }
  if ('sortOrder' in body) {
    const n = Number(body.sortOrder);
    if (Number.isFinite(n)) g.sortOrder = Math.round(n);
  }
  return g;
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

async function handleApi(req, res, url) {
  const method = req.method;
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent); // ['api', ...]

  // Basic CSRF protection: state-changing requests must be same-origin JSON.
  if (method !== 'GET' && method !== 'HEAD') {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return send(res, 403, { error: 'Cross-origin request blocked' });
    if (!(req.headers['content-type'] || '').includes('application/json')) return send(res, 415, { error: 'Expected JSON' });
  }

  // --- Auth ---------------------------------------------------------
  if (parts[1] === 'login' && method === 'POST') {
    const ip = req.socket.remoteAddress;
    if (tooManyAttempts(ip)) return send(res, 429, { error: 'Too many attempts. Try again in a few minutes.' });
    const body = await readJson(req);
    const found = await store.getUserByUsername(str(body.username, 64).trim().toLowerCase());
    if (!found || !verifyPassword(str(body.password, 256), found)) {
      recordFailedAttempt(ip);
      return send(res, 401, { error: 'Incorrect username or password.' });
    }
    loginAttempts.delete(ip);
    const token = crypto.randomBytes(32).toString('hex');
    await store.createSession(sha256(token), found.id, Date.now() + SESSION_TTL_MS);
    store.deleteExpiredSessions(Date.now()).catch(() => {});
    return send(res, 200, { user: publicUser(found) }, { 'Set-Cookie': sessionCookie(req, token, SESSION_TTL_MS / 1000) });
  }

  if (parts[1] === 'logout' && method === 'POST') {
    const token = parseCookies(req).camc_session;
    if (token) await store.deleteSession(sha256(token));
    return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
  }

  const user = await currentUser(req);

  if (parts[1] === 'me' && method === 'GET') {
    return send(res, 200, { user: user ? publicUser(user) : null });
  }

  if (parts[1] === 'password' && method === 'POST') {
    if (!user) return send(res, 401, { error: 'Please sign in.' });
    const body = await readJson(req);
    if (!verifyPassword(str(body.currentPassword, 256), user)) return send(res, 400, { error: 'Current password is incorrect.' });
    const next = str(body.newPassword, 256);
    if (next.length < 6) return send(res, 400, { error: 'New password must be at least 6 characters.' });
    const { salt, hash } = hashPassword(next);
    await store.updateUserPassword(user.id, salt, hash);
    return send(res, 200, { ok: true });
  }

  // --- Teacher accounts (administrator only) -------------------------
  if (parts[1] === 'teachers') {
    if (!user) return send(res, 401, { error: 'Please sign in.' });
    if (user.role !== 'admin') return send(res, 403, { error: 'Only the administrator can manage teacher accounts.' });

    if (parts.length === 2 && method === 'GET') {
      return send(res, 200, { teachers: (await store.listUsers('teacher')).map(publicUser) });
    }
    if (parts.length === 2 && method === 'POST') {
      const body = await readJson(req);
      const username = str(body.username, 64).trim().toLowerCase();
      const password = str(body.password, 256);
      if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
        return send(res, 400, { error: 'Username must be 3–32 characters: letters, numbers, dot, dash or underscore.' });
      }
      if (password.length < 6) return send(res, 400, { error: 'Password must be at least 6 characters.' });
      if (await store.getUserByUsername(username)) return send(res, 409, { error: 'That username is already taken.' });
      const teacher = await store.createUser({
        id: crypto.randomUUID(),
        username,
        name: str(body.name, 120).trim() || username,
        role: 'teacher',
        ...hashPassword(password),
        createdAt: new Date().toISOString(),
      });
      return send(res, 201, { teacher: publicUser(teacher) });
    }
    return send(res, 405, { error: 'Not allowed' });
  }

  // --- Classes and VIP groups ---------------------------------------
  if (parts[1] === 'groups') {
    const id = parts[2];
    if (!id && method === 'GET') return send(res, 200, { groups: await store.listGroups() });

    if (!user) return send(res, 401, { error: 'Please sign in.' });
    if (user.role !== 'teacher') return send(res, 403, { error: 'Only teachers can manage classes and VIP groups.' });

    if (!id && method === 'POST') {
      const g = sanitizeGroup(await readJson(req), { requireId: true });
      const existing = await store.listGroups();
      if (existing.some((x) => x.id.toLowerCase() === g.id.toLowerCase())) {
        return send(res, 409, { error: 'A group with that code already exists.' });
      }
      if (g.sortOrder === undefined) g.sortOrder = existing.reduce((m, x) => Math.max(m, x.sortOrder), 0) + 10;
      const [created] = await store.createGroups([g]);
      return send(res, 201, { group: created });
    }
    if (id && method === 'PUT') {
      const updated = await store.updateGroup(id, sanitizeGroup(await readJson(req), { requireId: false }));
      if (!updated) return send(res, 404, { error: 'Group not found' });
      return send(res, 200, { group: updated });
    }
    if (id && method === 'DELETE') {
      await store.deleteGroup(id);
      return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: 'Not allowed' });
  }

  // --- Events -------------------------------------------------------
  if (parts[1] === 'events') {
    const id = parts[2];

    if (!id && method === 'GET') {
      const list = (await store.listEvents()).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
      return send(res, 200, { events: list });
    }
    if (id && method === 'GET') {
      const ev = await store.getEvent(id);
      return ev ? send(res, 200, { event: ev }) : send(res, 404, { error: 'Event not found' });
    }

    // Everything below edits seating charts: teachers only.
    if (!user) return send(res, 401, { error: 'Please sign in.' });
    if (user.role !== 'teacher') return send(res, 403, { error: 'Only teachers can edit seating charts.' });

    if (!id && method === 'POST') {
      const body = await readJson(req);
      const name = str(body.name, 120).trim();
      if (!name) return send(res, 400, { error: 'Event name is required.' });
      const now = new Date().toISOString();
      const ev = await store.createEvent({
        id: crypto.randomBytes(6).toString('base64url'),
        name,
        date: str(body.date, 20),
        ...sanitizeLayout(body),
        createdAt: now,
        createdBy: user.name,
        updatedAt: now,
        updatedBy: user.name,
      });
      return send(res, 201, { event: ev });
    }
    if (id && method === 'PUT') {
      const body = await readJson(req);
      const name = str(body.name, 120).trim();
      if (!name) return send(res, 400, { error: 'Event name is required.' });
      const ev = await store.updateEvent(id, {
        ...sanitizeLayout(body),
        name,
        date: str(body.date, 20),
        updatedAt: new Date().toISOString(),
        updatedBy: user.name,
      });
      return ev ? send(res, 200, { event: ev }) : send(res, 404, { error: 'Event not found' });
    }
    if (id && method === 'DELETE') {
      await store.deleteEvent(id);
      return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: 'Not allowed' });
  }

  return send(res, 404, { error: 'Not found' });
}

/* ------------------------------------------------------------------ */
/* Static files                                                        */
/* ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

function serveStatic(req, res, pathname) {
  let file;
  if (pathname === '/' || pathname === '/index.html') file = 'index.html';
  else if (pathname === '/teacher' || pathname === '/teacher/') file = 'teacher.html';
  else file = pathname.replace(/^\/+/, '');

  const full = path.normalize(path.join(PUBLIC_DIR, file));
  if (!full.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Forbidden');

  fs.readFile(full, (err, data) => {
    if (err) return send(res, 404, 'Not found');
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(full)] || 'application/octet-stream',
      'Cache-Control': full.endsWith('.html') ? 'no-cache' : 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
    });
    res.end(data);
  });
}

/* ------------------------------------------------------------------ */
/* Start                                                               */
/* ------------------------------------------------------------------ */

async function seed() {
  if (!(await store.getUserByUsername(ADMIN_USERNAME))) {
    await store.createUser({
      id: crypto.randomUUID(),
      username: ADMIN_USERNAME,
      name: 'CAMC Administrator',
      role: 'admin',
      ...hashPassword(ADMIN_DEFAULT_PASSWORD),
      createdAt: new Date().toISOString(),
    });
    console.log(`Created administrator account "${ADMIN_USERNAME}".`);
  }
  if (!(await store.hasGroups())) {
    const existing = new Set((await store.listGroups()).map((g) => g.id));
    await store.createGroups(DEFAULT_GROUPS.filter((g) => !existing.has(g.id)));
    console.log('Added the default classes and VIP group.');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    return serveStatic(req, res, url.pathname);
  } catch (err) {
    if (!err.status) console.error(err);
    if (!res.headersSent) send(res, err.status || 500, { error: err.status ? err.message : 'Server error' });
  }
});

seed()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`CAMC Seating running at http://localhost:${PORT} (storage: ${store.kind})`);
      console.log(`  Viewer:  http://localhost:${PORT}/`);
      console.log(`  Teacher: http://localhost:${PORT}/teacher`);
    });
  })
  .catch((err) => {
    console.error('Could not start CAMC Seating:', err.message);
    if (store.kind === 'supabase') console.error('Check SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY and that supabase/schema.sql has been run.');
    process.exit(1);
  });
