/* Motio — site vitrine. Chaque interaction ici a un équivalent réel dans l'app. */

(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var REL_URL = 'https://github.com/Motio-training/motio-updates/releases/latest';
  var VERSION_URL = 'https://raw.githubusercontent.com/Motio-training/motio-updates/refs/heads/main/version.json';
  var RELEASES_API = 'https://api.github.com/repos/Motio-training/motio-updates/releases?per_page=3';

  function pad(n, l) { return String(n).padStart(l, '0'); }
  function fmtKg(v) { return (Math.round(v * 10) / 10).toString().replace('.', ',') + ' kg'; }

  /* ---------- 1. le chrono du héros tourne réellement ---------- */
  var heroChrono = document.getElementById('heroChrono');
  var heroT0 = performance.now();
  if (heroChrono && reduced) heroChrono.textContent = '00:00.00';

  /* ---------- 2. chaque section apparaît en arrivant à l'écran ---------- */
  var sections = document.querySelectorAll('[data-sect]');
  if (reduced || !('IntersectionObserver' in window)) {
    sections.forEach(function (s) { s.classList.add('seen'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('seen'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -10% 0px' });
    sections.forEach(function (s) { io.observe(s); });
  }

  /* ---------- 3. numéro de version, lu depuis le même version.json que l'app ---------- */
  fetch(VERSION_URL, { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      var name = j && (j.versionName || j.version_name || j.version);
      if (!name) return;
      ['verHero', 'verInstall', 'verFoot'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.textContent = 'version ' + name;
      });
      var bar = document.getElementById('floatbarVersion');
      if (bar) bar.textContent = 'Motio · version ' + name;
    })
    .catch(function () { /* on garde le texte de repli */ });

  /* ---------- 4. dernières versions publiées, lues en direct sur GitHub ---------- */
  var releasesList = document.getElementById('releasesList');
  if (releasesList) {
    fetch(RELEASES_API)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (list) {
        if (!Array.isArray(list) || !list.length) throw new Error('empty');
        releasesList.innerHTML = list.slice(0, 3).map(function (r) {
          var body = (r.body || '').replace(/\r/g, '').replace(/^#+\s*/gm, '').trim();
          if (body.length > 260) body = body.slice(0, 260).replace(/\s+\S*$/, '') + '…';
          var date = r.published_at
            ? new Date(r.published_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
            : '';
          var tag = r.tag_name || '—';
          var name = r.name || tag || 'Nouvelle version';
          return '<article class="release">'
            + '<div class="release-meta"><p class="release-tag">' + escapeHtml(tag) + '</p>'
            + '<p class="release-date">' + escapeHtml(date) + '</p></div>'
            + '<div class="release-body"><h3>' + escapeHtml(name) + '</h3>'
            + '<p>' + escapeHtml(body || 'Corrections et améliorations.') + '</p></div>'
            + '</article>';
        }).join('');
      })
      .catch(function () {
        releasesList.innerHTML = '<p class="fineprint">Détail indisponible pour le moment — <a href="https://github.com/Motio-training/motio-updates/releases" rel="noopener">voir directement sur GitHub</a>.</p>';
      });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- 5. QR codes vers la dernière release ---------- */
  (function makeQR() {
    function draw() {
      if (typeof window.qrcode !== 'function') return false;
      ['qrHero', 'qrBig'].forEach(function (id) {
        var host = document.getElementById(id);
        if (!host) return;
        var qr = window.qrcode(0, 'M');
        qr.addData(REL_URL);
        qr.make();
        host.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
        var svg = host.querySelector('svg');
        if (svg) { svg.style.width = '100%'; svg.style.height = '100%'; svg.style.display = 'block'; }
      });
      return true;
    }
    if (!draw()) {
      var n = 0;
      var iv = setInterval(function () { if (draw() || ++n > 40) clearInterval(iv); }, 150);
    }
  })();

  /* ---------- 6. démo des trois modes de chronométrage ---------- */
  var MODES = {
    chrono: { titre: 'Chrono', desc: "Temps qui monte, tours enregistrés au passage. Pour les tests, les circuits libres et tout ce qui se mesure à la fin.", meta: 'temps qui monte' },
    minuteur: { titre: 'Minuteur', desc: "Temps qui descend, avec relance. Signal sonore audible écran éteint : le téléphone peut rester dans la poche.", meta: 'décompte 60 s' },
    tabata: { titre: 'Tabata', desc: "Effort et récupération en alternance, nombre de tours et de blocs réglables. Chaque transition est annoncée à la voix.", meta: 'effort 20 s · récup 10 s' }
  };

  var demo = {
    dial: document.getElementById('demoDial'),
    digits: document.getElementById('demoDigits'),
    phase: document.getElementById('demoPhase'),
    meta: document.getElementById('demoMeta'),
    title: document.getElementById('demoTitle'),
    desc: document.getElementById('demoDesc'),
    lap1: document.getElementById('demoLap1'),
    lap2: document.getElementById('demoLap2'),
    run: document.getElementById('demoRun'),
    second: document.getElementById('demoSecond'),
    reset: document.getElementById('demoReset'),
    tabs: document.querySelectorAll('.mode-tab')
  };

  var demoState = { mode: 'chrono', running: false, laps: [], acc: 0, startedAt: 0 };

  function demoElapsed(now) { return demoState.acc + (demoState.running ? now - demoState.startedAt : 0); }

  function paintDemo(ms) {
    if (!demo.digits) return;
    var txt = '', frac = 0, phase = '', meta = MODES[demoState.mode].meta, color = '#A9C25E';

    if (demoState.mode === 'chrono') {
      txt = pad(Math.floor(ms / 60000), 2) + ':' + pad(Math.floor(ms / 1000) % 60, 2) + '.' + pad(Math.floor(ms / 10) % 100, 2);
      frac = (ms % 60000) / 60000;
      phase = demoState.running ? 'en cours' : (ms > 0 ? 'en pause' : 'prêt');
    } else if (demoState.mode === 'minuteur') {
      var rest = Math.max(0, 60000 - ms);
      txt = pad(Math.floor(rest / 60000), 1) + ':' + pad(Math.floor(rest / 1000) % 60, 2) + '.' + pad(Math.floor(rest / 10) % 100, 2);
      frac = rest / 60000;
      phase = rest === 0 ? 'terminé' : (demoState.running ? 'décompte' : 'prêt');
      if (rest === 0 && demoState.running) { demoState.acc = 60000; demoState.running = false; }
      if (rest === 0) color = '#D3A45E';
    } else {
      var W = 20000, R = 10000, N = 8, cycle = W + R, total = cycle * N;
      var c = Math.min(ms, total - 1);
      var round = Math.floor(c / cycle) + 1;
      var inCycle = c % cycle;
      var work = inCycle < W;
      var restT = work ? W - inCycle : cycle - inCycle;
      txt = pad(Math.floor(restT / 1000), 2) + '.' + pad(Math.floor(restT / 10) % 100, 2);
      frac = work ? restT / W : restT / R;
      phase = ms >= total ? 'terminé' : (work ? 'effort' : 'récupération');
      color = work ? '#A9C25E' : '#D3A45E';
      meta = ms >= total ? '8 tours bouclés' : 'tour ' + round + ' / ' + N;
      if (ms >= total && demoState.running) { demoState.acc = total; demoState.running = false; }
    }

    demo.digits.textContent = txt;
    demo.digits.style.color = demoState.mode === 'tabata' ? color : '#F4F3EE';
    if (demo.phase) demo.phase.textContent = phase;
    if (demo.meta) demo.meta.textContent = meta;
    if (demo.dial) demo.dial.style.background = 'conic-gradient(' + color + ' ' + frac.toFixed(4) + 'turn, #2B3422 0turn)';
    syncRunButton();
  }

  function syncRunButton() {
    if (demo.run) demo.run.textContent = demoState.running ? 'Pause' : 'Démarrer';
    if (demo.second) demo.second.textContent = demoState.mode === 'chrono' ? 'Tour' : 'Relancer';
  }

  function paintLaps() {
    [demo.lap1, demo.lap2].forEach(function (el, i) {
      if (!el) return;
      var lap = demoState.laps[i];
      el.innerHTML = lap ? '<span>tour ' + lap.n + '</span><span>' + lap.t + '</span>' : '<span>—</span><span>—</span>';
      el.classList.toggle('has-lap', !!lap);
    });
  }

  function syncMode() {
    var m = MODES[demoState.mode];
    if (demo.title) demo.title.textContent = m.titre;
    if (demo.desc) demo.desc.textContent = m.desc;
    demo.tabs.forEach(function (el) {
      var on = el.getAttribute('data-mode') === demoState.mode;
      el.classList.toggle('on', on);
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    syncRunButton();
    paintLaps();
  }

  function setMode(mode) {
    demoState.mode = mode;
    demoState.running = false;
    demoState.acc = 0;
    demoState.laps = [];
    demoState.startedAt = performance.now();
    syncMode();
    paintDemo(0);
  }

  demo.tabs.forEach(function (el) {
    el.addEventListener('click', function () { setMode(el.getAttribute('data-mode')); });
  });

  if (demo.run) demo.run.addEventListener('click', function () {
    var now = performance.now();
    if (demoState.running) { demoState.acc = demoElapsed(now); demoState.running = false; }
    else { demoState.startedAt = now; demoState.running = true; }
    syncRunButton();
  });

  if (demo.reset) demo.reset.addEventListener('click', resetDemo);
  function resetDemo() {
    demoState.acc = 0;
    demoState.startedAt = performance.now();
    demoState.running = false;
    demoState.laps = [];
    paintDemo(0);
    paintLaps();
  }

  if (demo.second) demo.second.addEventListener('click', function () {
    if (demoState.mode !== 'chrono') { resetDemo(); return; }
    var ms = demoElapsed(performance.now());
    var t = pad(Math.floor(ms / 60000), 2) + ':' + pad(Math.floor(ms / 1000) % 60, 2) + '.' + pad(Math.floor(ms / 10) % 100, 2);
    demoState.laps = [{ n: demoState.laps.length + 1, t: t }].concat(demoState.laps).slice(0, 2);
    paintLaps();
  });

  syncMode();

  /* ---------- 7. programme : slider de semaine ---------- */
  var EXOS = [
    { nom: 'Développé couché barre', base: 60, inc: 2.5 },
    { nom: 'Squat barre', base: 80, inc: 5 },
    { nom: 'Tirage vertical poitrine', base: 52.5, inc: 2.5 }
  ];
  var WEEK_NOTES = {
    1: "Semaine d'entrée : charges volontairement modestes, la marge de progression est gardée pour plus tard.",
    2: 'Même charge, une répétition de plus. La progression commence par le volume.',
    3: 'Haut de la fourchette de répétitions atteint : la charge va monter la semaine prochaine.',
    4: 'La charge monte d’un cran, les répétitions redescendent au bas de la fourchette.',
    5: 'On remonte en répétitions sur la nouvelle charge.',
    6: 'Semaine de décharge, insérée automatiquement : volume et intensité réduits pour absorber le travail accumulé.',
    7: 'Reprise après décharge, directement en haut de la fourchette.',
    8: 'Fin de bloc : nouvelle charge de référence, le bloc suivant repart de là.'
  };

  var weekRange = document.getElementById('weekRange');
  var weekTitleEl = document.getElementById('weekTitle');
  var weekNoteEl = document.getElementById('weekNote');
  var progRows = document.getElementById('progRows');

  function computeRows(w) {
    var deload = w === 6;
    var idx = deload ? 4 : (w > 6 ? w - 2 : w - 1);
    return EXOS.map(function (e) {
      var steps = Math.floor(idx / 3);
      var reps = deload ? 6 : 8 + (idx % 3);
      var series = deload ? 2 : 3;
      var charge = deload ? (e.base + e.inc * steps) * 0.85 : e.base + e.inc * steps;
      return { nom: e.nom, serie: series + ' × ' + reps, charge: fmtKg(Math.round(charge / (e.inc / 2)) * (e.inc / 2)) };
    });
  }

  function paintWeek() {
    var w = Number(weekRange.value);
    var deload = w === 6;
    if (weekTitleEl) {
      weekTitleEl.textContent = deload ? 'Semaine ' + w + ' · décharge' : 'Semaine ' + w + ' / 8';
      weekTitleEl.classList.toggle('deload', deload);
    }
    if (weekNoteEl) weekNoteEl.textContent = WEEK_NOTES[w] || '';
    if (progRows) {
      progRows.innerHTML = computeRows(w).map(function (row) {
        return '<div class="prog-row"><span class="nom">' + escapeHtml(row.nom) + '</span>'
          + '<span class="serie">' + escapeHtml(row.serie) + '</span>'
          + '<span class="charge">' + escapeHtml(row.charge) + '</span></div>';
      }).join('');
    }
  }

  if (weekRange) {
    weekRange.addEventListener('input', paintWeek);
    paintWeek();
  }

  /* ---------- 8. barre de téléchargement flottante ---------- */
  var floatbar = document.getElementById('floatbar');
  if (floatbar) {
    var onScrollBar = function () {
      var show = window.scrollY > window.innerHeight * 0.85;
      floatbar.classList.toggle('show', show);
    };
    window.addEventListener('scroll', onScrollBar, { passive: true });
    onScrollBar();
  }

  /* ---------- boucle d'animation : chrono du héros + démo ---------- */
  function tick(now) {
    if (heroChrono && !reduced) {
      var ms = now - heroT0;
      heroChrono.textContent = pad(Math.floor(ms / 60000), 2) + ':' + pad(Math.floor(ms / 1000) % 60, 2) + '.' + pad(Math.floor(ms / 10) % 100, 2);
    }
    paintDemo(demoElapsed(now));
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
