/* ==========================================================================
   Modèle de données — portage exact de WorkoutModel.kt et WorkoutStore.kt.

   Les noms de champs ci-dessous sont ceux écrits par l'application dans
   filesDir/workouts.json. Toute divergence rendrait illisible côté Android ce
   que le web écrit. Si tu modifies WorkoutModel.kt, ce fichier suit.
   ========================================================================== */

export const MODES = ['CHRONO', 'MINUTEUR', 'TABATA', 'EMOM'];

export const MODE_LABELS = {
  CHRONO: 'Chrono',
  MINUTEUR: 'Minuteur',
  TABATA: 'Tabata',
  EMOM: 'EMOM'
};

/* Constantes d'estimation — WorkoutModel.kt */
export const WARMUP_SEC = 600;     // échauffement forfaitaire de la séance
export const EX_WARMUP_SEC = 300;  // échauffement propre à chaque exercice
export const SETUP_SEC = 10;       // mise en place avant la 1re série
export const SEC_PER_REP = 3;      // durée moyenne d'une répétition

export function nouvelExercice(nom = '') {
  return {
    name: nom,
    mode: 'MINUTEUR',
    plannedSets: 4,
    targetReps: 0,
    recupSec: 90,
    workSec: 20,
    restSec: 10,
    tabataSeries: 8,
    groupId: 0,
    sets: []
  };
}

export function nouvelleSeance(nom = '', categorie = 'Push') {
  return {
    id: Date.now(),           // Workout.id — millisecondes, comme l'app
    name: nom,
    category: categorie,
    exercises: [],
    history: []
  };
}

/** Durée estimée d'un exercice, en secondes. Même calcul que Exercise.estimatedSec. */
export function dureeExercice(e) {
  const n = Math.max(1, e.plannedSets);
  const tension = n * e.targetReps * SEC_PER_REP;
  let base;
  switch (e.mode) {
    case 'MINUTEUR': base = SETUP_SEC + (n - 1) * e.recupSec + tension; break;
    case 'CHRONO': base = SETUP_SEC + tension; break;
    case 'TABATA': base = e.tabataSeries * (e.workSec + e.restSec); break;
    /* EMOM : l'intervalle EST la duree, recuperation comprise. */
    case 'EMOM': base = n * e.workSec; break;
    default: base = 0;
  }
  return EX_WARMUP_SEC + base;
}

/** Durée estimée d'une séance, en secondes. Même calcul que estimateSec. */
export function dureeSeance(exercices) {
  return WARMUP_SEC + exercices.reduce((t, e) => t + dureeExercice(e), 0);
}

/**
 * Étendue du bloc (superset / circuit) contenant l'exercice d'indice idx.
 * L'adjacence est exigée, comme dans blockRange : deux exercices de même
 * groupe séparés par un troisième ne forment pas un bloc.
 */
export function etendueBloc(liste, idx) {
  if (idx < 0 || idx >= liste.length) return [idx, idx];
  const g = liste[idx].groupId;
  if (g === 0) return [idx, idx];
  let a = idx, b = idx;
  while (a > 0 && liste[a - 1].groupId === g) a--;
  while (b < liste.length - 1 && liste[b + 1].groupId === g) b++;
  return [a, b];
}

export function prochainGroupId(liste) {
  return liste.reduce((m, e) => Math.max(m, e.groupId), 0) + 1;
}

export function libelleBloc(taille) {
  if (taille <= 1) return '';
  return taille === 2 ? 'Superset' : 'Circuit';
}

/** « 1:30 » — fmtRecup. */
export function fmtRecup(sec) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export const CATEGORIES_DEFAUT = ['Push', 'Pull', 'Legs'];

/* ---------------------------------------------------------------- objectifs */
/* ProgramModel.kt — Goal et Level */

export const GOALS = [
  { id: 'MASSE', label: 'Prise de masse', desc: 'Séries moyennes, volume élevé' },
  { id: 'FORCE', label: 'Force', desc: 'Charges lourdes, séries courtes, longue récup' },
  { id: 'SECHE', label: 'Perte de gras', desc: 'Séries longues, récupération courte' },
  { id: 'FORME', label: 'Remise en forme', desc: 'Reprise progressive, volume modéré' }
];

export const LEVELS = [
  { id: 'DEBUTANT', label: 'Débutant' },
  { id: 'INTERMEDIAIRE', label: 'Intermédiaire' },
  { id: 'AVANCE', label: 'Avancé' }
];

/* ------------------------------------------------------------------ séries */

export function volumeSerie(s) { return (s.weight || 0) * (s.reps || 0); }
export function volumeExercice(e) { return (e.sets || []).reduce((t, s) => t + volumeSerie(s), 0); }

/** rirLabel — WorkoutModel.kt */
export function libelleRir(rir) {
  if (rir < 0) return '';
  if (rir === 0) return 'RIR 0 · échec';
  if (rir >= 5) return 'RIR 5+ · facile';
  return `RIR ${rir} · RPE ${10 - rir}`;
}

export const MOOD_LABELS = {
  1: 'Épuisé', 2: 'Fatigué', 3: 'Normal', 4: 'En forme', 5: 'Excellent'
};

/** 1RM estimé, formule d'Epley — comme estimate1RM côté app. */
export function estime1RM(poids, reps) {
  if (poids <= 0 || reps <= 0) return 0;
  if (reps === 1) return poids;
  return poids * (1 + reps / 30);
}

export function kg(v) {
  if (v == null) return '—';
  return (Math.abs(v % 1) < 0.05 ? Math.round(v) : v.toFixed(1)) + ' kg';
}
