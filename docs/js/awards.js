/* Big screen for award presentations. The studio decides which award is shown. */
(function () {
  'use strict';
  const { t, applyI18n } = window.CAMC;
  const { API, h, every, query } = window.Studio;
  const $ = (id) => document.getElementById(id);

  const showId = query('show');
  let lastKey = null;

  function sparkle() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = $('sparkles');
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 150 + Math.random() * 380;
      const s = h('i', { style: {
        left: '50%', top: '42%',
        animationDelay: `${Math.random() * 0.4}s`,
      } });
      s.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
      s.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
      box.appendChild(s);
      setTimeout(() => s.remove(), 3200);
    }
  }

  function render(state) {
    const stage = $('stage');
    if (!state) {
      stage.innerHTML = '';
      stage.appendChild(h('p', { class: 'big-msg' }, t('notFound')));
      return;
    }
    document.title = `${state.title} · Awards`;
    const a = state.award;
    const key = JSON.stringify([state.index, a && [a.id, a.category, a.recipient, a.detail, !!a.photo], state.title]);
    if (key !== lastKey) {
      lastKey = key;
      stage.innerHTML = '';
      if (!a) {
        stage.appendChild(h('div', { class: 'award award-intro reveal' },
          h('div', { class: 'award-cat' }, 'CAMC'),
          h('div', { class: 'award-name' }, state.title)));
      } else {
        stage.appendChild(h('div', { class: 'award reveal' },
          a.category ? h('div', { class: 'award-cat' }, a.category) : null,
          a.photo && a.photo.startsWith('data:image/') ? h('img', { class: 'award-photo', src: a.photo, alt: '' }) : null,
          h('div', { class: 'award-name' }, a.recipient || '—'),
          a.detail ? h('div', { class: 'award-detail' }, a.detail) : null));
        sparkle();
      }
    }
    const dots = $('progress');
    dots.innerHTML = '';
    for (let i = 0; i < state.total && state.total <= 40; i++) {
      dots.appendChild(h('i', { class: i === state.index ? 'on' : i < state.index ? 'done' : '' }));
    }
  }

  window.Screen.setupControls();
  applyI18n();
  if (!API.configured) $('stage').appendChild(h('p', { class: 'big-msg' }, t('notConfigured')));
  else if (!showId) $('stage').appendChild(h('p', { class: 'big-msg' }, t('notFound')));
  else every(1500, async () => render(await API.awardState(showId)));
})();
