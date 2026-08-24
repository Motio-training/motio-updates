/* ==========================================================================
   Minuteurs — onglet autonome de la barre du bas, comme dans l'appli
   Android : les trois modes hors du contexte d'une séance, pour un usage
   libre (échauffement, étirements, tout ce qui n'est pas dans le carnet).
   Réutilise le même moteur (timer.js) que l'écran de séance en direct.
   ========================================================================== */

import { h, render } from '../ui.js';
import { Engine } from '../timer.js';
import * as beeper from '../beeper.js';
import { ouvrirPave } from '../numpad.js';

const MODES = [['CHRONO', 'Chrono'], ['MINUTEUR', 'Minuteur'], ['TABATA', 'Tabata'], ['EMOM', 'EMOM']];
const PRESETS_MINUTEUR_1 = [30, 60, 90, 120];
const PRESETS_MINUTEUR_2 = [180, 300];

/* L'EMOM EST UN TABATA SANS REPOS : un intervalle répété n fois, rien entre
   deux. Le moteur tabata le fait déjà, bip de début de tour compris — d'où
   ce moteur-là pour les deux onglets, et aucun second moteur à maintenir.
   `mode` est donc l'onglet AFFICHÉ, `engine.mode` celui qui tourne : les deux
   se séparent ici et nulle part ailleurs. */
const moteurDe = (m) => (m === 'EMOM' ? 'TABATA' : m);

export function vueMinuteurs() {
  let mode = 'CHRONO';
  let recupSec = 90;
  let workSec = 20, restSec = 10, series = 8;
  let emomSec = 60, emomTours = 10;
  const engine = new Engine((snap) => majCadran(snap));

  /* Disposition reprise de MinuteurScreen (MainActivity.kt) : trois onglets
     soulignés tout en haut, et le cadran seul au milieu de l'écran. Le web
     ajoutait un sur-titre « Entraînement » et un grand « Minuteurs » qui
     n'existent pas dans l'application et repoussaient le chrono vers le bas. */
  const el = h(`
    <section class="page minuteurs">
      <div class="min-onglets" data-modes></div>
      <div data-reglages></div>

      <div class="run-cadran run-neutral" data-cadran>
        <span class="run-cadran-label" data-label>Chrono</span>
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
      const b = h(`<button class="min-onglet ${mode === id ? 'on' : ''}" type="button">${label}</button>`);
      b.onclick = () => {
        arreterTout();
        mode = id; engine.mode = moteurDe(id);
        dessinerModes(); dessinerReglages();
        cadran.className = 'run-cadran run-neutral';
        cadran.querySelector('[data-label]').textContent = 'Prêt';
        const cyclique = mode === 'TABATA' || mode === 'EMOM';
        cadran.querySelector('[data-value]').textContent = cyclique ? '—' : fmtSec(mode === 'MINUTEUR' ? recupSec : 0);
        dessinerControles();
      };
      zoneModes.appendChild(b);
    }
  }

  /** NumberRow (MainActivity.kt) : label + − + valeur + + — même stepper pour
   *  les trois champs de Tabata, portage exact (pas de « Blocs » : « Séries »
   *  comme le natif, pas 5, mais 1). */
  function stepper(label, valeur, onChange, { pas = 5, min = 0, max = 999, unite = '' } = {}) {
    const rangee = h(`
      <div class="minuteur-stepper">
        <span class="minuteur-stepper-label">${label}</span>
        <button type="button" class="minuteur-stepper-bouton" data-moins aria-label="Diminuer">−</button>
        <span class="minuteur-stepper-valeur" data-valeur>${valeur}${unite}</span>
        <button type="button" class="minuteur-stepper-bouton" data-plus aria-label="Augmenter">+</button>
      </div>`);
    const affiche = rangee.querySelector('[data-valeur]');
    function appliquer(v) {
      valeur = Math.min(max, Math.max(min, v));
      affiche.textContent = `${valeur}${unite}`;
      onChange(valeur);
    }
    rangee.querySelector('[data-moins]').onclick = () => appliquer(valeur - pas);
    rangee.querySelector('[data-plus]').onclick = () => appliquer(valeur + pas);
    return rangee;
  }

  /** Puce de durée pré-réglée — même valeurs que MinuteurScreen (MainActivity.kt) :
   *  0:30/1:00/1:30/2:00 puis 3:00/5:00/Autre…, plus -15s/+15s. Remplace l'ancien
   *  champ numérique brut : Nicolas voulait les trois modes « semblables dans
   *  l'utilisation et l'aspect visuel » — Minuteur et Tabata partagent maintenant
   *  le même vocabulaire visuel (puces/steppers) que Chrono partageait déjà
   *  (aucun réglage, juste le cadran). */
  function dessinerReglages() {
    zoneReglages.replaceChildren();
    if (mode === 'MINUTEUR') {
      const chips1 = h('<div class="rangee rangee-serree" style="margin-bottom:.5rem"></div>');
      const chips2 = h('<div class="rangee rangee-serree" style="margin-bottom:.5rem"></div>');
      const ajustes = h('<div class="rangee rangee-serree"></div>');
      function dessinerChips() {
        chips1.replaceChildren();
        PRESETS_MINUTEUR_1.forEach(s => {
          const b = h(`<button class="chip-cat ${recupSec === s ? 'on' : ''}" type="button">${fmtSec(s)}</button>`);
          b.onclick = () => { recupSec = s; dessinerChips(); };
          chips1.appendChild(b);
        });
        chips2.replaceChildren();
        PRESETS_MINUTEUR_2.forEach(s => {
          const b = h(`<button class="chip-cat ${recupSec === s ? 'on' : ''}" type="button">${fmtSec(s)}</button>`);
          b.onclick = () => { recupSec = s; dessinerChips(); };
          chips2.appendChild(b);
        });
        const autre = h(`<button class="chip-cat ${[...PRESETS_MINUTEUR_1, ...PRESETS_MINUTEUR_2].includes(recupSec) ? '' : 'on'}" type="button">Autre…</button>`);
        autre.onclick = () => ouvrirPave({
          kind: 'secondes',
          onValider: (v) => {
            const n = parseInt(v, 10);
            if (Number.isInteger(n) && n >= 5) { recupSec = Math.min(3600, n); dessinerChips(); }
          }
        });
        chips2.appendChild(autre);
      }
      dessinerChips();
      const moins15 = h('<button class="chip-cat" type="button">-15 s</button>');
      moins15.onclick = () => { recupSec = Math.max(5, recupSec - 15); dessinerChips(); };
      const plus15 = h('<button class="chip-cat" type="button">+15 s</button>');
      plus15.onclick = () => { recupSec += 15; dessinerChips(); };
      ajustes.append(moins15, plus15);
      zoneReglages.append(chips1, chips2, ajustes);
    } else if (mode === 'TABATA') {
      const col = h('<div style="display:flex;flex-direction:column;gap:.5rem"></div>');
      col.append(
        stepper('Travail', workSec, (v) => { workSec = v; }, { pas: 5, min: 5, max: 600, unite: 's' }),
        stepper('Repos', restSec, (v) => { restSec = v; }, { pas: 5, min: 0, max: 600, unite: 's' }),
        stepper('Séries', series, (v) => { series = v; }, { pas: 1, min: 1, max: 50, unite: '' })
      );
      zoneReglages.appendChild(col);
    } else if (mode === 'EMOM') {
      /* Deux réglages seulement : l'intervalle et le nombre de tours. Le temps
         qui reste dans l'intervalle sert de récupération, il n'y a donc rien
         à régler pour elle. */
      const col = h('<div style="display:flex;flex-direction:column;gap:.5rem"></div>');
      col.append(
        stepper('Intervalle', emomSec, (v) => { emomSec = v; }, { pas: 5, min: 10, max: 600, unite: 's' }),
        stepper('Tours', emomTours, (v) => { emomTours = v; }, { pas: 1, min: 1, max: 60, unite: '' })
      );
      zoneReglages.appendChild(col);
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
        zoneControles.appendChild(bouton('Démarrer', () => {
          beeper.unlock();
          engine.mode = 'TABATA';
          // C'est le repos à zéro qui fait l'EMOM.
          if (mode === 'EMOM') engine.tabataStart(emomSec, 0, emomTours);
          else engine.tabataStart(workSec, restSec, series);
        }, 'btn-lg'));
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
