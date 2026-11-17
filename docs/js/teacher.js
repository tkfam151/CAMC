/* Teacher portal: sign in, admin account management, seating chart editor. */
(function () {
  'use strict';
  const { t, applyI18n, onLangChange, formatDate, toast, debounce } = window.CAMC;
  const $ = (id) => document.getElementById(id);

  let me = null;
  let events = [];

  // Editor state
  let ev = null;          // { id, name, date }
  let layout = null;      // { seatData, extraSeatList, balconySeatList, walkwaySeatList }
  let undoStack = [];
  let dirty = false;
  let saving = false;
  let showClasses = false;
  let editingSeat = null;
  let tempPhoto = null;
  let userZoom = false;

  function autoFit() {
    if (userZoom || $('view-editor').hidden) return;
    const size = Hall.fit($('ed-hall-card'), 14, 28);
    if (size) $('ed-zoom').value = size;
  }

  const VIEWS = ['view-signin', 'view-admin', 'view-dashboard', 'view-groups', 'view-krathongs', 'view-editor'];
  function show(view) {
    $('loading').hidden = true;
    VIEWS.forEach((v) => ($(v).hidden = v !== view));
    window.scrollTo(0, 0);
  }

  function initials(name) {
    return (name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  }

  function setUserChrome() {
    const signedIn = !!me;
    $('user-chip').hidden = !signedIn;
    $('btn-signout').hidden = !signedIn;
    $('btn-password').hidden = !signedIn;
    if (signedIn) {
      $('user-avatar').textContent = initials(me.name);
      $('user-name').textContent = me.name;
    }
  }

  /* ================================================================ */
  /* Routing                                                          */
  /* ================================================================ */

  async function route() {
    if (!me) {
      setUserChrome();
      show('view-signin');
      setTimeout(() => $('si-user').focus(), 50);
      return;
    }
    setUserChrome();
    if (me.role === 'admin') return showAdmin();

    const m = location.hash.match(/^#\/event\/([\w-]+)/);
    if (m) return openEditor(m[1]);
    if (!leaveEditorOk()) return;
    if (location.hash.startsWith('#/groups')) return showGroups();
    if (location.hash.startsWith('#/krathongs')) return showKrathongs();
    return showDashboard();
  }

  /** Called when navigating away from the editor. Returns false to stay. */
  function leaveEditorOk() {
    if (dirty && ev && !$('view-editor').hidden && !confirm(t('confirmLeave'))) {
      window.history.replaceState(null, '', `#/event/${ev.id}`);
      return false;
    }
    dirty = false;
    ev = null;
    return true;
  }

  async function loadGroups() {
    const { groups } = await DB.listGroups();
    Hall.setGroups(groups);
    return groups;
  }

  window.addEventListener('hashchange', () => {
    if (me && me.role === 'teacher') route();
  });

  /* ================================================================ */
  /* Sign in / out                                                    */
  /* ================================================================ */

  $('signin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = $('si-user').value.trim();
    const password = $('si-pass').value;
    $('si-error').textContent = '';
    if (!username || !password) return;
    const btn = e.target.querySelector('.submit');
    btn.disabled = true;
    try {
      const data = await DB.login(username, password);
      me = data.user;
      $('si-pass').value = '';
      route();
    } catch (err) {
      $('si-error').textContent = err.message;
      $('si-pass').select();
    } finally {
      btn.disabled = false;
    }
  });

  $('btn-signout').addEventListener('click', async () => {
    if (dirty && !confirm(t('confirmLeave'))) return;
    dirty = false;
    await DB.logout();
    me = null;
    undoStack = [];
    location.hash = '';
    route();
  });

  /* ================================================================ */
  /* Modals                                                           */
  /* ================================================================ */

  function openModal(id) {
    const m = $(id);
    m.classList.add('open');
    m.setAttribute('aria-hidden', 'false');
    setTimeout(() => {
      const f = m.querySelector('input:not([type=hidden]):not([hidden]), select');
      if (f) f.focus();
    }, 60);
  }
  function closeModal(id) {
    const m = $(id);
    m.classList.remove('open');
    m.setAttribute('aria-hidden', 'true');
  }
  document.querySelectorAll('.modal').forEach((m) => {
    m.addEventListener('mousedown', (e) => { if (e.target === m) closeModal(m.id); });
    m.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closeModal(m.id)));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('.modal.open').forEach((m) => closeModal(m.id));
  });

  // Change password
  $('btn-password').addEventListener('click', () => {
    $('pw-cur').value = '';
    $('pw-new').value = '';
    $('pw-error').textContent = '';
    openModal('pw-modal');
  });
  $('pw-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('pw-error').textContent = '';
    try {
      await DB.changePassword($('pw-cur').value, $('pw-new').value);
      closeModal('pw-modal');
      toast(t('passwordChanged'));
    } catch (err) {
      $('pw-error').textContent = err.message;
    }
  });

  /* ================================================================ */
  /* Admin                                                            */
  /* ================================================================ */

  async function showAdmin() {
    show('view-admin');
    await loadTeachers();
  }

  async function loadTeachers() {
    const { teachers } = await DB.listTeachers();
    const tbody = $('teacher-rows');
    tbody.innerHTML = '';
    teachers
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((u) => {
        const tr = document.createElement('tr');
        const who = document.createElement('td');
        const wrap = document.createElement('div');
        wrap.className = 'who';
        const av = document.createElement('span');
        av.className = 'avatar';
        av.textContent = initials(u.name);
        const nm = document.createElement('span');
        nm.textContent = u.name;
        wrap.append(av, nm);
        who.appendChild(wrap);
        const un = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = u.username;
        un.appendChild(badge);
        const cr = document.createElement('td');
        cr.className = 'muted';
        cr.textContent = formatDate(u.createdAt);
        tr.append(who, un, cr);
        tbody.appendChild(tr);
      });
    $('no-teachers').hidden = teachers.length > 0;
  }

  $('teacher-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('tf-error').textContent = '';
    const body = { name: $('tf-name').value.trim(), username: $('tf-user').value.trim(), password: $('tf-pass').value };
    try {
      const { teacher } = await DB.createTeacher(body);
      toast(t('accountCreated', teacher.username));
      e.target.reset();
      await loadTeachers();
      $('tf-name').focus();
    } catch (err) {
      $('tf-error').textContent = err.message;
    }
  });

  /* ================================================================ */
  /* Classes & VIP groups                                             */
  /* ================================================================ */

  const PALETTE = [
    '#ff3b30', '#ff2d55', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#30b0c7',
    '#32ade6', '#007aff', '#5856d6', '#af52de', '#a2845e', '#c9a227', '#8e8e93', '#1c1c1e',
  ];
  let editingGroup = null; // group being edited, or null for a new one
  let groupKind = 'class';
  let groupColor = PALETTE[8];
  let afterGroupSave = null;

  /* ================================================================ */
  /* Loy Krathong moderation                                          */
  /* ================================================================ */

  let krathongs = [];

  async function showKrathongs() {
    document.title = `${t('navKrathong')} · CAMC`;
    $('greeting-kt').textContent = me.name;
    show('view-krathongs');
    try {
      const [list, status] = await Promise.all([DB.listAllKrathongs(), DB.krathongStatus()]);
      krathongs = list;
      $('kt-open').checked = !!(status && status.open);
      renderKrathongs();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function renderKrathongs() {
    const grid = $('kt-grid');
    grid.innerHTML = '';
    const hidden = krathongs.filter((k) => k.hidden).length;
    $('kt-total').textContent = t('ktTotal', krathongs.length, hidden);
    $('kt-empty').hidden = krathongs.length > 0;
    $('kt-clear').disabled = krathongs.length === 0;
    krathongs.forEach((k) => {
      const card = document.createElement('article');
      card.className = 'kt-card' + (k.hidden ? ' is-hidden' : '');
      const art = document.createElement('div');
      art.className = 'kt-card-art';
      art.innerHTML = Krathong.svg(k.design);
      const name = document.createElement('div');
      name.className = 'kt-card-name';
      name.textContent = k.name || t('ktFriend');
      const wish = document.createElement('div');
      wish.className = 'kt-card-wish';
      wish.textContent = k.wish;
      const meta = document.createElement('div');
      meta.className = 'kt-card-meta';
      meta.textContent = formatDate(k.createdAt, true);
      if (k.hidden) {
        const b = document.createElement('span');
        b.className = 'badge';
        b.textContent = t('ktHidden');
        meta.appendChild(b);
      }
      const actions = document.createElement('div');
      actions.className = 'kt-card-actions';
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'btn btn-secondary btn-sm';
      toggle.textContent = k.hidden ? t('ktShow') : t('ktHide');
      toggle.addEventListener('click', async () => {
        toggle.disabled = true;
        try {
          await DB.setKrathongHidden(k.id, !k.hidden);
          k.hidden = !k.hidden;
          renderKrathongs();
        } catch (err) {
          toast(err.message, 'error');
          toggle.disabled = false;
        }
      });
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn btn-danger btn-sm';
      del.textContent = t('delete');
      del.addEventListener('click', async () => {
        if (!confirm(t('ktConfirmDelete'))) return;
        try {
          await DB.deleteKrathong(k.id);
          krathongs = krathongs.filter((x) => x.id !== k.id);
          renderKrathongs();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
      actions.append(toggle, del);
      card.append(art, name, wish, meta, actions);
      grid.appendChild(card);
    });
  }

  $('kt-open').addEventListener('change', async (e) => {
    const want = e.target.checked;
    try {
      const status = await DB.setKrathongOpen(want);
      e.target.checked = !!status.open;
    } catch (err) {
      e.target.checked = !want;
      toast(err.message, 'error');
    }
  });

  $('kt-clear').addEventListener('click', async () => {
    if (!confirm(t('ktConfirmClear'))) return;
    try {
      const n = await DB.clearKrathongs();
      krathongs = [];
      renderKrathongs();
      toast(t('ktCleared', n));
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  async function showGroups() {
    document.title = `${t('navGroups')} · CAMC Seating`;
    $('greeting-groups').textContent = me.name;
    show('view-groups');
    await loadGroups();
    renderGroups();
  }

  function renderGroups() {
    const classes = Hall.getGroups('class');
    const vips = Hall.getGroups('vip');
    fillGroupList($('class-list'), classes);
    fillGroupList($('vipgroup-list'), vips);
    $('class-count').textContent = t('groupCount', classes.length);
    $('vip-count').textContent = t('groupCount', vips.length);
  }

  function fillGroupList(ul, groups) {
    ul.innerHTML = '';
    if (!groups.length) {
      const li = document.createElement('li');
      li.className = 'group-empty';
      li.textContent = t('noneYet');
      ul.appendChild(li);
      return;
    }
    groups.forEach((g) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'group-row';
      const sw = document.createElement('span');
      sw.className = 'seat taken group-seat';
      sw.style.setProperty('--seat-color', g.color);
      sw.style.setProperty('--seat-ink', Hall.textOn(g.color));
      sw.textContent = g.id;
      const text = document.createElement('span');
      text.className = 'group-text';
      const nm = document.createElement('span');
      nm.className = 'group-name';
      nm.textContent = g.name;
      const code = document.createElement('span');
      code.className = 'group-code';
      code.textContent = g.id;
      text.append(nm, code);
      const chev = document.createElement('span');
      chev.className = 'group-chev';
      chev.innerHTML = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
      b.append(sw, text, chev);
      b.addEventListener('click', () => openGroupSheet(g));
      li.appendChild(b);
      ul.appendChild(li);
    });
  }

  function openGroupSheet(group, kind, onSaved) {
    editingGroup = group || null;
    afterGroupSave = onSaved || null;
    groupKind = group ? group.kind : kind || 'class';
    const used = new Set(Hall.getGroups().map((g) => g.color));
    groupColor = group ? group.color : groupKind === 'vip' ? '#c9a227' : PALETTE.find((c) => !used.has(c)) || PALETTE[8];
    $('gm-title').textContent = group ? group.name : groupKind === 'vip' ? t('newVip') : t('newClass');
    $('gm-code').value = group ? group.id : groupKind === 'vip' ? 'VIP-' : '';
    $('gm-code').disabled = !!group;
    $('gm-name').value = group ? group.name : '';
    $('gm-error').textContent = '';
    $('gm-delete').hidden = !group;
    renderGroupSheet();
    openModal('group-modal');
    setTimeout(() => (group ? $('gm-name') : $('gm-code')).focus(), 80);
  }

  function renderGroupSheet() {
    document.querySelectorAll('#gm-kind button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === groupKind)));
    const sw = $('gm-swatches');
    sw.innerHTML = '';
    const colors = PALETTE.includes(groupColor) ? PALETTE : [...PALETTE, groupColor];
    colors.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.style.background = c;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(c === groupColor));
      b.setAttribute('aria-label', c);
      b.addEventListener('click', () => { groupColor = c; renderGroupSheet(); });
      sw.appendChild(b);
    });
    const custom = document.createElement('label');
    custom.className = 'swatch swatch-custom';
    custom.title = t('customColor');
    const input = document.createElement('input');
    input.type = 'color';
    input.value = groupColor;
    input.setAttribute('aria-label', t('customColor'));
    input.addEventListener('change', () => { groupColor = input.value.toLowerCase(); renderGroupSheet(); });
    custom.appendChild(input);
    sw.appendChild(custom);
    updateGroupPreview();
  }

  function updateGroupPreview() {
    const p = $('gm-preview');
    p.style.setProperty('--seat-color', groupColor);
    p.style.setProperty('--seat-ink', Hall.textOn(groupColor));
    p.classList.toggle('vip', groupKind === 'vip');
    $('gm-preview-text').textContent = $('gm-code').value.trim() || '7A';
  }

  document.querySelectorAll('#gm-kind button').forEach((b) =>
    b.addEventListener('click', () => {
      groupKind = b.dataset.kind;
      if (!editingGroup) {
        $('gm-title').textContent = groupKind === 'vip' ? t('newVip') : t('newClass');
        if (groupKind === 'vip' && !$('gm-code').value) $('gm-code').value = 'VIP-';
        if (groupKind === 'class' && $('gm-code').value === 'VIP-') $('gm-code').value = '';
      }
      renderGroupSheet();
    }),
  );
  $('gm-code').addEventListener('input', updateGroupPreview);

  $('group-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('gm-error').textContent = '';
    const body = { name: $('gm-name').value.trim(), color: groupColor, kind: groupKind };
    try {
      let saved;
      if (editingGroup) {
        saved = (await DB.updateGroup(editingGroup.id, body)).group;
      } else {
        saved = (await DB.createGroup({ ...body, id: $('gm-code').value.trim() })).group;
      }
      closeModal('group-modal');
      toast(t('groupSaved', saved.name));
      await groupsChanged();
      if (afterGroupSave) afterGroupSave(saved);
    } catch (err) {
      $('gm-error').textContent = err.message;
    }
  });

  $('gm-delete').addEventListener('click', async () => {
    const g = editingGroup;
    if (!g || !confirm(t('confirmDeleteGroup', g.name))) return;
    try {
      await DB.deleteGroup(g.id);
      closeModal('group-modal');
      await groupsChanged();
    } catch (err) {
      $('gm-error').textContent = err.message;
    }
  });

  async function groupsChanged() {
    await loadGroups();
    if (!$('view-groups').hidden) renderGroups();
    if (!$('view-editor').hidden) {
      populateClassSelects();
      renderEditor();
    }
  }

  $('btn-add-class').addEventListener('click', () => openGroupSheet(null, 'class'));
  $('btn-add-vip').addEventListener('click', () => openGroupSheet(null, 'vip'));

  /* ================================================================ */
  /* Teacher dashboard                                                */
  /* ================================================================ */

  async function showDashboard() {
    document.title = 'Teacher · CAMC Seating';
    $('greeting').textContent = me.name;
    show('view-dashboard');
    const data = await DB.listEvents();
    events = data.events;
    renderDashboard();
  }

  function renderDashboard() {
    const q = $('dash-search').value.trim().toLowerCase();
    const list = $('dash-list');
    list.innerHTML = '';

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'event-card new';
    add.innerHTML = '<span class="plus"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></span>';
    const addLabel = document.createElement('span');
    addLabel.textContent = t('newEvent');
    add.appendChild(addLabel);
    add.addEventListener('click', openNewEvent);
    list.appendChild(add);

    events
      .filter((e) => !q || e.name.toLowerCase().includes(q))
      .forEach((e) => {
        const a = document.createElement('a');
        a.className = 'event-card';
        a.href = `#/event/${e.id}`;
        const top = document.createElement('div');
        const date = document.createElement('div');
        date.className = 'date';
        date.textContent = e.date ? formatDate(e.date) : `${t('updated')} ${formatDate(e.updatedAt)}`;
        const name = document.createElement('h2');
        name.className = 'name';
        name.textContent = e.name;
        const by = document.createElement('div');
        by.className = 'tiny muted';
        by.style.marginTop = '6px';
        by.textContent = `${t('updated')} ${formatDate(e.updatedAt, true)}${e.updatedBy ? ' · ' + e.updatedBy : ''}`;
        top.append(date, name, by);
        const meta = document.createElement('div');
        meta.className = 'meta';
        const count = document.createElement('div');
        count.className = 'count';
        count.textContent = e.allocated;
        const small = document.createElement('small');
        small.textContent = t('seatsAssigned');
        count.appendChild(small);
        const chev = document.createElement('span');
        chev.className = 'chev';
        chev.innerHTML = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
        meta.append(count, chev);
        a.append(top, meta);
        list.appendChild(a);
      });

    if (!events.length) {
      const p = document.createElement('p');
      p.className = 'muted';
      p.style.alignSelf = 'center';
      p.textContent = t('emptyEvents');
      list.appendChild(p);
    }
  }
  $('dash-search').addEventListener('input', renderDashboard);

  function openNewEvent() {
    $('ne-name').value = '';
    $('ne-date').value = '';
    $('ne-error').textContent = '';
    openModal('new-modal');
  }

  $('new-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('ne-name').value.trim();
    if (!name) { $('ne-error').textContent = t('newEventPrompt'); return; }
    try {
      const { event } = await DB.createEvent({ name, date: $('ne-date').value, ...Hall.emptyLayout() });
      closeModal('new-modal');
      location.hash = `#/event/${event.id}`;
    } catch (err) {
      $('ne-error').textContent = err.message;
    }
  });

  /* ================================================================ */
  /* Editor                                                           */
  /* ================================================================ */

  async function openEditor(id) {
    if (ev && ev.id === id && !$('view-editor').hidden) return;
    $('loading').hidden = false;
    VIEWS.forEach((v) => ($(v).hidden = true));
    try {
      const [{ event }] = await Promise.all([DB.getEvent(id), loadGroups()]);
      ev = { id: event.id, name: event.name, date: event.date || '' };
      layout = Hall.normalize(JSON.parse(JSON.stringify(event)));
      layout = { seatData: layout.seatData, extraSeatList: layout.extraSeatList, balconySeatList: layout.balconySeatList, walkwaySeatList: layout.walkwaySeatList };
      undoStack = [];
      dirty = false;
      $('ed-name').value = ev.name;
      $('ed-date').value = ev.date;
      $('ed-search').value = '';
      $('ed-public').href = `../?event=${encodeURIComponent(ev.id)}`;
      document.title = `${ev.name} · CAMC Seating`;
      show('view-editor');
      populateClassSelects();
      renderEditor();
      autoFit();
    } catch (err) {
      toast(err.message, 'error');
      location.hash = '#/';
    }
  }

  function snapshot() {
    undoStack.push(JSON.stringify(layout));
    if (undoStack.length > 40) undoStack.shift();
    markDirty();
  }

  function markDirty() {
    dirty = true;
    updateStatus();
  }

  function updateStatus() {
    const s = $('ed-status');
    s.classList.toggle('dirty', dirty);
    s.textContent = saving ? t('saving') : dirty ? t('unsaved') : t('saved');
    $('ed-undo').disabled = undoStack.length === 0;
    $('ed-save').disabled = saving || !dirty;
  }

  function undo() {
    if (!undoStack.length) return;
    layout = JSON.parse(undoStack.pop());
    markDirty();
    renderEditor();
  }

  async function save() {
    if (!ev || saving) return;
    const name = $('ed-name').value.trim();
    if (!name) { $('ed-name').focus(); return; }
    saving = true;
    updateStatus();
    try {
      await DB.updateEvent(ev.id, { name, date: $('ed-date').value, ...layout });
      ev.name = name;
      ev.date = $('ed-date').value;
      document.title = `${ev.name} · CAMC Seating`;
      dirty = false;
      toast(t('saved'));
    } catch (err) {
      toast(err.message, 'error');
      if (err.status === 401) { me = null; route(); }
    } finally {
      saving = false;
      updateStatus();
    }
  }

  function renderEditor() {
    const s = Hall.stats(layout);
    $('ed-total').textContent = s.total;
    $('ed-alloc').textContent = s.allocated;
    $('ed-remain').textContent = s.remaining;
    $('ed-rate').textContent = s.rate + '%';
    $('ed-meter').style.width = s.rate + '%';

    Hall.render($('ed-hall'), layout, {
      editable: true,
      t,
      onSeatClick: openSeat,
      onSwap: swapSeats,
      onAdd: addSeat,
    });
    $('ed-hall').classList.toggle('show-classes', showClasses);
    const before = window.scrollY;
    Hall.highlight($('ed-hall'), layout, $('ed-search').value);
    window.scrollTo(0, before);
    renderLegend();
    renderVipPanel();
    updateStatus();
  }

  function renderVipPanel() {
    const list = $('ed-vip-list');
    list.innerHTML = '';
    const vips = Object.entries(layout.seatData)
      .map(([seatId, raw]) => ({ seatId, ...Hall.seatInfo(raw) }))
      .filter((v) => v.vip)
      .sort((a, b) => a.seatId.localeCompare(b.seatId, undefined, { numeric: true }));
    $('ed-no-vips').hidden = vips.length > 0;
    vips.forEach((v) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'vip-item';
      const av = document.createElement('span');
      av.className = 'vip-avatar';
      av.style.setProperty('--vip-color', v.color);
      if (v.photoUrl) {
        const img = document.createElement('img');
        img.src = v.photoUrl;
        img.alt = '';
        av.appendChild(img);
      } else {
        av.textContent = (v.personName || v.name).trim().slice(0, 1).toUpperCase();
      }
      const text = document.createElement('span');
      text.className = 'vip-text';
      const nm = document.createElement('span');
      nm.className = 'vip-name';
      nm.textContent = v.personName || t('vipSeat');
      const grp = document.createElement('span');
      grp.className = 'vip-group';
      grp.textContent = v.name;
      text.append(nm, grp);
      const seat = document.createElement('span');
      seat.className = 'vip-seat';
      seat.textContent = v.seatId;
      b.append(av, text, seat);
      b.addEventListener('click', () => openSeat(v.seatId));
      list.appendChild(b);
    });
  }

  function renderLegend() {
    const counts = {};
    Object.values(layout.seatData).forEach((d) => { counts[d.classId] = (counts[d.classId] || 0) + 1; });
    const legend = $('ed-legend');
    legend.innerHTML = '';
    const q = $('ed-search').value.trim();
    [...Hall.getGroups('vip'), ...Hall.getGroups('class')].forEach((c) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (c.kind === 'vip' ? ' chip-vip' : '');
      chip.title = c.name;
      chip.setAttribute('aria-pressed', String(q === c.id));
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = c.color;
      chip.append(dot, document.createTextNode(c.id));
      if (counts[c.id]) {
        const n = document.createElement('span');
        n.className = 'n';
        n.textContent = counts[c.id];
        chip.appendChild(n);
      }
      chip.addEventListener('click', () => {
        $('ed-search').value = q === c.id ? '' : c.id;
        $('al-class').value = c.id;
        renderLegend();
        Hall.highlight($('ed-hall'), layout, $('ed-search').value);
      });
      legend.appendChild(chip);
    });
  }

  function populateClassSelects() {
    ['al-class', 'sm-class'].forEach((id) => {
      const sel = $(id);
      const prev = sel.value;
      sel.innerHTML = '';
      [['class', t('classes')], ['vip', t('vipGroups')]].forEach(([kind, label]) => {
        const groups = Hall.getGroups(kind);
        if (!groups.length) return;
        const og = document.createElement('optgroup');
        og.label = label;
        groups.forEach((c) => {
          const o = document.createElement('option');
          o.value = c.id;
          o.textContent = kind === 'vip' ? `★ ${c.name}` : c.name;
          og.appendChild(o);
        });
        sel.appendChild(og);
      });
      if (prev && Hall.classById(prev)) sel.value = prev;
    });
  }

  $('ed-add-group').addEventListener('click', () =>
    openGroupSheet(null, 'class', (g) => {
      $('al-class').value = g.id;
    }),
  );

  function swapSeats(from, to) {
    snapshot();
    const a = layout.seatData[from];
    const b = layout.seatData[to];
    delete layout.seatData[from];
    delete layout.seatData[to];
    if (b) layout.seatData[from] = b;
    if (a) layout.seatData[to] = a;
    renderEditor();
  }

  function nextNum(list, prefix) {
    let max = 0;
    list.forEach((id) => { const n = parseInt(id.slice(prefix.length), 10); if (n > max) max = n; });
    return max + 1;
  }

  function addSeat(target) {
    snapshot();
    if (target === 'BAL_L') layout.balconySeatList.L.push('LBAL' + nextNum(layout.balconySeatList.L, 'LBAL'));
    else if (target === 'BAL_R') layout.balconySeatList.R.push('RBAL' + nextNum(layout.balconySeatList.R, 'RBAL'));
    else if (target === 'EXTRA') layout.extraSeatList.push('EX' + nextNum(layout.extraSeatList, 'EX'));
    else {
      const [row, zone] = target.split('-');
      const cols = zone === 'L' ? Hall.LEFT_COLS : zone === 'R' ? Hall.RIGHT_COLS : Hall.CENTER_COLS;
      const free = cols.find((c) => !layout.walkwaySeatList.includes(`${row}-${c}`));
      if (free == null) { undoStack.pop(); return; }
      layout.walkwaySeatList.push(`${row}-${free}`);
    }
    renderEditor();
  }

  /* ---------------- Auto allocate ---------------- */

  function allocate() {
    const classId = $('al-class').value;
    const count = parseInt($('al-count').value, 10);
    const mode = $('al-mode').value;
    const buffer = $('al-buffer').checked;
    const cls = Hall.classById(classId);
    if (!cls || !(count > 0)) { toast(t('invalidCount'), 'error'); $('al-count').focus(); return; }

    const seq = [];
    const free = (r, c) => !Hall.isBooth(r, c) && !layout.seatData[r + c];

    if (mode === 'HORIZ_1_TO_29' || mode === 'HORIZ_29_TO_1') {
      Hall.ROWS.forEach((r) => {
        for (let i = 1; i <= Hall.TOTAL_COLS; i++) {
          const c = mode === 'HORIZ_1_TO_29' ? i : Hall.TOTAL_COLS + 1 - i;
          if (free(r, c)) seq.push(r + c);
        }
      });
    } else {
      const zones = {
        RIGHT: [1, 2, 3, 4, 5, 6, 7],
        CENTER: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22],
        LEFT: [23, 24, 25, 26, 27, 28, 29],
      };
      const order = mode === 'ZONE_RIGHT_VER' ? ['RIGHT', 'CENTER', 'LEFT'] : mode === 'ZONE_CENTER_VER' ? ['CENTER', 'RIGHT', 'LEFT'] : ['LEFT', 'CENTER', 'RIGHT'];
      order.forEach((z) => Hall.ROWS.forEach((r) => zones[z].forEach((c) => { if (free(r, c)) seq.push(r + c); })));
    }
    Hall.dynamicSeatIds(layout).forEach((id) => { if (!layout.seatData[id]) seq.push(id); });

    if (buffer && seq.length && Object.keys(layout.seatData).length) seq.shift();

    if (seq.length < count) { toast(t('notEnough', seq.length), 'error'); return; }

    snapshot();
    seq.slice(0, count).forEach((id) => {
      layout.seatData[id] = { classId: cls.id, className: cls.name, color: cls.color, personName: '', photoUrl: null };
    });
    $('al-count').value = '';
    renderEditor();
  }

  /* ---------------- Seat sheet ---------------- */

  function isDynamic(id) {
    return /^(EX|LBAL|RBAL|W[12]-)/.test(id);
  }

  function openSeat(seatId) {
    Hall.hidePop();
    editingSeat = seatId;
    const d = layout.seatData[seatId];
    $('sm-title').textContent = `${t('editSeat')} ${seatId}`;
    $('sm-sub').textContent = d ? Hall.seatInfo(d).name : t('available');
    $('sm-class').value = d && Hall.classById(d.classId) ? d.classId : $('al-class').value;
    $('sm-person').value = d ? d.personName || '' : '';
    tempPhoto = d ? d.photoUrl || null : null;
    $('sm-clear').hidden = !d;
    $('sm-remove').hidden = !isDynamic(seatId);
    $('sm-photo').value = '';
    updateSwatch();
    updatePhotoPreview();
    openModal('seat-modal');
  }

  function updateSwatch() {
    const c = Hall.classById($('sm-class').value);
    $('sm-swatch').style.background = c ? c.color : 'transparent';
  }
  $('sm-class').addEventListener('change', updateSwatch);

  function updatePhotoPreview() {
    const p = $('sm-photo-preview');
    const existing = p.querySelector('img');
    if (existing) existing.remove();
    p.querySelector('svg').style.display = tempPhoto ? 'none' : '';
    if (tempPhoto) {
      const img = document.createElement('img');
      img.src = tempPhoto;
      img.alt = '';
      p.appendChild(img);
    }
    $('sm-photo-clear').hidden = !tempPhoto;
  }

  $('sm-photo-btn').addEventListener('click', () => $('sm-photo').click());
  $('sm-photo-clear').addEventListener('click', () => { tempPhoto = null; updatePhotoPreview(); });
  $('sm-photo').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 160;
        let w = img.width, h = img.height;
        if (w > h && w > max) { h *= max / w; w = max; } else if (h > max) { w *= max / h; h = max; }
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(w);
        canvas.height = Math.round(h);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        tempPhoto = canvas.toDataURL('image/jpeg', 0.85);
        updatePhotoPreview();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  $('seat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!editingSeat) return;
    const cls = Hall.classById($('sm-class').value);
    if (!cls) return;
    snapshot();
    layout.seatData[editingSeat] = {
      classId: cls.id,
      className: cls.name,
      color: cls.color,
      personName: $('sm-person').value.trim(),
      photoUrl: tempPhoto,
    };
    closeModal('seat-modal');
    renderEditor();
  });

  $('sm-clear').addEventListener('click', () => {
    snapshot();
    delete layout.seatData[editingSeat];
    closeModal('seat-modal');
    renderEditor();
  });

  $('sm-remove').addEventListener('click', () => {
    const id = editingSeat;
    if (!confirm(t('confirmRemoveSeat', id))) return;
    snapshot();
    delete layout.seatData[id];
    layout.extraSeatList = layout.extraSeatList.filter((x) => x !== id);
    layout.balconySeatList.L = layout.balconySeatList.L.filter((x) => x !== id);
    layout.balconySeatList.R = layout.balconySeatList.R.filter((x) => x !== id);
    layout.walkwaySeatList = layout.walkwaySeatList.filter((x) => x !== id);
    closeModal('seat-modal');
    renderEditor();
  });

  /* ---------------- Event actions ---------------- */

  $('ed-save').addEventListener('click', save);
  $('ed-undo').addEventListener('click', undo);
  $('al-run').addEventListener('click', allocate);
  $('al-count').addEventListener('keydown', (e) => { if (e.key === 'Enter') allocate(); });
  $('ed-name').addEventListener('input', markDirty);
  $('ed-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
  $('ed-date').addEventListener('change', markDirty);
  $('ed-search').addEventListener('input', debounce(() => { renderLegend(); Hall.highlight($('ed-hall'), layout, $('ed-search').value); }, 150));
  $('ed-zoom').addEventListener('input', (e) => {
    userZoom = true;
    $('ed-hall-card').style.setProperty('--seat', e.target.value + 'px');
  });
  window.addEventListener('resize', debounce(autoFit, 150));

  function setLabels(classes) {
    showClasses = classes;
    $('ed-lbl-num').setAttribute('aria-pressed', String(!classes));
    $('ed-lbl-cls').setAttribute('aria-pressed', String(classes));
    $('ed-hall').classList.toggle('show-classes', classes);
  }
  $('ed-lbl-num').addEventListener('click', () => setLabels(false));
  $('ed-lbl-cls').addEventListener('click', () => setLabels(true));

  $('ed-clear').addEventListener('click', () => {
    if (!confirm(t('confirmClear'))) return;
    snapshot();
    layout = Hall.emptyLayout();
    renderEditor();
  });

  $('ed-delete').addEventListener('click', async () => {
    if (!confirm(t('confirmDelete', ev.name))) return;
    try {
      await DB.deleteEvent(ev.id);
      dirty = false;
      ev = null;
      location.hash = '#/';
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  $('ed-export').addEventListener('click', () => {
    const data = { eventName: $('ed-name').value.trim() || ev.name, date: $('ed-date').value, ...layout, exportDate: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SeatLayout_${data.eventName.replace(/[^\w฀-๿-]+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  $('ed-import').addEventListener('click', () => $('ed-import-file').click());
  $('ed-import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || typeof data.seatData !== 'object') throw new Error('bad');
        snapshot();
        const n = Hall.normalize(data);
        layout = { seatData: n.seatData, extraSeatList: n.extraSeatList, balconySeatList: n.balconySeatList, walkwaySeatList: n.walkwaySeatList };
        renderEditor();
        toast(t('importDone', data.eventName || file.name));
      } catch {
        toast(t('importBad'), 'error');
      }
    };
    reader.readAsText(file);
  });

  $('ed-back').addEventListener('click', (e) => {
    if (dirty && !confirm(t('confirmLeave'))) { e.preventDefault(); return; }
    dirty = false;
  });

  document.addEventListener('keydown', (e) => {
    if ($('view-editor').hidden) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'z' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) {
      e.preventDefault();
      undo();
    }
  });

  window.addEventListener('beforeunload', (e) => {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.seat')) Hall.hidePop();
  });

  onLangChange(() => {
    if (!$('view-dashboard').hidden) renderDashboard();
    if (!$('view-editor').hidden) { populateClassSelects(); renderEditor(); }
    if (!$('view-admin').hidden) loadTeachers();
    if (!$('view-groups').hidden) renderGroups();
    if (!$('view-krathongs').hidden) renderKrathongs();
  });

  /* ================================================================ */
  /* Boot                                                             */
  /* ================================================================ */

  // Any request that finds the session has expired sends the teacher back to sign in.
  window.addEventListener('unhandledrejection', (e) => {
    if (e.reason && e.reason.status === 401 && me) {
      me = null;
      dirty = false;
      toast(e.reason.message, 'error');
      route();
    }
  });

  applyI18n();
  if (!DB.configured) {
    route();
    $('si-error').textContent = t('notConfigured');
    $('signin-form').querySelectorAll('input, button').forEach((n) => (n.disabled = true));
  } else {
    DB.me()
      .then((d) => { me = d.user; })
      .catch(() => { me = null; })
      .finally(route);
  }
})();
