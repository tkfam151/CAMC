'use strict';

/*
 * Local JSON-file storage. Used when Supabase is not configured, which is
 * handy for development. Production should use Supabase (see README).
 */

const fs = require('fs');
const path = require('path');

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function createFileStore(dataDir) {
  const file = path.join(dataDir, 'db.json');
  let db;
  try {
    db = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    db = {};
  }
  db.users = db.users || [];
  db.events = db.events || [];
  db.groups = db.groups || null; // null = never seeded
  const sessions = new Map();

  function save() {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file + '.tmp', JSON.stringify(db));
    fs.renameSync(file + '.tmp', file);
  }

  const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));

  return {
    kind: 'file',

    // Users
    async getUserByUsername(username) { return clone(db.users.find((u) => u.username === username)) || null; },
    async getUserById(id) { return clone(db.users.find((u) => u.id === id)) || null; },
    async listUsers(role) { return clone(db.users.filter((u) => u.role === role)); },
    async createUser(user) {
      if (db.users.some((u) => u.username === user.username)) throw httpError(409, 'That username is already taken.');
      db.users.push(clone(user));
      save();
      return clone(user);
    },
    async updateUserPassword(id, salt, hash) {
      const u = db.users.find((x) => x.id === id);
      if (u) Object.assign(u, { salt, hash });
      save();
    },

    // Sessions (memory only in file mode)
    async createSession(tokenHash, userId, expiresAt) { sessions.set(tokenHash, { userId, expiresAt }); },
    async getSession(tokenHash) { const s = sessions.get(tokenHash); return s ? { ...s } : null; },
    async extendSession(tokenHash, expiresAt) { const s = sessions.get(tokenHash); if (s) s.expiresAt = expiresAt; },
    async deleteSession(tokenHash) { sessions.delete(tokenHash); },
    async deleteExpiredSessions(now) { for (const [k, s] of sessions) if (s.expiresAt < now) sessions.delete(k); },

    // Groups (classes and VIP categories)
    async hasGroups() { return Array.isArray(db.groups); },
    async listGroups() {
      return clone(db.groups || []).sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
    },
    async createGroups(groups) {
      db.groups = db.groups || [];
      for (const g of groups) {
        if (db.groups.some((x) => x.id.toLowerCase() === g.id.toLowerCase())) throw httpError(409, 'A group with that code already exists.');
      }
      db.groups.push(...clone(groups));
      save();
      return clone(groups);
    },
    async updateGroup(id, patch) {
      const g = (db.groups || []).find((x) => x.id === id);
      if (!g) return null;
      Object.assign(g, patch);
      save();
      return clone(g);
    },
    async deleteGroup(id) {
      db.groups = (db.groups || []).filter((x) => x.id !== id);
      save();
    },

    // Events
    async listEvents() {
      return db.events.map((e) => ({
        id: e.id, name: e.name, date: e.date || '', allocated: Object.keys(e.seatData || {}).length,
        updatedAt: e.updatedAt, updatedBy: e.updatedBy,
      }));
    },
    async getEvent(id) { return clone(db.events.find((e) => e.id === id)) || null; },
    async createEvent(ev) { db.events.push(clone(ev)); save(); return clone(ev); },
    async updateEvent(id, patch) {
      const ev = db.events.find((e) => e.id === id);
      if (!ev) return null;
      Object.assign(ev, clone(patch));
      save();
      return clone(ev);
    },
    async deleteEvent(id) { db.events = db.events.filter((e) => e.id !== id); save(); },
  };
}

module.exports = { createFileStore, httpError };
