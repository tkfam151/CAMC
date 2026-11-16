/* Shared auditorium layout + renderer used by the viewer and the teacher editor. */
(function () {
  'use strict';

  // Classes and VIP groups, loaded from the server with setGroups().
  let GROUPS = [];
  function setGroups(list) { GROUPS = Array.isArray(list) ? list : []; }
  function getGroups(kind) { return kind ? GROUPS.filter((g) => g.kind === kind) : GROUPS.slice(); }

  /** Resolve a seat's current label and colour (group edits apply to every event). */
  function seatInfo(data) {
    if (!data) return null;
    const g = GROUPS.find((x) => x.id === data.classId);
    return {
      classId: data.classId,
      name: g ? g.name : data.className || data.classId,
      color: g ? g.color : data.color || '#8e8e93',
      vip: g ? g.kind === 'vip' : /vip/i.test(data.classId || ''),
      personName: data.personName || '',
      photoUrl: typeof data.photoUrl === 'string' && data.photoUrl.startsWith('data:image/') ? data.photoUrl : null,
    };
  }

  const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'];
  const TOTAL_COLS = 29;
  const LEFT_COLS = [29, 28, 27, 26, 25, 24, 23];
  const CENTER_COLS = [22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8];
  const RIGHT_COLS = [7, 6, 5, 4, 3, 2, 1];

  function isBooth(row, num) {
    return ['I', 'J', 'K', 'L'].includes(row) && num >= 12 && num <= 18;
  }

  function emptyLayout() {
    return { seatData: {}, extraSeatList: [], balconySeatList: { L: [], R: [] }, walkwaySeatList: [] };
  }

  function normalize(ev) {
    return {
      seatData: (ev && ev.seatData) || {},
      extraSeatList: (ev && ev.extraSeatList) || [],
      balconySeatList: {
        L: (ev && ev.balconySeatList && ev.balconySeatList.L) || [],
        R: (ev && ev.balconySeatList && ev.balconySeatList.R) || [],
      },
      walkwaySeatList: (ev && ev.walkwaySeatList) || [],
    };
  }

  function mainSeatIds() {
    const ids = [];
    ROWS.forEach((r) => {
      for (let c = 1; c <= TOTAL_COLS; c++) if (!isBooth(r, c)) ids.push(r + c);
    });
    return ids;
  }

  function dynamicSeatIds(layout) {
    return [...layout.balconySeatList.L, ...layout.balconySeatList.R, ...layout.walkwaySeatList, ...layout.extraSeatList];
  }

  function allSeatIds(layout) {
    return [...mainSeatIds(), ...dynamicSeatIds(layout)];
  }

  function stats(layout) {
    const total = allSeatIds(layout).length;
    const valid = new Set(allSeatIds(layout));
    const allocated = Object.keys(layout.seatData).filter((id) => valid.has(id)).length;
    return { total, allocated, remaining: total - allocated, rate: total ? Math.round((allocated / total) * 100) : 0 };
  }

  function classById(id) {
    return GROUPS.find((c) => c.id === id);
  }

  function displayCode(seatId) {
    if (seatId.includes('-')) return seatId.split('-')[1];
    const m = seatId.match(/^[A-P](\d+)$/);
    if (m) return m[1];
    return seatId.replace('LBAL', 'L').replace('RBAL', 'R').replace('EX', '');
  }

  // Pick black or white text for legibility on a seat colour.
  function textOn(hex) {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6);
    const r = parseInt(full.slice(0, 2), 16), g = parseInt(full.slice(2, 4), 16), b = parseInt(full.slice(4, 6), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.68 ? '#1d1d1f' : '#ffffff';
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /* ---------------------------------------------------------------- */
  /* Seat popover                                                     */
  /* ---------------------------------------------------------------- */

  let pop;
  function ensurePop() {
    if (pop) return pop;
    pop = el('div', 'seat-pop');
    pop.setAttribute('role', 'tooltip');
    document.body.appendChild(pop);
    return pop;
  }

  function showPop(seatEl, seatId, raw, t) {
    const data = seatInfo(raw);
    const p = ensurePop();
    p.innerHTML = '';
    if (data && data.photoUrl) {
      const img = el('img', 'seat-pop-photo');
      img.src = data.photoUrl;
      img.alt = '';
      p.appendChild(img);
    }
    p.appendChild(el('div', 'seat-pop-id', `${t('seat')} ${seatId}`));
    if (data) {
      if (data.vip) p.appendChild(el('div', 'vip-badge', 'VIP'));
      if (data.personName) p.appendChild(el('div', 'seat-pop-name', data.personName));
      const row = el('div', 'seat-pop-class');
      const dot = el('span', 'dot');
      dot.style.background = data.color;
      row.appendChild(dot);
      row.appendChild(document.createTextNode(data.name));
      p.appendChild(row);
    } else {
      p.appendChild(el('div', 'seat-pop-empty', t('available')));
    }
    p.classList.add('show');
    const r = seatEl.getBoundingClientRect();
    const pr = p.getBoundingClientRect();
    let left = r.left + r.width / 2 - pr.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - pr.width - 8));
    let top = r.top - pr.height - 10;
    if (top < 8) top = r.bottom + 10;
    p.style.left = left + 'px';
    p.style.top = top + 'px';
  }

  function hidePop() {
    if (pop) pop.classList.remove('show');
  }
  window.addEventListener('scroll', hidePop, true);

  /* ---------------------------------------------------------------- */
  /* Renderer                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * Render the hall into `container`.
   * opts: {
   *   editable: bool,
   *   t: (key) => string,
   *   onSeatClick(seatId), onSwap(fromId, toId),
   *   onAdd(target)   // 'BAL_L' | 'BAL_R' | 'EXTRA' | 'W1-L' | ...
   * }
   */
  function render(container, layoutIn, opts) {
    const layout = normalize(layoutIn);
    const t = opts.t || ((k) => k);
    const editable = !!opts.editable;
    hidePop();
    container.innerHTML = '';

    const hall = el('div', 'hall');

    function seat(seatId, extraClass) {
      const raw = layout.seatData[seatId];
      const data = seatInfo(raw);
      const b = el('button', 'seat' + (extraClass ? ' ' + extraClass : ''));
      b.type = 'button';
      b.dataset.id = seatId;
      b.setAttribute('aria-label', `${t('seat')} ${seatId}${data ? ', ' + (data.personName ? data.personName + ', ' : '') + data.name : ', ' + t('available')}`);
      b.appendChild(el('span', 'seat-num', displayCode(seatId)));
      if (data) {
        b.classList.add('taken');
        b.style.setProperty('--seat-color', data.color);
        b.style.setProperty('--seat-ink', textOn(data.color));
        b.appendChild(el('span', 'seat-tag', data.classId));
        if (data.photoUrl || data.personName) b.classList.add('has-person');
        if (data.vip) b.classList.add('vip');
      }

      b.addEventListener('mouseenter', () => showPop(b, seatId, raw, t));
      b.addEventListener('mouseleave', hidePop);
      b.addEventListener('focus', () => showPop(b, seatId, raw, t));
      b.addEventListener('blur', hidePop);
      b.addEventListener('click', () => {
        if (opts.onSeatClick) opts.onSeatClick(seatId);
        else showPop(b, seatId, raw, t);
      });

      if (editable) {
        b.draggable = true;
        b.addEventListener('dragstart', (e) => {
          hidePop();
          e.dataTransfer.setData('text/plain', seatId);
          e.dataTransfer.effectAllowed = 'move';
          b.classList.add('dragging');
        });
        b.addEventListener('dragend', () => b.classList.remove('dragging'));
        b.addEventListener('dragover', (e) => { e.preventDefault(); b.classList.add('drop-target'); });
        b.addEventListener('dragleave', () => b.classList.remove('drop-target'));
        b.addEventListener('drop', (e) => {
          e.preventDefault();
          b.classList.remove('drop-target');
          const from = e.dataTransfer.getData('text/plain');
          if (from && from !== seatId && opts.onSwap) opts.onSwap(from, seatId);
        });
      }
      return b;
    }

    function placeholder() {
      return el('span', 'seat placeholder');
    }

    function addBtn(label, target) {
      const b = el('button', 'add-seat', label);
      b.type = 'button';
      b.addEventListener('click', () => opts.onAdd && opts.onAdd(target));
      return b;
    }

    function block(cols, cb) {
      const blk = el('div', 'block');
      cols.forEach((c) => blk.appendChild(cb(c)));
      return blk;
    }

    function rowLabel(text) {
      return el('span', 'row-label', text);
    }

    // Balcony wings
    function balcony(side) {
      const ids = layout.balconySeatList[side];
      if (!editable && ids.length === 0) return null;
      const wing = el('div', 'balcony');
      wing.appendChild(el('div', 'zone-label', side === 'L' ? t('balconyL') : t('balconyR')));
      const list = el('div', 'balcony-seats');
      ids.forEach((id) => list.appendChild(seat(id, 'dyn')));
      wing.appendChild(list);
      if (editable) wing.appendChild(addBtn('+', side === 'L' ? 'BAL_L' : 'BAL_R'));
      return wing;
    }

    const balL = balcony('L');
    const balR = balcony('R');
    if (balL) hall.appendChild(balL);

    const main = el('div', 'hall-main');
    const stage = el('div', 'stage', t('stage'));
    main.appendChild(stage);

    const grid = el('div', 'rows');

    ROWS.forEach((row) => {
      if (row === 'I') {
        const aisle = el('div', 'aisle');
        aisle.appendChild(el('div', 'zone-label', t('mainAisle')));

        ['W1', 'W2'].forEach((w) => {
          const has = layout.walkwaySeatList.some((id) => id.startsWith(w + '-'));
          if (!has && !editable) return;
          const r = el('div', 'row walkway');
          r.appendChild(rowLabel(w));
          const mk = (cols, zone) => {
            const blk = block(cols, (c) => {
              const id = `${w}-${c}`;
              return layout.walkwaySeatList.includes(id) ? seat(id, 'dyn') : placeholder();
            });
            if (editable) {
              blk.classList.add('editable-block');
              blk.appendChild(addBtn('+', `${w}-${zone}`));
            }
            return blk;
          };
          r.appendChild(mk(LEFT_COLS, 'L'));
          r.appendChild(mk(CENTER_COLS, 'C'));
          r.appendChild(mk(RIGHT_COLS, 'R'));
          r.appendChild(rowLabel(w));
          if (!has) r.classList.add('ghost');
          aisle.appendChild(r);
        });
        grid.appendChild(aisle);
      }

      const r = el('div', 'row');
      r.appendChild(rowLabel(row));
      const mk = (cols) =>
        block(cols, (c) => {
          if (isBooth(row, c)) {
            const b = el('span', 'seat booth');
            if (row === 'J' && c === 15) b.appendChild(el('span', 'booth-label', t('booth')));
            return b;
          }
          return seat(row + c);
        });
      r.appendChild(mk(LEFT_COLS));
      r.appendChild(mk(CENTER_COLS));
      r.appendChild(mk(RIGHT_COLS));
      r.appendChild(rowLabel(row));
      grid.appendChild(r);
    });

    main.appendChild(grid);

    if (editable || layout.extraSeatList.length) {
      const extra = el('div', 'extra');
      extra.appendChild(el('div', 'zone-label', t('extraSeats')));
      const list = el('div', 'extra-seats');
      layout.extraSeatList.forEach((id) => list.appendChild(seat(id, 'dyn')));
      if (editable) list.appendChild(addBtn('+', 'EXTRA'));
      extra.appendChild(list);
      main.appendChild(extra);
    }

    hall.appendChild(main);
    if (balR) hall.appendChild(balR);
    container.appendChild(hall);
  }

  /** Highlight seats matching a query. Returns the number of matches. */
  function highlight(container, layoutIn, query) {
    const layout = normalize(layoutIn);
    const q = (query || '').trim().toLowerCase();
    let count = 0;
    let first = null;
    container.querySelectorAll('.seat[data-id]').forEach((s) => {
      const d = seatInfo(layout.seatData[s.dataset.id]);
      const hit =
        q &&
        d &&
        ((d.classId || '').toLowerCase().includes(q) ||
          d.name.toLowerCase().includes(q) ||
          d.personName.toLowerCase().includes(q) ||
          (d.vip && q === 'vip'));
      const seatHit = q && s.dataset.id.toLowerCase() === q;
      s.classList.toggle('match', !!(hit || seatHit));
      if (hit || seatHit) {
        count++;
        if (!first) first = s;
      }
    });
    container.classList.toggle('searching', !!q);
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    return count;
  }

  /**
   * Choose a seat size so the hall fits the card's width. Returns the size used.
   * `card` is the scrolling container that holds the rendered hall.
   */
  function fit(card, min = 14, max = 30) {
    const hall = card.querySelector('.hall');
    if (!hall) return null;
    const style = getComputedStyle(card);
    const avail = card.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    let size = max;
    for (let i = 0; i < 4; i++) {
      card.style.setProperty('--seat', size + 'px');
      const w = hall.getBoundingClientRect().width;
      if (w <= avail || size <= min) break;
      // Width is roughly linear in seat size (gaps are fixed), so shrink and re-measure.
      size = Math.max(min, Math.min(size - 1, Math.floor(size * (avail / w))));
    }
    card.scrollLeft = (card.scrollWidth - card.clientWidth) / 2;
    return size;
  }

  window.Hall = {
    setGroups, getGroups, seatInfo, ROWS, TOTAL_COLS, LEFT_COLS, CENTER_COLS, RIGHT_COLS,
    isBooth, emptyLayout, normalize, mainSeatIds, dynamicSeatIds, allSeatIds, stats,
    classById, render, highlight, hidePop, textOn, fit,
  };
})();
