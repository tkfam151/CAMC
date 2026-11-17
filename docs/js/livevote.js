/* Big screen for live voting and Q&A. Controlled from /studio/. */
(function () {
  'use strict';
  const { t, applyI18n, onLangChange } = window.CAMC;
  const { API, h, qrSvg, siteUrl, prettyUrl, every, query } = window.Studio;
  const $ = (id) => document.getElementById(id);

  const code = query('code').toUpperCase();
  const joinUrl = siteUrl('vote/');
  let state = null;
  let questions = [];
  let lastKey = '';

  function message(text) {
    $('stage').innerHTML = '';
    $('stage').appendChild(h('p', { class: 'big-msg' }, text));
  }

  function render() {
    if (!state) return;
    const { room, poll } = state;
    $('title').textContent = room.title;
    document.title = `${room.title} · Live`;
    const mode = room.mode === 'qa' ? 'qa' : poll && (room.mode === 'poll' || room.mode === 'results') ? room.mode : 'idle';

    // The join chip sits in the corner except on the full-size join screen.
    $('chip').hidden = mode === 'idle';
    if (mode !== 'idle') window.Screen.joinChip($('chip'), joinUrl, room.code);

    // Only rebuild (and re-animate) when what is shown actually changes.
    const key = JSON.stringify([mode, poll && poll.id, poll && poll.question, poll && poll.options, mode === 'qa' ? questions.map((q) => [q.id, q.upvotes]) : 0]);
    const stage = $('stage');
    if (key !== lastKey) {
      lastKey = key;
      stage.innerHTML = '';
      if (mode === 'idle') stage.appendChild(joinHero(room));
      else if (mode === 'poll') stage.appendChild(pollView(poll));
      else if (mode === 'results') stage.appendChild(resultsView(poll));
      else stage.appendChild(qaView());
    }
    // Live numbers update in place.
    if (mode === 'poll') {
      const n = stage.querySelector('#vote-n');
      if (n) n.textContent = t('votes', poll.total);
    }
    if (mode === 'results') updateBars(poll);
    $('sub').textContent = mode === 'poll' && poll.state === 'closed' ? t('votingClosed') : '';
  }

  function joinHero(room) {
    return h('div', { class: 'join-hero fade-in' },
      h('div', { class: 'qr', html: qrSvg(`${joinUrl}?code=${room.code}`) }),
      h('div', {},
        h('p', { class: 'k' }, t('scrJoinAt')),
        h('p', { class: 'url' }, prettyUrl(joinUrl)),
        h('p', { class: 'k' }, t('scrCode')),
        h('div', { class: 'code' }, room.code)));
  }

  function pollView(poll) {
    return h('div', { class: 'fade-in' },
      h('h2', { class: 'poll-question' }, poll.question),
      h('div', { class: 'poll-options' }, poll.options.map((o, i) =>
        h('div', { class: 'poll-option' }, h('span', { class: 'letter' }, String.fromCharCode(65 + i)), h('span', {}, o)))),
      h('div', { class: 'vote-count' }, h('span', { class: 'pulse' }), h('span', { id: 'vote-n' }, t('votes', poll.total))));
  }

  function resultsView(poll) {
    const box = h('div', { class: 'fade-in' },
      h('h2', { class: 'poll-question' }, poll.question),
      h('div', { class: 'results', id: 'results' }, poll.options.map((o, i) =>
        h('div', { class: 'result', 'data-i': String(i) },
          h('div', { class: 'result-label' }, h('span', {}, `${String.fromCharCode(65 + i)}. ${o}`), h('span', { class: 'result-pct' }, '0%')),
          h('div', { class: 'result-track' }, h('i', {}))))),
      h('div', { class: 'vote-count' }, h('span', { id: 'vote-total' }, t('votes', poll.total))));
    requestAnimationFrame(() => requestAnimationFrame(() => updateBars(poll)));
    return box;
  }

  function updateBars(poll) {
    const max = Math.max(...poll.counts);
    document.querySelectorAll('#results .result').forEach((row) => {
      const i = Number(row.dataset.i);
      const n = poll.counts[i] || 0;
      const pct = poll.total ? Math.round((n / poll.total) * 100) : 0;
      row.classList.toggle('top', n === max && n > 0);
      row.querySelector('.result-pct').textContent = `${pct}%`;
      row.querySelector('.result-track i').style.width = pct + '%';
    });
    const total = document.getElementById('vote-total');
    if (total) total.textContent = t('votes', poll.total);
  }

  function qaView() {
    const open = questions.filter((q) => q.status === 'approved').slice(0, 6);
    if (!open.length) return h('p', { class: 'big-msg fade-in' }, t('scrNoQuestions'));
    return h('div', { class: 'qa-grid fade-in' }, open.map((q, i) =>
      h('div', { class: 'qa-card' + (i === 0 ? ' first' : '') },
        h('div', { class: 'qa-votes' }, String(q.upvotes), h('small', {}, '▲')),
        h('div', {}, h('div', { class: 'qa-body' }, q.body), q.name ? h('div', { class: 'qa-name' }, q.name) : null))));
  }

  window.Screen.setupControls();
  onLangChange(() => { lastKey = ''; render(); });
  applyI18n();

  if (!API.configured) message(t('notConfigured'));
  else if (!code) message(t('notFound'));
  else {
    let tick = 0;
    every(2000, async () => {
      const s = await API.roomState(code);
      if (!s) { message(t('notFound')); return; }
      state = s;
      if (state.room.mode === 'qa' && tick++ % 2 === 0) questions = await API.roomQuestions(code);
      render();
    });
  }
})();
