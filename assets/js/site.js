/* Motio — site vitrine. Trois petites choses, rien de plus. */

(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* 1. Le chrono du héros tourne réellement. C'est le produit, pas un décor. */
  var out = document.getElementById('chrono');
  if (out) {
    if (reduced) {
      out.textContent = '00:00.00';
    } else {
      var t0 = performance.now();
      var pad = function (n, l) { return String(n).padStart(l, '0'); };
      (function tick(now) {
        var ms = now - t0;
        var m = Math.floor(ms / 60000);
        var s = Math.floor(ms / 1000) % 60;
        var c = Math.floor(ms / 10) % 100;
        out.textContent = pad(m, 2) + ':' + pad(s, 2) + '.' + pad(c, 2);
        requestAnimationFrame(tick);
      })(t0);
    }
  }

  /* 2. Chaque bloc apparaît quand on l'atteint. */
  var blocks = document.querySelectorAll('.block');
  if (reduced || !('IntersectionObserver' in window)) {
    blocks.forEach(function (b) { b.classList.add('seen'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('seen'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -12% 0px' });
    blocks.forEach(function (b) { io.observe(b); });
  }

  /* 3. Le numéro de version vient du même version.json que la mise à jour
        intégrée à l'application. Une seule source de vérité. */
  var VERSION_URL = 'https://raw.githubusercontent.com/Motio-training/motio-updates/refs/heads/main/version.json';
  var line = document.getElementById('verline');
  if (line) {
    fetch(VERSION_URL, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var name = j && (j.versionName || j.version_name || j.version);
        if (name) line.textContent = 'version ' + name;
      })
      .catch(function () { /* on garde le texte de repli */ });
  }
})();
