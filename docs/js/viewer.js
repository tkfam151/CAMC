/* Public viewer: search events and view their seating plans (read-only). */
(function () {
  'use strict';
  const { t, applyI18n, onLangChange, formatDate, debounce } = window.CAMC;
  const $ = (id) => document.getElementById(id);

  let events = [];
  let current = null; // full event
  let labelMode = 'both'; // 'num' | 'cls' | 'both' (seat number above the class)
  let activeChip = null; // the class picked in the big picker or a class chip
  const MY_CLASS_KEY = 'camc_my_class';
  const savedClass = () => { try { return localStorage.getItem(MY_CLASS_KEY) || ''; } catch { return ''; } };
  let userZoom = false;

  function autoFit() {
    if (userZoom || $('event-view').hidden) return;
    const size = Hall.fit($('hall-card'));
    if (size) $('zoom').value = size;
  }

  function eventIdFromUrl() {
    return new URLSearchParams(location.search).get('event');
  }

  async function route() {
    const id = eventIdFromUrl();
    $('loading').hidden = false;
    $('list-view').hidden = true;
    $('event-view').hidden = true;
    try {
      if (id) await showEvent(id);
      else await showList();
    } catch (err) {
      $('list-view').hidden = false;
      $('event-list').innerHTML = '';
      $('event-empty').hidden = false;
      $('event-empty').textContent = err.status === 404 ? t('eventNotFound') : err.status === 503 ? t('notConfigured') : t('loadError');
    } finally {
      $('loading').hidden = true;
    }
  }

  function navigate(url) {
    history.pushState({}, '', url);
    window.scrollTo(0, 0);
    route();
  }

  /* ---------------- List ---------------- */

  async function showList() {
    document.title = 'CAMC Seating';
    const data = await DB.listEvents();
    events = data.events;
    $('list-view').hidden = false;
    renderList();
  }

  function renderList() {
    const q = $('event-search').value.trim().toLowerCase();
    $('event-search-clear').hidden = !q;
    const list = $('event-list');
    list.innerHTML = '';
    const filtered = events.filter((e) => !q || e.name.toLowerCase().includes(q) || (e.date || '').includes(q));
    filtered.forEach((e) => {
      const a = document.createElement('a');
      a.className = 'event-card';
      a.href = `?event=${encodeURIComponent(e.id)}`;
      a.addEventListener('click', (ev) => {
        if (ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
        ev.preventDefault();
        navigate(a.href);
      });

      const top = document.createElement('div');
      const date = document.createElement('div');
      date.className = 'date';
      date.textContent = e.date ? formatDate(e.date) : `${t('updated')} ${formatDate(e.updatedAt)}`;
      const name = document.createElement('h2');
      name.className = 'name';
      name.textContent = e.name;
      top.append(date, name);

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
    const empty = $('event-empty');
    empty.hidden = filtered.length > 0;
    empty.textContent = events.length ? t('noEventsMatch') : t('noEvents');
  }

  /* ---------------- Event ---------------- */

  async function showEvent(id) {
    const [data, g] = await Promise.all([DB.getEvent(id), DB.listGroups()]);
    Hall.setGroups(g.groups);
    current = data.event;
    document.title = `${current.name} · CAMC Seating`;
    $('event-view').hidden = false;
    $('seat-search').value = new URLSearchParams(location.search).get('q') || '';
    // Open straight on the teacher's class if they picked one before.
    const mine = savedClass();
    activeChip = mine && Object.values(current.seatData || {}).some((d) => d && d.classId === mine) ? mine : null;
    renderEvent();
  }

  function renderEvent() {
    if (!current) return;
    $('ev-title').textContent = current.name;
    const bits = [];
    if (current.date) bits.push(formatDate(current.date));
    if (current.updatedAt) bits.push(`${t('updated')} ${formatDate(current.updatedAt, true)}${current.updatedBy ? ` ${t('by')} ${current.updatedBy}` : ''}`);
    $('ev-meta').textContent = bits.join(' · ');

    const s = Hall.stats(Hall.normalize(current));
    $('st-total').textContent = s.total;
    $('st-alloc').textContent = s.allocated;
    $('st-remain').textContent = s.remaining;
    $('st-rate').textContent = s.rate + '%';
    requestAnimationFrame(() => ($('st-meter').style.width = s.rate + '%'));

    renderLegend();
    Hall.render($('hall'), current, { editable: false, t });
    applyLabels();
    autoFit();
    runSearch(false);
  }

  function renderLegend() {
    const counts = {};
    const vips = [];
    Object.entries(current.seatData || {}).forEach(([seatId, raw]) => {
      const d = Hall.seatInfo(raw);
      const k = d.classId || '?';
      if (!counts[k]) counts[k] = { n: 0, color: d.color, name: d.name, vip: d.vip };
      counts[k].n++;
      if (d.vip) vips.push({ seatId, ...d });
    });

    const legend = $('legend');
    legend.innerHTML = '';
    const order = Hall.getGroups().map((c) => c.id);
    const rank = (id) => (counts[id].vip ? -1000 : 0) + (order.indexOf(id) + 1 || 999);
    Object.keys(counts)
      .sort((a, b) => rank(a) - rank(b))
      .forEach((id) => {
        const c = counts[id];
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip' + (c.vip ? ' chip-vip' : '');
        chip.setAttribute('aria-pressed', String(activeChip === id));
        chip.title = c.name;
        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.style.background = c.color;
        const n = document.createElement('span');
        n.className = 'n';
        n.textContent = c.n;
        chip.append(dot, document.createTextNode(c.vip ? c.name : id), n);
        chip.addEventListener('click', () => pickClass(activeChip === id ? null : id, false));
        legend.appendChild(chip);
      });

    renderVipList(vips);
    renderFinder(counts, order);
  }

  // The big "See where your class sits" picker and the plain-language answer.
  function renderFinder(counts, order) {
    const sel = $('my-class');
    const ids = Object.keys(counts).filter((id) => id !== '?' && !counts[id].vip)
      .sort((a, b) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999));
    sel.innerHTML = '';
    const first = document.createElement('option');
    first.value = '';
    first.textContent = t('pickYourClass');
    sel.appendChild(first);
    ids.forEach((id) => {
      const o = document.createElement('option');
      o.value = id;
      o.textContent = counts[id].name;
      sel.appendChild(o);
    });
    sel.value = activeChip && ids.includes(activeChip) ? activeChip : '';
    $('class-finder').hidden = ids.length === 0;

    const out = $('cf-result');
    out.innerHTML = '';
    if (!sel.value) return;
    const info = Hall.classSeats(current, sel.value);
    const head = document.createElement('div');
    head.className = 'cf-head';
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = counts[sel.value].color;
    head.append(dot, document.createTextNode(`${counts[sel.value].name} · ${t('seatsN', info.count)}`));
    out.appendChild(head);
    const list = document.createElement('div');
    list.className = 'cf-rows';
    info.rows.forEach(({ row, ranges }) => {
      const r = document.createElement('span');
      r.className = 'cf-row';
      const b = document.createElement('b');
      b.textContent = `${t('rowWord')} ${row}`;
      r.append(b, document.createTextNode(` ${ranges}`));
      list.appendChild(r);
    });
    if (info.extra.length) {
      const r = document.createElement('span');
      r.className = 'cf-row';
      const b = document.createElement('b');
      b.textContent = t('extraSeatsShort');
      r.append(b, document.createTextNode(` ${info.extra.join(', ')}`));
      list.appendChild(r);
    }
    out.appendChild(list);
  }

  function pickClass(id, scroll) {
    activeChip = id || null;
    try { if (id) localStorage.setItem(MY_CLASS_KEY, id); else localStorage.removeItem(MY_CLASS_KEY); } catch { /* ignore */ }
    $('seat-search').value = '';
    renderLegend();
    runSearch(false);
    if (scroll && id) $('hall-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderVipList(vips) {
    const list = $('vip-list');
    list.innerHTML = '';
    // Only shown when a teacher has switched it on for this event.
    $('vip-section').hidden = vips.length === 0 || !current.showVipList;
    const named = vips.filter((v) => v.personName);
    const show = named.length ? named : vips;
    show
      .sort((a, b) => a.name.localeCompare(b.name) || (a.personName || '').localeCompare(b.personName || ''))
      .forEach((v) => {
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
        b.addEventListener('click', () => {
          activeChip = null;
          $('seat-search').value = v.seatId;
          runSearch(true);
          document.querySelectorAll('#legend .chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
          $('hall-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        list.appendChild(b);
      });
  }

  function runSearch(scroll) {
    const q = $('seat-search').value;
    $('seat-search-clear').hidden = !q;
    const card = $('hall');
    const before = window.scrollY;
    // Typed search wins; otherwise show the picked class.
    const n = q.trim() || !activeChip ? Hall.highlight(card, current, q) : Hall.highlightClass(card, current, activeChip);
    if (!scroll) window.scrollTo(0, before);
    $('result-note').textContent = q.trim() ? (n ? t('results', n) : t('noResults')) : '';
  }

  /* ---------------- Wiring ---------------- */

  $('event-search').addEventListener('input', renderList);
  $('event-search-clear').addEventListener('click', () => { $('event-search').value = ''; renderList(); $('event-search').focus(); });
  $('seat-search').addEventListener('input', debounce(() => {
    activeChip = null;
    renderLegend();
    runSearch(true);
  }, 150));
  $('seat-search-clear').addEventListener('click', () => { $('seat-search').value = ''; activeChip = null; renderLegend(); runSearch(false); });
  $('my-class').addEventListener('change', (e) => pickClass(e.target.value, true));
  $('back-link').addEventListener('click', (e) => { e.preventDefault(); navigate(location.pathname); });

  function applyLabels() {
    $('lbl-num').setAttribute('aria-pressed', String(labelMode === 'num'));
    $('lbl-cls').setAttribute('aria-pressed', String(labelMode === 'cls'));
    $('lbl-both').setAttribute('aria-pressed', String(labelMode === 'both'));
    $('hall').classList.toggle('show-classes', labelMode === 'cls');
    $('hall').classList.toggle('show-both', labelMode === 'both');
  }
  function setLabels(mode) {
    labelMode = mode;
    applyLabels();
  }
  $('lbl-num').addEventListener('click', () => setLabels('num'));
  $('lbl-cls').addEventListener('click', () => setLabels('cls'));
  $('lbl-both').addEventListener('click', () => setLabels('both'));
  $('zoom').addEventListener('input', (e) => {
    userZoom = true;
    $('hall-card').style.setProperty('--seat', e.target.value + 'px');
  });
  window.addEventListener('resize', debounce(autoFit, 150));

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.seat')) Hall.hidePop();
  });

  window.addEventListener('popstate', route);
  onLangChange(() => {
    if (!$('list-view').hidden) renderList();
    if (!$('event-view').hidden) renderEvent();
  });

  applyI18n();
  route();
})();
