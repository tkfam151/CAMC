/* Shared behaviour for big screens: full screen button, hide controls and cursor when idle. */
(function () {
  'use strict';
  function setupControls() {
    const btn = document.getElementById('btn-fullscreen');
    if (btn) {
      btn.addEventListener('click', () => {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen?.().catch(() => {});
      });
    }
    let timer;
    const wake = () => {
      document.body.classList.remove('idle');
      clearTimeout(timer);
      timer = setTimeout(() => document.body.classList.add('idle'), 3000);
    };
    ['mousemove', 'touchstart', 'keydown'].forEach((ev) => window.addEventListener(ev, wake, { passive: true }));
    wake();
  }

  /** Fill a .join-chip element: "Join at <url>", the code and a QR code. */
  function joinChip(el, url, code) {
    const { h, qrSvg, prettyUrl } = window.Studio;
    const { t } = window.CAMC;
    el.innerHTML = '';
    el.append(
      h('div', { class: 'txt' },
        h('span', { class: 'k' }, t('scrJoinAt')),
        h('span', { class: 'url' }, prettyUrl(url)),
        code ? h('span', { class: 'code' }, code) : null),
      // Both /vote/ and /wall/ accept ?code=, so scanning opens the right room directly.
      h('div', { class: 'qr', html: qrSvg(code ? `${url}?code=${encodeURIComponent(code)}` : url) }),
    );
  }

  window.Screen = { setupControls, joinChip };
})();
