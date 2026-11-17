/* Krathong renderer: turns a design object into an SVG drawing. */
(function () {
  'use strict';

  const BASES = ['leaf', 'bread', 'coconut', 'lotus'];
  const FLOWERS = ['marigold', 'orchid', 'lotus', 'rose', 'jasmine'];
  const DECOS = ['none', 'pearls', 'ribbon', 'stars'];
  const PETAL_COLORS = ['#2e7d32', '#66bb6a', '#00897b', '#f06292', '#f5b301', '#8e44ad', '#1e88e5'];
  const FLOWER_COLORS = ['#ff9f0a', '#ffd60a', '#ffffff', '#ff6fae', '#e53935', '#9b59b6', '#ff5722'];
  const HEX = /^#[0-9a-fA-F]{6}$/;

  const DEFAULT = { base: 'leaf', petal: '#2e7d32', flower: 'marigold', flowerColor: '#ff9f0a', candles: 1, incense: 2, deco: 'pearls' };

  /** Return a safe, complete design (unknown values fall back to defaults). */
  function normalize(d) {
    d = d && typeof d === 'object' ? d : {};
    const int = (v, lo, hi, def) => (Number.isInteger(v) && v >= lo && v <= hi ? v : def);
    return {
      base: BASES.includes(d.base) ? d.base : DEFAULT.base,
      petal: HEX.test(d.petal || '') ? d.petal.toLowerCase() : DEFAULT.petal,
      flower: FLOWERS.includes(d.flower) ? d.flower : DEFAULT.flower,
      flowerColor: HEX.test(d.flowerColor || '') ? d.flowerColor.toLowerCase() : DEFAULT.flowerColor,
      candles: int(d.candles, 1, 3, DEFAULT.candles),
      incense: int(d.incense, 0, 3, DEFAULT.incense),
      deco: DECOS.includes(d.deco) ? d.deco : DEFAULT.deco,
    };
  }

  function random() {
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    return {
      base: pick(BASES), petal: pick(PETAL_COLORS), flower: pick(FLOWERS), flowerColor: pick(FLOWER_COLORS),
      candles: 1 + Math.floor(Math.random() * 3), incense: Math.floor(Math.random() * 4), deco: pick(DECOS),
    };
  }

  /* --- colour helpers --------------------------------------------------- */

  function mix(hex, target, amount) {
    const a = parseInt(hex.slice(1), 16), b = parseInt(target.slice(1), 16);
    const ch = (x, s) => (x >> s) & 255;
    const m = (s) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * amount);
    return '#' + ((1 << 24) | (m(16) << 16) | (m(8) << 8) | m(0)).toString(16).slice(1);
  }
  const shade = (hex, amt) => mix(hex, '#000000', amt);
  const tint = (hex, amt) => mix(hex, '#ffffff', amt);

  let uid = 0;

  /* --- parts ------------------------------------------------------------- */

  const BASE_STYLE = {
    leaf: { top: '#8bc34a', side: '#558b2f', ring: '#c5e1a5' },
    bread: { top: '#e2b06a', side: '#a86b2d', ring: '#f3d29b' },
    coconut: { top: '#f4ecd8', side: '#6d4c2f', ring: '#8d6e4f' },
    lotus: { top: '#43a047', side: '#2e7d32', ring: '#81c784' },
  };

  function base(d) {
    const s = BASE_STYLE[d.base];
    let out = '';
    // Cylinder side and top face.
    out += `<path d="M26 150 A94 24 0 0 0 214 150 L214 162 A94 24 0 0 1 26 162 Z" fill="${s.side}"/>`;
    out += `<ellipse cx="120" cy="150" rx="94" ry="24" fill="${s.top}"/>`;
    out += `<ellipse cx="120" cy="150" rx="80" ry="18" fill="none" stroke="${s.ring}" stroke-width="2" opacity=".7"/>`;
    if (d.base === 'bread') {
      // Crust speckles.
      [[60, 156], [90, 166], [130, 168], [170, 163], [196, 156], [48, 160]].forEach(([x, y]) => {
        out += `<ellipse cx="${x}" cy="${y}" rx="3" ry="1.6" fill="#7a4a1d" opacity=".5"/>`;
      });
    }
    if (d.base === 'coconut') {
      out += `<path d="M30 158 Q60 172 100 174 M140 174 Q180 172 210 158" stroke="#4e3420" stroke-width="2" fill="none" opacity=".6"/>`;
    }
    if (d.base === 'lotus') {
      // Pink lotus-petal skirt around the base.
      for (let i = 0; i < 9; i++) {
        const x = 34 + i * 21.5;
        out += `<path d="M${x - 12} 160 Q${x} 178 ${x + 12} 160 Q${x} 166 ${x - 12} 160 Z" fill="#f48fb1" stroke="#ec407a" stroke-width="1"/>`;
      }
    }
    return out;
  }

  function petal(x, y, w, h, color, lean) {
    const tipX = x + lean;
    const light = tint(color, 0.18), dark = shade(color, 0.22);
    return (
      `<path d="M${x - w} ${y} L${tipX} ${y - h} L${x + w} ${y} Q${x} ${y + 6} ${x - w} ${y} Z" fill="${color}" stroke="${dark}" stroke-width="1.2" stroke-linejoin="round"/>` +
      `<path d="M${x} ${y + 2} L${tipX} ${y - h} L${x + w} ${y} Z" fill="${light}" opacity=".55"/>`
    );
  }

  function backPetals(d) {
    let out = '';
    const n = 8;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x = 44 + t * 152;
      const y = 146 - Math.sin(t * Math.PI) * 14;
      out += petal(x, y, 13, 44, shade(d.petal, 0.12), (t - 0.5) * -10);
    }
    return out;
  }

  function frontPetals(d) {
    let out = '';
    const n = 9;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x = 34 + t * 172;
      const y = 165 + Math.sin(t * Math.PI) * 9;
      out += petal(x, y, 12, 26 - Math.abs(t - 0.5) * 8, d.petal, (t - 0.5) * 14);
    }
    return out;
  }

  function mound(d) {
    return `<ellipse cx="120" cy="132" rx="56" ry="26" fill="${shade(d.petal, 0.35)}"/>` +
      `<ellipse cx="120" cy="127" rx="50" ry="20" fill="${shade(d.petal, 0.2)}"/>`;
  }

  function flower(type, x, y, r, c) {
    const dark = shade(c, 0.25);
    let out = '';
    if (type === 'marigold') {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        out += `<circle cx="${(x + Math.cos(a) * r * 0.6).toFixed(1)}" cy="${(y + Math.sin(a) * r * 0.6).toFixed(1)}" r="${(r * 0.45).toFixed(1)}" fill="${c}" stroke="${dark}" stroke-width=".8"/>`;
      }
      out += `<circle cx="${x}" cy="${y}" r="${(r * 0.45).toFixed(1)}" fill="${shade(c, 0.12)}"/>`;
    } else if (type === 'orchid') {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * 360 - 90;
        out += `<ellipse cx="${x}" cy="${(y - r * 0.55).toFixed(1)}" rx="${(r * 0.38).toFixed(1)}" ry="${(r * 0.6).toFixed(1)}" fill="${c}" stroke="${dark}" stroke-width=".8" transform="rotate(${a + 90} ${x} ${y})"/>`;
      }
      out += `<circle cx="${x}" cy="${y}" r="${(r * 0.3).toFixed(1)}" fill="#ffe082"/>`;
    } else if (type === 'lotus') {
      const p = (dx, h, w, fill) => `<path d="M${x + dx - w} ${y + r * 0.6} Q${x + dx - w} ${y - h * 0.3} ${x + dx} ${y - h} Q${x + dx + w} ${y - h * 0.3} ${x + dx + w} ${y + r * 0.6} Z" fill="${fill}" stroke="${dark}" stroke-width=".8"/>`;
      out += p(-r * 0.55, r * 1.1, r * 0.45, shade(c, 0.08)) + p(r * 0.55, r * 1.1, r * 0.45, shade(c, 0.08)) + p(0, r * 1.45, r * 0.5, c);
    } else if (type === 'rose') {
      out += `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" stroke="${dark}" stroke-width="1"/>`;
      out += `<path d="M${x - r * 0.6} ${y} A${r * 0.6} ${r * 0.6} 0 1 1 ${x + r * 0.3} ${y + r * 0.5} M${x - r * 0.25} ${y} A${r * 0.3} ${r * 0.3} 0 1 1 ${x + r * 0.2} ${y + r * 0.2}" fill="none" stroke="${dark}" stroke-width="1.1"/>`;
    } else {
      // jasmine
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * 360;
        out += `<ellipse cx="${x}" cy="${(y - r * 0.5).toFixed(1)}" rx="${(r * 0.3).toFixed(1)}" ry="${(r * 0.55).toFixed(1)}" fill="${c}" stroke="${shade(c, 0.18)}" stroke-width=".7" transform="rotate(${a} ${x} ${y})"/>`;
      }
      out += `<circle cx="${x}" cy="${y}" r="${(r * 0.22).toFixed(1)}" fill="#fff59d"/>`;
    }
    return out;
  }

  function flowers(d) {
    const spots = [
      [88, 120, 11], [152, 120, 11], [120, 122, 10],
      [72, 136, 12], [168, 136, 12], [98, 140, 13], [142, 140, 13], [120, 144, 13],
    ];
    return spots.map(([x, y, r]) => flower(d.flower, x, y, r, d.flowerColor)).join('');
  }

  function candlesAndIncense(d, id, animated) {
    let out = '';
    // Incense sticks behind the candles.
    const incenseX = { 0: [], 1: [120], 2: [108, 132], 3: [104, 120, 136] }[d.incense];
    incenseX.forEach((x, i) => {
      const lean = (i - (incenseX.length - 1) / 2) * 5;
      out += `<line x1="${x}" y1="128" x2="${x + lean}" y2="58" stroke="#8d5a3b" stroke-width="2" stroke-linecap="round"/>`;
      out += `<circle cx="${x + lean}" cy="57" r="2.6" fill="#ff5722" class="${animated ? 'kt-ember' : ''}"/>`;
      if (animated) {
        out += `<path class="kt-smoke" d="M${x + lean} 54 q-5 -10 0 -20 q5 -10 0 -20" stroke="#ffffff" stroke-width="1.4" fill="none" opacity=".35"/>`;
      }
    });
    // Candles.
    const candleX = { 1: [120], 2: [109, 131], 3: [100, 120, 140] }[d.candles];
    candleX.forEach((x, i) => {
      const top = i === Math.floor(candleX.length / 2) && candleX.length !== 2 ? 82 : 90;
      out += `<rect x="${x - 5}" y="${top}" width="10" height="${124 - top}" rx="2" fill="url(#${id}-wax)"/>`;
      out += `<line x1="${x}" y1="${top}" x2="${x}" y2="${top - 5}" stroke="#3e2723" stroke-width="1.4"/>`;
      out += `<g class="${animated ? 'kt-flame' : ''}" style="transform-origin:${x}px ${top - 4}px">` +
        `<circle cx="${x}" cy="${top - 12}" r="14" fill="url(#${id}-glow)"/>` +
        `<path d="M${x} ${top - 24} Q${x + 6} ${top - 12} ${x} ${top - 4} Q${x - 6} ${top - 12} ${x} ${top - 24} Z" fill="url(#${id}-flame)"/>` +
        `</g>`;
    });
    return out;
  }

  function deco(d) {
    if (d.deco === 'pearls') {
      let out = '';
      for (let i = 0; i <= 16; i++) {
        const a = Math.PI * (i / 16);
        out += `<circle cx="${(120 - Math.cos(a) * 92).toFixed(1)}" cy="${(163 + Math.sin(a) * 21).toFixed(1)}" r="2.6" fill="#fffdf5" stroke="#d6cfc0" stroke-width=".6"/>`;
      }
      return out;
    }
    if (d.deco === 'ribbon') {
      return `<path d="M27 156 A94 24 0 0 0 213 156 L213 161 A94 24 0 0 1 27 161 Z" fill="#e6b422"/>` +
        `<path d="M112 178 l-8 10 l8 -3 l8 3 l-8 -10 Z" fill="#c9971a"/>`;
    }
    if (d.deco === 'stars') {
      let out = '';
      [[50, 164], [82, 172], [120, 175], [158, 172], [190, 164]].forEach(([x, y]) => {
        out += `<path d="M${x} ${y - 4} L${x + 1.2} ${y - 1.2} L${x + 4} ${y} L${x + 1.2} ${y + 1.2} L${x} ${y + 4} L${x - 1.2} ${y + 1.2} L${x - 4} ${y} L${x - 1.2} ${y - 1.2} Z" fill="#ffe082"/>`;
      });
      return out;
    }
    return '';
  }

  /**
   * SVG markup for a krathong. All values come from normalize(), so the
   * string is safe to insert as HTML.
   * opts: { animated: boolean, title: string (plain text, escaped) }
   */
  function svg(design, opts = {}) {
    const d = normalize(design);
    const id = 'kt' + ++uid;
    const defs =
      `<defs>` +
      `<linearGradient id="${id}-wax" x1="0" x2="1"><stop offset="0" stop-color="#fff3d6"/><stop offset=".6" stop-color="#fffaf0"/><stop offset="1" stop-color="#e8d9b5"/></linearGradient>` +
      `<radialGradient id="${id}-glow"><stop offset="0" stop-color="#ffd54f" stop-opacity=".75"/><stop offset="1" stop-color="#ffb300" stop-opacity="0"/></radialGradient>` +
      `<linearGradient id="${id}-flame" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff59d"/><stop offset=".55" stop-color="#ffb300"/><stop offset="1" stop-color="#ff6f00"/></linearGradient>` +
      `</defs>`;
    const title = opts.title ? `<title>${String(opts.title).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]))}</title>` : '';
    return (
      `<svg class="krathong-svg" viewBox="0 20 240 172" xmlns="http://www.w3.org/2000/svg" role="img">${title}${defs}` +
      base(d) + backPetals(d) + mound(d) + candlesAndIncense(d, id, !!opts.animated) + flowers(d) + frontPetals(d) + deco(d) +
      `</svg>`
    );
  }

  window.Krathong = { svg, normalize, random, DEFAULT, BASES, FLOWERS, DECOS, PETAL_COLORS, FLOWER_COLORS };
})();
