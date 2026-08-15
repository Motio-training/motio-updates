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

  /* ---------- 4b. Moti : démo de chat (héros + section dédiée) ---------- */
  var SCRIPTS = {
    court: {
      turns: [
        { who: 'u', text: "Je n'ai que 40 minutes ce soir, jambes." },
        { who: 'm', text: "Ton dernier bas du corps remonte à 5 jours, tu étais à 80 kg au squat pour 3 × 8. En 40 minutes je garde le squat lourd et je condense le reste en superset." }
      ],
      card: {
        titre: 'Bas du corps · 38 min',
        lignes: [
          { nom: 'Squat barre', val: '4 × 6 · 82,5 kg' },
          { nom: 'Presse à cuisses', val: '3 × 10 · 120 kg' },
          { nom: 'Leg curl + mollets', val: '3 × 12 · superset' }
        ]
      }
    },
    stagne: {
      turns: [
        { who: 'u', text: 'Pourquoi je stagne au développé couché ?' },
        { who: 'm', text: "Sur 6 semaines tu es passé de 60 à 62,5 kg, donc tu progresses, mais lentement. Ce qui saute aux yeux : tes séances pectoraux tombent presque toujours en fin de semaine, après deux jours d'affilée. Tes dernières séries sont incomplètes une fois sur deux. C'est un problème de fraîcheur, pas de force." }
      ],
      card: null
    },
    epaule: {
      turns: [
        { who: 'u', text: "J'ai mal à l'épaule droite, je fais quoi pour la séance de demain ?" },
        { who: 'm', text: "Je remplace le développé incliné barre et les élévations latérales, qui sont les deux mouvements les plus exposés de ta séance. Le reste ne bouge pas. Si la douleur persiste au-delà de quelques jours, ça relève d'un professionnel de santé, pas de moi." }
      ],
      card: {
        titre: 'Haut du corps · adapté',
        lignes: [
          { nom: 'Développé incliné barre', val: 'remplacé' },
          { nom: 'Développé haltères neutre', val: '4 × 10 · 22 kg' },
          { nom: 'Tirage horizontal', val: '4 × 10 · 55 kg' }
        ]
      }
    }
  };

  function createChatDemo(el, opts) {
    opts = opts || {};
    var timers = [];
    function after(ms, fn) { var id = setTimeout(fn, ms); timers.push(id); return id; }
    function clear() { timers.forEach(clearTimeout); timers = []; }

    function bubble(who, big) {
      var row = document.createElement('div');
      row.className = 'msg-row ' + (who === 'u' ? 'mine' : 'moti');
      var b = document.createElement('div');
      b.className = 'msg-bubble';
      if (big) {
        var label = document.createElement('p');
        label.className = 'who-label';
        label.textContent = who === 'u' ? 'Toi' : 'Moti';
        b.appendChild(label);
      }
      var p = document.createElement('p');
      b.appendChild(p);
      row.appendChild(b);
      return { row: row, p: p };
    }

    function typingRow() {
      var row = document.createElement('div');
      row.className = 'msg-row moti';
      var d = document.createElement('div');
      d.className = 'typing-dots';
      d.innerHTML = '<i></i><i></i><i></i>';
      row.appendChild(d);
      return row;
    }

    function workoutCard(card, big) {
      var wrap = document.createElement('div');
      wrap.className = 'workout-card';
      if (big) {
        var head = document.createElement('div');
        head.className = 'workout-card-head';
        head.innerHTML = '<p class="tag">Séance proposée</p><p class="titre-2">' + escapeHtml(card.titre) + '</p>';
        wrap.appendChild(head);
      } else {
        var tag = document.createElement('p');
        tag.className = 'tag'; tag.textContent = 'Séance proposée';
        var titre = document.createElement('p');
        titre.className = 'titre'; titre.textContent = card.titre;
        wrap.appendChild(tag); wrap.appendChild(titre);
      }
      card.lignes.forEach(function (l) {
        var r = document.createElement('div');
        r.className = 'row';
        r.innerHTML = '<span>' + escapeHtml(l.nom) + '</span><span>' + escapeHtml(l.val) + '</span>';
        wrap.appendChild(r);
      });
      if (big) {
        var actions = document.createElement('div');
        actions.className = 'workout-card-actions';
        actions.innerHTML = '<span class="add">Ajouter à mes séances</span><span class="edit">Modifier</span>';
        wrap.appendChild(actions);
      } else {
        var cta = document.createElement('div');
        cta.className = 'cta';
        cta.textContent = 'Ajouter à mes séances';
        wrap.appendChild(cta);
      }
      return wrap;
    }

    function typeOut(p, full, done) {
      var i = 0;
      function step() {
        i = Math.min(full.length, i + 2);
        p.textContent = full.slice(0, i);
        el.scrollTop = el.scrollHeight;
        if (i < full.length) after(16, step);
        else if (done) done();
      }
      after(16, step);
    }

    function play(name) {
      var script = SCRIPTS[name];
      if (!script) return;
      clear();
      el.innerHTML = '';

      if (reduced) {
        script.turns.forEach(function (t) {
          var m = bubble(t.who, opts.big);
          m.p.textContent = t.text;
          el.appendChild(m.row);
        });
        if (script.card) el.appendChild(workoutCard(script.card, opts.big));
        return;
      }

      var t = 300;
      script.turns.forEach(function (turn, i) {
        var isLast = i === script.turns.length - 1;
        if (turn.who === 'u') {
          after(t, function () {
            var m = bubble('u', opts.big);
            m.p.textContent = turn.text;
            el.appendChild(m.row);
            el.scrollTop = el.scrollHeight;
          });
          t += 700;
        } else {
          (function (delay) {
            var typeRow;
            after(delay, function () {
              typeRow = typingRow();
              el.appendChild(typeRow);
              el.scrollTop = el.scrollHeight;
            });
            after(delay + 950, function () {
              if (typeRow && typeRow.parentNode) typeRow.parentNode.removeChild(typeRow);
              var m = bubble('m', opts.big);
              el.appendChild(m.row);
              typeOut(m.p, turn.text, function () {
                if (script.card && isLast) {
                  after(450, function () {
                    el.appendChild(workoutCard(script.card, opts.big));
                    el.scrollTop = el.scrollHeight;
                    if (opts.onDone) opts.onDone(true);
                  });
                } else if (isLast && opts.onDone) {
                  opts.onDone(false);
                }
              });
            });
          })(t);
          t += 950 + turn.text.length * 13 + 500;
        }
      });
    }

    return { play: play, stop: clear };
  }

  var heroChatEl = document.getElementById('heroChat');
  if (heroChatEl) {
    var heroDemo = createChatDemo(heroChatEl, {
      big: false,
      onDone: function (hadCard) {
        if (reduced) return;
        setTimeout(function () { heroDemo.play('court'); }, hadCard ? 6000 : 5000);
      }
    });
    heroDemo.play('court');
  }

  var motiChatEl = document.getElementById('motiChat');
  if (motiChatEl) {
    var motiDemo = createChatDemo(motiChatEl, { big: true });
    var quickQs = document.querySelectorAll('.quick-q');
    quickQs.forEach(function (btn) {
      btn.addEventListener('click', function () {
        quickQs.forEach(function (b) { b.classList.toggle('on', b === btn); });
        motiDemo.play(btn.getAttribute('data-q'));
      });
    });
    var motiSection = document.getElementById('moti');
    if (motiSection && !reduced && 'IntersectionObserver' in window) {
      var motiIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { motiIO.disconnect(); motiDemo.play('court'); }
        });
      }, { threshold: 0.25 });
      motiIO.observe(motiSection);
    } else {
      motiDemo.play('court');
    }
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

  /* ---------- 7. programme : générateur par objectif + slider de semaine ---------- */
  var PROGRAMS = {
    muscle: {
      phrase: 'Prendre du muscle, 4 séances par semaine, salle complète',
      decoupe: 'Haut / bas · 4 séances',
      series: 3, repsBase: 8,
      exos: [
        { nom: 'Développé couché barre', base: 60, inc: 2.5 },
        { nom: 'Squat barre', base: 80, inc: 5 },
        { nom: 'Tirage vertical poitrine', base: 52.5, inc: 2.5 }
      ]
    },
    force: {
      phrase: 'Gagner en force sur les gros mouvements, 3 séances, barre et rack',
      decoupe: 'Full body lourd · 3 séances',
      series: 5, repsBase: 4,
      exos: [
        { nom: 'Squat barre', base: 90, inc: 5 },
        { nom: 'Développé couché barre', base: 65, inc: 2.5 },
        { nom: 'Soulevé de terre', base: 110, inc: 5 }
      ]
    },
    temps: {
      phrase: '40 minutes maximum, 3 séances, haltères et barre de traction',
      decoupe: 'Full body condensé · 3 séances',
      series: 3, repsBase: 10,
      exos: [
        { nom: 'Goblet squat', base: 24, inc: 2 },
        { nom: 'Développé haltères', base: 22, inc: 2 },
        { nom: 'Traction lestée', base: 5, inc: 2.5 }
      ]
    }
  };
  var GEN_STEPS = [
    'lecture du carnet · 46 séances retenues',
    'découpage et répartition des groupes musculaires',
    'charges de départ calées sur tes derniers records',
    'progression et décharge placées sur 8 semaines'
  ];
  var progState = { obj: 'muscle' };
  function currentProgram() { return PROGRAMS[progState.obj] || PROGRAMS.muscle; }

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
  var progDecoupeEl = document.getElementById('progDecoupe');

  function computeRows(w) {
    var p = currentProgram();
    var deload = w === 6;
    var idx = deload ? 4 : (w > 6 ? w - 2 : w - 1);
    return p.exos.map(function (e) {
      var steps = Math.floor(idx / 3);
      var reps = deload ? Math.max(4, p.repsBase - 2) : p.repsBase + (idx % 3);
      var series = deload ? Math.max(2, p.series - 2) : p.series;
      var charge = deload ? (e.base + e.inc * steps) * 0.85 : e.base + e.inc * steps;
      return { nom: e.nom, serie: series + ' × ' + reps, charge: fmtKg(Math.round(charge / (e.inc / 2)) * (e.inc / 2)) };
    });
  }

  function syncDecoupe() {
    if (progDecoupeEl) progDecoupeEl.textContent = currentProgram().decoupe + ' · bloc de 8 semaines';
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
  syncDecoupe();

  /* ---------- 7b. générateur : phrase, puces d'objectif, log de génération ---------- */
  var genPhrase = document.getElementById('genPhrase');
  var genBtn = document.getElementById('genBtn');
  var genLog = document.getElementById('genLog');
  var chips = document.querySelectorAll('.chip');
  var genTimers = [];

  if (genPhrase) genPhrase.value = currentProgram().phrase;

  function runGeneration() {
    genTimers.forEach(clearTimeout);
    genTimers = [];
    if (weekRange) weekRange.value = 1;
    paintWeek();
    if (!genLog) return;
    genLog.innerHTML = '';
    if (reduced) {
      genLog.innerHTML = GEN_STEPS.map(function (s, i) {
        return '<p' + (i === GEN_STEPS.length - 1 ? ' class="last"' : '') + '>· ' + escapeHtml(s) + '</p>';
      }).join('');
      return;
    }
    GEN_STEPS.forEach(function (line, i) {
      var id = setTimeout(function () {
        var p = document.createElement('p');
        if (i === GEN_STEPS.length - 1) p.className = 'last';
        p.textContent = '· ' + line;
        genLog.appendChild(p);
      }, 320 * (i + 1));
      genTimers.push(id);
    });
  }

  function setObjective(obj) {
    progState.obj = obj;
    if (genPhrase) genPhrase.value = currentProgram().phrase;
    chips.forEach(function (c) { c.classList.toggle('on', c.getAttribute('data-obj') === obj); });
    syncDecoupe();
    runGeneration();
  }

  chips.forEach(function (c) {
    c.addEventListener('click', function () { setObjective(c.getAttribute('data-obj')); });
  });
  if (genBtn) genBtn.addEventListener('click', runGeneration);

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
