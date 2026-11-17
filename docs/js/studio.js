/* Studio: teachers create and run live voting, message walls, awards and the run of show. */
(function () {
  'use strict';
  const { t, applyI18n, onLangChange, formatDate, toast } = window.CAMC;
  const { API, h, qrSvg, siteUrl, prettyUrl } = window.Studio;
  const $ = (id) => document.getElementById(id);

  const ICONS = {
    up: '<path d="M18 15l-6-6-6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    open: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    prev: '<path d="M15 18l-6-6 6-6"/>',
    next: '<path d="M9 6l6 6-6 6"/>',
    start: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/>',
  };
  // The title as currently typed (so saving another field never overwrites a new title).
  const curTitle = (fallback) => {
    const el = document.querySelector('#detail .title-input');
    return el && el.value.trim() ? el.value : fallback;
  };
  const icon = (name) => h('span', { html: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>` }).firstChild;

  const TABS = {
    vote: { list: 'rooms', kind: 'room', key: 'code', newLabel: 'newRoom' },
    walls: { list: 'walls', kind: 'wall', key: 'code', newLabel: 'newWall' },
    awards: { list: 'award_shows', kind: 'award_show', key: 'id', newLabel: 'newAwardShow' },
    run: { list: 'run_shows', kind: 'run_show', key: 'id', newLabel: 'newRunShow' },
  };
  const THEMES = ['general', 'waikhru', 'songkran', 'graduation', 'newyear', 'christmas'];
  const THEME_KEY = { general: 'themeGeneral', waikhru: 'themeWaikhru', songkran: 'themeSongkran', graduation: 'themeGraduation', newyear: 'themeNewyear', christmas: 'themeChristmas' };

  let me = null;
  let tab = 'vote';
  let selected = null;
  let items = [];
  let editing = false;     // an inline form is open: don't refresh underneath it
  let timerHandle = null;

  /* ================================================================ */
  /* Sign in                                                          */
  /* ================================================================ */

  function initials(name) {
    return (name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  }

  function showView(id) {
    $('loading').hidden = true;
    ['view-signin', 'view-app'].forEach((v) => ($(v).hidden = v !== id));
    $('user-chip').hidden = !me;
    $('btn-signout').hidden = !me;
    if (me) {
      $('user-avatar').textContent = initials(me.name);
      $('user-name').textContent = me.name;
    }
  }

  $('signin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('si-error').textContent = '';
    try {
      const { user } = await DB.login($('si-user').value.trim(), $('si-pass').value);
      $('si-pass').value = '';
      me = user;
      route();
    } catch (err) {
      $('si-error').textContent = err.message;
    }
  });

  $('btn-signout').addEventListener('click', async () => {
    await DB.logout();
    me = null;
    route();
  });

  /* ================================================================ */
  /* Routing and list                                                 */
  /* ================================================================ */

  function parseHash() {
    const [, tb, id] = (location.hash.match(/^#\/(vote|walls|awards|run)(?:\/([\w-]+))?/) || []);
    return { tab: tb || 'vote', id: id || null };
  }

  async function route() {
    if (!me) {
      showView('view-signin');
      $('si-error').textContent = '';
      return;
    }
    if (me.role !== 'teacher') {
      showView('view-signin');
      $('si-error').textContent = t('adminNoStudio');
      return;
    }
    const r = parseHash();
    tab = r.tab;
    selected = r.id;
    editing = false;
    showView('view-app');
    document.querySelectorAll('#tabs a').forEach((a) => a.setAttribute('aria-current', a.dataset.tab === tab ? 'page' : 'false'));
    $('btn-new-label').textContent = t(TABS[tab].newLabel);
    await refresh(true);
  }

  window.addEventListener('hashchange', () => { if (me) route(); });

  async function refresh(full) {
    try {
      items = await API.list(TABS[tab].list);
      renderSide();
      if (full || !isBusy()) await renderDetail();
    } catch (err) {
      handleError(err);
    }
  }

  function isBusy() {
    const a = document.activeElement;
    return editing || (a && $('detail').contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName));
  }

  function handleError(err) {
    if (err.status === 401) { me = null; route(); return; }
    toast(err.message, 'error');
  }

  function renderSide() {
    const list = $('side-list');
    list.innerHTML = '';
    if (!items.length) {
      list.appendChild(h('li', { class: 'side-empty' }, t('emptyList')));
      return;
    }
    const key = TABS[tab].key;
    items.forEach((it) => {
      const meta = [];
      if (tab === 'vote') {
        meta.push(h('span', {}, it.code));
        if (it.mode !== 'idle') meta.push(h('span', { class: 'pill live' }, t('onScreen')));
        if (it.pending) meta.push(h('span', { class: 'pill warn' }, t('pendingN', it.pending)));
      } else if (tab === 'walls') {
        meta.push(h('span', {}, `${it.code} · ${t(THEME_KEY[it.theme])}`));
        if (it.pending) meta.push(h('span', { class: 'pill warn' }, t('pendingN', it.pending)));
      } else {
        meta.push(h('span', {}, `${it.currentIndex >= 0 ? Math.min(it.currentIndex + 1, it.count) : 0} / ${it.count}`));
        if (tab === 'run' && it.date) meta.push(h('span', {}, formatDate(it.date)));
      }
      list.appendChild(h('li', {},
        h('button', { type: 'button', class: 'side-item', 'aria-current': String(it[key] === selected), onclick: () => { location.hash = `#/${tab}/${it[key]}`; } },
          h('span', { class: 't' }, it.title), h('span', { class: 'm' }, meta))));
    });
  }

  $('btn-new').addEventListener('click', async () => {
    const title = { vote: 'Assembly', walls: 'Message Wall', awards: 'Prize Giving', run: 'Show' }[tab] + ' ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    try {
      const saved = await API.save(TABS[tab].kind, { title });
      location.hash = `#/${tab}/${saved[TABS[tab].key]}`;
    } catch (err) {
      handleError(err);
    }
  });

  /* ================================================================ */
  /* Shared bits                                                      */
  /* ================================================================ */

  function card(...children) {
    return h('section', { class: 'card card-pad' }, children);
  }

  function sectionHead(title, ...actions) {
    return h('div', { class: 'section-h' }, h('h3', {}, title), h('div', { class: 'item-actions', style: { marginTop: 0 } }, actions));
  }

  function btn(label, onclick, cls = 'btn btn-secondary btn-sm', extra = {}) {
    return h('button', { type: 'button', class: cls, onclick: async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      try { await onclick(); } catch (err) { handleError(err); } finally { b.disabled = false; }
    }, ...extra }, label);
  }

  function toggle(label, checked, onchange) {
    const input = h('input', { type: 'checkbox', role: 'switch' });
    input.checked = !!checked;
    input.addEventListener('change', async () => {
      try { await onchange(input.checked); } catch (err) { input.checked = !input.checked; handleError(err); }
    });
    return h('label', { class: 'switch' }, input, h('span', {}, label));
  }

  /** Text input that saves when you leave it (or press Enter). */
  function field(value, onsave, attrs = {}) {
    const input = h(attrs.multiline ? 'textarea' : 'input', { class: attrs.class || 'input input-sm', maxlength: attrs.max || 200, placeholder: attrs.placeholder || '', 'aria-label': attrs.placeholder || '', type: attrs.type || null, min: attrs.min, max: attrs.maxNum, rows: attrs.rows });
    input.value = value == null ? '' : value;
    let last = input.value;
    const commit = async () => {
      if (input.value === last) return;
      try {
        await onsave(input.value);
        last = input.value;
        toast(t('savedShort'));
      } catch (err) {
        handleError(err);
      }
    };
    input.addEventListener('change', commit);
    if (!attrs.multiline) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
    return input;
  }

  function titleRow(value, onsave, ...actions) {
    const input = field(value, onsave, { class: 'title-input', max: 120, placeholder: t('titleLabel') });
    return h('div', { class: 'detail-head' }, input, actions);
  }

  function shareCard(studentUrl, code, screenUrl) {
    const full = code ? `${studentUrl}?code=${code}` : studentUrl;
    return card(h('div', { class: 'share' },
      code ? h('div', { class: 'qr-mini', html: qrSvg(full) }) : null,
      h('div', { class: 'share-text' },
        h('span', { class: 'muted small' }, t('studentLink')),
        h('span', { class: 'share-url' }, prettyUrl(studentUrl)),
        code ? h('span', { class: 'share-code' }, code) : null),
      h('div', { class: 'share-actions' },
        h('a', { class: 'btn btn-sm', href: screenUrl, target: '_blank', rel: 'noopener' }, icon('open'), t('openScreen')),
        code ? btn([icon('copy'), t('copyLink')], async () => {
          await navigator.clipboard.writeText(full);
          toast(t('copied'));
        }) : null)));
  }

  function deleteButton(name, kind, id) {
    return btn([icon('trash'), t('deleteThis')], async () => {
      if (!confirm(t('confirmDeleteX', name))) return;
      await API.remove(kind, id);
      location.hash = `#/${tab}`;
    }, 'btn btn-danger btn-sm');
  }

  /**
   * Saves one row (an award or a run-of-show item). The local copy is updated
   * first and saves run one at a time, so quick edits to several fields never
   * overwrite each other with older values.
   */
  function rowSaver(obj, kind) {
    let chain = Promise.resolve();
    return (patch) => {
      Object.assign(obj, patch);
      const run = chain.then(() => API.save(kind, { ...obj }));
      chain = run.catch(() => {});
      return run;
    };
  }

  function orderButtons(list, index, kind, after) {
    const move = async (dir) => {
      const ids = list.map((x) => x.id);
      const j = index + dir;
      [ids[index], ids[j]] = [ids[j], ids[index]];
      await API.reorder(kind, ids);
      await after();
    };
    return h('div', { class: 'order-btns' },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('moveUp'), disabled: index === 0, onclick: () => move(-1).catch(handleError) }, icon('up')),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('moveDown'), disabled: index === list.length - 1, onclick: () => move(1).catch(handleError) }, icon('down')));
  }

  /* ================================================================ */
  /* Detail                                                           */
  /* ================================================================ */

  async function renderDetail() {
    clearInterval(timerHandle);
    const box = $('detail');
    const item = items.find((x) => x[TABS[tab].key] === selected);
    if (!item) {
      box.replaceChildren(card(h('p', { class: 'muted', style: { margin: 0 } }, t('pickOne'))));
      return;
    }
    let content;
    if (tab === 'vote') content = await voteDetail(item);
    else if (tab === 'walls') content = await wallDetail(item);
    else if (tab === 'awards') content = await awardsDetail(item);
    else content = await runDetail(item);
    if (isBusy() && box.childElementCount) return; // the teacher started typing while we loaded
    const y = window.scrollY;
    box.replaceChildren(...content);
    window.scrollTo(0, y);
  }

  /* ---------------- Voting & Q&A ---------------- */

  async function voteDetail(room) {
    const [polls, questions] = await Promise.all([API.list('polls', room.code), API.list('questions', room.code)]);
    const code = room.code;
    const reload = () => refresh(true);

    const modes = h('div', { class: 'segmented' }, ['idle', 'poll', 'results', 'qa'].map((m) =>
      h('button', {
        type: 'button', 'aria-pressed': String(room.mode === m),
        disabled: (m === 'poll' || m === 'results') && !room.activePoll,
        onclick: () => API.set('room', code, { mode: m }).then(reload).catch(handleError),
      }, t({ idle: 'modeIdle', poll: 'modePoll', results: 'modeResults', qa: 'modeQa' }[m]))));

    const pollList = h('ul', { class: 'item-list' });
    polls.forEach((p, i) => {
      const live = room.activePoll === p.id && room.mode !== 'idle' && room.mode !== 'qa';
      const stateLabel = { draft: t('stDraft'), open: t('stOpen'), closed: t('stClosed') }[p.state];
      const bars = h('div', { class: 'mini-bars' }, p.options.map((o, k) => {
        const n = p.counts[k] || 0;
        const pct = p.total ? Math.round((n / p.total) * 100) : 0;
        return h('div', { class: 'mini-bar' }, h('span', {}, o), h('div', { class: 'track' }, h('i', { style: { width: pct + '%' } })), h('span', {}, String(n)));
      }));
      const li = h('li', { class: 'item' + (live ? ' is-live' : '') },
        h('div', { class: 'item-top' },
          orderButtons(polls, i, 'polls', reload),
          h('div', { class: 'grow' },
            h('div', { class: 'item-title' }, p.question),
            h('div', { class: 'item-sub' },
              h('span', { class: 'pill' + (p.state === 'open' ? ' ok' : '') }, stateLabel), ' ',
              live ? h('span', { class: 'pill live' }, t('onScreen')) : null, ' ', t('votes', p.total)),
            bars)),
        h('div', { class: 'item-actions' },
          p.state !== 'open' ? btn(t('startVoting'), async () => {
            await API.set('poll', p.id, { state: 'open' });
            await API.set('room', code, { activePoll: p.id, mode: 'poll' });
            await reload();
          }, 'btn btn-sm') : btn(t('closeVoting'), async () => { await API.set('poll', p.id, { state: 'closed' }); await reload(); }, 'btn btn-sm'),
          btn(t('showResults'), async () => { await API.set('room', code, { activePoll: p.id, mode: 'results' }); await reload(); }),
          btn(t('resetVotes'), async () => {
            if (!confirm(t('confirmReset'))) return;
            await API.set('poll', p.id, { state: p.state, reset: true });
            await reload();
          }),
          btn(t('edit'), async () => { li.replaceWith(pollForm(code, p, reload)); }),
          btn(t('deleteThis'), async () => {
            if (!confirm(t('confirmDeleteX', p.question))) return;
            await API.remove('poll', p.id);
            await reload();
          }, 'btn btn-danger btn-sm')));
      pollList.appendChild(li);
    });

    const addBtn = btn([icon('plus'), t('addPoll')], async () => {
      addBtn.replaceWith(pollForm(code, null, reload));
    }, 'btn btn-sm');

    const order = { pending: 0, approved: 1, answered: 2, hidden: 3 };
    const qs = questions.slice().sort((a, b) => order[a.status] - order[b.status] || b.upvotes - a.upvotes);
    const qList = h('ul', { class: 'item-list' });
    if (!qs.length) qList.appendChild(h('li', { class: 'muted small' }, t('noQuestions')));
    qs.forEach((q) => {
      const st = { pending: ['stPending', 'warn'], approved: ['stApproved', 'ok'], hidden: ['stHidden', ''], answered: ['stAnswered', ''] }[q.status];
      const setStatus = (s) => API.set('question', q.id, { status: s }).then(reload);
      qList.appendChild(h('li', { class: 'item' },
        h('div', { class: 'item-top' },
          h('div', { class: 'num' }, String(q.upvotes)),
          h('div', { class: 'grow' },
            h('div', { class: 'item-title' }, q.body),
            h('div', { class: 'item-sub' }, h('span', { class: 'pill ' + st[1] }, t(st[0])), ' ', q.name || '', ' · ', formatDate(q.createdAt, true)))),
        h('div', { class: 'item-actions' },
          q.status !== 'approved' ? btn(t('approve'), () => setStatus('approved'), 'btn btn-sm') : null,
          q.status !== 'answered' && q.status !== 'pending' ? btn(t('markAnswered'), () => setStatus('answered')) : null,
          q.status !== 'hidden' ? btn(t('hide'), () => setStatus('hidden')) : null,
          btn(t('deleteThis'), async () => { await API.remove('question', q.id); await reload(); }, 'btn btn-danger btn-sm'))));
    });

    return [
      titleRow(room.title, (v) => API.save('room', { id: code, title: v }).then(() => refresh()), deleteButton(room.title, 'room', code)),
      shareCard(siteUrl('vote/'), code, `../livevote/?code=${code}`),
      card(h('div', { class: 'section-h' }, h('h3', {}, t('screenShows')), modes)),
      card(sectionHead(t('pollsTitle')), pollList, h('div', { style: { marginTop: '12px' } }, addBtn)),
      card(sectionHead(t('qaTitle')),
        h('div', { class: 'toggles' },
          toggle(t('qaOpenLabel'), room.qaOpen, (v) => API.set('room', code, { qaOpen: v }).then(reload)),
          toggle(t('qaModeratedLabel'), room.qaModerated, (v) => API.set('room', code, { qaModerated: v }).then(reload))),
        qList),
    ];
  }

  function pollForm(code, poll, after) {
    editing = true;
    const q = h('input', { class: 'input', maxlength: 200, placeholder: t('pollQuestion'), 'aria-label': t('pollQuestion') });
    q.value = poll ? poll.question : '';
    const opts = h('div', { class: 'edit-grid' });
    const addOpt = (v) => {
      if (opts.childElementCount >= 6) return;
      const input = h('input', { class: 'input input-sm', maxlength: 80, placeholder: t('optionN', opts.childElementCount + 1) });
      input.value = v || '';
      const row = h('div', { class: 'opt-row' }, input,
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('removePhoto'), onclick: () => { if (opts.childElementCount > 2) row.remove(); } }, icon('x')));
      opts.appendChild(row);
    };
    (poll ? poll.options : ['', '']).forEach(addOpt);
    const err = h('div', { class: 'form-error', style: { textAlign: 'left', margin: 0, minHeight: 0 } });
    const form = h('form', { class: 'item stack-form', novalidate: true },
      h('label', { class: 'label' }, t('pollQuestion')), q,
      h('label', { class: 'label' }, t('pollOptions')), opts,
      h('div', {}, h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => addOpt('') }, icon('plus'), t('addOption'))),
      err,
      h('div', { class: 'form-row-end' },
        h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => { editing = false; after(); } }, t('cancel')),
        h('button', { type: 'submit', class: 'btn btn-sm' }, t('save'))));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const options = [...opts.querySelectorAll('input')].map((i) => i.value.trim()).filter(Boolean);
      try {
        await API.save('poll', { id: poll ? poll.id : null, roomCode: code, question: q.value, options });
        editing = false;
        await after();
      } catch (ex) {
        err.textContent = ex.message;
      }
    });
    // Focus the question, unless the teacher has already clicked into another field.
    setTimeout(() => { if (!form.contains(document.activeElement)) q.focus(); }, 30);
    return form;
  }

  /* ---------------- Message walls ---------------- */

  async function wallDetail(wall) {
    const posts = await API.list('posts', wall.code);
    const code = wall.code;
    const reload = () => refresh(true);
    const theme = h('select', { class: 'select select-sm', 'aria-label': t('theme'), style: { width: 'auto' } },
      THEMES.map((th) => h('option', { value: th }, t(THEME_KEY[th]))));
    theme.value = wall.theme;
    theme.addEventListener('change', () => API.save('wall', { id: code, title: curTitle(wall.title), theme: theme.value }).then(reload).catch(handleError));

    const order = { pending: 0, approved: 1, hidden: 2 };
    const sorted = posts.slice().sort((a, b) => order[a.status] - order[b.status] || b.id - a.id);
    const pending = posts.filter((p) => p.status === 'pending');
    const list = h('ul', { class: 'item-list' });
    if (!sorted.length) list.appendChild(h('li', { class: 'muted small' }, t('wallEmpty')));
    sorted.forEach((p) => {
      const st = { pending: ['stPending', 'warn'], approved: ['stApproved', 'ok'], hidden: ['stHidden', ''] }[p.status];
      const setStatus = (s) => API.set('post', p.id, { status: s }).then(reload);
      list.appendChild(h('li', { class: 'item', style: { borderLeft: `6px solid ${p.color}` } },
        h('div', { class: 'item-title', style: { fontWeight: 500 } }, p.message),
        h('div', { class: 'item-sub' }, h('span', { class: 'pill ' + st[1] }, t(st[0])), ' ', p.name || '', ' · ', formatDate(p.createdAt, true)),
        h('div', { class: 'item-actions' },
          p.status !== 'approved' ? btn(t('approve'), () => setStatus('approved'), 'btn btn-sm') : null,
          p.status !== 'hidden' ? btn(t('hide'), () => setStatus('hidden')) : null,
          btn(t('deleteThis'), async () => { await API.remove('post', p.id); await reload(); }, 'btn btn-danger btn-sm'))));
    });

    return [
      titleRow(wall.title, (v) => API.save('wall', { id: code, title: v, theme: theme.value }).then(() => refresh()), theme, deleteButton(wall.title, 'wall', code)),
      shareCard(siteUrl('wall/'), code, `../livewall/?w=${code}`),
      card(h('div', { class: 'toggles' },
        toggle(t('wallOpenLabel'), wall.open, (v) => API.set('wall', code, { open: v }).then(reload)),
        toggle(t('wallModeratedLabel'), wall.moderated, (v) => API.set('wall', code, { moderated: v }).then(reload)))),
      card(sectionHead(`${t('messagesTitle')} (${posts.length})`,
        pending.length ? btn(`${t('approve')} (${pending.length})`, async () => {
          for (const p of pending) await API.set('post', p.id, { status: 'approved' });
          await reload();
        }, 'btn btn-sm') : null), list),
    ];
  }

  /* ---------------- Awards ---------------- */

  let eventsCache = null;
  const layoutCache = new Map();

  async function awardsDetail(show) {
    const [awards, events] = await Promise.all([
      API.list('awards', show.id),
      eventsCache ? Promise.resolve(eventsCache) : DB.listEvents().then((r) => (eventsCache = r.events)),
    ]);
    const reload = () => refresh(true);
    const id = show.id;

    const eventSel = h('select', { class: 'select select-sm', 'aria-label': t('linkedEvent') },
      h('option', { value: '' }, t('noEvent')), events.map((e) => h('option', { value: e.id }, e.name)));
    eventSel.value = show.eventId || '';
    eventSel.addEventListener('change', () => API.save('award_show', { id, title: curTitle(show.title), eventId: eventSel.value || null }).then(reload).catch(handleError));

    // Presenter controls
    const i = show.currentIndex;
    const cur = awards[i];
    const nxt = awards[i + 1];
    const go = (n) => API.set('award_show', id, { currentIndex: n }).then(reload);
    const presenter = card(
      sectionHead(t('presenting'), h('a', { class: 'btn btn-sm', href: `../awards/?show=${id}`, target: '_blank', rel: 'noopener' }, icon('open'), t('openScreen'))),
      h('div', { class: 'presenter' },
        h('div', { class: 'present-box' }, h('div', { class: 'k' }, t('nowShowing')),
          cur ? [h('div', { class: 'v' }, cur.recipient || '—'), h('div', { class: 's' }, [cur.category, cur.detail].filter(Boolean).join(' · '))]
            : h('div', { class: 's', style: { marginTop: '6px' } }, i < 0 ? t('nothingYet') : '')),
        h('div', { class: 'present-box' }, h('div', { class: 'k' }, t('upNext')),
          nxt ? [h('div', { class: 'v' }, nxt.recipient || '—'), h('div', { class: 's' }, [nxt.category, nxt.detail, nxt.seat ? `${t('awardSeat')} ${nxt.seat}` : ''].filter(Boolean).join(' · '))]
            : h('div', { class: 's', style: { marginTop: '6px' } }, awards.length ? t('allDone') : ''))),
      h('div', { class: 'present-controls' },
        btn([icon('prev'), t('prev')], () => go(i - 1), 'btn btn-secondary', { disabled: i < 0 }),
        btn([t('next'), icon('next')], () => go(i + 1), 'btn', { disabled: i >= awards.length - 1 }),
        btn([icon('start'), t('toStart')], () => go(-1), 'btn btn-ghost', { disabled: i < 0 })),
      await seatMap(show.eventId, nxt));

    const list = h('ul', { class: 'item-list' });
    awards.forEach((a, k) => list.appendChild(awardRow(a, k, awards, reload, k === i)));

    return [
      titleRow(show.title, (v) => API.save('award_show', { id, title: v, eventId: eventSel.value || null }).then(() => refresh()), deleteButton(show.title, 'award_show', id)),
      card(h('div', { class: 'field' }, h('label', {}, t('linkedEvent')), eventSel), h('p', { class: 'muted small', style: { margin: '12px 0 0' } }, t('secretNote'))),
      presenter,
      card(sectionHead(`${t('awardsList')} (${awards.length})`), list,
        h('div', { style: { marginTop: '12px' } }, btn([icon('plus'), t('addAward')], async () => { await API.save('award', { showId: id }); await reload(); }, 'btn btn-sm'))),
    ];
  }

  async function seatMap(eventId, award) {
    if (!eventId) return null;
    if (!award || !award.seat) return h('p', { class: 'muted small', style: { margin: '14px 0 0' } }, award ? t('noSeat') : '');
    try {
      if (!layoutCache.has(eventId)) {
        const [{ event }, { groups }] = await Promise.all([DB.getEvent(eventId), DB.listGroups()]);
        Hall.setGroups(groups);
        layoutCache.set(eventId, event);
      }
      const ev = layoutCache.get(eventId);
      const box = h('div', { class: 'hall-scroll' });
      Hall.render(box, ev, { editable: false, t });
      const wrap = h('div', { class: 'seat-map' }, h('div', { class: 'seat-note' }, t('nextSeat', award.seat)), box);
      requestAnimationFrame(() => {
        const y = window.scrollY;
        Hall.highlight(box, ev, award.seat);
        window.scrollTo(0, y);
      });
      return wrap;
    } catch {
      return null;
    }
  }

  function awardRow(a, k, all, reload, live) {
    const save = rowSaver(a, 'award');
    const photo = h('div', { class: 'award-photo' }, a.photo ? h('img', { src: a.photo, alt: '' }) : icon('plus'));
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
    file.addEventListener('change', () => {
      const f = file.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = async () => {
          const max = 320;
          const s = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * s);
          c.height = Math.round(img.height * s);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          try { await save({ photo: c.toDataURL('image/jpeg', 0.85) }); await reload(); } catch (err) { handleError(err); }
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(f);
    });
    return h('li', { class: 'item' + (live ? ' is-live' : '') },
      h('div', { class: 'item-top' },
        orderButtons(all, k, 'awards', reload),
        h('div', { class: 'num' }, String(k + 1)),
        h('div', { class: 'grow edit-grid cols-award' },
          field(a.category, (v) => save({ category: v }), { placeholder: t('awardCategory'), max: 120 }),
          field(a.recipient, (v) => save({ recipient: v }), { placeholder: t('awardRecipient'), max: 120 }),
          field(a.detail, (v) => save({ detail: v }), { placeholder: t('awardDetail'), max: 160 }),
          field(a.seat, (v) => save({ seat: v.toUpperCase() }), { placeholder: t('awardSeat'), max: 12 }))),
      h('div', { class: 'item-actions', style: { alignItems: 'center' } },
        photo, file,
        btn(t('choosePhoto'), async () => file.click()),
        a.photo ? btn(t('removePhoto'), async () => { await save({ photo: '' }); await reload(); }) : null,
        btn(t('deleteThis'), async () => {
          if (!confirm(t('confirmDeleteX', a.recipient || a.category || '#' + (k + 1)))) return;
          await API.remove('award', a.id);
          await reload();
        }, 'btn btn-danger btn-sm')));
  }

  /* ---------------- Run of show ---------------- */

  async function runDetail(show) {
    const list = await API.list('run_items', show.id);
    const id = show.id;
    const reload = () => refresh(true);
    const i = show.currentIndex;
    const cur = list[i];
    const nxt = i < 0 ? list[0] : list[i + 1];
    const go = (n) => API.set('run_show', id, { currentIndex: n }).then(reload);
    const elapsedEl = h('div', { class: 'v' });
    const total = list.reduce((s, x) => s + (x.durationMin || 0), 0);

    const tick = () => {
      if (!cur || !show.startedAt) { elapsedEl.textContent = ''; return; }
      const s = Math.max(0, Math.round((Date.now() - Date.parse(show.startedAt)) / 1000));
      const planned = (cur.durationMin || 0) * 60;
      elapsedEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` + (planned ? ` / ${cur.durationMin}:00` : '');
      elapsedEl.style.color = planned && s > planned ? 'var(--danger)' : '';
    };
    tick();
    timerHandle = setInterval(tick, 1000);

    const dateInput = field(show.date, (v) => API.save('run_show', { id, title: curTitle(show.title), date: v }).then(() => refresh()), { type: 'date', placeholder: t('showDate'), max: 20 });
    dateInput.style.width = 'auto';

    const presenter = card(
      sectionHead(t('presenting'), h('a', { class: 'btn btn-sm', href: `../runshow/?show=${id}`, target: '_blank', rel: 'noopener' }, icon('open'), t('openScreen'))),
      h('div', { class: 'presenter' },
        h('div', { class: 'present-box' }, h('div', { class: 'k' }, t('runNow')),
          cur ? [h('div', { class: 'v' }, cur.title || '—'), h('div', { class: 's' }, cur.presenter), elapsedEl]
            : h('div', { class: 's', style: { marginTop: '6px' } }, i < 0 ? t('nothingYet') : t('runFinished'))),
        h('div', { class: 'present-box' }, h('div', { class: 'k' }, t('runNext')),
          nxt ? [h('div', { class: 'v' }, nxt.title || '—'), h('div', { class: 's' }, [nxt.presenter, nxt.durationMin ? `${nxt.durationMin} min` : ''].filter(Boolean).join(' · ')), nxt.notes ? h('div', { class: 's' }, nxt.notes) : null]
            : h('div', { class: 's', style: { marginTop: '6px' } }, '—'))),
      cur && cur.notes ? h('p', { class: 'small', style: { margin: '12px 0 0' } }, h('b', {}, t('itemNotes') + ': '), cur.notes) : null,
      h('div', { class: 'present-controls' },
        btn([icon('prev'), t('prev')], () => go(i - 1), 'btn btn-secondary', { disabled: i < 0 }),
        btn([t('next'), icon('next')], () => go(i + 1), 'btn', { disabled: i >= list.length }),
        btn([icon('start'), t('toStart')], () => go(-1), 'btn btn-ghost', { disabled: i < 0 })));

    const ul = h('ul', { class: 'item-list' });
    list.forEach((it, k) => {
      const save = rowSaver(it, 'run_item');
      const minutes = field(it.durationMin, (v) => save({ durationMin: Number(v) || 0 }), { type: 'number', placeholder: t('itemMinutes'), min: 0, maxNum: 600, max: 4 });
      ul.appendChild(h('li', { class: 'item' + (k === i ? ' is-live' : '') },
        h('div', { class: 'item-top' },
          orderButtons(list, k, 'run_items', reload),
          h('div', { class: 'num' }, String(k + 1)),
          h('div', { class: 'grow edit-grid' },
            h('div', { class: 'edit-grid cols-run' },
              field(it.title, (v) => save({ title: v }), { placeholder: t('itemTitle'), max: 160 }),
              field(it.presenter, (v) => save({ presenter: v }), { placeholder: t('itemPresenter'), max: 120 }),
              minutes),
            field(it.notes, (v) => save({ notes: v }), { placeholder: t('itemNotes'), max: 1000, multiline: true, class: 'input input-sm textarea', rows: 2 }))),
        h('div', { class: 'item-actions' },
          btn(t('deleteThis'), async () => {
            if (!confirm(t('confirmDeleteX', it.title || '#' + (k + 1)))) return;
            await API.remove('run_item', it.id);
            await reload();
          }, 'btn btn-danger btn-sm'))));
    });

    return [
      titleRow(show.title, (v) => API.save('run_show', { id, title: v, date: dateInput.value }).then(() => refresh()), dateInput, deleteButton(show.title, 'run_show', id)),
      presenter,
      card(sectionHead(`${t('runOrder')} · ${t('totalTime', total)}`), ul,
        h('div', { style: { marginTop: '12px' } }, btn([icon('plus'), t('addItem')], async () => { await API.save('run_item', { showId: id }); await reload(); }, 'btn btn-sm'))),
    ];
  }

  /* ================================================================ */
  /* Start                                                            */
  /* ================================================================ */

  // Keep counts, pending questions and messages fresh while the studio is open.
  setInterval(() => {
    if (me && me.role === 'teacher' && !$('view-app').hidden && !document.hidden && !isBusy()) refresh();
  }, 4000);

  onLangChange(() => { if (me) route(); });
  applyI18n();
  if (!API.configured) {
    showView('view-signin');
    $('si-error').textContent = t('notConfigured');
  } else {
    DB.me().then((d) => { me = d.user; }).catch(() => { me = null; }).finally(route);
  }
})();
