/* Student page: post a message to a themed message wall. */
(function () {
  'use strict';
  const { t, applyI18n, onLangChange } = window.CAMC;
  const { API, h, every, query } = window.Studio;
  const $ = (id) => document.getElementById(id);

  const NOTE_COLORS = ['#ffe08a', '#ffd6e0', '#cdeffd', '#d4f5c9', '#e6dcff', '#ffd9b3'];
  const THEME_KEY = { general: 'themeGeneral', waikhru: 'themeWaikhru', songkran: 'themeSongkran', graduation: 'themeGraduation', newyear: 'themeNewyear', christmas: 'themeChristmas' };

  let code = (query('w') || query('code') || '').toUpperCase();
  let wall = null;
  let posts = [];
  let color = NOTE_COLORS[0];
  let stopPolling = null;

  function showJoin(message) {
    if (stopPolling) stopPolling();
    $('loading').hidden = true;
    $('wall').hidden = true;
    $('join').hidden = false;
    $('join-error').textContent = message || '';
    $('code').value = code;
    setTimeout(() => $('code').focus(), 50);
  }

  $('code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  $('join-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('code').value.trim();
    if (v.length !== 6) { $('join-error').textContent = t('wrongCode'); return; }
    enter(v);
  });
  $('change-code').addEventListener('click', () => {
    history.replaceState(null, '', location.pathname);
    code = '';
    showJoin();
  });

  async function enter(c) {
    try {
      const s = await API.wallState(c, 0);
      if (!s) { showJoin(t('wrongCode')); return; }
      code = c;
      history.replaceState(null, '', `?w=${encodeURIComponent(code)}`);
      wall = s.wall;
      posts = s.posts;
      $('join').hidden = true;
      $('loading').hidden = true;
      $('wall').hidden = false;
      render();
      if (stopPolling) stopPolling();
      stopPolling = every(8000, async () => {
        const next = await API.wallState(code, 0);
        if (!next) return;
        wall = next.wall;
        posts = next.posts;
        render();
      });
    } catch (err) {
      showJoin(err.message);
    }
  }

  function render() {
    if (!wall) return;
    document.body.dataset.theme = wall.theme;
    $('wall-theme').textContent = t(THEME_KEY[wall.theme] || 'themeGeneral');
    $('wall-code').textContent = wall.code;
    $('wall-title').textContent = wall.title;
    document.title = `${wall.title} · CAMC Wall`;
    $('post-form').hidden = !wall.open;
    $('wall-closed').hidden = wall.open;

    const sw = $('colors');
    sw.innerHTML = '';
    NOTE_COLORS.forEach((c) => {
      sw.appendChild(h('button', {
        type: 'button', class: 'swatch', role: 'radio', 'aria-checked': String(c === color), 'aria-label': c,
        style: { background: c }, onclick: () => { color = c; render(); },
      }));
    });
    $('compose').style.background = color;

    const grid = $('notes');
    grid.innerHTML = '';
    if (!posts.length) grid.appendChild(h('p', { class: 'muted' }, t('wallEmpty')));
    posts.slice(-30).reverse().forEach((p) => {
      grid.appendChild(h('figure', { class: 'sticky', style: { background: p.color } },
        h('blockquote', {}, p.message),
        p.name ? h('figcaption', {}, p.name) : null));
    });
  }

  $('post-message').addEventListener('input', (e) => { $('counter').textContent = `${e.target.value.length} / 200`; });

  $('post-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = $('post-message').value.trim();
    if (!message) { $('post-message').focus(); return; }
    $('post-send').disabled = true;
    try {
      const res = await API.wallPost(code, $('post-name').value.trim(), message, color);
      $('post-message').value = '';
      $('counter').textContent = '0 / 200';
      $('post-note').textContent = res.status === 'pending' ? t('wallSentPending') : t('wallSent');
      $('post-note').className = 'note ok';
      if (res.status !== 'pending') {
        const s = await API.wallState(code, 0);
        if (s) { posts = s.posts; render(); }
      }
    } catch (err) {
      $('post-note').textContent = err.message;
      $('post-note').className = 'note err';
    } finally {
      $('post-send').disabled = false;
    }
  });

  onLangChange(render);
  applyI18n();
  if (!API.configured) showJoin(t('notConfigured'));
  else if (code) enter(code);
  else showJoin();
})();
