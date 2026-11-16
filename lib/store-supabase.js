'use strict';

/*
 * Supabase (Postgres) storage. The server talks to Supabase with the
 * service-role key, so the key must never be sent to the browser. Row Level
 * Security is enabled on every table with no public policies (see
 * supabase/schema.sql), so the public anon key cannot read or change data.
 */

const { createClient } = require('@supabase/supabase-js');
const { httpError } = require('./store-file');

function createSupabaseStore(url, serviceKey) {
  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  function check({ data, error }, conflictMessage) {
    if (error) {
      if (error.code === '23505' && conflictMessage) throw httpError(409, conflictMessage);
      const err = new Error(`Supabase: ${error.message}`);
      err.details = error;
      throw err;
    }
    return data;
  }

  const toUser = (r) => r && ({
    id: r.id, username: r.username, name: r.name, role: r.role,
    salt: r.password_salt, hash: r.password_hash, createdAt: r.created_at,
  });

  const toGroup = (r) => ({ id: r.id, name: r.name, color: r.color, kind: r.kind, sortOrder: r.sort_order });
  const fromGroup = (g) => ({ id: g.id, name: g.name, color: g.color, kind: g.kind, sort_order: g.sortOrder });

  const toEvent = (r) => r && ({
    id: r.id,
    name: r.name,
    date: r.event_date || '',
    ...emptyLayout(),
    ...(r.layout || {}),
    createdAt: r.created_at,
    createdBy: r.created_by,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  });

  function emptyLayout() {
    return { seatData: {}, extraSeatList: [], balconySeatList: { L: [], R: [] }, walkwaySeatList: [] };
  }

  function eventRow(ev) {
    const row = {};
    if ('name' in ev) row.name = ev.name;
    if ('date' in ev) row.event_date = ev.date || '';
    if ('seatData' in ev) {
      row.layout = {
        seatData: ev.seatData,
        extraSeatList: ev.extraSeatList,
        balconySeatList: ev.balconySeatList,
        walkwaySeatList: ev.walkwaySeatList,
      };
      row.allocated = Object.keys(ev.seatData || {}).length;
    }
    if ('createdAt' in ev) row.created_at = ev.createdAt;
    if ('createdBy' in ev) row.created_by = ev.createdBy;
    if ('updatedAt' in ev) row.updated_at = ev.updatedAt;
    if ('updatedBy' in ev) row.updated_by = ev.updatedBy;
    return row;
  }

  return {
    kind: 'supabase',

    // Users
    async getUserByUsername(username) {
      return toUser(check(await sb.from('camc_users').select('*').eq('username', username).maybeSingle()));
    },
    async getUserById(id) {
      return toUser(check(await sb.from('camc_users').select('*').eq('id', id).maybeSingle()));
    },
    async listUsers(role) {
      return check(await sb.from('camc_users').select('*').eq('role', role).order('name')).map(toUser);
    },
    async createUser(u) {
      const row = {
        id: u.id, username: u.username, name: u.name, role: u.role,
        password_salt: u.salt, password_hash: u.hash, created_at: u.createdAt,
      };
      return toUser(check(await sb.from('camc_users').insert(row).select().single(), 'That username is already taken.'));
    },
    async updateUserPassword(id, salt, hash) {
      check(await sb.from('camc_users').update({ password_salt: salt, password_hash: hash }).eq('id', id));
    },

    // Sessions
    async createSession(tokenHash, userId, expiresAt) {
      check(await sb.from('camc_sessions').insert({ token_hash: tokenHash, user_id: userId, expires_at: new Date(expiresAt).toISOString() }));
    },
    async getSession(tokenHash) {
      const r = check(await sb.from('camc_sessions').select('user_id, expires_at').eq('token_hash', tokenHash).maybeSingle());
      return r ? { userId: r.user_id, expiresAt: Date.parse(r.expires_at) } : null;
    },
    async extendSession(tokenHash, expiresAt) {
      check(await sb.from('camc_sessions').update({ expires_at: new Date(expiresAt).toISOString() }).eq('token_hash', tokenHash));
    },
    async deleteSession(tokenHash) {
      check(await sb.from('camc_sessions').delete().eq('token_hash', tokenHash));
    },
    async deleteExpiredSessions(now) {
      check(await sb.from('camc_sessions').delete().lt('expires_at', new Date(now).toISOString()));
    },

    // Groups
    async hasGroups() {
      // The settings row records that defaults were seeded, so deleting every
      // group later does not bring the defaults back.
      const r = check(await sb.from('camc_settings').select('value').eq('key', 'groups_seeded').maybeSingle());
      return !!r;
    },
    async listGroups() {
      return check(await sb.from('camc_groups').select('*').order('sort_order').order('id')).map(toGroup);
    },
    async createGroups(groups) {
      const rows = check(await sb.from('camc_groups').insert(groups.map(fromGroup)).select(), 'A group with that code already exists.');
      check(await sb.from('camc_settings').upsert({ key: 'groups_seeded', value: 'true' }));
      return rows.map(toGroup);
    },
    async updateGroup(id, patch) {
      const row = {};
      if ('name' in patch) row.name = patch.name;
      if ('color' in patch) row.color = patch.color;
      if ('kind' in patch) row.kind = patch.kind;
      if ('sortOrder' in patch) row.sort_order = patch.sortOrder;
      const r = check(await sb.from('camc_groups').update(row).eq('id', id).select().maybeSingle());
      return r ? toGroup(r) : null;
    },
    async deleteGroup(id) {
      check(await sb.from('camc_groups').delete().eq('id', id));
    },

    // Events
    async listEvents() {
      const rows = check(await sb.from('camc_events').select('id, name, event_date, allocated, updated_at, updated_by'));
      return rows.map((r) => ({
        id: r.id, name: r.name, date: r.event_date || '', allocated: r.allocated,
        updatedAt: r.updated_at, updatedBy: r.updated_by,
      }));
    },
    async getEvent(id) {
      return toEvent(check(await sb.from('camc_events').select('*').eq('id', id).maybeSingle()));
    },
    async createEvent(ev) {
      return toEvent(check(await sb.from('camc_events').insert({ id: ev.id, ...eventRow(ev) }).select().single()));
    },
    async updateEvent(id, patch) {
      return toEvent(check(await sb.from('camc_events').update(eventRow(patch)).eq('id', id).select().maybeSingle()));
    },
    async deleteEvent(id) {
      check(await sb.from('camc_events').delete().eq('id', id));
    },
  };
}

module.exports = { createSupabaseStore };
