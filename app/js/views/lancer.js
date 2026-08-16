/* ==========================================================================
   Séance en direct — la pièce qui manquait à l'espace web : jusqu'ici il ne
   savait qu'éditer des modèles, jamais les exécuter (voir la note du menu :
   « La séance en cours se déroule dans l'application »).

   Reprend le comportement de SessionEngine.kt (app/js/timer.js) :
   - MINUTEUR : le 1er passage travaille à la volée (pas de récup avant la
     1re série, comme dans l'estimation de durée : SETUP_SEC, pas recupSec) ;
     ensuite chaque série suivante est précédée d'un décompte de récup, dont
     la fin déclenche automatiquement le chrono de tension (comportement natif
     de minuteurStart()/OVERFLOW, aucun tap requis pour démarrer la série).
   - CHRONO : chaque série est un chrono manuel (départ/validation), sans
     récup imposée entre elles.
   - TABATA : entièrement automatique, une fois lancé.

   Écrit la séance terminée à deux endroits en fin de parcours :
   - saveWorkout() : ajoute la Session au modèle local (historique, "fois
     faite"), même table que l'éditeur.
   - finishSession() : la ligne publique dans shared_sessions (fil, profil,
     classement) — même format que Social.push côté Android.
   ========================================================================== */

import { h, render, loading, empty, failure, esc, toast, duree } from '../ui.js';
import { getWorkout, saveWorkout, finishSession } from '../api.js';
import { currentUser } from '../supabase.js';
import { libelleRir, kg } from '../model.js';
import { Engine } from '../timer.js';
import * as beeper from '../beeper.js';

const RIR = [0, 1, 2, 3, 4, 5];

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

  /* La réalisation en cours : copie des exercices du modèle, séries vidées. */
  const session = {
    uid: crypto.randomUUID(),
    startedAt: Date.now(),
    endedAt: 0,
    workoutName: modele.name,
    category: modele.category,
    exercises: modele.exercises.map(e => ({ ...e, sets: [] }))
  };

  let exIndex = 0;
  let termine = false;
  let engineMode = null;   // 'travail' (chrono libre) | 'MINUTEUR' | 'TABATA' | null (pas démarré)
  let enregistrement = false;

  const engine = new Engine((snap) => majCadran(snap));

  const el = h(`
    <section class="page run">
      <div class="run-tete">
        <button class="lien-inline" data-quitter type="button">‹ Quitter</button>
        <span class="run-progress" data-progress></span>
        <button class="btn btn-sm btn-ghost" data-terminer type="button">Terminer la séance</button>
      </div>
      <div data-corps></div>
    </section>`);

  const corps = el.querySelector('[data-corps]');
  const progress = el.querySelector('[data-progress]');

  el.querySelector('[data-quitter]').onclick = () => {
    const fait = session.exercises.some(e => e.sets.length);
    if (fait && !confirm("Quitter sans terminer ? Rien ne sera enregistré.")) return;
    location.hash = '#/seances';
  };
  el.querySelector('[data-terminer]').onclick = () => finaliser();

  function majCadran(snap) {
    const cadran = corps.querySelector('[data-cadran]');
    if (!cadran) return;
    cadran.className = `run-cadran run-${snap.colorKey}`;
    cadran.querySelector('[data-label]').textContent = snap.label;
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
    engineMode = null;
    const ex = session.exercises[exIndex];
    const numSerie = ex.sets.length + 1;
    const derniere = numSerie > ex.plannedSets && ex.mode !== 'TABATA';

    progress.textContent = `Exercice ${exIndex + 1} / ${session.exercises.length}`;

    corps.replaceChildren(h(`
      <div>
        <p class="eyebrow">${esc(labelMode(ex.mode))}</p>
        <h1>${esc(ex.name)}</h1>
        <p class="ligne-meta" data-cible></p>

        <div class="run-cadran run-neutral" data-cadran>
          <span class="run-cadran-label" data-label>Prêt</span>
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
          <button class="btn btn-ghost" data-precedent type="button" ${exIndex === 0 ? 'disabled' : ''}>Exercice précédent</button>
          <button class="btn btn-ghost" data-suivant type="button">Passer à l'exercice suivant</button>
        </div>
      </div>`));

    const cible = corps.querySelector('[data-cible]');
    cible.textContent = ex.mode === 'TABATA'
      ? `${ex.tabataSeries} blocs · ${ex.workSec}s travail / ${ex.restSec}s repos`
      : `${ex.plannedSets} séries${ex.targetReps ? ` × ${ex.targetReps} reps` : ''}` +
        (ex.mode === 'MINUTEUR' ? ` · récup ${ex.recupSec}s` : '');

    redessinerSeries();
    dessinerControles();

    corps.querySelector('[data-precedent]').onclick = () => { engine.chronoStop(); engine.minuteurStop(); engine.tabataStop(); exIndex--; dessinerExercice(); };
    corps.querySelector('[data-suivant]').onclick = () => passerExercice();

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

      /* On distingue sur le SOUS-MODE du moteur, pas sur celui de l'exercice :
         la 1re série d'un exercice MINUTEUR tourne en CHRONO (pas de récup
         avant la 1re série), seules les suivantes passent par le décompte. */
      let tensionMs;
      if (engine.mode === 'MINUTEUR') { tensionMs = engine.endTension(); engine.minuteurStop(); }
      else { tensionMs = engine.chronoStart ? Date.now() - engine.chronoStart : 0; engine.chronoStop(); }

      ex.sets.push({ weight: poids, reps, tensionMs, rir: rirChoisi });
      afficherSaisie(false);
      redessinerSeries();

      if (ex.sets.length >= ex.plannedSets) {
        dessinerControles();  // exercice complet : proposer "suivant"
      } else if (ex.mode === 'MINUTEUR') {
        engine.mode = 'MINUTEUR';
        engine.minuteurStart(ex.recupSec);
        dessinerControles();
      } else {
        dessinerControles();
      }
    };
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
        engine.mode = 'TABATA';
        engine.tabataStart(ex.workSec, ex.restSec, ex.tabataSeries);
        surveillerTabata();
      }, 'btn-lg'));
      return;
    }

    /* MINUTEUR / CHRONO : la 1re série démarre directement en tension (pas de
       récup avant la 1re, voir l'estimation de durée du modèle). */
    if (ex.sets.length === 0) {
      zone.appendChild(bouton('Démarrer la série', () => {
        beeper.unlock();
        engine.mode = 'CHRONO';
        engine.chronoReset();
        afficherSaisie(true);
      }, 'btn-lg'));
    } else if (ex.mode === 'MINUTEUR') {
      /* Une récup est déjà en cours (lancée juste après la série précédente) :
         rien à faire, majCadran() affichera la saisie à la fin du décompte. */
      const snap = engine._snapshot(Date.now());
      if (snap.phase === 'PAUSED') {
        zone.appendChild(bouton('Reprendre', () => engine.minuteurTogglePause()));
      } else {
        zone.appendChild(bouton('Pause', () => engine.minuteurTogglePause()));
      }
    } else {
      zone.appendChild(bouton('Série suivante', () => {
        engine.mode = 'CHRONO';
        engine.chronoReset();
        afficherSaisie(true);
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

  function labelMode(m) {
    return { MINUTEUR: 'Séries et récupération', CHRONO: 'Chrono libre', TABATA: 'Tabata' }[m] || m;
  }

  function passerExercice() {
    engine.chronoStop(); engine.minuteurStop(); engine.tabataStop();
    if (exIndex < session.exercises.length - 1) { exIndex++; dessinerExercice(); }
    else finaliser();
  }

  async function finaliser() {
    if (termine || enregistrement) return;
    const fait = session.exercises.some(e => e.sets.length);
    if (!fait) { location.hash = '#/seances'; return; }
    termine = true;
    engine.chronoStop(); engine.minuteurStop(); engine.tabataStop();
    session.endedAt = Date.now();

    enregistrement = true;
    render(loading('Enregistrement de la séance'));
    try {
      const dansModele = {
        startedAt: session.startedAt, endedAt: session.endedAt,
        uid: session.uid, note: '', mood: 0,
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
