'use strict';

/*
 * CAMC Seating — a small, dependency-free Node.js server.
 *
 *   /            Public viewer: search events and see their seating plans.
 *   /teacher     Sign-in for teachers (edit seating charts) and the
 *                administrator (create teacher accounts only).
 *
 * Data is kept in data/db.json. Passwords are hashed with scrypt.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY = 15 * 1024 * 1024; // photos are stored inline as small JPEGs
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

const ADMIN_USERNAME = 'camcadmin';
const ADMIN_DEFAULT_PASSWORD = 'sisbcamc';

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, user) {
  const { hash } = hashPassword(password, user.salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(user.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function loadDb() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    return { users: [], events: [] };
  }
}

let db = loadDb();

function saveDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}

// Make sure the administrator account exists.
if (!db.users.some((u) => u.username === ADMIN_USERNAME)) {
  db.users.push({
    id: crypto.randomUUID(),
    username: ADMIN_USERNAME,
    name: 'CAMC Administrator',
    role: 'admin',
    ...hashPassword(ADMIN_DEFAULT_PASSWORD),
    createdAt: new Date().toISOString(),
  });
  saveDb();
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

const sessions = new Map(); // token -> { userId, expires }

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId, expires: Date.now() + SESSION_TTL_MS });
  return token;
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function currentUser(req) {
  const token = parseCookies(req).camc_session;
  if (!token) return null;
  const s = sessions.get(token);
  if (!s || s.expires < Date.now()) {
    sessions.delete(token);
    return null;
  }
  s.expires = Date.now() + SESSION_TTL_MS;
  return db.users.find((u) => u.id === s.userId) || null;
}

function sessionCookie(req, token, maxAgeSec) {
  const secure = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted;
  return [
    `camc_session=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`,
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

// Simple login throttling per IP.
const loginAttempts = new Map(); // ip -> { count, resetAt }
function tooManyAttempts(ip) {
  const now = Date.now();
  const rec = loginAttempts.get(ip);
  if (!rec || rec.resetAt < now) return false;
  return rec.count >= 10;
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
  const payload = isJson ? JSON.stringify(body) : body;
  res.writeHead(status, {
    'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Request too large'), { status: 413 }));
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
        reject(Object.assign(new Error('Invalid JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function publicUser(u) {
  return { id: u.id, username: u.username, name: u.name, role: u.role, createdAt: u.createdAt };
}

const SEAT_ID_RE = /^([A-P]([1-9]|1\d|2\d)|EX\d{1,4}|[LR]BAL\d{1,4}|W[12]-([1-9]|1\d|2\d))$/;

function str(v, max) {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

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
  const ids = (arr, re) => (Array.isArray(arr) ? arr.filter((x) => typeof x === 'string' && re.test(x)) : []);
  const bal = input && input.balconySeatList ? input.balconySeatList : {};
  return {
    seatData,
    extraSeatList: [...new Set(ids(input && input.extraSeatList, /^EX\d{1,4}$/))],
    balconySeatList: {
      L: [...new Set(ids(bal.L, /^LBAL\d{1,4}$/))],
      R: [...new Set(ids(bal.R, /^RBAL\d{1,4}$/))],
    },
    walkwaySeatList: [...new Set(ids(input && input.walkwaySeatList, /^W[12]-([1-9]|1\d|2\d)$/))],
  };
}

function eventSummary(e) {
  return {
    id: e.id,
    name: e.name,
    date: e.date || '',
    allocated: Object.keys(e.seatData || {}).length,
    updatedAt: e.updatedAt,
    updatedBy: e.updatedBy,
  };
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

async function handleApi(req, res, url) {
  const method = req.method;
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const user = currentUser(req);

  // Basic CSRF protection: state-changing requests must be same-origin JSON.
  if (method !== 'GET' && method !== 'HEAD') {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return send(res, 403, { error: 'Cross-origin request blocked' });
    if (!(req.headers['content-type'] || '').includes('application/json')) {
      return send(res, 415, { error: 'Expected JSON' });
    }
  }

  // --- Auth ---------------------------------------------------------
  if (parts[1] === 'login' && method === 'POST') {
    const ip = req.socket.remoteAddress;
    if (tooManyAttempts(ip)) return send(res, 429, { error: 'Too many attempts. Try again in a few minutes.' });
    const body = await readJson(req);
    const username = str(body.username, 64).trim().toLowerCase();
    const found = db.users.find((u) => u.username === username);
    if (!found || !verifyPassword(str(body.password, 256), found)) {
      recordFailedAttempt(ip);
      return send(res, 401, { error: 'Incorrect username or password.' });
    }
    loginAttempts.delete(ip);
    const token = createSession(found.id);
    return send(res, 200, { user: publicUser(found) }, {
      'Set-Cookie': sessionCookie(req, token, SESSION_TTL_MS / 1000),
    });
  }

  if (parts[1] === 'logout' && method === 'POST') {
    const token = parseCookies(req).camc_session;
    if (token) sessions.delete(token);
    return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
  }

  if (parts[1] === 'me' && method === 'GET') {
    return send(res, 200, { user: user ? publicUser(user) : null });
  }

  if (parts[1] === 'password' && method === 'POST') {
    if (!user) return send(res, 401, { error: 'Please sign in.' });
    const body = await readJson(req);
    if (!verifyPassword(str(body.currentPassword, 256), user)) return send(res, 400, { error: 'Current password is incorrect.' });
    const next = str(body.newPassword, 256);
    if (next.length < 6) return send(res, 400, { error: 'New password must be at least 6 characters.' });
    Object.assign(user, hashPassword(next));
    saveDb();
    return send(res, 200, { ok: true });
  }

  // --- Teacher accounts (administrator only) -------------------------
  if (parts[1] === 'teachers') {
    if (!user) return send(res, 401, { error: 'Please sign in.' });
    if (user.role !== 'admin') return send(res, 403, { error: 'Only the administrator can manage teacher accounts.' });

    if (parts.length === 2 && method === 'GET') {
      return send(res, 200, { teachers: db.users.filter((u) => u.role === 'teacher').map(publicUser) });
    }

    if (parts.length === 2 && method === 'POST') {
      const body = await readJson(req);
      const username = str(body.username, 64).trim().toLowerCase();
      const name = str(body.name, 120).trim();
      const password = str(body.password, 256);
      if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
        return send(res, 400, { error: 'Username must be 3–32 characters: letters, numbers, dot, dash or underscore.' });
      }
      if (password.length < 6) return send(res, 400, { error: 'Password must be at least 6 characters.' });
      if (db.users.some((u) => u.username === username)) return send(res, 409, { error: 'That username is already taken.' });
      const teacher = {
        id: crypto.randomUUID(),
        username,
        name: name || username,
        role: 'teacher',
        ...hashPassword(password),
        createdAt: new Date().toISOString(),
      };
      db.users.push(teacher);
      saveDb();
      return send(res, 201, { teacher: publicUser(teacher) });
    }

    return send(res, 405, { error: 'Not allowed' });
  }

  // --- Events -------------------------------------------------------
  if (parts[1] === 'events') {
    const id = parts[2];

    if (!id && method === 'GET') {
      const list = db.events.map(eventSummary).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      return send(res, 200, { events: list });
    }

    if (id && method === 'GET') {
      const ev = db.events.find((e) => e.id === id);
      if (!ev) return send(res, 404, { error: 'Event not found' });
      return send(res, 200, { event: ev });
    }

    // Everything below edits seating charts: teachers only.
    if (!user) return send(res, 401, { error: 'Please sign in.' });
    if (user.role !== 'teacher') return send(res, 403, { error: 'Only teachers can edit seating charts.' });

    if (!id && method === 'POST') {
      const body = await readJson(req);
      const name = str(body.name, 120).trim();
      if (!name) return send(res, 400, { error: 'Event name is required.' });
      const ev = {
        id: crypto.randomBytes(6).toString('base64url'),
        name,
        date: str(body.date, 20),
        ...sanitizeLayout(body),
        createdAt: new Date().toISOString(),
        createdBy: user.name,
        updatedAt: new Date().toISOString(),
        updatedBy: user.name,
      };
      db.events.push(ev);
      saveDb();
      return send(res, 201, { event: ev });
    }

    const ev = db.events.find((e) => e.id === id);
    if (!ev) return send(res, 404, { error: 'Event not found' });

    if (method === 'PUT') {
      const body = await readJson(req);
      const name = str(body.name, 120).trim();
      if (!name) return send(res, 400, { error: 'Event name is required.' });
      Object.assign(ev, sanitizeLayout(body), {
        name,
        date: str(body.date, 20),
        updatedAt: new Date().toISOString(),
        updatedBy: user.name,
      });
      saveDb();
      return send(res, 200, { event: ev });
    }

    if (method === 'DELETE') {
      db.events = db.events.filter((e) => e.id !== id);
      saveDb();
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    return serveStatic(req, res, url.pathname);
  } catch (err) {
    if (!res.headersSent) send(res, err.status || 500, { error: err.status ? err.message : 'Server error' });
    if (!err.status) console.error(err);
  }
});

server.listen(PORT, () => {
  console.log(`CAMC Seating running at http://localhost:${PORT}`);
  console.log(`  Viewer:  http://localhost:${PORT}/`);
  console.log(`  Teacher: http://localhost:${PORT}/teacher`);
});
