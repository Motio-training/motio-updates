/* ==========================================================================
   Séance en direct — reprend RunWorkout (TrainingScreens.kt ~ligne 1409),
   revu pixel pour pixel d'après de vraies captures du natif (2026-08-16) :
   pas de carte autour du chrono (texte nu sur le fond), en-tête sur 2 lignes
   (SÉANCE + chrono à gauche, titre au centre, avatar Moti + pause + croix à
   droite, « reste ~Xh » sous les icônes), ÉCHAUFFEMENT en gros texte doré
   seul (pas de libellé séparé), rappel LA DERNIÈRE FOIS pendant l'échauffe-
   ment, cellules Poids/Reps ouvrant un pavé numérique dédié, glissement
   pour corriger une série déjà faite, suggestion de charge autorégulée par
   RIR (Coaching.kt), bannière de record, bouton unique « Exercice suivant
   ▶ » + rond « ‹ » précédent, croix = dialogue unique (terminer avec bilan
   / quitter sans enregistrer).

   Écarts encore assumés : pas de suivi en direct visible par les abonnés
   (LiveSessions), pas de remplacement d'exercice en cours de route, pas de
   report automatique du RIR d'une série à l'autre, pas d'estimation de
   charge de départ sans historique (StrengthDefaults — dépend du niveau et
   du poids de corps, des réglages locaux natifs sans équivalent web),
   navigation simplifiée (pas de superséries/blocs multi-exercices, pas de
   « peek » vers l'exercice précédent/suivant en gardant la récup en cours).
   ========================================================================== */

import { h, render, loading, empty, failure, esc, toast } from '../ui.js';
import { getWorkout, saveWorkout, finishSession, sessionsOf,
         demarrerDirect, battementDirect, arreterDirect } from '../api.js';
import { currentUser } from '../supabase.js';
import { libelleRir, kg, dureeSeance, estime1RM } from '../model.js';
import { devineMateriel } from '../catalog.js';
import { Engine } from '../timer.js';
import * as beeper from '../beeper.js';
import { ouvrirBilan } from '../bilan.js';
import { ouvrirPave } from '../numpad.js';

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

  /* Records d'avant cette séance, par nom d'exercice (newRecords/recordsFor,
     Stats.kt) : figés une fois pour toutes au lancement, comme le natif qui
     exclut la session en cours — deux séries plus lourdes l'une que l'autre
     PENDANT la même séance ne se comparent pas entre elles, seulement au
     meilleur déjà enregistré avant de commencer. Best-effort : une panne
     réseau ici n'empêche pas de s'entraîner, la bannière de record manque
     juste pour cette séance. */
  const meilleursAvant = new Map();
  try {
    const passees = await sessionsOf(moi.id, { limit: 200 });
    for (const s of passees) {
      for (const ex of (Array.isArray(s.details) ? s.details : [])) {
        for (const st of (ex.s || [])) {
          if (!st.r || !st.w) continue;
          const cur = meilleursAvant.get(ex.n) || { poids: 0, repsAuPoidsMax: 0, rm: 0 };
          if (st.w > cur.poids) { cur.poids = st.w; cur.repsAuPoidsMax = st.r; }
          else if (Math.abs(st.w - cur.poids) < 0.001 && st.r > cur.repsAuPoidsMax) cur.repsAuPoidsMax = st.r;
          const rm = estime1RM(st.w, st.r);
          if (rm > cur.rm) cur.rm = rm;
          meilleursAvant.set(ex.n, cur);
        }
      }
    }
  } catch { /* pas grave : pas de bannière de record cette fois */ }

  let exIndex = 0;
  let warmup = true;      // écran ÉCHAUFFEMENT tant qu'aucune série n'a démarré sur cet exercice
  let termine = false;
  let enregistrement = false;
  let poidsVal = 0, repsVal = 0;   // valeurs des cellules Poids/Reps — pavé numérique, pas d'<input>

  const totalEstimeSec = dureeSeance(modele.exercises);
  const engine = new Engine((snap) => majCadran(snap));

  const el = h(`
    <section class="page run">
      <div class="run-tete">
        <div class="run-tete-gauche">
          <span class="run-tete-label">SÉANCE</span>
          <span class="run-chrono-global" data-chrono-global>0:00</span>
        </div>
        <h1 class="run-titre" data-titre></h1>
        <div class="run-tete-droite">
          <div class="run-tete-icones">
            <a href="#/coach"><img class="run-avatar" src="../assets/img/moti_avatar.jpg" alt="Moti, ton coach IA"></a>
            <button class="run-icone" data-pause type="button" hidden aria-label="Pause">❚❚</button>
            <button class="run-icone" data-quitter type="button" aria-label="Fermer">✕</button>
          </div>
          <span class="run-reste" data-reste></span>
        </div>
      </div>
      <p class="run-sousligne" data-sousligne></p>
      <div data-corps></div>
    </section>`);

  const corps = el.querySelector('[data-corps]');
  const titreEl = el.querySelector('[data-titre]');
  const sousligneEl = el.querySelector('[data-sousligne]');
  const chronoGlobal = el.querySelector('[data-chrono-global]');
  const resteEl = el.querySelector('[data-reste]');
  const pauseBtn = el.querySelector('[data-pause]');

  /* Chrono global de séance — tourne du "Démarrer" au "Terminer", même hors
     de tout exercice précis (RunWorkout.kt : globalMs). */
  function ticGlobal() {
    if (termine) return;
    const ecoule = Math.floor((Date.now() - session.startedAt) / 1000);
    chronoGlobal.textContent = fmtClock(ecoule);
    resteEl.textContent = `reste ~${fmtReste(Math.max(0, totalEstimeSec - ecoule))}`;
  }
  ticGlobal();
  const tickGlobal = setInterval(() => { if (termine) clearInterval(tickGlobal); else ticGlobal(); }, 1000);

  el.querySelector('[data-quitter]').onclick = () => ouvrirFin();
  pauseBtn.onclick = () => engine.minuteurTogglePause();

  function majCadran(snap) {
    const cadran = corps.querySelector('[data-cadran]');
    if (!cadran) return;
    const label = cadran.querySelector('[data-label]');
    const valeur = cadran.querySelector('[data-value]');
    const enTension = engine.tensionActive || (engine.mode === 'CHRONO' && engine.chronoStart != null);
    const etat = enTension ? 'serie' : (snap.phase === 'COUNTDOWN' ? 'place' : 'recup');
    cadran.className = `run-cadran run-cad-${etat}`;
    label.hidden = false;
    label.textContent = etat === 'serie' ? 'SÉRIE' : etat === 'place' ? 'MISE EN PLACE' : 'RÉCUPÉRATION';
    valeur.textContent = snap.value;

    if (snap.mode === 'MINUTEUR' && snap.phase !== 'DONE') {
      pauseBtn.hidden = false;
      pauseBtn.textContent = snap.phase === 'PAUSED' ? '▶' : '❚❚';
    } else {
      pauseBtn.hidden = true;
    }

    /* MINUTEUR : la fin du décompte démarre la tension toute seule (moteur) —
       on fait juste suivre l'UI sans action de l'utilisateur. */
    if (snap.mode === 'MINUTEUR' && snap.phase === 'OVERFLOW') {
      corps.querySelector('[data-derniere]').hidden = true;
      prepareSaisie(session.exercises[exIndex]);
    }
  }

  function afficherSaisie(visible) {
    const zone = corps.querySelector('[data-saisie]');
    if (zone) zone.hidden = !visible;
  }

  /** Dernières séries connues pour cet exercice (dernière session l'ayant contenu). */
  function dernieresSeries(nom) {
    const historique = modele.history || [];
    for (let i = historique.length - 1; i >= 0; i--) {
      const ex = (historique[i].exercises || []).find(e => e.name === nom && e.sets?.length);
      if (ex) return ex.sets;
    }
    return null;
  }

  /** Reflète poidsVal/repsVal dans les cellules — pas d'<input>, la valeur
   *  vit en mémoire et se pose via le pavé numérique (ouvrirPave). */
  function majCellules() {
    const pv = corps.querySelector('[data-poids-val]');
    const rv = corps.querySelector('[data-reps-val]');
    if (pv) pv.textContent = poidsVal ? trimNum(poidsVal) : '0';
    if (rv) rv.textContent = repsVal || '0';
  }

  /** Pré-remplit poids/reps avec la suggestion autorégulée par RIR (LoadCoach,
   *  Coaching.kt) — « comme la dernière fois » quand il n'y a rien de plus à
   *  dire, une charge ajustée sinon. */
  function prepareSaisie(ex) {
    const sets = dernieresSeries(ex.name);
    const dernier = sets ? sets[sets.length - 1] : null;
    const suggestion = dernier ? suggestionCharge(ex.name, dernier) : null;
    const poidsRef = corps.querySelector('[data-poids-ref]');
    const repsRef = corps.querySelector('[data-reps-ref]');
    if (dernier) {
      if (!poidsVal) poidsVal = (suggestion?.poids ?? dernier.weight) || 0;
      if (!repsVal) repsVal = dernier.reps || ex.targetReps || 0;
      poidsRef.textContent = kg(dernier.weight);
      repsRef.textContent = `${dernier.reps} reps`;
    } else {
      if (!repsVal && ex.targetReps) repsVal = ex.targetReps;
      poidsRef.textContent = ''; repsRef.textContent = '';
    }
    majCellules();
    afficherSaisie(true);
  }

  function dessinerDerniereFois(ex) {
    const zone = corps.querySelector('[data-derniere]');
    const sets = warmup ? dernieresSeries(ex.name) : null;
    if (!sets || !sets.length) { zone.hidden = true; return; }
    zone.hidden = false;
    const liste = zone.querySelector('[data-derniere-liste]');
    liste.replaceChildren();
    sets.forEach((s, i) => liste.appendChild(h(
      `<li>${i + 1}. ${esc(kg(s.weight))} × ${s.reps}${s.rir >= 0 ? ' · RIR ' + s.rir : ''}</li>`)));
    const dernier = sets[sets.length - 1];
    const suggestion = suggestionCharge(ex.name, dernier);
    /* N'affiche la ligne conseillée que si elle dit plus qu'une évidence —
       même seuil que LastTimeRecap (TrainingScreens.kt). */
    zone.querySelector('[data-conseil]').textContent = suggestion && suggestion.raison !== 'comme la dernière fois'
      ? `→ ${esc(kg(suggestion.poids))} conseillés : ${suggestion.raison}`
      : `→ ${esc(kg(dernier.weight))} conseillés · comme la dernière fois`;
  }

  function dessinerExercice() {
    const ex = session.exercises[exIndex];
    warmup = ex.sets.length === 0;
    poidsVal = 0; repsVal = 0;

    titreEl.textContent = ex.name;
    pauseBtn.hidden = true;

    corps.replaceChildren(h(`
      <div>
        <div class="run-derniere" data-derniere hidden>
          <p class="run-derniere-label">LA DERNIÈRE FOIS</p>
          <ol class="run-derniere-liste" data-derniere-liste></ol>
          <p class="run-conseil" data-conseil></p>
        </div>

        <div class="run-cadran run-cad-warmup" data-cadran>
          <span class="run-cadran-label" data-label hidden>ÉCHAUFFEMENT</span>
          <span class="run-cadran-value" data-value>ÉCHAUFFEMENT</span>
        </div>

        <p class="run-pr-banniere" data-pr hidden></p>

        <div class="run-controles" data-controles></div>

        <div class="run-saisie" data-saisie hidden>
          <div class="run-cellules">
            <button type="button" class="run-cellule" data-poids>
              <span class="run-cellule-label">Poids</span>
              <span class="run-cellule-valeur" data-poids-val>0</span>
              <span class="run-cellule-ref" data-poids-ref></span>
            </button>
            <button type="button" class="run-cellule" data-reps>
              <span class="run-cellule-label">Reps</span>
              <span class="run-cellule-valeur" data-reps-val>0</span>
              <span class="run-cellule-ref" data-reps-ref></span>
            </button>
          </div>
          <p class="run-rir-label">RIR (facultatif, répétitions en réserve)</p>
          <div class="run-rir" data-rir>
            ${RIR.map(r => `<button type="button" class="puce" data-rir-val="${r}">${r === 5 ? '5+' : r}</button>`).join('')}
          </div>
          <button class="btn btn-lg" data-valider-serie type="button">Série faite</button>
        </div>

        <ul class="liste run-series" data-liste-series></ul>

        <div class="run-bas">
          <button class="run-fleche-ronde" data-precedent type="button" ${exIndex === 0 ? 'disabled' : ''}>‹</button>
          <button class="btn btn-lg run-suivant" data-suivant type="button">Exercice suivant ▶</button>
        </div>
      </div>`));

    dessinerSousligne();
    dessinerDerniereFois(ex);
    redessinerSeries();
    dessinerControles();

    corps.querySelector('[data-precedent]').onclick = () => {
      engine.chronoStop(); engine.minuteurStop(); engine.tabataStop();
      pauseBtn.hidden = true;
      exIndex--; dessinerExercice();
    };
    corps.querySelector('[data-suivant]').onclick = () => passerExercice();

    /* Taper le cadran = action principale (centerTap, TrainingScreens.kt) :
       valide la série en cours si la saisie est ouverte, sinon déclenche le
       bouton principal du moment (Démarrer / Relancer / Série suivante). Rien
       ne se passe pendant un décompte de récup/mise en place en cours, comme
       dans le natif. */
    corps.querySelector('[data-cadran]').onclick = () => {
      const saisie = corps.querySelector('[data-saisie]');
      if (saisie && !saisie.hidden) { corps.querySelector('[data-valider-serie]')?.click(); return; }
      corps.querySelector('[data-controles] button')?.click();
    };

    /* Pavé numérique dédié (NumPadDialog) au lieu du clavier système : les
       cellules sont des boutons, la valeur vit dans poidsVal/repsVal. */
    corps.querySelector('[data-poids]').onclick = () => {
      ouvrirPave({
        kind: 'poids',
        onValider: (v) => {
          if (!v) return;
          const n = parseFloat(v.replace(',', '.'));
          if (!Number.isNaN(n)) { poidsVal = n; majCellules(); }
        }
      });
    };
    corps.querySelector('[data-reps]').onclick = () => {
      ouvrirPave({
        kind: 'reps',
        onValider: (v) => {
          if (!v) return;
          const n = parseInt(v, 10);
          if (Number.isInteger(n) && n > 0) { repsVal = n; majCellules(); }
        }
      });
    };

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
      const poids = poidsVal || 0;
      const reps = repsVal || 0;
      if (!reps) return toast('Renseigne le nombre de répétitions.');

      let tensionMs;
      if (engine.mode === 'MINUTEUR') { tensionMs = engine.endTension(); engine.minuteurStop(); }
      else { tensionMs = engine.chronoStart ? Date.now() - engine.chronoStart : 0; engine.chronoStop(); }

      ex.sets.push({ weight: poids, reps, tensionMs, rir: rirChoisi });
      afficherSaisie(false);
      redessinerSeries();
      dessinerSousligne();

      /* Bannière de record (PrBanner) : comparée aux séances passées, jamais
         à cette même séance en cours (meilleursAvant est figé au lancement). */
      const msgRecord = messageRecord(ex.name, poids, reps, meilleursAvant);
      const banniere = corps.querySelector('[data-pr]');
      banniere.hidden = !msgRecord;
      banniere.textContent = msgRecord ? `★  ${msgRecord}` : '';

      /* Enchaîne directement sur la récupération, comme centerTap→startRecup
         (natif) : après « Série faite », pas de bouton à chercher pour
         relancer le décompte — il démarre tout seul, et la tension suivante
         s'enclenche d'elle-même à la fin (OVERFLOW, voir majCadran). */
      const complet = ex.sets.length >= ex.plannedSets;
      if (!complet && ex.mode === 'MINUTEUR') {
        engine.mode = 'MINUTEUR';
        engine.minuteurStart(ex.recupSec);
      }
      dessinerControles();
    };
  }

  /** Sous-ligne « Exo X/Y · série X/Y · cible Xreps · r X:XX » — RunWorkout.kt. */
  function dessinerSousligne() {
    const ex = session.exercises[exIndex];
    const numSerie = Math.min(ex.sets.length + (warmup ? 0 : 1), ex.mode === 'TABATA' ? 1 : ex.plannedSets);
    const bits = [
      `Exo ${exIndex + 1}/${session.exercises.length}`,
      `série ${numSerie || 1}/${ex.mode === 'TABATA' ? 1 : ex.plannedSets}`
    ];
    if (ex.targetReps) bits.push(`cible ${ex.targetReps} reps`);
    if (ex.mode === 'MINUTEUR') bits.push(`r ${fmtClock(ex.recupSec)}`);
    sousligneEl.textContent = bits.join(' · ');
  }

  function redessinerSeries() {
    const ex = session.exercises[exIndex];
    const ul = corps.querySelector('[data-liste-series]');
    ul.replaceChildren();
    ex.sets.forEach((s, i) => ul.appendChild(ligneSerieGlissable(s, i)));
  }

  /** Glissement pour corriger une série déjà faite (au lieu du pavé numérique
   *  natif directement branché sur la case touchée) : glisser la ligne vers
   *  la gauche révèle « Modifier », qui rouvre le pavé (poids puis reps) sur
   *  CETTE série précise. La série reste un objet en mémoire (session.
   *  exercises[exIndex].sets[i]) : rien à sauvegarder tant que la séance
   *  n'est pas terminée, la correction part avec le reste à ce moment-là. */
  function ligneSerieGlissable(s, i) {
    const LARGEUR = 92; // px, largeur de la zone « Modifier » révélée
    const li = h(`
      <li class="run-serie-rangee">
        <div class="run-serie-action"><button type="button">Modifier</button></div>
        <div class="ligne run-serie-faite">
          Série ${i + 1} — ${esc(kg(s.weight))} × ${s.reps}
          ${s.rir >= 0 ? `<span class="etiquette">${esc(libelleRir(s.rir))}</span>` : ''}
        </div>
      </li>`);
    const contenu = li.querySelector('.run-serie-faite');
    const boutonModifier = li.querySelector('.run-serie-action button');

    let depart = null, x = 0, ouvert = false;
    const poser = (val) => { x = val; contenu.style.transform = x ? `translateX(${x}px)` : ''; };

    contenu.addEventListener('pointerdown', (e) => {
      depart = e.clientX;
      contenu.style.transition = 'none';
      contenu.setPointerCapture(e.pointerId);
    });
    contenu.addEventListener('pointermove', (e) => {
      if (depart === null) return;
      const base = ouvert ? -LARGEUR : 0;
      poser(Math.min(0, Math.max(-LARGEUR, base + (e.clientX - depart))));
    });
    const relacher = () => {
      if (depart === null) return;
      depart = null;
      contenu.style.transition = '';
      ouvert = x < -LARGEUR / 2;
      poser(ouvert ? -LARGEUR : 0);
    };
    contenu.addEventListener('pointerup', relacher);
    contenu.addEventListener('pointercancel', relacher);
    // Un appui alors que « Modifier » est révélé referme la ligne au lieu de
    // rouvrir le pavé par accident.
    contenu.addEventListener('click', (e) => {
      if (ouvert) { e.preventDefault(); ouvert = false; poser(0); }
    });

    boutonModifier.onclick = () => {
      ouvert = false; poser(0);
      ouvrirPave({
        kind: 'poids',
        onValider: (v) => {
          if (v) { const n = parseFloat(v.replace(',', '.')); if (!Number.isNaN(n)) s.weight = n; }
          ouvrirPave({
            kind: 'reps',
            onValider: (v2) => {
              if (v2) { const n2 = parseInt(v2, 10); if (Number.isInteger(n2) && n2 > 0) s.reps = n2; }
              redessinerSeries();
            }
          });
        }
      });
    };

    return li;
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
        corps.querySelector('[data-derniere]').hidden = true;
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
        corps.querySelector('[data-derniere]').hidden = true;
        if (ex.mode === 'MINUTEUR') {
          engine.mode = 'MINUTEUR';
          engine.minuteurStart(SETUP_SEC);
        } else {
          engine.mode = 'CHRONO';
          engine.chronoReset();
          prepareSaisie(ex);
        }
        warmup = false;
        dessinerSousligne();
        zone.replaceChildren();
      }, 'btn-lg'));
    } else if (ex.mode === 'MINUTEUR') {
      /* Pause/Reprendre : icône dans l'en-tête, gérée par majCadran. */
    } else {
      zone.appendChild(bouton('Série suivante', () => {
        engine.mode = 'CHRONO';
        engine.chronoReset();
        prepareSaisie(ex);
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
    pauseBtn.hidden = true;
    if (exIndex < session.exercises.length - 1) { exIndex++; dessinerExercice(); }
    else ouvrirFin(true);
  }

  /** Croix de l'en-tête : dialogue unique terminer/quitter (EndSessionDialog, RunWorkout.kt). */
  function ouvrirFin(depuisDernierExo = false) {
    if (termine) return;
    const fait = session.exercises.some(e => e.sets.length);
    if (!fait) {
      termine = true;
      arreterDirect(moi.id).catch(() => {});
      location.hash = '#/seances';
      return;
    }

    const nbSeries = session.exercises.reduce((t, e) => t + e.sets.length, 0);
    const modale = h(`
      <div class="modale" role="dialog" aria-label="Terminer la séance">
        <div class="modale-boite">
          <div class="modale-tete"><h2>Terminer la séance ?</h2></div>
          <p class="etat-mono">${nbSeries} série${nbSeries > 1 ? 's' : ''} enregistrée${nbSeries > 1 ? 's' : ''} jusqu'ici.</p>
          <div class="run-fin-actions">
            <button class="btn btn-lg" data-avec-bilan type="button">Terminer avec bilan</button>
            <button class="btn btn-ghost" data-sans-enregistrer type="button">Quitter sans enregistrer</button>
            <button class="lien-inline" data-annuler type="button">Annuler</button>
          </div>
        </div>
      </div>`);
    modale.querySelector('[data-avec-bilan]').onclick = () => { modale.remove(); ouvrirRessenti(); };
    modale.querySelector('[data-sans-enregistrer]').onclick = () => {
      if (confirm('Quitter sans enregistrer cette séance ?')) {
        termine = true;
        arreterDirect(moi.id).catch(() => {});
        location.hash = '#/seances';
      }
    };
    modale.querySelector('[data-annuler]').onclick = () => modale.remove();
    document.body.appendChild(modale);
  }

  /** Ressenti de fin : 5 émojis + note — EndSessionDialog/mood/note (RunWorkout.kt).
   *  Nommée à part de bilan.js::ouvrirBilan (le VRAI écran de résultats, importé plus
   *  haut) pour ne plus le masquer par une déclaration locale du même nom — c'était
   *  le cas avant : finaliser() appelait sans le savoir CETTE fonction-ci au lieu de
   *  l'écran de bilan importé, à cause du masquage de portée JS. */
  function ouvrirRessenti() {
    if (termine) return;
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
    arreterDirect(moi.id).catch(() => {});

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

    /* Le bilan (charge totale, carte musculaire, détail modifiable par
       exercice) est partagé avec l'historique par séance — voir bilan.js. */
    await ouvrirBilan({ moi, modele, session, onFermer: () => { location.hash = '#/seances'; } });
  }

  dessinerExercice();
  render(el);

  /* Suivi en direct (LiveSessions, Social.kt) : annonce le début UNE SEULE
     fois, puis publie l'avancement toutes les ~15 s tant que cet écran reste
     affiché — un sondage de présence, pas un fil en temps réel. Best-effort
     partout : une panne réseau ici ne doit jamais interrompre la séance. */
  demarrerDirect(moi.id, modele.name, modele.category).catch(() => {});
  const battementId = setInterval(() => {
    if (termine || !document.body.contains(el)) {
      clearInterval(battementId);
      // Écran quitté sans passer par finaliser()/« Quitter sans
      // enregistrer » (changement de route en cours de route) : la ligne
      // doit quand même disparaître, pas traîner jusqu'à sa péremption.
      if (!termine) arreterDirect(moi.id).catch(() => {});
      return;
    }
    battementDirect(moi.id, session, exIndex).catch(() => {});
  }, 15000);
}

/** trimNum (TrainingScreens.kt) : nombre sans « kg », décimale seulement si besoin. */
function trimNum(v) {
  return Math.abs(v % 1) < 0.05 ? String(Math.round(v)) : v.toFixed(1).replace('.', ',');
}

/** recordMessage (TrainingScreens.kt) : priorité poids+1RM > poids > 1RM > reps. */
function messageRecord(nom, poids, reps, meilleursAvant) {
  const avant = meilleursAvant.get(nom);
  if (!avant) return '';
  const battPoids = poids > avant.poids + 0.001;
  const rm = estime1RM(poids, reps);
  const battRM = rm > avant.rm + 0.001;
  if (battPoids && battRM) return `Record ! ${trimNum(poids)} kg, ta plus lourde sur cet exercice.`;
  if (battPoids) return `Record de charge : ${trimNum(poids)} kg.`;
  if (battRM) return `Record : meilleur 1RM estimé sur cet exercice.`;
  if (Math.abs(poids - avant.poids) < 0.001 && reps > avant.repsAuPoidsMax) return `Record : ${reps} répétitions à ${trimNum(poids)} kg.`;
  return '';
}

/** suggestionCharge (LoadCoach.suggestedWeight, Coaching.kt) : autorégulation
 *  par RIR à partir de la dernière fois — pas d'estimation de départ sans
 *  historique (StrengthDefaults dépend de réglages locaux natifs absents du
 *  web : poids de corps, niveau). */
function suggestionCharge(nomExercice, dernier) {
  if (!dernier) return null;
  const step = devineMateriel(nomExercice) === 'BARRE' ? 2.5 : 1.0;
  const round = v => Math.round(v / step) * step;
  const rir = dernier.rir ?? -1;
  if (rir < 0) return { poids: dernier.weight, raison: 'comme la dernière fois' };
  if (rir >= 4) return { poids: round(dernier.weight * 1.075), raison: `RIR ${rir} la dernière fois : encore facile, charge relevée` };
  if (rir >= 2) return { poids: round(dernier.weight * 1.02), raison: `RIR ${rir} la dernière fois : léger cran si possible` };
  return { poids: dernier.weight, raison: `RIR ${rir} la dernière fois : proche de l'échec, même charge` };
}

function fmtClock(totalSec) {
  const m = Math.floor(totalSec / 60), s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Même formule que fmtEstimate (entrainement.js / TrainingScreens.kt), pour le « reste ~Xh ». */
function fmtReste(sec) {
  const totalMin = Math.round(sec / 60);
  const hh = Math.floor(totalMin / 60), mm = totalMin % 60;
  return hh > 0 ? `${hh} h ${String(mm).padStart(2, '0')}` : `${mm} min`;
}
