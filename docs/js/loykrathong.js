/* Loy Krathong builder: design a krathong and float it with a wish. */
(function () {
  'use strict';
  const { t, applyI18n, onLangChange, getLang } = window.CAMC;
  const AVATAR_LABEL = { boy: 'avBoy', girl: 'avGirl' };
  const $ = (id) => document.getElementById(id);

  let design = Krathong.random();
  const DRAFT_KEY = 'camc_krathong_draft';
  const SENT_KEY = 'camc_krathong_sent';
  const SENT_LOCK_MS = 12 * 60 * 60 * 1000; // one krathong per device for 12 hours
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (saved) design = Krathong.normalize(saved);
  } catch { /* ignore */ }
  // Drafts saved before faces and wishes existed get one of each to start with.
  if (!Krathong.AVATARS.includes(design.avatar) || !design.wish) {
    const r = Krathong.random();
    design = { ...design, avatar: Krathong.AVATARS.includes(design.avatar) ? design.avatar : r.avatar, wish: design.wish || r.wish };
  }

  function saveDraft() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(design)); } catch { /* ignore */ }
  }

  const LABELS = {
    base: { leaf: 'baseLeaf', bread: 'baseBread', coconut: 'baseCoconut', lotus: 'baseLotus' },
    flower: { marigold: 'flMarigold', orchid: 'flOrchid', lotus: 'flLotus', rose: 'flRose', jasmine: 'flJasmine' },
    deco: { none: 'decoNone', pearls: 'decoPearls', ribbon: 'decoRibbon', stars: 'decoStars' },
  };

  /* --- Rendering ------------------------------------------------------ */

  // Optional extras, switched on and off by teachers (loaded in checkOpen).
  let features = { extraWishes: false, classes: false };
  let classes = [];

  /** The class flag for the krathong, when classes are switched on. */
  function groupFor(d) {
    if (!features.classes || !d.group) return null;
    const g = classes.find((c) => c.id === d.group);
    return g ? { id: g.id, color: g.color } : null;
  }

  function renderPreview() {
    $('kt-preview').innerHTML = Krathong.svg(design, { animated: true, group: groupFor(design) });
  }

  function renderClassPicker() {
    $('kt-class-panel').hidden = !features.classes;
    if (!features.classes) return;
    const sel = $('kt-class');
    if (sel.options.length !== classes.length + 1) {
      sel.innerHTML = '';
      const first = document.createElement('option');
      first.value = '';
      first.textContent = t('ktPickClass');
      sel.appendChild(first);
      classes.forEach((c) => {
        const o = document.createElement('option');
        o.value = c.id;
        o.textContent = c.name;
        sel.appendChild(o);
      });
    } else {
      sel.options[0].textContent = t('ktPickClass');
    }
    sel.value = design.group && classes.some((c) => c.id === design.group) ? design.group : '';
  }

  function optionCards(containerId, key, values) {
    const box = $(containerId);
    box.innerHTML = '';
    values.forEach((v) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'kt-option';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(design[key] === v));
      const art = document.createElement('span');
      art.className = 'kt-option-art';
      art.innerHTML = Krathong.svg({ ...design, [key]: v });
      const label = document.createElement('span');
      label.className = 'kt-option-label';
      label.textContent = t(LABELS[key][v]);
      b.append(art, label);
      b.addEventListener('click', () => set(key, v));
      box.appendChild(b);
    });
  }

  function swatches(containerId, key, colors) {
    const box = $(containerId);
    box.innerHTML = '';
    colors.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.style.background = c;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(design[key] === c));
      b.setAttribute('aria-label', c);
      b.addEventListener('click', () => set(key, c));
      box.appendChild(b);
    });
  }

  function segmented(containerId, key, values, label) {
    const box = $(containerId);
    box.innerHTML = '';
    values.forEach((v) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-pressed', String(design[key] === v));
      b.setAttribute('aria-checked', String(design[key] === v));
      b.textContent = label ? label(v) : String(v);
      b.addEventListener('click', () => set(key, v));
      box.appendChild(b);
    });
  }

  function renderControls() {
    optionCards('opt-base', 'base', Krathong.BASES);
    swatches('opt-petal', 'petal', Krathong.PETAL_COLORS);
    optionCards('opt-flower', 'flower', Krathong.FLOWERS);
    swatches('opt-flowerColor', 'flowerColor', Krathong.FLOWER_COLORS);
    segmented('opt-candles', 'candles', [1, 2, 3]);
    segmented('opt-incense', 'incense', [0, 1, 2, 3]);
    segmented('opt-deco', 'deco', Krathong.DECOS, (v) => t(LABELS.deco[v]));
    avatarCards();
    wishButtons();
  }

  // Doll faces instead of a typed name.
  function avatarCards() {
    const box = $('opt-avatar');
    box.innerHTML = '';
    Krathong.AVATARS.forEach((v) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'kt-option kt-avatar-option';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(design.avatar === v));
      b.setAttribute('aria-label', t(AVATAR_LABEL[v]));
      // Draw just the face, zoomed in.
      b.innerHTML = `<span class="kt-face"><svg viewBox="36 84 52 50" aria-hidden="true">${Krathong.avatarSvg(v)}</svg></span>`;
      const label = document.createElement('span');
      label.className = 'kt-option-label';
      label.textContent = t(AVATAR_LABEL[v]);
      b.appendChild(label);
      b.addEventListener('click', () => set('avatar', v));
      box.appendChild(b);
    });
  }

  // Five wishes to pick from instead of typing one.
  function wishButtons() {
    const box = $('opt-wish');
    box.innerHTML = '';
    (features.extraWishes ? Krathong.WISH_KEYS : Krathong.BASIC_WISHES).forEach((v) => {
      const w = Krathong.WISHES[v];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'kt-wish-option';
      b.style.setProperty('--wish', w.color);
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(design.wish === v));
      const icon = document.createElement('span');
      icon.className = 'kt-wish-icon';
      icon.textContent = w.icon;
      const label = document.createElement('span');
      label.textContent = getLang() === 'en' ? w.en : w.th;
      b.append(icon, label);
      b.addEventListener('click', () => set('wish', v));
      box.appendChild(b);
    });
  }

  function render() {
    // A wish that has been switched off can't be chosen.
    if (!features.extraWishes && design.wish && !Krathong.BASIC_WISHES.includes(design.wish)) design.wish = Krathong.BASIC_WISHES[0];
    renderClassPicker();
    renderPreview();
    renderControls();
  }

  function set(key, value) {
    design = Krathong.normalize({ ...design, [key]: value });
    saveDraft();
    render();
  }

  /* --- Floating --------------------------------------------------------- */

  $('kt-name').addEventListener('input', () => { $('kt-error').textContent = ''; });
  $('kt-class').addEventListener('change', (e) => {
    $('kt-error').textContent = '';
    design = { ...design, group: e.target.value || null };
    saveDraft();
    render();
  });

  $('kt-random').addEventListener('click', () => {
    design = Krathong.random();
    saveDraft();
    render();
    const p = $('kt-preview');
    p.classList.remove('pop');
    void p.offsetWidth;
    p.classList.add('pop');
  });

  $('kt-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('kt-error').textContent = '';
    const btn = $('kt-submit');
    btn.disabled = true;
    btn.textContent = t('ktFloating');
    try {
      if (!design.avatar || !design.wish) {
        $('kt-error').textContent = t('ktPickBoth');
        return;
      }
      if (features.classes && !groupFor(design)) {
        $('kt-error').textContent = t('ktNeedClass');
        $('kt-class').focus();
        return;
      }
      const name = $('kt-name').value.trim();
      if (!name) {
        $('kt-error').textContent = t('ktNeedName');
        $('kt-name').focus();
        return;
      }
      // The name is kept for teachers only; it never appears on the river.
      const sendDesign = { ...design };
      if (!features.classes) delete sendDesign.group;
      await DB.submitKrathong({ name, wish: '', design: sendDesign });
      // Lock the builder on this device so it can't go back and float another.
      try { localStorage.setItem(SENT_KEY, JSON.stringify({ at: Date.now(), design, group: groupFor(design) })); } catch { /* ignore */ }
      // Float the preview away, then show the thank-you panel.
      $('kt-preview').classList.add('float-away');
      await new Promise((r) => setTimeout(r, 1600));
      showDone(design, groupFor(design));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      $('kt-error').textContent = err.status === 503 ? t('notConfigured') : err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = t('ktFloat');
    }
  });

  /** Show the thank-you panel. Once a krathong is floated, the builder stays closed on this device. */
  function showDone(d, group) {
    $('kt-done-art').innerHTML = Krathong.svg(d, { animated: true, group });
    $('kt-builder').hidden = true;
    $('kt-hero').hidden = true;
    $('kt-done').hidden = false;
  }

  function alreadySent() {
    try {
      const sent = JSON.parse(localStorage.getItem(SENT_KEY) || 'null');
      if (sent && Date.now() - sent.at < SENT_LOCK_MS) return sent;
      localStorage.removeItem(SENT_KEY);
    } catch { /* storage unavailable */ }
    return null;
  }

  // Coming back with the browser's Back button can restore the old page from
  // memory; check again so the builder never reappears after floating.
  window.addEventListener('pageshow', () => {
    const sent = alreadySent();
    if (sent && $('kt-done').hidden) showDone(Krathong.normalize(sent.design), sent.group);
  });

  /* --- Status ----------------------------------------------------------- */

  async function checkOpen() {
    if (!DB.configured) {
      showClosed(t('notConfigured'));
      return;
    }
    try {
      const s = await DB.krathongStatus();
      if (s && s.open === false) showClosed(t('ktClosed'));
      if (s && s.features) features = s.features;
      if (features.classes) {
        const { groups } = await DB.listGroups();
        classes = groups.filter((g) => g.kind === 'class');
      }
      render();
    } catch {
      /* the submit call reports any problem */
    }
  }

  function showClosed(message) {
    const n = $('kt-closed');
    n.textContent = message;
    n.hidden = false;
    $('kt-submit').disabled = true;
  }

  onLangChange(() => { render(); $('kt-submit').textContent = t('ktFloat'); });
  applyI18n();
  const sent = alreadySent();
  if (sent) {
    showDone(Krathong.normalize(sent.design), sent.group);
  } else {
    render();
    checkOpen();
  }
})();
