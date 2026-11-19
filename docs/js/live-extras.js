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

  /* ---------------- Features ---------------- */

  async function loadFeatures() {
    try {
      const s = await DB.krathongStatus();
      const next = (s && s.features) || {};
      const changed = JSON.stringify(next) !== JSON.stringify(features);
      if (next.classes && !groups.size) {
        const { groups: list } = await DB.listGroups();
        list.forEach((g) => groups.set(g.id, g));
      }
      features = next;
      if (features.music) Music.start(); else Music.stop();
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

  function celebrate(n) {
    const banner = $('milestone');
    banner.textContent = t('ktMilestone', n);
    banner.hidden = false;
    setTimeout(() => { banner.hidden = true; }, 7000);
    if (reduceMotion) return;
    showUntil = performance.now() + 6500;
    for (let i = 0; i < 4; i++) setTimeout(launch, i * 250);
    if (!running) { running = true; requestAnimationFrame(tick); }
  }

  /** Call when the number of krathongs goes from `before` to `after`. */
  function milestone(before, after) {
    if (!features.fireworks) return;
    if (Math.floor(after / 100) > Math.floor(before / 100) && after >= 100) celebrate(Math.floor(after / 100) * 100);
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

    async function start() {
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
      clearInterval(timer);
      if (actx) {
        master.gain.setTargetAtTime(0.0001, actx.currentTime, 0.3);
        setTimeout(() => { if (!on && actx) actx.suspend().catch(() => {}); }, 1500);
      }
    }

    async function unlock() {
      if (!on || !actx) return;
      await actx.resume().catch(() => {});
      if (actx.state === 'running') {
        showButton(false);
        nextTime = actx.currentTime + 0.1;
      }
    }

    $('music-btn').addEventListener('click', unlock);
    ['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, unlock));
    return { start, stop };
  })();

  window.LiveExtras = { start, groupFor, renderStats, milestone, features: () => features };
})();
