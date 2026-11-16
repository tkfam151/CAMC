/* Shared auditorium layout + renderer used by the viewer and the teacher editor. */
(function () {
  'use strict';

  const CLASS_LIST = [
    { id: '7A', name: '7 Archimedes (7A)', color: '#00b8d9' },
    { id: '7E', name: '7 Einstein (7E)', color: '#ff2d55' },
    { id: '7F', name: '7 Franklin (7F)', color: '#2563eb' },
    { id: '7Lang', name: '7 Lang', color: '#f5a623' },
    { id: '7N', name: '7 Newton (7N)', color: '#a855f7' },
    { id: '7P', name: '7 Pasteur (7P)', color: '#65a30d' },
    { id: '7T', name: '7 Tesla (7T)', color: '#ec4899' },
    { id: '8A', name: '8 Austen (8A)', color: '#f97316' },
    { id: '8B', name: '8 Byron (8B)', color: '#0891b2' },
    { id: '8H', name: '8 Hemingway (8H)', color: '#15803d' },
    { id: '8Lang', name: '8 Lang', color: '#e11d48' },
    { id: '8M', name: '8 Mendelssohn (8M)', color: '#22c55e' },
    { id: '8S', name: '8 Shakespeare (8S)', color: '#eab308' },
    { id: '8W', name: '8 Wordsworth (8W)', color: '#4f46e5' },
    { id: '9B', name: '9 Beethoven (9B)', color: '#f43f5e' },
    { id: '9G', name: '9 Gershwin (9G)', color: '#0ea5e9' },
    { id: '9H', name: '9 Haydn (9H)', color: '#7c3aed' },
    { id: '9M', name: '9 Mozart (9M)', color: '#fb7185' },
    { id: '9S', name: '9 Schubert (9S)', color: '#10b981' },
    { id: '9T', name: '9 Turing (9T)', color: '#d946ef' },
    { id: '10L', name: '10 Leonardo (10L)', color: '#d97706' },
    { id: '10M', name: '10 Monet (10M)', color: '#16a34a' },
    { id: '10P', name: '10 Picasso (10P)', color: '#ea580c' },
    { id: '10R', name: '10 Rutherford (10R)', color: '#0e7490' },
    { id: '10V', name: '10 Van Gogh (10V)', color: '#9333ea' },
    { id: '11A', name: '11 Aristotle (11A)', color: '#0284c7' },
    { id: '11P', name: '11 Plato (11P)', color: '#1d4ed8' },
    { id: '11R', name: '11 Ramanujan (11R)', color: '#ff9500' },
    { id: '11S', name: '11 Socrates (11S)', color: '#dc2626' },
    { id: '11V', name: '11 Voltaire (11V)', color: '#059669' },
    { id: '12G', name: '12 Gryphon (12G)', color: '#db2777' },
    { id: '12M', name: '12 Merlion (12M)', color: '#7e22ce' },
    { id: '12P', name: '12 Phoenix (12P)', color: '#c2410c' },
    { id: '12U', name: '12 Unicorn (12U)', color: '#6366f1' },
    { id: 'Council', name: 'Student Council (สภานักเรียน)', color: '#ef4444' },
    { id: 'VIP', name: 'VIP', color: '#c9a227' },
    { id: 'SMT', name: 'SMT', color: '#ff007f' },
    { id: 'PST', name: 'PST', color: '#f472b6' },
    { id: 'Teacher', name: 'Teacher', color: '#991b1b' },
  ];

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
    return CLASS_LIST.find((c) => c.id === id);
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

  function showPop(seatEl, seatId, data, t) {
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
      if (data.personName) p.appendChild(el('div', 'seat-pop-name', data.personName));
      const row = el('div', 'seat-pop-class');
      const dot = el('span', 'dot');
      dot.style.background = data.color;
      row.appendChild(dot);
      row.appendChild(document.createTextNode(data.className || data.classId));
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
      const data = layout.seatData[seatId];
      const b = el('button', 'seat' + (extraClass ? ' ' + extraClass : ''));
      b.type = 'button';
      b.dataset.id = seatId;
      b.setAttribute('aria-label', `${t('seat')} ${seatId}${data ? ', ' + (data.personName ? data.personName + ', ' : '') + (data.className || data.classId) : ', ' + t('available')}`);
      b.appendChild(el('span', 'seat-num', displayCode(seatId)));
      if (data) {
        b.classList.add('taken');
        b.style.setProperty('--seat-color', data.color);
        b.style.setProperty('--seat-ink', textOn(data.color));
        b.appendChild(el('span', 'seat-tag', data.classId));
        if (data.photoUrl || data.personName) b.classList.add('has-person');
      }

      b.addEventListener('mouseenter', () => showPop(b, seatId, data, t));
      b.addEventListener('mouseleave', hidePop);
      b.addEventListener('focus', () => showPop(b, seatId, data, t));
      b.addEventListener('blur', hidePop);
      b.addEventListener('click', () => {
        if (opts.onSeatClick) opts.onSeatClick(seatId);
        else showPop(b, seatId, data, t);
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
      const d = layout.seatData[s.dataset.id];
      const hit =
        q &&
        d &&
        ((d.classId || '').toLowerCase().includes(q) ||
          (d.className || '').toLowerCase().includes(q) ||
          (d.personName || '').toLowerCase().includes(q));
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
    CLASS_LIST, ROWS, TOTAL_COLS, LEFT_COLS, CENTER_COLS, RIGHT_COLS,
    isBooth, emptyLayout, normalize, mainSeatIds, dynamicSeatIds, allSeatIds, stats,
    classById, render, highlight, hidePop, textOn, fit,
  };
})();
