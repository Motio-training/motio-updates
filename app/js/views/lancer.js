/* ==========================================================================
   Séance en direct — reprend le comportement ET le vocabulaire de
   RunWorkout (TrainingScreens.kt) : écran ÉCHAUFFEMENT avant chaque
   exercice, libellés SÉRIE/RÉCUPÉRATION, chrono global de séance, bilan de
   fin avec ressenti et note.

   Écarts assumés (pavé numérique dédié, glissement pour corriger une série
   déjà faite, suggestion de charge du coach, suivi en direct, remplacement
   d'exercice en cours de route) : le natif y consacre plusieurs centaines
   de lignes rien que pour ça. Ici : champs numériques classiques au lieu du
   pavé, navigation précédent/suivant simple au lieu du glissement.

   SessionEngine.kt : le décompte de mise en place (SETUP_SEC, 10 s) précède
   la toute première série d'un exercice, la récupération configurée
   précède les suivantes — les deux se comportent pareil côté moteur
   (minuteurStart), seul le libellé « Mise en place »/« Récupération »
   change.
   ========================================================================== */

import { h, render, loading, empty, failure, esc, toast, duree } from '../ui.js';
import { getWorkout, saveWorkout, finishSession } from '../api.js';
import { currentUser } from '../supabase.js';
import { libelleRir, kg } from '../model.js';
import { Engine } from '../timer.js';
import * as beeper from '../beeper.js';

const RIR = [0, 1, 2, 3, 4, 5];
const SETUP_SEC = 10;
const MOODS = [[1, '😩'], [2, '😕'], [3, '😐'], [4, '🙂'], [5, '💪']];
const MOOD_LABELS = { 1: 'Épuisé', 2: 'Fatigué', 3: 'Normal', 4: 'En forme', 5: 'Excellent' };

export async function vueLancerSeance(params) {
  render(loading('Préparation de la séance'));
  const moi = await currentUser();

  let row;
  try { row = await getWorkout(moi.id, params.id); }
  catch (e) { return render(failure(e, "La séance n'a pas pu être chargée")); }
  if (!row) return render(empty('Séance introuvable', 'Elle a peut-être été supprimée.',
    { href: '#/seances', label: 'Retour aux séances' }));

  const modele = row.data;
  if (!modele.exercises?.length) return render(empty('Séance vide',
    'Ajoute au moins un exercice avant de la lancer.',
    { href: `#/seances/${esc(params.id)}`, label: "Modifier la séance" }));

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

  let exIndex = 0;
  let warmup = true;      // écran ÉCHAUFFEMENT tant qu'aucune série n'a démarré sur cet exercice
  let termine = false;
  let enregistrement = false;

  const engine = new Engine((snap) => majCadran(snap));

  const el = h(`
    <section class="page run">
      <div class="run-tete">
        <span class="run-chrono-global" data-chrono-global>0:00</span>
        <span class="run-progress" data-progress></span>
        <span class="run-fermer" data-quitter>✕</span>
      </div>
      <div data-corps></div>
      <div class="run-bas-fixe">
        <button class="lien-inline" data-terminer type="button">Terminer la séance</button>
      </div>
    </section>`);

  const corps = el.querySelector('[data-corps]');
  const progress = el.querySelector('[data-progress]');
  const chronoGlobal = el.querySelector('[data-chrono-global]');

  /* Chrono global de séance — tourne du "Démarrer" au "Terminer", même hors
     de tout exercice précis (RunWorkout.kt : globalMs). */
  const tickGlobal = setInterval(() => {
    if (termine) { clearInterval(tickGlobal); return; }
    chronoGlobal.textContent = fmtClock(Math.floor((Date.now() - session.startedAt) / 1000));
  }, 1000);

  el.querySelector('[data-quitter]').onclick = () => {
    const fait = session.exercises.some(e => e.sets.length);
    if (fait && !confirm("Quitter sans terminer ? Rien ne sera enregistré.")) return;
    location.hash = '#/seances';
  };
  el.querySelector('[data-terminer]').onclick = () => ouvrirBilan();

  function majCadran(snap) {
    const cadran = corps.querySelector('[data-cadran]');
    if (!cadran) return;
    cadran.className = `run-cadran run-${snap.colorKey}`;
    const enTension = engine.tensionActive || (engine.mode === 'CHRONO' && engine.chronoStart != null);
    cadran.querySelector('[data-label]').textContent = enTension ? 'SÉRIE' : (snap.phase === 'COUNTDOWN' ? 'MISE EN PLACE' : 'RÉCUPÉRATION');
    cadran.querySelector('[data-value]').textContent = snap.value;

    /* MINUTEUR : la fin du décompte démarre la tension toute seule (moteur) —
       on fait juste suivre l'UI sans action de l'utilisateur. */
    if (snap.mode === 'MINUTEUR' && snap.phase === 'OVERFLOW') afficherSaisie(true);
  }

  function afficherSaisie(visible) {
    const zone = corps.querySelector('[data-saisie]');
    if (zone) zone.hidden = !visible;
  }

  function dessinerExercice() {
    const ex = session.exercises[exIndex];
    warmup = ex.sets.length === 0;

    progress.textContent = `Exo ${exIndex + 1}/${session.exercises.length}`;

    corps.replaceChildren(h(`
      <div>
        <h1 class="run-titre">${esc(ex.name)}</h1>
        <p class="run-sousligne" data-sousligne></p>

        <div class="run-cadran run-neutral" data-cadran>
          <span class="run-cadran-label" data-label>ÉCHAUFFEMENT</span>
          <span class="run-cadran-value" data-value>—</span>
        </div>

        <div class="run-controles" data-controles></div>

        <div class="run-saisie" data-saisie hidden>
          <div class="rangee rangee-serree">
            <label class="champ champ-mini"><span>Poids (kg)</span>
              <input type="number" inputmode="decimal" min="0" step="0.5" data-poids></label>
            <label class="champ champ-mini"><span>Répétitions</span>
              <input type="number" inputmode="numeric" min="0" data-reps value="${ex.targetReps || ''}"></label>
          </div>
          <p class="run-rir-label">RIR (facultatif, répétitions en réserve)</p>
          <div class="run-rir" data-rir>
            ${RIR.map(r => `<button type="button" class="puce" data-rir-val="${r}">${r === 5 ? '5+' : r}</button>`).join('')}
          </div>
          <button class="btn btn-lg" data-valider-serie type="button">Série faite</button>
        </div>

        <ul class="liste run-series" data-liste-series></ul>

        <div class="run-bas">
          <button class="run-fleche" data-precedent type="button" ${exIndex === 0 ? 'disabled' : ''}>‹</button>
          <button class="btn btn-ghost" data-suivant type="button" style="flex:1">Exercice suivant</button>
          <button class="run-fleche" data-suivant-fleche type="button" ${exIndex >= session.exercises.length - 1 ? 'disabled' : ''}>›</button>
        </div>
      </div>`));

    dessinerSousligne();
    redessinerSeries();
    dessinerControles();

    corps.querySelector('[data-precedent]').onclick = () => {
      engine.chronoStop(); engine.minuteurStop(); engine.tabataStop();
      exIndex--; dessinerExercice();
    };
    const allerSuivant = () => passerExercice();
    corps.querySelector('[data-suivant]').onclick = allerSuivant;
    corps.querySelector('[data-suivant-fleche]').onclick = allerSuivant;

    let rirChoisi = -1;
    corps.querySelectorAll('[data-rir-val]').forEach(b => {
      b.onclick = () => {
        const v = Number(b.dataset.rirVal);
        rirChoisi = rirChoisi === v ? -1 : v;
        corps.querySelectorAll('[data-rir-val]').forEach(x =>
          x.classList.toggle('puce-active', Number(x.dataset.rirVal) === rirChoisi));
      };
    });

    corps.querySelector('[data-valider-serie]').onclick = () => {
      const poids = parseFloat(corps.querySelector('[data-poids]').value) || 0;
      const reps = parseInt(corps.querySelector('[data-reps]').value, 10) || 0;
      if (!reps) return toast('Renseigne le nombre de répétitions.');

      let tensionMs;
      if (engine.mode === 'MINUTEUR') { tensionMs = engine.endTension(); engine.minuteurStop(); }
      else { tensionMs = engine.chronoStart ? Date.now() - engine.chronoStart : 0; engine.chronoStop(); }

      ex.sets.push({ weight: poids, reps, tensionMs, rir: rirChoisi });
      afficherSaisie(false);
      redessinerSeries();
      dessinerSousligne();

      if (ex.sets.length >= ex.plannedSets) {
        dessinerControles();
      } else if (ex.mode === 'MINUTEUR') {
        engine.mode = 'MINUTEUR';
        engine.minuteurStart(ex.recupSec);
        dessinerControles();
      } else {
        dessinerControles();
      }
    };
  }

  /** Sous-ligne « Exo X/Y · série X/Y · cible Xreps · r X:XX » — RunWorkout.kt. */
  function dessinerSousligne() {
    const ex = session.exercises[exIndex];
    const s = corps.querySelector('[data-sousligne]');
    if (!s) return;
    const numSerie = Math.min(ex.sets.length + (warmup ? 0 : 1), ex.mode === 'TABATA' ? 1 : ex.plannedSets);
    const bits = [`série ${numSerie || 1}/${ex.mode === 'TABATA' ? 1 : ex.plannedSets}`];
    if (ex.targetReps) bits.push(`cible ${ex.targetReps} reps`);
    if (ex.mode === 'MINUTEUR') bits.push(`r ${fmtClock(ex.recupSec)}`);
    s.textContent = bits.join(' · ');
  }

  function redessinerSeries() {
    const ex = session.exercises[exIndex];
    const ul = corps.querySelector('[data-liste-series]');
    ul.replaceChildren();
    ex.sets.forEach((s, i) => {
      ul.appendChild(h(`<li class="ligne run-serie-faite">
        Série ${i + 1} — ${esc(kg(s.weight))} × ${s.reps}
        ${s.rir >= 0 ? `<span class="etiquette">${esc(libelleRir(s.rir))}</span>` : ''}
      </li>`));
    });
  }

  function dessinerControles() {
    const ex = session.exercises[exIndex];
    const zone = corps.querySelector('[data-controles]');
    const complet = ex.sets.length >= ex.plannedSets && ex.mode !== 'TABATA';
    const tabataFait = ex.mode === 'TABATA' && ex.sets.length > 0;
    zone.replaceChildren();
    afficherSaisie(false);

    if (complet || tabataFait) {
      zone.appendChild(bouton('Exercice suivant', () => passerExercice(), 'btn-lg'));
      return;
    }

    if (ex.mode === 'TABATA') {
      zone.appendChild(bouton(ex.sets.length ? 'Relancer' : 'Démarrer', () => {
        beeper.unlock();
        warmup = false;
        engine.mode = 'TABATA';
        engine.tabataStart(ex.workSec, ex.restSec, ex.tabataSeries);
        surveillerTabata();
        zone.replaceChildren();
      }, 'btn-lg'));
      return;
    }

    /* Chaque série (y compris la 1re) est précédée d'une « mise en place » :
       SETUP_SEC avant la toute première, la récup configurée ensuite —
       exactement le calcul de dureeExercice (model.js) et de RunWorkout.kt. */
    if (ex.sets.length === 0 && warmup) {
      zone.appendChild(bouton('Démarrer', () => {
        beeper.unlock();
        if (ex.mode === 'MINUTEUR') {
          engine.mode = 'MINUTEUR';
          engine.minuteurStart(SETUP_SEC);
        } else {
          engine.mode = 'CHRONO';
          engine.chronoReset();
          afficherSaisie(true);
        }
        warmup = false;
        dessinerSousligne();
        zone.replaceChildren();
      }, 'btn-lg'));
    } else if (ex.mode === 'MINUTEUR') {
      const snap = engine._snapshot(Date.now());
      if (snap.phase === 'PAUSED') zone.appendChild(bouton('Reprendre', () => engine.minuteurTogglePause()));
      else zone.appendChild(bouton('Pause', () => engine.minuteurTogglePause()));
    } else {
      zone.appendChild(bouton('Série suivante', () => {
        engine.mode = 'CHRONO';
        engine.chronoReset();
        afficherSaisie(true);
        zone.replaceChildren();
      }, 'btn-lg'));
    }
  }

  function surveillerTabata() {
    const ex = session.exercises[exIndex];
    const t = setInterval(() => {
      const snap = engine._snapshot(Date.now());
      if (snap.phase === 'DONE') {
        clearInterval(t);
        ex.sets.push({ weight: 0, reps: 0, tensionMs: ex.workSec * ex.tabataSeries * 1000, rir: -1 });
        redessinerSeries();
        dessinerControles();
      }
    }, 300);
  }

  function bouton(texte, onClick, classe = '') {
    const b = h(`<button class="btn ${classe}" type="button">${esc(texte)}</button>`);
    b.onclick = onClick;
    return b;
  }

  function passerExercice() {
    engine.chronoStop(); engine.minuteurStop(); engine.tabataStop();
    if (exIndex < session.exercises.length - 1) { exIndex++; dessinerExercice(); }
    else ouvrirBilan();
  }

  /** Bilan de fin : ressenti (5 émojis) + note — EndSessionDialog/mood/note (RunWorkout.kt). */
  function ouvrirBilan() {
    if (termine) return;
    const fait = session.exercises.some(e => e.sets.length);
    if (!fait) { location.hash = '#/seances'; return; }

    const modale = h(`
      <div class="modale" role="dialog" aria-label="Terminer la séance">
        <div class="modale-boite">
          <div class="modale-tete"><h2>Terminer la séance</h2></div>
          <p class="champ-label">Comment t'es-tu senti ?</p>
          <div class="run-moods" data-moods></div>
          <label class="champ"><span>Note (facultatif)</span>
            <input type="text" data-note placeholder="douleur épaule, mauvaise nuit…" maxlength="300"></label>
          <div class="modale-pied">
            <button class="lien-inline" data-annuler type="button">Annuler</button>
            <button class="btn" data-valider type="button">Terminer</button>
          </div>
        </div>
      </div>`);
    const zoneMoods = modale.querySelector('[data-moods]');
    MOODS.forEach(([v, emoji]) => {
      const b = h(`<button type="button" class="run-mood" title="${esc(MOOD_LABELS[v])}">${emoji}</button>`);
      b.onclick = () => {
        session.mood = session.mood === v ? 0 : v;
        zoneMoods.querySelectorAll('.run-mood').forEach((x, i) => x.classList.toggle('on', MOODS[i][0] === session.mood));
      };
      zoneMoods.appendChild(b);
    });
    modale.querySelector('[data-note]').addEventListener('input', (e) => { session.note = e.target.value; });
    modale.querySelector('[data-annuler]').onclick = () => modale.remove();
    modale.querySelector('[data-valider]').onclick = () => { modale.remove(); finaliser(); };
    document.body.appendChild(modale);
  }

  async function finaliser() {
    if (termine || enregistrement) return;
    termine = true;
    engine.chronoStop(); engine.minuteurStop(); engine.tabataStop();
    session.endedAt = Date.now();

    enregistrement = true;
    render(loading('Enregistrement de la séance'));
    try {
      const dansModele = {
        startedAt: session.startedAt, endedAt: session.endedAt,
        uid: session.uid, note: session.note, mood: session.mood,
        exercises: session.exercises
      };
      modele.history = modele.history || [];
      modele.history.push(dansModele);
      await saveWorkout(moi.id, modele);
      await finishSession(moi.id, session);
    } catch (err) {
      return render(failure(err, "La séance n'a pas pu être enregistrée"));
    }

    const tonnage = session.exercises.reduce((t, e) => t + e.sets.reduce((u, s) => u + s.weight * s.reps, 0), 0);
    render(h(`
      <section class="page page-etroite">
        <p class="eyebrow">Séance terminée</p>
        <h1>Bien joué.</h1>
        <div class="chiffres">
          <div><b>${esc(duree((session.endedAt - session.startedAt) / 1000))}</b><span>durée</span></div>
          <div><b>${Math.round(tonnage)}</b><span>kg déplacés</span></div>
          <div><b>${session.exercises.reduce((t, e) => t + e.sets.length, 0)}</b><span>séries</span></div>
        </div>
        <a class="btn btn-lg" href="#/historique">Voir l'historique</a>
      </section>`));
  }

  dessinerExercice();
  render(el);
}

function fmtClock(totalSec) {
  const m = Math.floor(totalSec / 60), s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
