/* ==========================================================================
   Bilan de séance — portage de SummaryScreen (TrainingScreens.kt ~2745).
   Partagé entre deux points d'entrée : la fin d'une séance en direct
   (lancer.js) et l'historique d'une séance (entrainement.js, HistoryScreen
   côté natif) — même écran, même capacité de correction dans les deux cas,
   exactement comme le natif réutilise SummaryScreen pour les deux.

   Écarts assumés face au natif : pas de zoom plein écran ni de bulle de nom
   sur la carte musculaire, pas de pavé numérique dédié (édition par
   prompt()), pas de rattachement manuel des exercices non reconnus par le
   lexique musculaire.
   ========================================================================== */

import { h, render, esc, toast, duree } from './ui.js';
import { saveWorkout, finishSession } from './api.js';
import { kg } from './model.js';
import { ouvrirPartage } from './partage.js';
import { muscleLoadOf } from './muscle-lexicon.js';
import { drawMuscleMap, drawLegend, MuscleScale } from './muscle-map.js';

/**
 * @param {object} p
 * @param {object} p.moi utilisateur courant (currentUser())
 * @param {object} p.modele workout.data (le modèle, dont modele.history contient `session`)
 * @param {object} p.session la réalisation à afficher — objet à l'intérieur de modele.history
 * @param {() => void} p.onFermer appelé à la fermeture (retour séances, ou redessiner l'historique)
 */
export async function ouvrirBilan({ moi, modele, session, onFermer }) {
  /* Un identifiant stable est requis pour synchroniser shared_sessions —
     les réalisations enregistrées avant l'introduction du champ n'en ont
     pas, on en dérive un de la date (esprit de la migration native). */
  session.uid = session.uid || `legacy-${session.startedAt}`;
  session.workoutName = session.workoutName || modele.name;
  session.category = session.category || modele.category;

  const tonnageOf = () => session.exercises.reduce((t, e) => t + e.sets.reduce((u, s) => u + s.weight * s.reps, 0), 0);
  const tensionOf = () => session.exercises.reduce((t, e) => t + e.sets.reduce((u, s) => u + (s.tensionMs || 0), 0), 0);

  const el = h(`
    <section class="page page-etroite">
      <p class="eyebrow">Bilan</p>
      <h1>${esc(modele.name || `Séance ${modele.category}`)}</h1>

      <div class="bilan-grande">
        <span class="bilan-grande-label">Charge totale déplacée</span>
        <span class="bilan-grande-valeur" data-tonnage></span>
      </div>
      <div class="bilan-petites">
        <div class="bilan-petite"><span class="label">Temps global</span><span class="valeur">${esc(duree(Math.max(0, (session.endedAt || 0) - (session.startedAt || 0)) / 1000))}</span></div>
        <div class="bilan-petite"><span class="label">Temps sous tension</span><span class="valeur" data-tension></span></div>
      </div>

      <div data-muscles></div>

      <p class="bilan-souscat">Par exercice</p>
      <div data-exercices></div>

      <div data-diverge></div>

      <button class="btn btn-lg" data-partager type="button" style="width:100%;margin-top:.8rem">Partager le bilan</button>
      <button class="btn btn-ghost" data-fermer type="button" style="width:100%;margin-top:.6rem">Fermer</button>
    </section>`);

  /* saveAll (SummaryScreen.kt) : toute correction réécrit le modèle ET la
     ligne partagée (shared_sessions), pour que fil/classement restent
     cohérents avec l'historique local. */
  async function saveAll() {
    try {
      await saveWorkout(moi.id, modele);
      await finishSession(moi.id, session);
    } catch (err) { toast(err.message); }
    redessiner();
  }

  function redessiner() {
    el.querySelector('[data-tonnage]').textContent = kg(tonnageOf());
    el.querySelector('[data-tension]').textContent = duree(tensionOf() / 1000);
    dessinerMuscles();
    dessinerExercices();
    dessinerDiverge();
  }

  async function dessinerMuscles() {
    const zone = el.querySelector('[data-muscles]');
    const { zones, unknown, isEmpty } = await muscleLoadOf(session);
    if (isEmpty && !unknown.length) { zone.replaceChildren(); return; }
    zone.replaceChildren(h(`
      <div>
        <p class="bilan-souscat">Muscles sollicités</p>
        ${!isEmpty ? `
          <canvas class="bilan-canvas" data-canvas></canvas>
          <div class="bilan-faces"><span>Face</span><span>Dos</span></div>
          <div class="bilan-degrade-row">
            <span>0</span><canvas class="bilan-degrade" data-legende></canvas><span>${MuscleScale.SESSION}+ séries</span>
          </div>` : ''}
        ${unknown.length ? `<p class="bilan-inconnus">${unknown.length === 1 ? '1 exercice non reconnu' : unknown.length + ' exercices non reconnus'} : ${esc(unknown.join(', '))}</p>` : ''}
      </div>`));
    if (!isEmpty) {
      const canvas = zone.querySelector('[data-canvas]');
      const legende = zone.querySelector('[data-legende]');
      await drawMuscleMap(canvas, zones, MuscleScale.SESSION);
      drawLegend(legende, MuscleScale.SESSION);
    }
  }

  function dessinerExercices() {
    const zone = el.querySelector('[data-exercices]');
    zone.replaceChildren();
    session.exercises.forEach((ex, exIdx) => {
      const volume = ex.sets.reduce((t, s) => t + s.weight * s.reps, 0);
      const tensionMs = ex.sets.reduce((t, s) => t + (s.tensionMs || 0), 0);
      const carte = h(`
        <div class="bilan-exo">
          <div class="bilan-exo-tete">
            <b>${exIdx + 1}.  ${esc(ex.name || 'Exercice')}</b>
            <button class="bilan-exo-drop" data-drop type="button" aria-label="Retirer l'exercice">✕</button>
          </div>
          <p class="bilan-exo-meta">${ex.sets.length} séries · ${esc(kg(volume))} · tension ${esc(duree(tensionMs / 1000))}</p>
          <div data-series></div>
          <button class="btn btn-ghost bilan-ajouter-serie" data-ajouter type="button">＋ Ajouter une série</button>
        </div>`);

      const zoneSeries = carte.querySelector('[data-series]');
      ex.sets.forEach((s, i) => {
        const ligne = h(`
          <div class="bilan-serie-row">
            <span class="bilan-serie-idx">${i + 1}</span>
            <button class="bilan-cell" data-poids type="button">${esc(kg(s.weight))}</button>
            <span class="bilan-x">×</span>
            <button class="bilan-cell" data-reps type="button">${s.reps}</button>
            <button class="bilan-suppr-serie" data-suppr type="button" aria-label="Supprimer la série">✕</button>
          </div>`);
        ligne.querySelector('[data-poids]').onclick = () => {
          const v = prompt('Poids (kg)', String(s.weight));
          if (v === null) return;
          const n = parseFloat(v.replace(',', '.'));
          if (!Number.isNaN(n)) { s.weight = n; saveAll(); }
        };
        ligne.querySelector('[data-reps]').onclick = () => {
          const v = prompt('Répétitions', String(s.reps));
          if (v === null) return;
          const n = parseInt(v, 10);
          if (Number.isInteger(n) && n > 0) { s.reps = n; saveAll(); }
        };
        ligne.querySelector('[data-suppr]').onclick = () => {
          if (!confirm(`Supprimer la série ${i + 1} ?`)) return;
          ex.sets.splice(i, 1);
          saveAll();
        };
        zoneSeries.appendChild(ligne);
      });

      carte.querySelector('[data-ajouter]').onclick = () => {
        const prev = ex.sets[ex.sets.length - 1];
        ex.sets.push({ weight: prev?.weight || 0, reps: prev?.reps || 0, tensionMs: 0, rir: -1 });
        saveAll();
      };
      carte.querySelector('[data-drop]').onclick = () => {
        if (!confirm(`« ${ex.name} » et ses ${ex.sets.length} série(s) seront retirés de cette séance. Les autres exercices sont conservés.`)) return;
        session.exercises.splice(exIdx, 1);
        saveAll();
      };

      zone.appendChild(carte);
    });
  }

  /* La séance jouée s'écarte-t-elle du modèle ? Comparaison par NOM
     d'exercice — c'est ce qui change quand un exercice est remplacé,
     ajouté ou retiré en cours de route (SummaryScreen.kt, `diverged`). */
  let variantSaved = 0; // 0 rien fait, 1 modèle mis à jour, 2 variante enregistrée
  function dessinerDiverge() {
    const zone = el.querySelector('[data-diverge]');
    const diverged = session.exercises.map(e => e.name).join('|') !== (modele.exercises || []).map(e => e.name).join('|');
    if (!diverged) { zone.replaceChildren(); return; }
    const texte = variantSaved === 1 ? 'La séance a été mise à jour avec cette version.'
      : variantSaved === 2 ? 'La variante est enregistrée comme nouvelle séance.'
      : "Cette réalisation est déjà rangée dans l'historique. Que veux-tu faire du modèle ?";
    zone.replaceChildren(h(`
      <div class="bilan-diverge">
        <h3>Tu as modifié la séance en cours de route</h3>
        <p>${esc(texte)}</p>
        ${variantSaved === 0 ? `
          <button class="btn" data-maj type="button">Mettre à jour cette séance</button>
          <button class="btn btn-ghost" data-variante type="button">Garder comme nouvelle séance</button>` : ''}
      </div>`));
    if (variantSaved === 0) {
      zone.querySelector('[data-maj]').onclick = async () => {
        modele.exercises = session.exercises.map(ex => ({ ...ex, sets: [] }));
        try { await saveWorkout(moi.id, modele); } catch (err) { return toast(err.message); }
        variantSaved = 1;
        dessinerDiverge();
      };
      zone.querySelector('[data-variante]').onclick = async () => {
        const nv = {
          id: Date.now(),
          name: (modele.name || `Séance ${modele.category}`) + ' (variante)',
          category: modele.category,
          exercises: session.exercises.map(ex => ({ ...ex, sets: [] })),
          history: []
        };
        try { await saveWorkout(moi.id, nv); } catch (err) { return toast(err.message); }
        variantSaved = 2;
        dessinerDiverge();
      };
    }
  }

  /* Même gabarit que le partage depuis l'historique (partage.js) — juste
     construit ici à partir de la séance affichée, pas relu depuis
     shared_sessions. */
  el.querySelector('[data-partager]').onclick = () => ouvrirPartage({
    workout_name: session.workoutName,
    started_at: new Date(session.startedAt).toISOString(),
    volume_kg: tonnageOf(),
    duration_ms: Math.max(0, (session.endedAt || 0) - (session.startedAt || 0)),
    tension_ms: tensionOf(),
    details: session.exercises.map(e => ({
      n: e.name,
      s: e.sets.map(s => ({ w: s.weight, r: s.reps, rir: s.rir }))
    }))
  });
  el.querySelector('[data-fermer]').onclick = () => onFermer();

  redessiner();
  render(el);
}
