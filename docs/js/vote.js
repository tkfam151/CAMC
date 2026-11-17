/* Student page: vote in live polls and ask questions. */
(function () {
  'use strict';
  const { t, applyI18n, onLangChange, toast } = window.CAMC;
  const { API, h, every, query } = window.Studio;
  const $ = (id) => document.getElementById(id);

  let code = (query('code') || '').toUpperCase();
  let state = null;
  let questions = [];
  let stopPolling = null;
  const myVotes = load('camc_my_votes', {});     // pollId -> option
  const myUpvotes = new Set(load('camc_my_upvotes', []));

  function load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
  }
  function store(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  }

  /* ---------------- Joining ---------------- */

  function showJoin(message) {
    if (stopPolling) stopPolling();
    $('loading').hidden = true;
    $('room').hidden = true;
    $('join').hidden = false;
    $('join-error').textContent = message || '';
    $('code').value = code;
    setTimeout(() => $('code').focus(), 50);
  }

  $('code').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  $('join-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('code').value.trim().toUpperCase();
    if (v.length !== 6) { $('join-error').textContent = t('wrongCode'); return; }
    enter(v);
  });

  $('change-code').addEventListener('click', () => {
    history.replaceState(null, '', location.pathname);
    code = '';
    showJoin();
  });

  async function enter(c) {
    $('join-error').textContent = '';
    try {
      const s = await API.roomState(c);
      if (!s) { showJoin(t('wrongCode')); return; }
      code = c;
      history.replaceState(null, '', `?code=${encodeURIComponent(code)}`);
      state = s;
      $('join').hidden = true;
      $('loading').hidden = true;
      $('room').hidden = false;
      render();
      if (stopPolling) stopPolling();
      let tick = 0;
      stopPolling = every(3000, async () => {
        const next = await API.roomState(code);
        if (!next) { showJoin(t('wrongCode')); return; }
        state = next;
        if (tick++ % 2 === 0 && state.room.qaOpen !== undefined) questions = await API.roomQuestions(code);
        render();
      });
    } catch (err) {
      showJoin(err.message);
    }
  }

  /* ---------------- Rendering ---------------- */

  function render() {
    if (!state) return;
    const { room, poll } = state;
    $('room-code').textContent = room.code;
    $('room-title').textContent = room.title;
    document.title = `${room.title} · CAMC Live`;
    renderPoll(room, poll);
    renderQa(room);
  }

  function renderPoll(room, poll) {
    const body = $('poll-body');
    body.innerHTML = '';
    if (!poll) {
      body.appendChild(h('p', { class: 'waiting' }, t('waitingPoll')));
      return;
    }
    const mine = myVotes[poll.id];
    const showResults = poll.state === 'closed' || room.mode === 'results';
    body.appendChild(h('h2', { class: 'poll-q' }, poll.question));

    if (poll.state === 'open' && !showResults) {
      const list = h('div', { class: 'options' });
      poll.options.forEach((opt, i) => {
        list.appendChild(h('button', {
          type: 'button',
          class: 'option' + (mine === i ? ' chosen' : ''),
          'aria-pressed': String(mine === i),
          onclick: () => vote(poll.id, i),
        }, h('span', { class: 'option-letter' }, String.fromCharCode(65 + i)), h('span', { class: 'option-text' }, opt)));
      });
      body.appendChild(list);
      if (mine !== undefined) body.appendChild(h('p', { class: 'note ok' }, t('voteSent')));
      return;
    }

    body.appendChild(bars(poll, mine));
    body.appendChild(h('p', { class: 'note' }, poll.state === 'closed' ? t('votingClosed') : t('votes', poll.total)));
  }

  function bars(poll, mine) {
    const max = Math.max(1, ...poll.counts);
    const wrap = h('div', { class: 'bars' });
    poll.options.forEach((opt, i) => {
      const n = poll.counts[i] || 0;
      const pct = poll.total ? Math.round((n / poll.total) * 100) : 0;
      wrap.appendChild(h('div', { class: 'bar' + (n === max && n > 0 ? ' top' : '') + (mine === i ? ' mine' : '') },
        h('div', { class: 'bar-label' }, h('span', {}, opt), h('span', { class: 'bar-pct' }, `${pct}%`)),
        h('div', { class: 'bar-track' }, h('i', { style: { width: pct + '%' } }))));
    });
    return wrap;
  }

  async function vote(pollId, option) {
    const before = myVotes[pollId];
    myVotes[pollId] = option;
    render();
    try {
      await API.vote(code, pollId, option);
      store('camc_my_votes', myVotes);
    } catch (err) {
      if (before === undefined) delete myVotes[pollId]; else myVotes[pollId] = before;
      render();
      toast(err.message, 'error');
    }
  }

  function renderQa(room) {
    const show = room.qaOpen || questions.length > 0;
    $('qa-card').hidden = !show;
    if (!show) return;
    $('ask-form').hidden = !room.qaOpen;
    $('qa-closed').hidden = room.qaOpen;
    const list = $('q-list');
    list.innerHTML = '';
    if (!questions.length) {
      list.appendChild(h('li', { class: 'q-empty' }, t('noQuestions')));
      return;
    }
    questions.forEach((q) => {
      const done = myUpvotes.has(q.id);
      const answered = q.status === 'answered';
      list.appendChild(h('li', { class: 'q-item' + (answered ? ' answered' : '') },
        h('button', {
          type: 'button', class: 'upvote' + (done ? ' done' : ''), disabled: done || answered,
          'aria-label': t('upvote'), onclick: () => upvote(q),
        }, h('span', { html: '<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>' }), h('b', {}, String(q.upvotes))),
        h('div', { class: 'q-text' },
          h('p', {}, q.body),
          h('span', { class: 'q-meta' }, [q.name, answered ? t('answered') : ''].filter(Boolean).join(' · ')))));
    });
  }

  async function upvote(q) {
    myUpvotes.add(q.id);
    q.upvotes += 1;
    render();
    try {
      q.upvotes = await API.upvote(code, q.id);
      store('camc_my_upvotes', [...myUpvotes]);
    } catch (err) {
      toast(err.message, 'error');
    }
    render();
  }

  $('ask-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = $('ask-body').value.trim();
    if (!body) { $('ask-body').focus(); return; }
    $('ask-send').disabled = true;
    try {
      const res = await API.ask(code, $('ask-name').value.trim(), body);
      $('ask-body').value = '';
      $('ask-note').textContent = res.status === 'pending' ? t('askSentPending') : t('askSent');
      $('ask-note').className = 'note ok';
      questions = await API.roomQuestions(code);
      render();
    } catch (err) {
      $('ask-note').textContent = err.message;
      $('ask-note').className = 'note err';
    } finally {
      $('ask-send').disabled = false;
    }
  });

  /* ---------------- Start ---------------- */

  onLangChange(render);
  applyI18n();
  if (!API.configured) showJoin(t('notConfigured'));
  else if (code) enter(code);
  else showJoin();
})();
