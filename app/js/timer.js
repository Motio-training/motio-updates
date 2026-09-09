/* ==========================================================================
   Moteur des trois modes de minuterie — portage de SessionEngine.kt.
   Un seul mode actif à la fois ici (contrairement à l'app native, qui peut
   garder un minuteur actif en fond pendant qu'on regarde le chrono) : sur le
   web, un seul exercice s'exécute à l'écran à la fois, donc un seul moteur
   suffit.

   Utilisation : new Engine(onTick) ; puis chronoReset()/minuteurStart(...)/
   tabataStart(...) selon le mode de l'exercice en cours. onTick(snapshot)
   est rappelé ~10x/s pendant qu'une session est active.
   ========================================================================== */

import * as beeper from './beeper.js';

const START_LEAD_MS = 150;

export class Engine {
  constructor(onTick) {
    this.onTick = onTick;
    this._interval = null;
    this._reset();
  }

  _reset() {
    this.mode = 'CHRONO';
    this.tensionStart = null;
    this.chronoStart = null;
    this.minDurSec = 120; this.minT0 = 0; this.minRunning = false; this.minPaused = false;
    this.minPausedElapsed = 0; this.minLastRemainSec = Infinity; this.minStartBeeped = false;
    this.workSec = 20; this.restSec = 10; this.series = 8;
    this.tabT0 = 0; this.tabRunning = false; this.tabPaused = false; this.tabPausedElapsed = 0;
    this.tabLastPhaseIdx = -Infinity; this.tabLastRemainSec = Infinity; this.tabDoneBeeped = false;
    /* Circuit : le déroulé complet posé à l'avance (circuitPlan, model.js) et
       ses fins cumulées. Le moteur ne décide de rien, il lit une horloge et
       dit dans quel segment on se trouve — un circuit reprend donc exactement
       où il en était après un rechargement de page. */
    this.circPlan = []; this.circEnds = [];
    this.circT0 = 0; this.circRunning = false; this.circPaused = false; this.circPausedElapsed = 0;
    this.circLastIdx = -Infinity; this.circLastRemainSec = Infinity; this.circDoneBeeped = false;
  }

  get tensionActive() { return this.tensionStart != null; }
  get tensionElapsedMs() { return this.tensionStart ? Date.now() - this.tensionStart : 0; }
  beginTension() { this.tensionStart = Date.now(); }
  endTension() { const d = this.tensionElapsedMs; this.tensionStart = null; return d; }

  _startLoop() {
    if (this._interval) return;
    this._interval = setInterval(() => this._tick(), 100);
  }
  _stopLoopIfIdle() {
    if (this.chronoStart == null && !this.minRunning && !this.tabRunning && !this.circRunning) {
      clearInterval(this._interval); this._interval = null;
    }
  }

  chronoReset() { this.chronoStart = Date.now(); this._startLoop(); this._tick(); }
  chronoStop() { this.chronoStart = null; this._tick(); this._stopLoopIfIdle(); }

  minuteurStart(durSec) {
    this.minDurSec = durSec;
    this.minT0 = Date.now(); this.minRunning = true; this.minPaused = false;
    this.minPausedElapsed = 0; this.minLastRemainSec = Infinity; this.minStartBeeped = false;
    this._startLoop(); this._tick();
  }
  minuteurStop() { this.minRunning = false; this.minPaused = false; this._tick(); this._stopLoopIfIdle(); }
  minuteurTogglePause() {
    if (!this.minRunning) return;
    if (this.minPaused) { this.minT0 = Date.now() - this.minPausedElapsed; this.minPaused = false; }
    else { this.minPausedElapsed = Date.now() - this.minT0; this.minPaused = true; }
    this._tick();
  }

  tabataStart(workSec, restSec, series) {
    this.workSec = workSec; this.restSec = restSec; this.series = series;
    this.tabT0 = Date.now(); this.tabRunning = true; this.tabPaused = false; this.tabPausedElapsed = 0;
    this.tabLastPhaseIdx = -Infinity; this.tabLastRemainSec = Infinity; this.tabDoneBeeped = false;
    this._startLoop(); this._tick();
  }
  /* ---- Circuit ---- */

  /** Charge un déroulé (circuitPlan, model.js) sans rien démarrer. */
  circuitLoad(plan) {
    this.circPlan = plan || [];
    this.circEnds = [];
    let cumul = 0;
    for (const s of this.circPlan) { cumul += s.durSec; this.circEnds.push(cumul); }
  }

  circuitStart() {
    if (!this.circPlan.length) return;
    this.circT0 = Date.now(); this.circRunning = true;
    this.circPaused = false; this.circPausedElapsed = 0;
    this.circLastIdx = -Infinity; this.circLastRemainSec = Infinity; this.circDoneBeeped = false;
    this._startLoop(); this._tick();
  }

  circuitStop() { this.circRunning = false; this.circPaused = false; this._tick(); this._stopLoopIfIdle(); }

  circuitTogglePause() {
    if (!this.circRunning) return;
    if (this.circPaused) { this.circT0 = Date.now() - this.circPausedElapsed; this.circPaused = false; }
    else { this.circPausedElapsed = Date.now() - this.circT0; this.circPaused = true; }
    this._tick();
  }

  /** Index du segment en cours, ou -1 si le circuit est fini ou à l'arrêt. */
  circuitIndex(now = Date.now()) {
    if (!this.circRunning || !this.circPlan.length) return -1;
    const elapsedMs = this.circPaused ? this.circPausedElapsed : now - this.circT0;
    const elapsedSec = Math.floor(elapsedMs / 1000);
    for (let i = 0; i < this.circEnds.length; i++) if (elapsedSec < this.circEnds[i]) return i;
    return -1;
  }

  tabataStop() { this.tabRunning = false; this.tabPaused = false; this._tick(); this._stopLoopIfIdle(); }
  tabataTogglePause() {
    if (!this.tabRunning) return;
    if (this.tabPaused) { this.tabT0 = Date.now() - this.tabPausedElapsed; this.tabPaused = false; }
    else { this.tabPausedElapsed = Date.now() - this.tabT0; this.tabPaused = true; }
    this._tick();
  }

  /* Capture/restauration de l'état — permet à une séance en cours de
     survivre à un changement d'écran ou à un rechargement de page
     (run-state.js). Tout est en horodatages absolus, donc le décompte
     reprend à la bonne seconde sans rattrapage à faire. */
  captureEtat() {
    return {
      mode: this.mode,
      tensionStart: this.tensionStart,
      chronoStart: this.chronoStart,
      minDurSec: this.minDurSec, minT0: this.minT0,
      minRunning: this.minRunning, minPaused: this.minPaused,
      minPausedElapsed: this.minPausedElapsed,
      workSec: this.workSec, restSec: this.restSec, series: this.series,
      tabT0: this.tabT0, tabRunning: this.tabRunning,
      tabPaused: this.tabPaused, tabPausedElapsed: this.tabPausedElapsed,
      /* Le PLAN du circuit n'est pas capturé : il se reconstruit à
         l'identique depuis la séance (circuitPlan), et c'est l'écran qui le
         recharge avant de restaurer cet état. Seule l'horloge compte. */
      circT0: this.circT0, circRunning: this.circRunning,
      circPaused: this.circPaused, circPausedElapsed: this.circPausedElapsed
    };
  }

  restaurerEtat(e) {
    if (!e) return;
    this.mode = e.mode || 'CHRONO';
    this.tensionStart = e.tensionStart ?? null;
    this.chronoStart = e.chronoStart ?? null;
    this.minDurSec = e.minDurSec ?? 120; this.minT0 = e.minT0 || 0;
    this.minRunning = !!e.minRunning; this.minPaused = !!e.minPaused;
    this.minPausedElapsed = e.minPausedElapsed || 0;
    this.workSec = e.workSec ?? 20; this.restSec = e.restSec ?? 10; this.series = e.series ?? 8;
    this.tabT0 = e.tabT0 || 0; this.tabRunning = !!e.tabRunning;
    this.tabPaused = !!e.tabPaused; this.tabPausedElapsed = e.tabPausedElapsed || 0;
    /* Un décompte déjà écoulé pendant l'absence ne doit pas rejouer ses bips
       de fin au retour : on le marque comme déjà sonné. */
    this.minLastRemainSec = Infinity;
    this.minStartBeeped = this.minRunning && !this.minPaused
      && (Date.now() - this.minT0) >= this.minDurSec * 1000;
    this.tabLastPhaseIdx = -Infinity; this.tabLastRemainSec = Infinity; this.tabDoneBeeped = false;
    this.circT0 = e.circT0 || 0; this.circRunning = !!e.circRunning;
    this.circPaused = !!e.circPaused; this.circPausedElapsed = e.circPausedElapsed || 0;
    this.circLastIdx = -Infinity; this.circLastRemainSec = Infinity; this.circDoneBeeped = false;
    if (this.chronoStart != null || this.minRunning || this.tabRunning || this.circRunning) {
      this._startLoop(); this._tick();
    }
  }

  _tick() {
    const now = Date.now();
    this._advance(now);
    if (this.onTick) this.onTick(this._snapshot(now));
    this._stopLoopIfIdle();
  }

  _advance(now) {
    if (this.minRunning && !this.minPaused) {
      const remainMs = this.minDurSec * 1000 - (now - this.minT0);
      if (remainMs > START_LEAD_MS) {
        const remainSec = Math.ceil(remainMs / 1000);
        if (remainSec >= 1 && remainSec <= 3 && remainSec < this.minLastRemainSec) beeper.shortBeep();
        this.minLastRemainSec = remainSec;
      } else if (!this.minStartBeeped) {
        this.minStartBeeped = true;
        beeper.startBeep();
        this.beginTension();
      }
    }
    if (this.tabRunning && !this.tabPaused) {
      const elapsed = now - this.tabT0;
      const phaseMs = (this.workSec + this.restSec) * 1000;
      const totalMs = phaseMs * this.series;
      if (elapsed >= totalMs) {
        if (!this.tabDoneBeeped) { this.tabDoneBeeped = true; beeper.startBeep(); }
      } else {
        const idx = Math.floor(elapsed / phaseMs);
        const inPhase = elapsed - idx * phaseMs;
        const working = inPhase < this.workSec * 1000;
        const remainMs = working ? this.workSec * 1000 - inPhase : phaseMs - inPhase;
        const remainSec = Math.ceil(remainMs / 1000);
        const phaseIdx = idx * 2 + (working ? 0 : 1);
        if (phaseIdx !== this.tabLastPhaseIdx) {
          // phaseBeep et non startBeep : en mode voix, c'est ici que le coach
          // annonce la posture ou le repos plutôt que de siffler.
          beeper.phaseBeep(working);
          this.tabLastPhaseIdx = phaseIdx;
          this.tabLastRemainSec = Infinity;
        }
        if (remainSec >= 1 && remainSec <= 3 && remainSec < this.tabLastRemainSec) beeper.shortBeep();
        this.tabLastRemainSec = remainSec;
      }
    }
    if (this.circRunning && !this.circPaused) {
      // Mêmes bips que le tabata, pour la même raison : sans le son, un
      // circuit oblige à regarder l'écran en permanence, alors que c'est
      // justement le format où l'on a les mains prises.
      const idx = this.circuitIndex(now);
      if (idx < 0) {
        if (!this.circDoneBeeped) { this.circDoneBeeped = true; beeper.startBeep(); }
      } else {
        const remainMs = this.circEnds[idx] * 1000 - (now - this.circT0);
        const remainSec = Math.ceil(remainMs / 1000);
        if (idx !== this.circLastIdx) {
          beeper.phaseBeep(this.circPlan[idx].work);
          this.circLastIdx = idx;
          this.circLastRemainSec = Infinity;
        }
        if (remainSec >= 1 && remainSec <= 3 && remainSec < this.circLastRemainSec) beeper.shortBeep();
        this.circLastRemainSec = remainSec;
      }
    }
  }

  _snapshot(now) {
    switch (this.mode) {
      case 'CHRONO': {
        const s = this.chronoStart;
        return { mode: 'CHRONO', phase: s == null ? 'IDLE' : 'OVERFLOW',
          label: 'Chrono', value: fmt(s == null ? 0 : Math.floor((now - s) / 1000)),
          colorKey: 'neutral', active: s != null };
      }
      case 'MINUTEUR': {
        if (!this.minRunning) return { mode: 'MINUTEUR', phase: 'IDLE', label: 'Minuteur',
          value: fmt(this.minDurSec), colorKey: 'neutral', active: false };
        if (this.minPaused) {
          const remainMs = this.minDurSec * 1000 - this.minPausedElapsed;
          return { mode: 'MINUTEUR', phase: 'PAUSED', label: 'Pause',
            value: fmt(remainMs > 0 ? Math.ceil(remainMs / 1000) : Math.floor(-remainMs / 1000)),
            colorKey: 'pause', active: true };
        }
        const remainMs = this.minDurSec * 1000 - (now - this.minT0);
        if (remainMs > 0) {
          const remainSec = Math.ceil(remainMs / 1000);
          return { mode: 'MINUTEUR', phase: 'COUNTDOWN', label: 'Décompte', value: fmt(remainSec),
            colorKey: remainSec <= 3 ? 'work' : 'neutral', active: true };
        }
        return { mode: 'MINUTEUR', phase: 'OVERFLOW', label: 'Temps de série',
          value: fmt(Math.floor(-remainMs / 1000)), colorKey: 'over', active: true };
      }
      case 'TABATA': {
        if (!this.tabRunning) return { mode: 'TABATA', phase: 'IDLE', label: 'Tabata',
          value: '—', colorKey: 'neutral', active: false };
        if (this.tabPaused) return { mode: 'TABATA', phase: 'PAUSED', label: 'Pause',
          value: '⏸', colorKey: 'pause', active: true };
        const elapsed = now - this.tabT0;
        const phaseMs = (this.workSec + this.restSec) * 1000;
        const totalMs = phaseMs * this.series;
        if (elapsed >= totalMs) {
          this.tabRunning = false;
          return { mode: 'TABATA', phase: 'DONE', label: 'Terminé', value: '✓',
            colorKey: 'neutral', active: false, serie: this.series, serieTot: this.series };
        }
        const idx = Math.floor(elapsed / phaseMs);
        const inPhase = elapsed - idx * phaseMs;
        const working = inPhase < this.workSec * 1000;
        const remainMs = working ? this.workSec * 1000 - inPhase : phaseMs - inPhase;
        return { mode: 'TABATA', phase: working ? 'WORK' : 'REST',
          label: (working ? 'Travail' : 'Repos') + `  ${idx + 1}/${this.series}`,
          value: String(Math.ceil(remainMs / 1000)), colorKey: working ? 'work' : 'rest',
          active: true, serie: idx + 1, serieTot: this.series };
      }
      case 'CIRCUIT': {
        const tours = this.circPlan.length ? this.circPlan[this.circPlan.length - 1].round : 0;
        const vide = { mode: 'CIRCUIT', station: -1, round: 0, roundTot: tours, segment: -1 };
        if (!this.circRunning || !this.circPlan.length) {
          return { ...vide, phase: 'IDLE', label: 'Circuit', value: '—', colorKey: 'neutral', active: false };
        }
        const idx = this.circuitIndex(now);
        if (this.circPaused) {
          const seg = this.circPlan[idx];
          return { ...vide, phase: 'PAUSED', label: 'Pause', value: '⏸', colorKey: 'pause',
            active: true, station: seg ? seg.station : -1, round: seg ? seg.round : 0, segment: idx };
        }
        if (idx < 0) {
          this.circRunning = false;
          return { ...vide, phase: 'DONE', label: 'Terminé', value: '✓',
            colorKey: 'neutral', active: false };
        }
        const seg = this.circPlan[idx];
        const remainMs = this.circEnds[idx] * 1000 - (now - this.circT0);
        // Un repos entre deux tours porte station = -1 : c'est ce qui
        // distingue « souffle avant de repartir » d'un repos entre stations.
        const entreTours = !seg.work && seg.station < 0;
        return {
          mode: 'CIRCUIT',
          phase: seg.work ? 'WORK' : 'REST',
          label: seg.work ? 'Effort' : (entreTours ? 'Repos entre les tours' : 'Repos'),
          value: String(Math.max(0, Math.ceil(remainMs / 1000))),
          colorKey: seg.work ? 'work' : 'rest',
          active: true,
          station: seg.station, round: seg.round, roundTot: tours, segment: idx
        };
      }
    }
  }
}

function fmt(totalSec) {
  const m = Math.floor(totalSec / 60), s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
