/* Shared helpers for the studio, student pages and big screens. */
(function () {
  'use strict';

  const cfg = window.CAMC_CONFIG || {};
  const configured = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
  const sb = configured
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
    : null;

  // Same key as the teacher portal, so a teacher signed in there is signed in here too.
  const TOKEN_KEY = 'camc_session';
  const token = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };

  /** A random ID for this browser, used to count one vote per device. */
  function voterId() {
    const KEY = 'camc_voter';
    try {
      let v = localStorage.getItem(KEY);
      if (!v) {
        v = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12));
        localStorage.setItem(KEY, v);
      }
      return v;
    } catch {
      if (!window.__camcVoter) window.__camcVoter = 'tmp-' + Math.random().toString(36).slice(2, 14);
      return window.__camcVoter;
    }
  }

  async function rpc(fn, args) {
    if (!configured) {
      throw Object.assign(new Error(window.CAMC ? window.CAMC.t('notConfigured') : 'Not connected to Supabase.'), { status: 503 });
    }
    const { data, error } = await sb.rpc(fn, args);
    if (error) {
      const err = new Error(/fetch|network/i.test(error.message || '') ? 'Can’t reach the server. Check your connection.' : error.message);
      err.code = error.code;
      if (error.code === '28000') err.status = 401;
      else if (error.code === '42501') err.status = 403;
      else if (error.code === 'P0002') err.status = 404;
      throw err;
    }
    return data;
  }

  const API = {
    configured,
    voterId,
    // Public
    roomState: (code) => rpc('camc_room_state', { p_code: code }),
    vote: (code, pollId, option) => rpc('camc_vote', { p_code: code, p_poll_id: pollId, p_voter: voterId(), p_option: option }),
    ask: (code, name, body) => rpc('camc_ask', { p_code: code, p_name: name, p_body: body, p_voter: voterId() }),
    roomQuestions: (code) => rpc('camc_room_questions', { p_code: code }),
    upvote: (code, id) => rpc('camc_upvote', { p_code: code, p_question_id: id, p_voter: voterId() }),
    wallState: (code, since) => rpc('camc_wall_state', { p_code: code, p_since: since || 0 }),
    wallPost: (code, name, message, color) => rpc('camc_wall_post', { p_code: code, p_name: name, p_message: message, p_color: color, p_voter: voterId() }),
    awardState: (id) => rpc('camc_award_state', { p_show: id }),
    runState: (id) => rpc('camc_run_state', { p_show: id }),
    // Teachers
    list: (kind, parent) => rpc('camc_studio_list', { p_token: token(), p_kind: kind, p_parent: parent == null ? null : String(parent) }),
    save: (kind, data) => rpc('camc_studio_save', { p_token: token(), p_kind: kind, p_data: data }),
    remove: (kind, id) => rpc('camc_studio_delete', { p_token: token(), p_kind: kind, p_id: String(id) }),
    set: (kind, id, patch) => rpc('camc_studio_set', { p_token: token(), p_kind: kind, p_id: String(id), p_patch: patch }),
    reorder: (kind, ids) => rpc('camc_studio_reorder', { p_token: token(), p_kind: kind, p_ids: ids }),
  };

  /**
   * Tiny DOM builder. Text is always set with textContent, so user content is safe.
   * h('button', { class: 'btn', onclick: fn }, 'Label', childNode)
   */
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v; // only for trusted, generated markup (icons, QR, krathong SVG)
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  /** QR code as SVG markup (the content is generated, not user text). */
  function qrSvg(text, color = '#0b1533') {
    const qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="QR code"><path d="${d}" fill="${color}"/></svg>`;
  }

  /** Absolute URL of a sibling directory, e.g. siteUrl('vote/') from any page. */
  function siteUrl(path) {
    const here = location.pathname.replace(/[^/]*$/, '');
    const root = here.replace(/[^/]+\/$/, ''); // pages live one folder below the site root
    return location.origin + root + path;
  }

  const prettyUrl = (u) => u.replace(/^https?:\/\//, '').replace(/\/$/, '');

  /** Run fn now and every ms milliseconds; returns a stop function. Pauses while the tab is hidden. */
  function every(ms, fn) {
    let timer = null;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      if (!document.hidden) {
        try { await fn(); } catch { /* keep going */ }
      }
      timer = setTimeout(tick, ms);
    };
    tick();
    return () => { stopped = true; clearTimeout(timer); };
  }

  const query = (name) => new URLSearchParams(location.search).get(name) || '';

  window.Studio = { API, h, qrSvg, siteUrl, prettyUrl, every, query };
})();
