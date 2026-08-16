/* ==========================================================================
   Minuteurs — onglet autonome de la barre du bas, comme dans l'appli
   Android : les trois modes hors du contexte d'une séance, pour un usage
   libre (échauffement, étirements, tout ce qui n'est pas dans le carnet).
   Réutilise le même moteur (timer.js) que l'écran de séance en direct.
   ========================================================================== */

import { h, render } from '../ui.js';
import { Engine } from '../timer.js';
import * as beeper from '../beeper.js';

const MODES = [['CHRONO', 'Chrono'], ['MINUTEUR', 'Minuteur'], ['TABATA', 'Tabata']];

export function vueMinuteurs() {
  let mode = 'CHRONO';
  let recupSec = 90;
  let workSec = 20, restSec = 10, series = 8;
  const engine = new Engine((snap) => majCadran(snap));

  const el = h(`
    <section class="page">
      <p class="eyebrow">Entraînement</p>
      <h1>Minuteurs</h1>

      <div class="rangee" style="gap:.5rem" data-modes></div>
      <div data-reglages></div>

      <div class="run-cadran run-neutral" data-cadran>
        <span class="run-cadran-label" data-label>Prêt</span>
        <span class="run-cadran-value" data-value>0:00</span>
      </div>

      <div class="run-controles" data-controles></div>
    </section>`);

  const zoneModes = el.querySelector('[data-modes]');
  const zoneReglages = el.querySelector('[data-reglages]');
  const zoneControles = el.querySelector('[data-controles]');
  const cadran = el.querySelector('[data-cadran]');

  function arreterTout() {
    engine.chronoStop(); engine.minuteurStop(); engine.tabataStop();
  }

  function majCadran(snap) {
    cadran.className = `run-cadran run-${snap.colorKey}`;
    cadran.querySelector('[data-label]').textContent = snap.label;
    cadran.querySelector('[data-value]').textContent = snap.value;
    dessinerControles();
  }

  function dessinerModes() {
    zoneModes.replaceChildren();
    for (const [id, label] of MODES) {
      const b = h(`<button class="puce ${mode === id ? 'puce-active' : ''}" type="button">${label}</button>`);
      b.onclick = () => {
        arreterTout();
        mode = id; engine.mode = id;
        dessinerModes(); dessinerReglages();
        cadran.className = 'run-cadran run-neutral';
        cadran.querySelector('[data-label]').textContent = 'Prêt';
        cadran.querySelector('[data-value]').textContent = mode === 'TABATA' ? '—' : fmtSec(mode === 'MINUTEUR' ? recupSec : 0);
        dessinerControles();
      };
      zoneModes.appendChild(b);
    }
  }

  function champNombre(label, valeur, onChange, { min = 0, max = 999, step = 1 } = {}) {
    const wrap = h(`<label class="champ champ-mini"><span>${label}</span><input type="number"></label>`);
    const input = wrap.querySelector('input');
    input.min = min; input.max = max; input.step = step; input.value = valeur;
    input.addEventListener('change', () => {
      const v = Math.min(max, Math.max(min, parseInt(input.value, 10) || min));
      input.value = v; onChange(v);
    });
    return wrap;
  }

  function dessinerReglages() {
    zoneReglages.replaceChildren();
    if (mode === 'MINUTEUR') {
      const rangee = h('<div class="rangee rangee-serree"></div>');
      rangee.appendChild(champNombre('Récup (s)', recupSec, (v) => { recupSec = v; }, { min: 5, max: 600, step: 5 }));
      zoneReglages.appendChild(rangee);
    } else if (mode === 'TABATA') {
      const rangee = h('<div class="rangee rangee-serree"></div>');
      rangee.appendChild(champNombre('Travail (s)', workSec, (v) => { workSec = v; }, { min: 5, max: 300 }));
      rangee.appendChild(champNombre('Repos (s)', restSec, (v) => { restSec = v; }, { min: 0, max: 300 }));
      rangee.appendChild(champNombre('Blocs', series, (v) => { series = v; }, { min: 1, max: 30 }));
      zoneReglages.appendChild(rangee);
    }
  }

  function bouton(texte, onClick, classe = '') {
    const b = h(`<button class="btn ${classe}" type="button">${texte}</button>`);
    b.onclick = onClick;
    return b;
  }

  function dessinerControles() {
    zoneControles.replaceChildren();
    if (mode === 'CHRONO') {
      if (engine.chronoStart == null) {
        zoneControles.appendChild(bouton('Démarrer', () => { beeper.unlock(); engine.mode = 'CHRONO'; engine.chronoReset(); }, 'btn-lg'));
      } else {
        zoneControles.appendChild(bouton('Réinitialiser', () => engine.chronoReset(), 'btn-lg'));
        zoneControles.appendChild(bouton('Arrêter', () => engine.chronoStop(), 'btn-lg btn-ghost'));
      }
    } else if (mode === 'MINUTEUR') {
      if (!engine.minRunning) {
        zoneControles.appendChild(bouton('Démarrer', () => { beeper.unlock(); engine.mode = 'MINUTEUR'; engine.minuteurStart(recupSec); }, 'btn-lg'));
      } else {
        zoneControles.appendChild(bouton(engine.minPaused ? 'Reprendre' : 'Pause', () => engine.minuteurTogglePause(), 'btn-lg'));
        zoneControles.appendChild(bouton('Arrêter', () => engine.minuteurStop(), 'btn-lg btn-ghost'));
      }
    } else {
      if (!engine.tabRunning) {
        zoneControles.appendChild(bouton('Démarrer', () => { beeper.unlock(); engine.mode = 'TABATA'; engine.tabataStart(workSec, restSec, series); }, 'btn-lg'));
      } else {
        zoneControles.appendChild(bouton(engine.tabPaused ? 'Reprendre' : 'Pause', () => engine.tabataTogglePause(), 'btn-lg'));
        zoneControles.appendChild(bouton('Arrêter', () => engine.tabataStop(), 'btn-lg btn-ghost'));
      }
    }
  }

  dessinerModes();
  dessinerReglages();
  dessinerControles();
  render(el);
}

function fmtSec(s) { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
