/*
 * Loy Krathong live river extras. Teachers switch each one on or off in the
 * teacher page (Loy Krathong tab); the big screen checks every 30 seconds.
 *   wishCount  how many krathongs each wish has
 *   classes    class flags on krathongs and a top-5 class leaderboard
 *   fireworks  fireworks every 100 krathongs
 *   music      an original, soft Thai-style tune made in the browser
 *              (pentatonic ranat/khim-like notes with a gentle ching)
 */
(function () {
  'use strict';
  const { t, getLang } = window.CAMC;
  const $ = (id) => document.getElementById(id);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let features = {};
  const groups = new Map();
  let onChange = () => {};
  let countdownAt = null;   // ISO time everyone floats together
  let clockOffset = 0;      // server time minus this computer's time

  /* ---------------- Features ---------------- */

  async function loadFeatures() {
    try {
      const s = await DB.krathongStatus();
      const next = (s && s.features) || {};
      countdownAt = (s && s.countdownAt) || null;
      if (s && s.now) clockOffset = Date.parse(s.now) - Date.now();
      const changed = JSON.stringify(next) !== JSON.stringify(features);
      if (next.classes && !groups.size) {
        const { groups: list } = await DB.listGroups();
        list.forEach((g) => groups.set(g.id, g));
      }
      features = next;
      if (features.music) Music.start(); else Music.stop();
      $('btn-photo').hidden = !features.keepsake;
      if (changed) onChange();
    } catch { /* try again later */ }
  }

  function start(opts) {
    onChange = opts.onChange || onChange;
    loadFeatures();
    setInterval(loadFeatures, 30000);
  }

  /** The class flag for a krathong, or null when classes are switched off. */
  function groupFor(k) {
    const id = k && k.design && k.design.group;
    if (!features.classes || !id) return null;
    const g = groups.get(id);
    return { id, color: g ? g.color : '#0071e3' };
  }

  /* ---------------- Wish counts and class leaderboard ---------------- */

  function renderStats(pool) {
    // Wish counts, most popular first
    const wishBox = $('wish-counts');
    const wishes = {};
    pool.forEach((k) => { const w = k.design && k.design.wish; if (w) wishes[w] = (wishes[w] || 0) + 1; });
    const wishList = Object.entries(wishes).filter(([w]) => Krathong.WISHES[w]).sort((a, b) => b[1] - a[1]);
    wishBox.hidden = !features.wishCount || !wishList.length;
    wishBox.replaceChildren(...wishList.map(([w, n]) => {
      const el = document.createElement('span');
      el.textContent = `${Krathong.WISHES[w].icon} ${n}`;
      el.title = Krathong.wishLabel(w, getLang());
      return el;
    }));

    // Top 5 classes
    const board = $('class-board');
    const counts = {};
    pool.forEach((k) => { const g = k.design && k.design.group; if (g) counts[g] = (counts[g] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    board.hidden = !features.classes || !top.length;
    const max = top.length ? top[0][1] : 1;
    $('class-list').replaceChildren(...top.map(([id, n], i) => {
      const g = groups.get(id);
      const li = document.createElement('li');
      const rank = document.createElement('span');
      rank.className = 'rank';
      rank.textContent = String(i + 1);
      const cls = document.createElement('span');
      cls.className = 'cls';
      cls.textContent = id;
      const bar = document.createElement('span');
      bar.className = 'bar';
      const fill = document.createElement('i');
      fill.style.width = `${Math.round((n / max) * 100)}%`;
      fill.style.background = g && /^#[0-9a-f]{6}$/i.test(g.color) ? g.color : '#ffd60a';
      bar.appendChild(fill);
      const num = document.createElement('span');
      num.className = 'n';
      num.textContent = String(n);
      li.append(rank, cls, bar, num);
      return li;
    }));
  }

  /* ---------------- Countdown to floating together ---------------- */

  function celebratedKey(at) { return 'camc_countdown_done_' + at; }
  function countdownTick() {
    const box = $('countdown');
    if (!features.countdown || !countdownAt) { box.hidden = true; return; }
    const left = Date.parse(countdownAt) - (Date.now() + clockOffset);
    if (left > 0) {
      const s = Math.ceil(left / 1000);
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
      $('countdown-v').textContent = (h ? `${h}:${String(m).padStart(2, '0')}` : String(m)) + ':' + String(sec).padStart(2, '0');
      box.classList.toggle('soon', s <= 10);
      box.hidden = false;
      return;
    }
    box.hidden = true;
    // At zero: the big moment (once, and only if we're within two minutes of it).
    let done = false;
    try { done = localStorage.getItem(celebratedKey(countdownAt)) === '1'; } catch { /* ignore */ }
    if (!done && left > -120000) {
      try { localStorage.setItem(celebratedKey(countdownAt), '1'); } catch { /* ignore */ }
      celebrate(t('ktHappy'), 15000);
    }
  }
  setInterval(countdownTick, 250);

  /* ---------------- Fireworks at every 100 ---------------- */

  const canvas = $('fireworks');
  const ctx = canvas.getContext('2d');
  let particles = [];
  let rockets = [];
  let showUntil = 0;
  let running = false;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  const COLORS = ['#ffd60a', '#ff9f0a', '#ff375f', '#64d2ff', '#30d158', '#bf5af2', '#ffffff'];

  function launch() {
    const W = window.innerWidth, H = window.innerHeight;
    rockets.push({ x: W * (0.15 + Math.random() * 0.7), y: H * 0.55, vy: -(7 + Math.random() * 3), target: H * (0.12 + Math.random() * 0.25), color: COLORS[Math.floor(Math.random() * COLORS.length)] });
  }

  function explode(r) {
    const n = 70;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const sp = 1.5 + Math.random() * 3.5;
      particles.push({ x: r.x, y: r.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, color: Math.random() < 0.2 ? '#ffffff' : r.color });
    }
  }

  function tick() {
    const W = window.innerWidth, H = window.innerHeight;
    ctx.clearRect(0, 0, W, H);
    const now = performance.now();
    if (now < showUntil && Math.random() < 0.06) launch();
    rockets = rockets.filter((r) => {
      r.y += r.vy;
      ctx.fillStyle = '#fff3cf';
      ctx.beginPath();
      ctx.arc(r.x, r.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
      if (r.y <= r.target) { explode(r); return false; }
      return true;
    });
    particles = particles.filter((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.045;
      p.vx *= 0.985;
      p.life -= 0.012;
      if (p.life <= 0) return false;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
      return true;
    });
    ctx.globalAlpha = 1;
    if (now < showUntil || rockets.length || particles.length) requestAnimationFrame(tick);
    else { running = false; ctx.clearRect(0, 0, W, H); }
  }

  function fireworks(ms) {
    if (reduceMotion) return;
    showUntil = Math.max(showUntil, performance.now() + ms);
    for (let i = 0; i < 4; i++) setTimeout(launch, i * 250);
    if (!running) { running = true; requestAnimationFrame(tick); }
  }

  function celebrate(text, ms = 6500) {
    const banner = $('milestone');
    banner.textContent = text;
    banner.hidden = false;
    clearTimeout(celebrate.timer);
    celebrate.timer = setTimeout(() => { banner.hidden = true; }, ms + 1500);
    fireworks(ms);
  }

  /** Call when the number of krathongs goes from `before` to `after`. */
  function milestone(before, after) {
    if (!features.fireworks) return;
    if (Math.floor(after / 100) > Math.floor(before / 100) && after >= 100) celebrate(t('ktMilestone', Math.floor(after / 100) * 100));
  }

  /* ---------------- Music ---------------- */

  const Music = (() => {
    let actx = null;
    let master = null;
    let timer = null;
    let on = false;
    let nextTime = 0;
    let step = 0;
    let degree = 5;
    let phrase = [];
    let song = null; // <audio> with a song file chosen on this computer
    const BEAT = 0.42;                 // seconds per note: slow and gentle
    const ROOT = 293.66;               // D4
    const SCALE = [0, 2, 4, 7, 9];     // pentatonic, as in much Thai music

    const freq = (deg) => {
      const oct = Math.floor(deg / 5);
      const st = SCALE[((deg % 5) + 5) % 5] + 12 * oct;
      return ROOT * Math.pow(2, st / 12);
    };

    // A soft plucked note (like ranat or khim): quick attack, gentle fade.
    function pluck(f, time, vol) {
      const o1 = actx.createOscillator();
      const o2 = actx.createOscillator();
      const g = actx.createGain();
      const lp = actx.createBiquadFilter();
      o1.type = 'triangle';
      o2.type = 'sine';
      o1.frequency.value = f;
      o2.frequency.value = f * 2;
      lp.type = 'lowpass';
      lp.frequency.value = 2600;
      const g2 = actx.createGain();
      g2.gain.value = 0.25;
      o1.connect(g);
      o2.connect(g2).connect(g);
      g.connect(lp).connect(master);
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(vol, time + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 1.3);
      o1.start(time); o2.start(time);
      o1.stop(time + 1.4); o2.stop(time + 1.4);
    }

    // A small "ching" cymbal tap.
    function ching(time) {
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = 'triangle';
      o.frequency.value = 3150;
      o.connect(g).connect(master);
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(0.035, time + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.35);
      o.start(time);
      o.stop(time + 0.4);
    }

    function newPhrase() {
      // Wander up and down the scale, ending back on a home note.
      const p = [];
      for (let i = 0; i < 15; i++) {
        degree += [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)];
        degree = Math.max(2, Math.min(11, degree));
        p.push(Math.random() < 0.15 ? null : degree);
      }
      p.push(5);
      return p;
    }

    function schedule() {
      while (nextTime < actx.currentTime + 0.6) {
        if (step % 16 === 0) phrase = (step % 32 === 16 && phrase.length) ? phrase : newPhrase(); // repeat each phrase once
        const note = phrase[step % 16];
        if (note !== null) pluck(freq(note), nextTime, 0.11);
        if (step % 4 === 0) pluck(freq(note === null ? 0 : (note % 5)) / 2, nextTime, 0.07); // low note every bar
        if (step % 2 === 1) ching(nextTime);
        nextTime += BEAT;
        step++;
      }
    }

    function showButton(show) {
      $('music-btn').hidden = !show;
    }

    async function playSong() {
      try {
        await song.play();
        showButton(false);
      } catch {
        showButton(true); // the browser needs a tap first
      }
    }

    /** Use a song file chosen on this computer instead of the built-in tune. */
    function setSong(file) {
      if (song) { song.pause(); URL.revokeObjectURL(song.src); }
      song = new Audio(URL.createObjectURL(file));
      song.loop = true;
      song.volume = 0.8;
      clearInterval(timer);
      if (actx) actx.suspend().catch(() => {});
      if (on) playSong();
    }

    // The school's song: docs/audio.mp3 on the website. If it isn't there,
    // the built-in tune plays instead.
    const SONG_URL = '../audio.mp3';
    let songChecked = false;
    async function loadSchoolSong() {
      if (songChecked) return;
      songChecked = true;
      try {
        const r = await fetch(SONG_URL, { method: 'HEAD', cache: 'no-store' });
        if (!r.ok || song) return;
        song = new Audio(SONG_URL);
        song.loop = true;
        song.volume = 0.8;
      } catch { /* no song file: use the built-in tune */ }
    }

    async function start() {
      await loadSchoolSong();
      if (song) {
        on = true;
        if (song.paused) playSong();
        return;
      }
      if (on) { if (actx && actx.state !== 'running') showButton(true); return; }
      on = true;
      try {
        if (!actx) {
          actx = new (window.AudioContext || window.webkitAudioContext)();
          master = actx.createGain();
          master.gain.value = 0.7;
          master.connect(actx.destination);
        }
        master.gain.setValueAtTime(0.7, actx.currentTime);
        if (actx.state !== 'running') await actx.resume().catch(() => {});
      } catch {
        on = false;
        return;
      }
      // Browsers only allow sound after someone clicks or taps the page.
      showButton(actx.state !== 'running');
      nextTime = actx.currentTime + 0.1;
      clearInterval(timer);
      timer = setInterval(() => { if (on && actx.state === 'running') schedule(); }, 200);
    }

    function stop() {
      if (!on) return;
      on = false;
      showButton(false);
      if (song) { song.pause(); return; }
      clearInterval(timer);
      if (actx) {
        master.gain.setTargetAtTime(0.0001, actx.currentTime, 0.3);
        setTimeout(() => { if (!on && actx) actx.suspend().catch(() => {}); }, 1500);
      }
    }

    async function unlock() {
      if (on && song) { if (song.paused) playSong(); return; }
      if (!on || !actx) return;
      await actx.resume().catch(() => {});
      if (actx.state === 'running') {
        showButton(false);
        nextTime = actx.currentTime + 0.1;
      }
    }

    $('music-btn').addEventListener('click', unlock);
    ['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, unlock));
    return { start, stop, setSong };
  })();


  /* ---------------- Keepsake picture ---------------- */

  // Draw an SVG element onto the canvas at its place on screen.
  function drawSvg(c2, svg, rect) {
    return new Promise((resolve) => {
      const clone = svg.cloneNode(true);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      // Colours that come from the stylesheet (e.g. the wave lines) must be copied in.
      const originals = svg.querySelectorAll('path');
      clone.querySelectorAll('path').forEach((p, i) => {
        const cs = getComputedStyle(originals[i]);
        p.setAttribute('fill', cs.fill);
        p.setAttribute('stroke', cs.stroke);
        p.setAttribute('stroke-width', cs.strokeWidth);
      });
      clone.setAttribute('width', rect.width);
      clone.setAttribute('height', rect.height);
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
      const img = new Image();
      img.onload = () => { c2.drawImage(img, rect.left, rect.top, rect.width, rect.height); URL.revokeObjectURL(url); resolve(); };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(); };
      img.src = url;
    });
  }

  /** Save one picture of the river (sky, moon, krathongs and title) as a PNG. */
  async function savePicture() {
    const W = window.innerWidth, H = window.innerHeight;
    const scale = Math.min(2, 3840 / W);
    const out = document.createElement('canvas');
    out.width = Math.round(W * scale);
    out.height = Math.round(H * scale);
    const c2 = out.getContext('2d');
    c2.scale(scale, scale);

    // Night sky and river, as in live.css
    const horizon = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--horizon')) || 54) / 100;
    const bg = c2.createLinearGradient(0, 0, 0, H);
    [[0, '#030716'], [0.32, '#0a1438'], [0.48, '#1b1f55'], [horizon, '#2a2560'], [Math.min(1, horizon + 0.001), '#0c2246'], [0.7, '#08203f'], [1, '#04122a']]
      .forEach(([o, c]) => bg.addColorStop(o, c));
    c2.fillStyle = bg;
    c2.fillRect(0, 0, W, H);
    c2.drawImage($('sky'), 0, 0, W, H); // stars, lanterns, moonlight

    // Moon
    const m = $('moon').getBoundingClientRect();
    const mx = m.left + m.width / 2, my = m.top + m.height / 2, mr = m.width / 2;
    const glow = c2.createRadialGradient(mx, my, mr, mx, my, mr * 3);
    glow.addColorStop(0, 'rgba(255, 238, 180, 0.3)');
    glow.addColorStop(1, 'rgba(255, 238, 180, 0)');
    c2.fillStyle = glow;
    c2.beginPath(); c2.arc(mx, my, mr * 3, 0, Math.PI * 2); c2.fill();
    const face = c2.createRadialGradient(mx - mr * 0.25, my - mr * 0.25, 0, mx, my, mr);
    face.addColorStop(0, '#fffdf0'); face.addColorStop(0.55, '#f6ebbf'); face.addColorStop(1, '#dccb86');
    c2.fillStyle = face;
    c2.beginPath(); c2.arc(mx, my, mr, 0, Math.PI * 2); c2.fill();

    // Skyline, waves, then krathongs from far to near
    const skyline = document.querySelector('.skyline');
    if (skyline) await drawSvg(c2, skyline, skyline.getBoundingClientRect());
    const waves = document.querySelector('.waves');
    if (waves) await drawSvg(c2, waves, waves.getBoundingClientRect());
    const sprites = [...document.querySelectorAll('.kt-sprite')]
      .sort((a, b) => (Number(a.style.zIndex) || 0) - (Number(b.style.zIndex) || 0));
    for (const sp of sprites) {
      const svg = sp.querySelector('svg');
      const r = svg && svg.getBoundingClientRect();
      if (r && r.right > 0 && r.left < W && r.width > 4) await drawSvg(c2, svg, r);
    }
    c2.drawImage(canvas, 0, 0, W, H); // fireworks, if any

    // Title, count and date
    const font = '-apple-system, BlinkMacSystemFont, "Noto Sans Thai", "Segoe UI", sans-serif';
    const pad = Math.max(24, W * 0.03);
    c2.textBaseline = 'top';
    c2.fillStyle = '#f6dc96';
    c2.font = `700 ${Math.round(Math.max(36, W * 0.04))}px ${font}`;
    c2.fillText('ลอยกระทง · Loy Krathong', pad, pad);
    c2.fillStyle = 'rgba(255, 255, 255, 0.8)';
    c2.font = `500 ${Math.round(Math.max(16, W * 0.013))}px ${font}`;
    const date = new Date().toLocaleDateString(getLang() === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    c2.fillText(`CAMC · ${$('count').textContent} · ${date}`, pad, pad + Math.max(46, W * 0.05));

    out.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `loykrathong-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  }

  $('btn-photo').addEventListener('click', () => { savePicture().catch(() => {}); });

  window.LiveExtras = { start, groupFor, renderStats, milestone, features: () => features };
})();
