/* ==========================================================================
   SÉANCE EN CIRCUIT — portage de CircuitScreen.kt.

   Un écran à part, et pas une branche de plus dans lancer.js : les deux
   écrans n'ont presque rien en commun. Une séance ordinaire est faite
   d'appuis (je valide ma série, je note ma charge, je passe à l'exercice
   suivant) ; un circuit ne se touche PAS. Il se lance une fois, puis se
   regarde et s'écoute : le temps d'effort tombe, le repos s'enchaîne, la
   station suivante arrive toute seule.

   CE QU'ON NE DEMANDE PAS : ni charge, ni répétitions, ni RIR, ni « exercice
   suivant ». Sur une station de trente secondes, saisir un poids n'a aucun
   sens et lever la tête pour appuyer sur un bouton casse le circuit. Ce qui
   est enregistré, c'est le temps d'effort réellement tenu, station par
   station : de quoi remplir l'historique, la durée et la carte musculaire
   sans rien réclamer pendant l'effort.

   LA PLANCHE DU MOUVEMENT tient la plus grande partie de l'écran, parce qu'en
   circuit on découvre souvent la station au moment d'y arriver. Pendant un
   repos, c'est déjà la planche de la station SUIVANTE qui s'affiche : c'est
   pendant qu'on souffle qu'on a besoin de voir ce qui arrive. Un bouton la
   masque (mémorisé localement, comme côté natif) et le décompte prend alors
   toute la place.
   ========================================================================== */

import { h, render, esc, loading, failure } from '../ui.js';
import { saveWorkout, finishSession, demarrerDirect, battementDirect, arreterDirect } from '../api.js';
import { circuitPlan, CIRCUIT_WORK_SEC, CIRCUIT_REST_SEC } from '../model.js';
import { Engine } from '../timer.js';
import * as beeper from '../beeper.js';
import { ouvrirBilan } from '../bilan.js';
import { lireEtat, ecrireEtat, effacerEtat } from '../run-state.js';
import { visualFor } from '../exercise-visuals.js';
import * as guide from '../coach-guide.js';

const CLE_VISUELS = 'motio.circuit-visuels';

/** Afficher la planche en grand pendant un circuit. Local, comme le réglage
 *  de son : ça dépend de l'écran qu'on a et de si l'on connaît déjà les
 *  mouvements, pas du compte. Activé par défaut. */
function visuelsActifs() {
  try { return localStorage.getItem(CLE_VISUELS) !== '0'; } catch { return true; }
}
function definirVisuels(v) {
  try { localStorage.setItem(CLE_VISUELS, v ? '1' : '0'); } catch { /* stockage refusé */ }
}

const fmtClock = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

export async function vueCircuit({ moi, modele, params }) {
  const session = {
    uid: crypto.randomUUID(),
    startedAt: Date.now(),
    endedAt: 0,
    mood: 0,
    note: '',
    workoutName: modele.name,
    category: modele.category,
    exercises: modele.exercises.map(e => ({ ...e, sets: [] }))
  };

  const repris = lireEtat(moi.id, params.id);
  if (repris?.session) Object.assign(session, repris.session);

  const plan = circuitPlan(session.exercises, modele.rounds, modele.roundRestSec);
  const totalSec = plan.reduce((t, s) => t + s.durSec, 0);
  const tours = plan.length ? plan[plan.length - 1].round : 0;

  let visuels = visuelsActifs();
  let termine = false;
  let enregistrement = false;
  let dernierSnap = null;

  const engine = new Engine((snap) => dessiner(snap));
  engine.guide = (...a) => guide.seconde(...a);
  engine.mode = 'CIRCUIT';
  engine.circuitLoad(plan);

  const el = h(`
    <section class="page circuit">
      <div class="circuit-tete">
        <div class="circuit-tete-bloc">
          <span class="circuit-label">SÉANCE</span>
          <span class="circuit-chrono" data-chrono>0:00</span>
        </div>
        <div class="circuit-tete-bloc circuit-tete-centre">
          <span class="circuit-label">TOUR</span>
          <span class="circuit-tour" data-tour>—</span>
        </div>
        <div class="circuit-tete-bloc circuit-tete-droite">
          <a href="#/coach"><img class="run-avatar" src="../assets/img/moti_avatar.jpg" alt="Moti, ton coach IA"></a>
          <button class="run-icone" data-quitter type="button" aria-label="Fermer">✕</button>
        </div>
      </div>
      <div class="circuit-corps" data-corps></div>
    </section>`);

  const chronoEl = el.querySelector('[data-chrono]');
  const tourEl = el.querySelector('[data-tour]');
  const corps = el.querySelector('[data-corps]');

  /**
   * ÉCRIT CE QUI A ÉTÉ FAIT, recalculé de zéro à chaque appel.
   *
   * Volontairement idempotent, et volontairement pas incrémental : compter
   * les efforts au fil de l'eau obligerait à ne rater aucun changement de
   * segment, or la page peut être rechargée au milieu d'un circuit. On repart
   * donc du déroulé et de l'endroit où l'on en est, ce qui donne toujours le
   * même résultat, appelé une fois ou dix.
   */
  function enregistrerEfforts(jusquA) {
    const faits = session.exercises.map(() => 0);
    const duree = session.exercises.map(() => 0);
    plan.forEach((seg, i) => {
      if (!seg.work || seg.station < 0 || seg.station >= session.exercises.length) return;
      if (jusquA >= 0 && i >= jusquA) return;
      faits[seg.station]++;
      duree[seg.station] = seg.durSec;
    });
    session.exercises.forEach((e, i) => {
      e.sets = [];
      // Ni charge ni répétitions : en circuit, la seule mesure est le temps
      // passé sous tension. rir -1 = non renseigné, comme pour le tabata.
      for (let k = 0; k < faits[i]; k++) {
        e.sets.push({ weight: 0, reps: 0, tensionMs: duree[i] * 1000, rir: -1 });
      }
    });
  }

  function sauver() {
    if (termine) return;
    ecrireEtat({
      userId: moi.id, workoutId: params.id,
      nom: modele.name, categorie: modele.category,
      circuit: true, session, engine: engine.captureEtat()
    });
  }

  /* ---- Avant le départ : le circuit en un coup d'œil ---- */
  function dessinerBriefing() {
    corps.replaceChildren(h(`
      <div class="circuit-briefing">
        <h1>${esc(modele.name || 'Circuit')}</h1>
        <p class="ligne-meta">${tours} tour${tours > 1 ? 's' : ''} ·
          ${session.exercises.length} stations ·
          ${Math.floor(totalSec / 60)} min ${totalSec % 60} s</p>
        <p class="etat-mono">Tout s'enchaîne tout seul : effort, repos, station suivante.
          Rien à saisir, rien à valider.</p>
        <ul class="liste circuit-stations">
          ${session.exercises.map((e, i) => {
            const v = visualFor(e.name);
            return `<li class="ligne circuit-station">
              ${v ? `<img class="exo-vignette" src="${v.image}" alt="" loading="lazy" width="44" height="44">` : ''}
              <span class="ligne-titre">${i + 1}. ${esc(e.name || `Station ${i + 1}`)}</span>
              <span class="ligne-meta">${e.workSec > 0 ? e.workSec : CIRCUIT_WORK_SEC} s d'effort ·
                ${e.restSec > 0 ? e.restSec : CIRCUIT_REST_SEC} s de repos</span>
            </li>`;
          }).join('')}
        </ul>
        ${modele.roundRestSec > 0 && tours > 1
          ? `<p class="etat-mono">Puis ${modele.roundRestSec} s de repos avant le tour suivant.</p>` : ''}
        <button class="btn btn-lg" data-demarrer type="button">Démarrer le circuit</button>
      </div>`));
    corps.querySelector('[data-demarrer]').onclick = () => {
      beeper.unlock();
      engine.circuitStart();
    };
  }

  /* ---- En circuit ---- */
  function dessinerCircuit(snap) {
    const pause = snap.phase === 'PAUSED';
    const effort = snap.phase === 'WORK';
    /* La station DONT ON MONTRE LA PLANCHE : pendant un effort, celle qu'on
       fait ; pendant un repos, la SUIVANTE — c'est en soufflant qu'on a
       besoin de savoir ce qui arrive, pas une fois qu'on y est. */
    let station = -1;
    if (snap.segment >= 0) {
      station = plan[snap.segment].work
        ? plan[snap.segment].station
        : (plan.slice(snap.segment + 1).find(s => s.work)?.station ?? -1);
    }
    const ex = session.exercises[station];
    const nom = ex?.name || '';
    const v = visuels && nom ? visualFor(nom) : null;


    corps.replaceChildren(h(`
      <div class="circuit-jeu ${effort ? 'effort' : pause ? 'pause' : 'repos'}">
        ${v
          ? `<div class="circuit-planche"><img src="${v.image}" alt="Mouvement de l'exercice ${esc(nom)}"></div>`
          : `<div class="circuit-compte-geant" data-geant>${esc(snap.value)}</div>`}
        <div class="circuit-bas">
          <div class="circuit-info">
            <span class="circuit-phase">${pause ? 'EN PAUSE' : effort ? 'EFFORT' : 'REPOS'}</span>
            <span class="circuit-nom">${esc(station >= 0 ? (nom || 'Station') : 'Fin du tour')}</span>
            ${!effort && station >= 0 ? '<span class="circuit-ensuite">Ensuite</span>' : ''}
          </div>
          ${v ? `<div class="circuit-compte" data-compte>${esc(snap.value)}</div>` : ''}
        </div>
        <div class="circuit-actions">
          <button class="btn ${pause ? '' : 'btn-ghost'}" data-pause type="button">${pause ? 'Reprendre' : 'Pause'}</button>
          <button class="btn btn-ghost" data-visuels type="button">${visuels ? 'Masquer les visuels' : 'Afficher les visuels'}</button>
        </div>
      </div>`));

    corps.querySelector('[data-pause]').onclick = () => engine.circuitTogglePause();
    corps.querySelector('[data-visuels]').onclick = () => {
      visuels = !visuels; definirVisuels(visuels);
      dessinerCircuit(dernierSnap || snap);
    };
  }

  /**
   * Ce que la voix du coach dira aux prochains changements de segment.
   *
   * Toujours en avance d'un cran : pendant un repos on prépare la phrase de
   * l'effort qui suit, pendant un effort celle du repos. Le moteur lit la
   * phrase telle qu'elle est AU MOMENT du changement (beeper.phaseBeep), et
   * il déclenche le premier changement dans le tick même du démarrage —
   * d'où l'appel dès l'écran d'attente, sans quoi la toute première posture
   * n'était pas annoncée.
   */
  function preparerVoix(segment) {
    const depart = Math.max(0, segment);
    const enCours = plan[depart];
    // Le mouvement en cours pendant un effort ; pendant un repos, celui qui
    // arrive — c'est de lui que le guide donnera la consigne.
    const effortCourant = enCours?.work ? enCours : plan.slice(depart).find(s => s.work);
    // « Ensuite » = le PROCHAIN effort strictement après le segment courant.
    // Sans ce « strictement », le repos annonçait la station d'encore après.
    const suivantEffort = plan.slice(depart + 1).find(s => s.work);
    guide.etat.exercice = session.exercises[effortCourant?.station]?.name || '';
    guide.etat.suivant = session.exercises[suivantEffort?.station]?.name || '';
    guide.etat.actif = true;
    guide.reinitialiser();
  }

  /* Redessin complet uniquement quand la STATION ou la PHASE change : sinon
     on se contente de réécrire le décompte. Sans ça, on reconstruirait le DOM
     — et on rechargerait la planche — dix fois par seconde. */
  let cleAffichee = null;
  function dessiner(snap) {
    dernierSnap = snap;
    if (termine) return;
    preparerVoix(snap.segment);

    const ecoule = Math.floor((Date.now() - session.startedAt) / 1000);
    chronoEl.textContent = fmtClock(ecoule);
    tourEl.textContent = snap.round > 0 ? `${snap.round}/${snap.roundTot || tours}` : '—';

    if (snap.phase === 'DONE') { dessinerFin(); return; }
    if (snap.phase === 'IDLE') { if (cleAffichee !== 'idle') { cleAffichee = 'idle'; dessinerBriefing(); } return; }

    const cle = `${snap.segment}|${snap.phase}|${visuels}`;
    if (cle !== cleAffichee) {
      cleAffichee = cle;
      dessinerCircuit(snap);
    } else {
      const cible = corps.querySelector('[data-compte]') || corps.querySelector('[data-geant]');
      if (cible) cible.textContent = snap.value;
    }
    sauver();
  }

  function dessinerFin() {
    if (cleAffichee === 'fin') return;
    cleAffichee = 'fin';
    const ecoule = Math.floor((Date.now() - session.startedAt) / 1000);
    corps.replaceChildren(h(`
      <div class="circuit-fin">
        <span class="circuit-fin-coche">✓</span>
        <h2>Circuit terminé</h2>
        <p class="ligne-meta">${tours} tour${tours > 1 ? 's' : ''} ·
          ${session.exercises.length} stations · ${fmtClock(ecoule)}</p>
        <button class="btn btn-lg" data-bilan type="button">Voir le bilan</button>
      </div>`));
    corps.querySelector('[data-bilan]').onclick = () => finaliser(-1);
  }

  async function finaliser(jusquA) {
    if (termine || enregistrement) return;
    termine = true;
    enregistrement = true;
    enregistrerEfforts(jusquA);
    engine.circuitStop();
    effacerEtat();
    session.endedAt = Date.now();
    arreterDirect(moi.id).catch(() => {});

    render(loading('Enregistrement de la séance'));
    try {
      modele.history = modele.history || [];
      modele.history.push({
        startedAt: session.startedAt, endedAt: session.endedAt,
        uid: session.uid, note: session.note, mood: session.mood,
        exercises: session.exercises
      });
      await saveWorkout(moi.id, modele);
      await finishSession(moi.id, session);
    } catch (err) {
      return render(failure(err, "La séance n'a pas pu être enregistrée"));
    }
    await ouvrirBilan({
      moi, modele, session, libre: false,
      onFermer: () => { location.hash = '#/seances'; }
    });
  }

  el.querySelector('[data-quitter]').onclick = () => {
    if (!engine.circRunning && !session.exercises.some(e => e.sets.length)) {
      effacerEtat();
      arreterDirect(moi.id).catch(() => {});
      location.hash = '#/seances';
      return;
    }
    const idx = engine.circuitIndex();
    const modale = h(`
      <div class="modale" role="dialog" aria-label="Arrêter le circuit">
        <div class="modale-boite">
          <div class="modale-tete"><h2>Arrêter le circuit ?</h2></div>
          <p class="etat-mono">Les tours déjà faits seront enregistrés. Tu peux aussi
            quitter sans rien garder.</p>
          <div class="run-fin-actions">
            <button class="btn btn-lg" data-garder type="button">Enregistrer</button>
            <button class="btn btn-ghost" data-jeter type="button">Quitter sans garder</button>
            <button class="lien-inline" data-annuler type="button">Annuler</button>
          </div>
        </div>
      </div>`);
    modale.querySelector('[data-garder]').onclick = () => {
      modale.remove();
      finaliser(idx < 0 ? plan.length : idx);
    };
    modale.querySelector('[data-jeter]').onclick = () => {
      termine = true;
      engine.circuitStop();
      effacerEtat();
      arreterDirect(moi.id).catch(() => {});
      modale.remove();
      location.hash = '#/seances';
    };
    modale.querySelector('[data-annuler]').onclick = () => modale.remove();
    document.body.appendChild(modale);
  };

  // Reprise d'un circuit laissé en plan : le plan est déjà chargé ci-dessus,
  // il ne reste que l'horloge à restaurer pour retomber sur le bon segment.
  if (repris?.engine) engine.restaurerEtat(repris.engine);
  dessiner(engine._snapshot(Date.now()));
  render(el);

  demarrerDirect(moi.id, modele.name, modele.category).catch(() => {});
  const battementId = setInterval(() => {
    if (termine || !document.body.contains(el)) {
      clearInterval(battementId);
      if (!termine) arreterDirect(moi.id).catch(() => {});
      return;
    }
    const st = dernierSnap?.station ?? 0;
    battementDirect(moi.id, session, Math.max(0, st)).catch(() => {});
  }, 15000);

  // Chrono de séance : le moteur ne tourne pas tant que le circuit n'est pas
  // lancé, or l'en-tête doit déjà compter.
  const chronoId = setInterval(() => {
    if (termine || !document.body.contains(el)) { clearInterval(chronoId); return; }
    chronoEl.textContent = fmtClock(Math.floor((Date.now() - session.startedAt) / 1000));
  }, 1000);
}
