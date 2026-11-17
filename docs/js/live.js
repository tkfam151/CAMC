/* Loy Krathong live river: floats every submitted krathong across the screen. */
(function () {
  'use strict';
  const { t, applyI18n, onLangChange } = window.CAMC;
  const $ = (id) => document.getElementById(id);

  const POLL_MS = 5000;        // check for new krathongs
  const REFRESH_MS = 30000;    // drop krathongs a teacher has hidden
  const SVG_ASPECT = 172 / 240;

  const scene = $('scene');
  const layer = $('krathongs');

  let pool = [];               // every visible krathong, oldest first
  const byId = new Map();
  let lastCreatedAt = null;
  let cursor = 0;              // round-robin position in pool
  const priority = [];         // new arrivals waiting for a free spot
  const sprites = [];
  let W = 0, H = 0, horizonY = 0, baseW = 200;

  /* ------------------------------------------------------------------ */
  /* Layout                                                              */
  /* ------------------------------------------------------------------ */

  function measure() {
    W = window.innerWidth;
    H = window.innerHeight;
    const horizon = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--horizon')) || 54;
    horizonY = (H * horizon) / 100;
    baseW = Math.max(130, Math.min(300, W * 0.14));
    sprites.forEach((s) => (s.el.style.width = baseW + 'px'));
    resizeSky();
  }

  function maxSprites() {
    return Math.max(5, Math.min(18, Math.round(W / 115)));
  }

  /* ------------------------------------------------------------------ */
  /* Sprites                                                             */
  /* ------------------------------------------------------------------ */

  function makeSprite(k, opts = {}) {
    const el = document.createElement('div');
    el.className = 'kt-sprite';
    el.style.width = baseW + 'px';
    el.innerHTML = Krathong.svg(k.design, { animated: true });
    const label = document.createElement('div');
    label.className = 'kt-label';
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = k.name || t('ktFriend');
    label.appendChild(n);
    if (k.wish) {
      const w = document.createElement('span');
      w.className = 'w';
      w.textContent = k.wish;
      label.appendChild(w);
    }
    el.appendChild(label);
    layer.appendChild(el);

    const depth = opts.depth ?? pickDepth();
    const s = {
      el, k, depth,
      x: opts.x ?? -baseW * 1.6,
      scale: 0.38 + depth * 0.6,
      speed: (10 + depth * 24) * Math.max(0.6, W / 1600),
      phase: Math.random() * Math.PI * 2,
      fresh: !!opts.fresh,
    };
    el.style.zIndex = String(10 + Math.round(depth * 1000));
    el.classList.toggle('far', s.scale < 0.66);
    el.classList.toggle('tiny', s.scale < 0.46);
    if (s.fresh) {
      el.classList.add('fresh');
      setTimeout(() => el.classList.remove('fresh'), 20000);
    }
    sprites.push(s);
    return s;
  }

  // Spread krathongs over the river so they don't bunch up.
  function pickDepth() {
    const slots = 8;
    const counts = new Array(slots).fill(0);
    sprites.forEach((s) => counts[Math.min(slots - 1, Math.floor(s.depth * slots))]++);
    const min = Math.min(...counts);
    const options = counts.map((c, i) => (c === min ? i : -1)).filter((i) => i >= 0);
    const slot = options[Math.floor(Math.random() * options.length)];
    return (slot + 0.15 + Math.random() * 0.7) / slots;
  }

  function onScreenIds() {
    return new Set(sprites.map((s) => s.k.id));
  }

  // Next krathong to float: new arrivals first, then take turns through everyone.
  function nextKrathong() {
    while (priority.length) {
      const k = byId.get(priority.shift());
      if (k) return { k, fresh: true };
    }
    if (!pool.length) return null;
    const showing = onScreenIds();
    for (let i = 0; i < pool.length; i++) {
      cursor = (cursor + 1) % pool.length;
      const k = pool[cursor];
      if (!showing.has(k.id) || pool.length <= sprites.length) return { k, fresh: false };
    }
    return null;
  }

  function removeSprite(s) {
    const i = sprites.indexOf(s);
    if (i >= 0) sprites.splice(i, 1);
    s.el.remove();
  }

  // Top the river up to its target number of krathongs. On first load they are
  // spread across the screen; later ones enter from the left, spaced apart.
  function fill(spread) {
    const target = Math.min(maxSprites(), pool.length);
    let i = 0;
    while (sprites.length < target) {
      const next = nextKrathong();
      if (!next) break;
      const x = spread ? (W * (sprites.length + Math.random() * 0.8)) / target : -baseW * (1.2 + i++ * 0.9);
      makeSprite(next.k, { x, fresh: next.fresh });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Animation loop                                                      */
  /* ------------------------------------------------------------------ */

  let lastFrame = 0;
  function frame(now) {
    const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 0;
    lastFrame = now;
    const riverH = H - horizonY;
    const time = now / 1000;

    for (const s of [...sprites]) {
      s.x += s.speed * dt;
      const w = baseW * s.scale;
      if (s.x > W + w * 0.3) {
        // Off the right edge: reuse the slot for the next krathong.
        removeSprite(s);
        const next = nextKrathong();
        if (next && sprites.length < Math.max(maxSprites(), 1)) {
          makeSprite(next.k, { x: -w - Math.random() * 160, fresh: next.fresh, depth: s.depth });
        }
        continue;
      }
      const h = w * SVG_ASPECT;
      const bottom = horizonY + riverH * (0.12 + s.depth * 0.6);
      const bob = Math.sin(time * 1.3 + s.phase) * 3 * s.scale;
      const tilt = Math.sin(time * 0.9 + s.phase) * 1.8;
      s.el.style.transform = `translate3d(${s.x.toFixed(1)}px, ${(bottom - h + bob).toFixed(1)}px, 0) scale(${s.scale.toFixed(3)}) rotate(${tilt.toFixed(2)}deg)`;
    }
    drawSky(time);
    requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------------ */
  /* Sky: stars and rising lanterns                                      */
  /* ------------------------------------------------------------------ */

  const sky = $('sky');
  const ctx = sky.getContext('2d');
  let stars = [];
  let lanterns = [];
  let glints = [];
  let moonX = 0;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function resizeSky() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    sky.width = Math.round(W * dpr);
    sky.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars = Array.from({ length: Math.round((W * horizonY) / 5500) }, () => ({
      x: Math.random() * W, y: Math.random() * horizonY * 0.95, r: Math.random() * 1.3 + 0.3, p: Math.random() * Math.PI * 2, s: 0.6 + Math.random() * 1.6,
    }));
    lanterns = Array.from({ length: Math.max(4, Math.round(W / 220)) }, () => newLantern(true));
    const m = $('moon').getBoundingClientRect();
    moonX = m.left + m.width / 2;
    // Moonlight on the water: short ripples that spread out and fade with distance.
    glints = Array.from({ length: 60 }, (_, i) => {
      const d = i / 60;
      return { d, off: (Math.random() - 0.5) * (0.04 + d * 0.16) * W, len: 8 + Math.random() * (14 + d * 40), p: Math.random() * Math.PI * 2 };
    });
  }

  function newLantern(anywhere) {
    return {
      x: Math.random() * W,
      y: anywhere ? Math.random() * horizonY : horizonY + 10,
      size: 6 + Math.random() * 10,
      speed: 6 + Math.random() * 10,
      sway: Math.random() * Math.PI * 2,
    };
  }

  let lastSky = 0;
  function drawSky(time) {
    const dt = lastSky ? Math.min(0.1, time - lastSky) : 0;
    lastSky = time;
    ctx.clearRect(0, 0, W, H);
    for (const s of stars) {
      const a = reduceMotion ? 0.8 : 0.45 + 0.45 * Math.sin(time * s.s + s.p);
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    const riverH = H - horizonY;
    ctx.lineCap = 'round';
    for (const g of glints) {
      const a = (1 - g.d) * (reduceMotion ? 0.35 : 0.2 + 0.25 * (0.5 + 0.5 * Math.sin(time * 1.7 + g.p)));
      ctx.globalAlpha = a;
      ctx.strokeStyle = '#ffeec0';
      ctx.lineWidth = 1.5 + g.d * 2.5;
      const y = horizonY + 6 + g.d * riverH * 0.92;
      const x = moonX + g.off + (reduceMotion ? 0 : Math.sin(time * 0.8 + g.p) * 6);
      ctx.beginPath();
      ctx.moveTo(x - g.len / 2, y);
      ctx.lineTo(x + g.len / 2, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const l of lanterns) {
      if (!reduceMotion) {
        l.y -= l.speed * dt;
        l.x += Math.sin(time * 0.4 + l.sway) * 0.15;
      }
      if (l.y < -40) Object.assign(l, newLantern(false));
      const fade = Math.min(1, Math.max(0, (horizonY - l.y) / 80));
      const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.size * 3);
      g.addColorStop(0, `rgba(255, 190, 90, ${0.55 * fade})`);
      g.addColorStop(1, 'rgba(255, 150, 60, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(l.x, l.y, l.size * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255, 214, 140, ${0.95 * fade})`;
      const w = l.size, h = l.size * 1.25;
      ctx.beginPath();
      ctx.moveTo(l.x - w * 0.5, l.y - h * 0.5);
      ctx.lineTo(l.x + w * 0.5, l.y - h * 0.5);
      ctx.lineTo(l.x + w * 0.38, l.y + h * 0.5);
      ctx.lineTo(l.x - w * 0.38, l.y + h * 0.5);
      ctx.closePath();
      ctx.fill();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Data                                                                */
  /* ------------------------------------------------------------------ */

  function updateCount() {
    $('count').textContent = t('ktLiveCount', pool.length);
    $('empty').hidden = pool.length > 0;
  }

  function addKrathongs(list, fresh) {
    for (const k of list) {
      if (byId.has(k.id)) continue;
      byId.set(k.id, k);
      pool.push(k);
      if (!lastCreatedAt || k.createdAt > lastCreatedAt) lastCreatedAt = k.createdAt;
      if (fresh) {
        priority.push(k.id);
        toast(t('ktNew', k.name || t('ktFriend')));
      }
    }
    updateCount();
    if (fresh) {
      // Let new arrivals in straight away, even if the river is full.
      while (priority.length && sprites.length < maxSprites() + 4) {
        const next = nextKrathong();
        if (!next) break;
        makeSprite(next.k, { x: -baseW, fresh: true });
      }
    }
    fill(!fresh);
  }

  async function poll() {
    try {
      const list = await DB.listKrathongs({ since: lastCreatedAt || undefined, limit: 200 });
      addKrathongs(list, true);
    } catch { /* try again next time */ }
    setTimeout(poll, POLL_MS);
  }

  async function refreshHidden() {
    try {
      const ids = await DB.krathongIds();
      const removed = pool.filter((k) => !ids.has(k.id));
      if (removed.length) {
        const gone = new Set(removed.map((k) => k.id));
        pool = pool.filter((k) => !gone.has(k.id));
        gone.forEach((id) => byId.delete(id));
        sprites.filter((s) => gone.has(s.k.id)).forEach((s) => {
          s.el.classList.add('leaving');
          setTimeout(() => removeSprite(s), 1000);
        });
        cursor = 0;
        updateCount();
      }
    } catch { /* ignore */ }
    setTimeout(refreshHidden, REFRESH_MS);
  }

  function toast(message) {
    const box = $('toasts');
    const n = document.createElement('div');
    n.className = 'toast';
    n.textContent = message;
    box.appendChild(n);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => n.remove(), 6000);
  }

  /* ------------------------------------------------------------------ */
  /* QR code, full screen, idle cursor                                   */
  /* ------------------------------------------------------------------ */

  function renderQr() {
    const url = new URL('../loykrathong/', location.href).href;
    $('qr-url').textContent = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    try {
      const qr = window.qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      const n = qr.getModuleCount();
      let path = '';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) path += `M${c} ${r}h1v1h-1z`;
      $('qr').innerHTML = `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="QR code"><path d="${path}" fill="#0b1533"/></svg>`;
    } catch {
      $('qr').hidden = true;
    }
  }

  $('btn-fullscreen').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  });

  let idleTimer;
  function wake() {
    scene.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => scene.classList.add('idle'), 3000);
  }
  ['mousemove', 'touchstart', 'keydown'].forEach((ev) => window.addEventListener(ev, wake, { passive: true }));

  /* ------------------------------------------------------------------ */
  /* Start                                                               */
  /* ------------------------------------------------------------------ */

  window.addEventListener('resize', () => measure());
  onLangChange(() => {
    updateCount();
    sprites.forEach((s) => { if (!s.k.name) s.el.querySelector('.kt-label .n').textContent = t('ktFriend'); });
  });

  applyI18n();
  measure();
  renderQr();
  wake();
  requestAnimationFrame(frame);

  if (!DB.configured) {
    $('empty').hidden = false;
    $('empty').querySelector('.empty-big').textContent = t('notConfigured');
    return;
  }

  DB.listKrathongs({ limit: 500 })
    .then((list) => addKrathongs(list, false))
    .catch(() => updateCount())
    .finally(() => {
      setTimeout(poll, POLL_MS);
      setTimeout(refreshHidden, REFRESH_MS);
    });
})();
