/* Backstage Now / Next screen with a timer for the current item. Controlled from /studio/. */
(function () {
  'use strict';
  const { t, applyI18n, onLangChange, getLang } = window.CAMC;
  const { API, h, every, query } = window.Studio;
  const $ = (id) => document.getElementById(id);

  const showId = query('show');
  let state = null;
  let clockOffset = 0; // server time minus this computer's time

  const fmt = (ms) => {
    const s = Math.max(0, Math.round(ms / 1000));
    const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
    return (hh ? `${hh}:${String(mm).padStart(2, '0')}` : String(mm)) + ':' + String(ss).padStart(2, '0');
  };

  function render() {
    if (!state) return;
    $('title').textContent = state.title;
    document.title = `${state.title} · Now / Next`;
    $('sub').textContent = state.date ? new Date(state.date + 'T00:00:00').toLocaleDateString(getLang() === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    const items = state.items;
    const i = state.index;
    const now = items[i];
    const next = items[i + 1];

    $('now-title').textContent = now ? now.title : i >= items.length - 1 && i >= 0 ? t('runFinished') : t('runNotStarted');
    $('now-presenter').textContent = now ? now.presenter : '';
    $('timer').hidden = !now;

    if (next) {
      $('next-title').textContent = next.title;
      $('next-meta').textContent = [next.presenter, next.durationMin ? `${next.durationMin} min` : ''].filter(Boolean).join(' · ');
    } else {
      $('next-title').textContent = i < 0 && items[0] ? items[0].title : '—';
      $('next-meta').textContent = i < 0 && items[0] ? items[0].presenter : '';
    }
    const later = $('later');
    later.innerHTML = '';
    items.slice(Math.max(0, i + 2), Math.max(0, i + 2) + 6).forEach((it) => {
      later.appendChild(h('li', {}, h('span', {}, it.title), h('span', {}, it.durationMin ? `${it.durationMin} min` : '')));
    });
    tick();
  }

  function tick() {
    $('clock').textContent = new Date(Date.now() + clockOffset).toLocaleTimeString(getLang() === 'th' ? 'th-TH' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
    if (!state) return;
    const now = state.items[state.index];
    if (!now || !state.startedAt) return;
    const elapsed = Date.now() + clockOffset - Date.parse(state.startedAt);
    const planned = now.durationMin * 60000;
    $('elapsed').textContent = fmt(elapsed);
    const timer = $('timer');
    if (planned > 0) {
      const left = planned - elapsed;
      $('left').textContent = left >= 0 ? t('runLeft', fmt(left)) : t('runOver', fmt(-left));
      timer.classList.toggle('over', left < 0);
      timer.classList.toggle('soon', left >= 0 && left < 60000);
      $('track').style.width = Math.min(100, (elapsed / planned) * 100) + '%';
    } else {
      $('left').textContent = '';
      timer.classList.remove('over', 'soon');
      $('track').style.width = '0%';
    }
  }

  setInterval(tick, 1000);
  window.Screen.setupControls();
  onLangChange(render);
  applyI18n();

  if (!API.configured) $('now-title').textContent = t('notConfigured');
  else if (!showId) $('now-title').textContent = t('notFound');
  else {
    every(2000, async () => {
      const s = await API.runState(showId);
      if (!s) { $('now-title').textContent = t('notFound'); return; }
      clockOffset = Date.parse(s.now) - Date.now();
      state = s;
      render();
    });
  }
})();
