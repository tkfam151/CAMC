/* Big screen for a message wall. New messages appear first; pages rotate when the wall is full. */
(function () {
  'use strict';
  const { t, applyI18n, onLangChange } = window.CAMC;
  const { API, h, siteUrl, every, query } = window.Studio;
  const $ = (id) => document.getElementById(id);

  const THEME_KEY = { general: 'themeGeneral', waikhru: 'themeWaikhru', songkran: 'themeSongkran', graduation: 'themeGraduation', newyear: 'themeNewyear', christmas: 'themeChristmas' };
  const PAGE_MS = 12000;

  const code = (query('w') || query('code')).toUpperCase();
  const joinUrl = siteUrl('wall/');
  let wall = null;
  let posts = [];          // newest first
  let known = new Set();
  const fresh = new Set();
  let page = 0;
  let lastPageTurn = Date.now();
  let lastKey = '';

  function perPage() {
    const box = $('notes');
    const style = getComputedStyle(box);
    const colW = parseFloat(style.gridTemplateColumns.split(' ')[0]) || 300;
    const cols = Math.max(1, style.gridTemplateColumns.split(' ').length);
    const rowH = parseFloat(style.gridAutoRows) || 200;
    const gap = parseFloat(style.rowGap) || 20;
    const rows = Math.max(1, Math.floor((box.clientHeight - parseFloat(style.paddingTop) + gap) / (rowH + gap)));
    return colW ? cols * rows : 8;
  }

  function render(force) {
    if (!wall) return;
    $('screen').dataset.theme = wall.theme;
    $('theme').textContent = t(THEME_KEY[wall.theme] || 'themeGeneral');
    $('title').textContent = wall.title;
    document.title = `${wall.title} · Wall`;
    $('chip').hidden = !wall.open;
    if (wall.open) window.Screen.joinChip($('chip'), joinUrl, wall.code);

    $('empty').hidden = posts.length > 0;
    $('empty').textContent = t('scrWallEmpty');
    $('notes').hidden = posts.length === 0;

    const n = perPage();
    const pages = Math.max(1, Math.ceil(posts.length / n));
    if (page >= pages) page = 0;
    const slice = posts.slice(page * n, page * n + n);
    const key = JSON.stringify([page, n, slice.map((p) => p.id)]);
    if (key === lastKey && !force) return;
    lastKey = key;

    const box = $('notes');
    box.innerHTML = '';
    slice.forEach((p, i) => {
      const el = h('article', { class: 'note' + (fresh.has(p.id) ? ' fresh' : ''), style: { background: p.color, animationDelay: `${Math.min(i, 12) * 60}ms` } },
        h('p', {}, p.message),
        p.name ? h('div', { class: 'by' }, p.name) : null);
      box.appendChild(el);
    });
    const dots = $('dots');
    dots.innerHTML = '';
    if (pages > 1) for (let i = 0; i < pages; i++) dots.appendChild(h('i', { class: i === page ? 'on' : '' }));
  }

  async function load() {
    const s = await API.wallState(code, 0);
    if (!s) {
      $('notes').hidden = true;
      $('empty').hidden = false;
      $('empty').textContent = t('notFound');
      return;
    }
    wall = s.wall;
    const next = s.posts.slice().reverse();
    const isFirst = known.size === 0 && posts.length === 0;
    let gotNew = false;
    next.forEach((p) => {
      if (!known.has(p.id)) {
        if (!isFirst) { fresh.add(p.id); gotNew = true; setTimeout(() => { fresh.delete(p.id); }, 20000); }
        known.add(p.id);
      }
    });
    posts = next;
    known = new Set(posts.map((p) => p.id));
    if (gotNew) { page = 0; lastPageTurn = Date.now(); }
    render();
  }

  // Turn pages when there are more messages than fit.
  setInterval(() => {
    if (!wall || Date.now() - lastPageTurn < PAGE_MS) return;
    lastPageTurn = Date.now();
    const pages = Math.ceil(posts.length / perPage());
    if (pages > 1) { page = (page + 1) % pages; render(); }
  }, 1000);

  window.addEventListener('resize', () => render(true));
  window.Screen.setupControls();
  onLangChange(() => render(true));
  applyI18n();

  if (!API.configured) { $('empty').hidden = false; $('empty').textContent = t('notConfigured'); }
  else if (!code) { $('empty').hidden = false; $('empty').textContent = t('notFound'); }
  else every(4000, load);
})();
