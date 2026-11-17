/* Loy Krathong builder: design a krathong and float it with a wish. */
(function () {
  'use strict';
  const { t, applyI18n, onLangChange } = window.CAMC;
  const $ = (id) => document.getElementById(id);

  let design = Krathong.random();
  const DRAFT_KEY = 'camc_krathong_draft';
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (saved) design = Krathong.normalize(saved);
  } catch { /* ignore */ }

  function saveDraft() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(design)); } catch { /* ignore */ }
  }

  const LABELS = {
    base: { leaf: 'baseLeaf', bread: 'baseBread', coconut: 'baseCoconut', lotus: 'baseLotus' },
    flower: { marigold: 'flMarigold', orchid: 'flOrchid', lotus: 'flLotus', rose: 'flRose', jasmine: 'flJasmine' },
    deco: { none: 'decoNone', pearls: 'decoPearls', ribbon: 'decoRibbon', stars: 'decoStars' },
  };

  /* --- Rendering ------------------------------------------------------ */

  function renderPreview() {
    $('kt-preview').innerHTML = Krathong.svg(design, { animated: true });
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
  }

  function render() {
    renderPreview();
    renderControls();
  }

  function set(key, value) {
    design = Krathong.normalize({ ...design, [key]: value });
    saveDraft();
    render();
  }

  /* --- Wish form ------------------------------------------------------ */

  function updateCounter() {
    $('kt-counter').textContent = `${$('kt-wish').value.length} / 140`;
  }
  $('kt-wish').addEventListener('input', updateCounter);

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
      await DB.submitKrathong({ name: $('kt-name').value.trim(), wish: $('kt-wish').value.trim(), design });
      // Float the preview away, then show the thank-you panel.
      $('kt-preview').classList.add('float-away');
      await new Promise((r) => setTimeout(r, 1600));
      $('kt-done-art').innerHTML = Krathong.svg(design, { animated: true });
      $('kt-builder').hidden = true;
      $('kt-done').hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      $('kt-error').textContent = err.status === 503 ? t('notConfigured') : err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = t('ktFloat');
    }
  });

  $('kt-again').addEventListener('click', () => {
    $('kt-wish').value = '';
    updateCounter();
    $('kt-preview').classList.remove('float-away');
    design = Krathong.random();
    saveDraft();
    render();
    $('kt-done').hidden = true;
    $('kt-builder').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
  render();
  updateCounter();
  checkOpen();
})();
