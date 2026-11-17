/* Data layer: talks to Supabase directly from the browser. */
(function () {
  'use strict';

  const cfg = window.CAMC_CONFIG || {};
  const configured = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
  const sb = configured
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
    : null;

  const TOKEN_KEY = 'camc_session';
  let memoryToken = null;
  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || memoryToken; } catch { return memoryToken; }
  }
  function setToken(token) {
    memoryToken = token;
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch { /* storage unavailable: keep it in memory */ }
  }

  function toError(error) {
    const err = new Error(error.message || 'Something went wrong. Please try again.');
    err.code = error.code;
    if (error.code === '28000') {
      err.status = 401;
      setToken(null);
    } else if (error.code === '42501') err.status = 403;
    else if (error.code === '23505') err.status = 409;
    else if (error.code === 'P0002') err.status = 404;
    else if (/fetch|network/i.test(err.message)) err.message = 'Can’t reach the database. Check your connection and try again.';
    return err;
  }

  function requireConfig() {
    if (!configured) {
      const err = new Error('This site isn’t connected to Supabase yet. Add your project URL and anon key to config.js.');
      err.status = 503;
      throw err;
    }
  }

  // `query` is a function so nothing touches the client before the config check.
  async function run(query) {
    requireConfig();
    const { data, error } = await query();
    if (error) throw toError(error);
    return data;
  }

  const rpc = (fn, args) => run(() => sb.rpc(fn, args));

  /* --- Layout clean-up before saving ---------------------------------- */

  const SEAT_ID_RE = /^([A-P]([1-9]|1\d|2\d)|EX\d{1,4}|[LR]BAL\d{1,4}|W[12]-([1-9]|1\d|2\d))$/;
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

  function cleanLayout(input) {
    const seatData = {};
    const src = input && typeof input.seatData === 'object' && input.seatData ? input.seatData : {};
    for (const [id, s] of Object.entries(src)) {
      if (!SEAT_ID_RE.test(id) || !s || typeof s !== 'object') continue;
      const photo = str(s.photoUrl, 400000);
      seatData[id] = {
        classId: str(s.classId, 40),
        className: str(s.className, 120),
        color: /^#[0-9a-fA-F]{3,8}$/.test(s.color || '') ? s.color : '#8e8e93',
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

  function rowToEvent(r) {
    const layout = r.layout || {};
    return {
      id: r.id,
      name: r.name,
      date: r.event_date || '',
      seatData: layout.seatData || {},
      extraSeatList: layout.extraSeatList || [],
      balconySeatList: layout.balconySeatList || { L: [], R: [] },
      walkwaySeatList: layout.walkwaySeatList || [],
      createdAt: r.created_at,
      createdBy: r.created_by,
      updatedAt: r.updated_at,
      updatedBy: r.updated_by,
    };
  }

  /* --- Public reads ---------------------------------------------------- */

  async function listEvents() {
    const rows = await run(() =>
      sb.from('camc_events').select('id, name, event_date, allocated, updated_at, updated_by').order('updated_at', { ascending: false }),
    );
    return {
      events: rows.map((r) => ({
        id: r.id, name: r.name, date: r.event_date || '', allocated: r.allocated,
        updatedAt: r.updated_at, updatedBy: r.updated_by,
      })),
    };
  }

  async function getEvent(id) {
    const row = await run(() => sb.from('camc_events').select('*').eq('id', id).maybeSingle());
    if (!row) throw Object.assign(new Error('This event could not be found.'), { status: 404 });
    return { event: rowToEvent(row) };
  }

  async function listGroups() {
    const rows = await run(() => sb.from('camc_groups').select('id, name, color, kind, sort_order').order('sort_order').order('id'));
    return { groups: rows.map((g) => ({ id: g.id, name: g.name, color: g.color, kind: g.kind, sortOrder: g.sort_order })) };
  }

  /* --- Account ---------------------------------------------------------- */

  async function login(username, password) {
    const data = await rpc('camc_login', { p_username: username, p_password: password });
    if (!data || data.error) throw new Error((data && data.error) || 'Incorrect username or password.');
    setToken(data.token);
    return { user: data.user };
  }

  async function logout() {
    const token = getToken();
    setToken(null);
    if (token && configured) await rpc('camc_logout', { p_token: token }).catch(() => {});
  }

  async function me() {
    const token = getToken();
    if (!token || !configured) return { user: null };
    const user = await rpc('camc_me', { p_token: token });
    if (!user) setToken(null);
    return { user };
  }

  const changePassword = (currentPassword, newPassword) =>
    rpc('camc_change_password', { p_token: getToken(), p_current: currentPassword, p_new: newPassword });

  /* --- Teacher accounts (administrator) -------------------------------- */

  const listTeachers = async () => ({ teachers: await rpc('camc_list_teachers', { p_token: getToken() }) });

  const createTeacher = async ({ name, username, password }) => ({
    teacher: await rpc('camc_create_teacher', { p_token: getToken(), p_username: username, p_name: name, p_password: password }),
  });

  /* --- Classes and VIP groups (teachers) -------------------------------- */

  const createGroup = async ({ id, name, color, kind }) => ({
    group: await rpc('camc_create_group', { p_token: getToken(), p_id: id, p_name: name, p_color: color, p_kind: kind }),
  });

  const updateGroup = async (id, { name, color, kind }) => ({
    group: await rpc('camc_update_group', { p_token: getToken(), p_id: id, p_name: name, p_color: color, p_kind: kind }),
  });

  const deleteGroup = (id) => rpc('camc_delete_group', { p_token: getToken(), p_id: id });

  /* --- Seating charts (teachers) ---------------------------------------- */

  const createEvent = async (ev) => ({
    event: await rpc('camc_create_event', { p_token: getToken(), p_name: ev.name, p_date: ev.date || '', p_layout: cleanLayout(ev) }),
  });

  const updateEvent = async (id, ev) => ({
    event: await rpc('camc_update_event', { p_token: getToken(), p_id: id, p_name: ev.name, p_date: ev.date || '', p_layout: cleanLayout(ev) }),
  });

  const deleteEvent = (id) => rpc('camc_delete_event', { p_token: getToken(), p_id: id });

  /* --- Loy Krathong ------------------------------------------------------ */

  const KRATHONG_COLUMNS = 'id, name, wish, design, created_at';
  const toKrathong = (r) => ({ id: Number(r.id), name: r.name, wish: r.wish, design: r.design, createdAt: r.created_at || r.createdAt, hidden: !!r.hidden });

  /** Visible krathongs, oldest first. `since` (ISO time) returns only newer ones. */
  async function listKrathongs({ since, limit = 500 } = {}) {
    const rows = await run(() => {
      let q = sb.from('camc_krathongs').select(KRATHONG_COLUMNS);
      if (since) q = q.gt('created_at', since).order('created_at', { ascending: true });
      else q = q.order('created_at', { ascending: false });
      return q.limit(limit);
    });
    const list = rows.map(toKrathong);
    return since ? list : list.reverse();
  }

  /** IDs of every visible krathong (used to drop ones a teacher has hidden). */
  async function krathongIds() {
    const rows = await run(() => sb.from('camc_krathongs').select('id').order('created_at', { ascending: false }).limit(5000));
    return new Set(rows.map((r) => Number(r.id)));
  }

  const krathongStatus = () => rpc('camc_krathong_status', {});

  const submitKrathong = async ({ name, wish, design }) =>
    toKrathong(await rpc('camc_submit_krathong', { p_name: name || '', p_wish: wish || '', p_design: design }));

  const listAllKrathongs = async () => (await rpc('camc_list_krathongs', { p_token: getToken() })).map(toKrathong);
  const setKrathongHidden = (id, hidden) => rpc('camc_set_krathong_hidden', { p_token: getToken(), p_id: id, p_hidden: hidden });
  const deleteKrathong = (id) => rpc('camc_delete_krathong', { p_token: getToken(), p_id: id });
  const clearKrathongs = () => rpc('camc_clear_krathongs', { p_token: getToken() });
  const setKrathongOpen = (open) => rpc('camc_set_krathong_open', { p_token: getToken(), p_open: open });

  window.DB = {
    listKrathongs, krathongIds, krathongStatus, submitKrathong,
    listAllKrathongs, setKrathongHidden, deleteKrathong, clearKrathongs, setKrathongOpen,
    configured,
    listEvents, getEvent, listGroups,
    login, logout, me, changePassword,
    listTeachers, createTeacher,
    createGroup, updateGroup, deleteGroup,
    createEvent, updateEvent, deleteEvent,
  };
})();
