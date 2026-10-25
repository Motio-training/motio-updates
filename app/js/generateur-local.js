/* ==========================================================================
   Générateur de séance SANS IA — portage de `ProgramGenerator.generateSingle`
   (ProgramGenerator.kt) et de tout ce dont il dépend.

   Aucune intelligence artificielle ici : des règles de musculation classiques
   appliquées au catalogue (catalog.js). C'est ce qui répond au bouton
   « Générer une séance » quand l'abonnement IA manque — donc hors ligne et
   sans coût — et c'est aussi le repli quand un abonné laisse la description
   vide. La version assistée vit dans programme-ia.js (`genererSeanceIA`).

   Fidélité au Kotlin : mêmes paliers par objectif, même nombre d'exercices,
   même répartition entre groupes musculaires, même ordre de préférence dans
   le catalogue. Toute divergence donnerait des séances différentes des deux
   côtés pour les mêmes réglages, ce qui est précisément ce qu'on corrige.
   ========================================================================== */

import {
  GROUPES, CATEGORIES_CATALOGUE, devineMateriel, MAINTIEN_DEFAUT_SEC
} from './catalog.js';
import { nouvelleSeance, nouvelExercice, GOALS } from './model.js';
import { toursPour } from './coach-guide.js';
import { WEEK_DAYS, premierJourApres, plusJours } from './programme-ia.js';

function norm(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/* ---------- Réglages par objectif (scheme) ----------
   Trois paliers par séance : le mouvement principal, les secondaires et les
   accessoires d'isolation n'ont ni le même nombre de répétitions, ni la même
   récupération. Les traiter tous pareil donnait des séances irréalistes — un
   développé couché ET des élévations latérales à 3-5 reps en « Force ». */

const PALIERS = {
  FORCE: {
    main: { sets: 5, repLow: 3, repHigh: 5, recupSec: 210 },
    secondary: { sets: 3, repLow: 6, repHigh: 8, recupSec: 120 },
    accessory: { sets: 3, repLow: 10, repHigh: 12, recupSec: 75 }
  },
  MASSE: {
    main: { sets: 4, repLow: 6, repHigh: 8, recupSec: 120 },
    secondary: { sets: 3, repLow: 8, repHigh: 12, recupSec: 90 },
    accessory: { sets: 3, repLow: 12, repHigh: 15, recupSec: 60 }
  },
  SECHE: {
    main: { sets: 3, repLow: 10, repHigh: 12, recupSec: 60 },
    secondary: { sets: 3, repLow: 12, repHigh: 15, recupSec: 45 },
    accessory: { sets: 2, repLow: 15, repHigh: 20, recupSec: 30 }
  },
  /* FORME et PERSONNALISE partagent le gabarit générique. */
  FORME: {
    main: { sets: 3, repLow: 8, repHigh: 10, recupSec: 90 },
    secondary: { sets: 3, repLow: 10, repHigh: 12, recupSec: 75 },
    accessory: { sets: 2, repLow: 12, repHigh: 15, recupSec: 60 }
  }
};
PALIERS.PERSONNALISE = PALIERS.FORME;

/** tierOf : le palier d'un exercice de la séance. */
function palier(sc, slot) {
  if (slot.main) return sc.main;
  if (slot.minor) return sc.accessory;
  return sc.secondary;
}

/** slotsFor : nombre d'exercices. Volontairement réduit pour la Force — un
 *  vrai bloc de force cible peu de mouvements travaillés lourd. */
function nombreDExercices(goal, level) {
  const base = { FORCE: 3, MASSE: 5, SECHE: 6, FORME: 4, PERSONNALISE: 4 }[goal];
  const adj = { DEBUTANT: -1, INTERMEDIAIRE: 0, AVANCE: 1 }[level];
  return Math.min(7, Math.max(3, (base === undefined ? 4 : base) + (adj === undefined ? 0 : adj)));
}

/** isMinor : petits groupes, moitié moins de volume qu'un gros groupe. */
function estPetitGroupe(nom) {
  const n = norm(nom);
  return ['biceps', 'triceps', 'mollet', 'trapez', 'abdo', 'lombaire', 'avant-bras']
    .some(k => n.includes(k));
}

/** isLower : bas du corps. Sert à la progression de charge d'un programme —
 *  conservé pour rester aligné sur le Kotlin, une séance isolée n'en fait rien. */
function estBasDuCorps(nom) {
  const n = norm(nom);
  return ['quadri', 'ischio', 'fessier', 'mollet', 'cuisse', 'jambe'].some(k => n.includes(k));
}

/**
 * groupsOfCategory : groupes musculaires d'une catégorie ; repli sur tout le
 * catalogue pour une catégorie personnalisée que le catalogue ne connaît pas.
 *
 * Une catégorie « tous les groupes » (Full body) EXCLUT les groupes de
 * mobilité, d'étirement et de yoga : full body veut dire tout le corps, pas
 * tout le catalogue. Sans ce filtre, l'arrivée de ces cinq groupes faisait
 * apparaître « Posture du pigeon » au milieu d'une séance de force, parce que
 * la répartition distribue les exercices entre TOUS les groupes. Une
 * catégorie qui les désigne explicitement — Mobilité, Prévention, Yoga — les
 * garde évidemment, c'est tout son objet.
 */
function groupesDeCategorie(nomCat) {
  const cible = norm(nomCat);
  const cat = CATEGORIES_CATALOGUE.find(c => norm(c.nom) === cible);
  const muscu = GROUPES.filter(g => !g.sante);
  if (!cat || cat.tous) return muscu.length ? muscu : [...GROUPES];
  const gs = GROUPES.filter(g => cat.groupes.includes(g.id));
  return gs.length ? gs : [...GROUPES];
}

/** isFullBody */
function estFullBody(nomCat) {
  const cible = norm(nomCat);
  const cat = CATEGORIES_CATALOGUE.find(c => norm(c.nom) === cible);
  return (cat && cat.tous === true) || cible.includes('full');
}

/**
 * allocate : répartit `slots` exercices entre des groupes pondérés (méthode
 * du plus fort reste). `rotate` départage les ex æquo différemment d'une
 * variante A à une variante B.
 */
function repartir(poids, slots, rotate) {
  const n = poids.length;
  if (!n || slots <= 0) return new Array(n).fill(0);
  const somme = poids.reduce((a, b) => a + b, 0);
  if (somme <= 0) return new Array(n).fill(0);
  const brut = poids.map(p => p / somme * slots);
  const out = brut.map(x => Math.floor(x));
  let reste = slots - out.reduce((a, b) => a + b, 0);
  const ordre = [...Array(n).keys()].sort((a, b) => {
    const fa = brut[a] - Math.floor(brut[a]);
    const fb = brut[b] - Math.floor(brut[b]);
    if (fb !== fa) return fb - fa;
    return ((a + rotate * 3) % n) - ((b + rotate * 3) % n);
  });
  let i = 0;
  while (reste > 0) { out[ordre[i % n]]++; reste--; i++; }
  return out;
}

/* Séance « tout le corps » : l'ordre des groupes est imposé pour garantir
   qu'on trouve toujours des jambes, une poussée et un tirage, même quand la
   séance ne compte que trois exercices. */
const FB_ORDRE_A = ['quadri', 'pector', 'dors', 'epaul', 'ischio', 'triceps',
  'abdo', 'biceps', 'mollet', 'fessier', 'trapez'];
const FB_ORDRE_B = ['ischio', 'pector', 'dors', 'epaul', 'quadri', 'biceps',
  'fessier', 'abdo', 'triceps', 'mollet', 'trapez'];

function planFullBody(groupes, slots, variante) {
  const ordre = variante % 2 === 0 ? FB_ORDRE_A : FB_ORDRE_B;
  const classes = [];
  ordre.forEach(cle => {
    const g = groupes.find(x => norm(x.nom).includes(cle) && !classes.includes(x));
    if (g) classes.push(g);
  });
  groupes.forEach(g => { if (!classes.includes(g)) classes.push(g); });
  if (!classes.length) return [];
  const counts = new Array(classes.length).fill(0);
  for (let i = 0; i < slots; i++) counts[i % classes.length]++;
  return classes.map((g, i) => [g, counts[i]]).filter(paire => paire[1] > 0);
}

/** Séance ciblée (Push, Pull, Legs) : répartition au prorata de l'importance. */
function planPondere(groupes, slots, variante) {
  const poids = groupes.map(g => (estPetitGroupe(g.nom) ? 0.4 : 1.0));
  const counts = repartir(poids, slots, variante);
  return groupes.map((g, i) => [g, counts[i]]).filter(paire => paire[1] > 0);
}

/** clash : deux exercices se ressemblent trop pour cohabiter dans une même
 *  séance quand le nom de l'un contient celui de l'autre (« Squat » et
 *  « Front Squat », « Dips » et « Dips buste penché »). */
function seRessemblent(a, b) {
  const x = norm(a), y = norm(b);
  return x === y || x.includes(y) || y.includes(x);
}

/** buildSlots */
function construireSlots(bp, slots, exclus, gears) {
  const groupes = groupesDeCategorie(bp.category);
  if (!groupes.length) return [];
  const fb = estFullBody(bp.category);
  const plan = fb ? planFullBody(groupes, slots, bp.variant)
    : planPondere(groupes, slots, bp.variant);

  const utilises = [];
  const out = [];
  // Au plus deux exercices « lourds » par séance : les suivants sont des
  // accessoires, moins de séries et récupération plus courte.
  let mains = 0;

  plan.forEach((paire, idx) => {
    const g = paire[0], want = paire[1];
    // Un exercice dont l'équipement n'est pas disponible n'est jamais
    // proposé. Si le filtre vide un groupe, on le laisse tomber plutôt que
    // de proposer l'infaisable.
    const dispo = g.exercices.filter(nom =>
      nom && !exclus.includes(nom) && (!gears.length || gears.includes(devineMateriel(nom))));
    if (!dispo.length) return;

    // Le catalogue va du plus lourd au plus analytique : le PREMIER exercice
    // retenu est toujours pris en tête de liste (le mouvement de base de la
    // séance), seuls les accessoires qui suivent sont décalés — sans quoi une
    // séance Push B se retrouverait sans le moindre développé.
    const ordre = [];
    ordre.push(fb && idx === 0 ? 0 : bp.variant % dispo.length);
    const accStart = 2 + (fb ? 0 : bp.variant * want);
    for (let i = 0; i < dispo.length; i++) ordre.push((accStart + i) % dispo.length);
    for (let i = 0; i < dispo.length; i++) ordre.push(i);   // filet : jamais bloqué

    let pris = 0;
    for (const i of ordre) {
      if (pris >= want) break;
      const nom = dispo[i];
      if (utilises.some(u => seRessemblent(u, nom))) continue;
      utilises.push(nom);
      const estMain = pris === 0 && !estPetitGroupe(g.nom) && mains < 2;
      if (estMain) mains++;
      out.push({
        name: nom, main: estMain,
        lower: estBasDuCorps(g.nom), minor: estPetitGroupe(g.nom),
        // Position tenue plutôt que comptée : « 3 × 8 » n'a aucun sens sur un
        // étirement des ischio-jambiers (voir MAINTIEN, model.js).
        holdSec: g.sante ? MAINTIEN_DEFAUT_SEC : 0
      });
      pris++;
    }
  });

  // Une séance dont un seul gros groupe est travaillé (Pull, par exemple)
  // mérite quand même un second exercice lourd.
  if (mains < 2) {
    const i = out.findIndex(s => !s.main && !s.minor);
    if (i >= 0) out[i].main = true;
  }
  return out;
}

/** exerciseFor (ProgramGenerator.kt) : l'exercice du carnet correspondant à
 *  un emplacement retenu. Mobilité, étirement, yoga : en MAINTIEN. */
function exercicePour(s, t) {
  const ex = nouvelExercice(s.name);
  if (s.holdSec > 0) {
    // Un exercice unilatéral réclame un nombre PAIR de tours : un par côté.
    // Un étirement du psoas fait vingt secondes à droite et rien à gauche,
    // c'est un étirement raté.
    const tours = toursPour(s.name, t.sets);
    ex.mode = 'MAINTIEN';
    ex.plannedSets = tours;
    ex.targetReps = 0;
    ex.recupSec = 20;
    ex.workSec = s.holdSec;
    ex.restSec = 20;
    ex.tabataSeries = tours;
  } else {
    ex.mode = 'MINUTEUR';
    ex.plannedSets = t.sets;
    ex.targetReps = t.repLow;
    ex.recupSec = t.recupSec;
  }
  return ex;
}

/**
 * generateSingle (ProgramGenerator.kt) : UNE séance, sans programme ni
 * planning daté. PAS enregistrée — comme la création manuelle, elle n'existe
 * qu'en mémoire tant que l'écran de modification n'a pas été validé.
 */
export function genererSeanceLocale({ goal, level, category, gears = [], excluded = [] }) {
  const sc = PALIERS[goal] || PALIERS.FORME;
  const slots = nombreDExercices(goal, level);
  const choisis = construireSlots({ title: category, category, variant: 0 }, slots, excluded, gears);
  if (!choisis.length) throw new Error('Aucun exercice ne correspond au matériel choisi.');

  const w = nouvelleSeance(category, category);
  choisis.forEach(s => w.exercises.push(exercicePour(s, palier(sc, s))));
  return w;
}

/* ---------- Programme complet (buildDraft, ProgramGenerator.kt) ---------- */

/** split : le découpage de la semaine selon le nombre de séances. */
const DECOUPAGES = {
  2: [['Full body A', 'Full body', 0], ['Full body B', 'Full body', 1]],
  3: [['Push', 'Push', 0], ['Pull', 'Pull', 0], ['Legs', 'Legs', 0]],
  4: [['Push', 'Push', 0], ['Pull', 'Pull', 0], ['Legs', 'Legs', 0], ['Full body', 'Full body', 1]],
  5: [['Push A', 'Push', 0], ['Pull A', 'Pull', 0], ['Legs', 'Legs', 0], ['Push B', 'Push', 1], ['Pull B', 'Pull', 1]],
  6: [['Push A', 'Push', 0], ['Pull A', 'Pull', 0], ['Legs A', 'Legs', 0],
      ['Push B', 'Push', 1], ['Pull B', 'Pull', 1], ['Legs B', 'Legs', 1]]
};
function decoupage(n) {
  return (DECOUPAGES[n] || DECOUPAGES[6]).map(([title, category, variant]) => ({ title, category, variant }));
}

/** repsForWeek : double progression, une répétition de plus par semaine à
 *  l'intérieur de la fourchette du palier, puis retour en bas de fourchette. */
function repsSemaine(t, semaine) {
  const cycle = Math.max(1, t.repHigh - t.repLow + 1);
  return t.repLow + ((semaine - 1) % cycle);
}

/** isDeloadWeek : une semaine sur cinq, sauf débutant ou programme court. */
function estDecharge(level, semaine, total) {
  return level !== 'DEBUTANT' && total >= 6 && semaine % 5 === 0;
}

/**
 * buildDraft (ProgramGenerator.kt) : un programme COMPLET sans IA — modèles
 * de séance et planning daté semaine par semaine, avec progression et
 * décharges. Rien n'est enregistré : il part dans l'écran d'aperçu, où tout
 * reste modifiable (programme-edition.js).
 */
export function construireProgrammeLocal({ goal, level, daysPerWeek, weeks, weekdays, minuteOfDay, startMs, gears = [] }) {
  const sc = PALIERS[goal] || PALIERS.FORME;
  const slots = nombreDExercices(goal, level);
  const bps = decoupage(daysPerWeek);
  const now = Date.now();
  const libelle = (GOALS.find(g => g.id === goal) || {}).label || 'Programme';
  const program = {
    id: now, name: `${libelle} — ${weeks} semaines`, goal, level, weeks, daysPerWeek,
    createdAt: now, workoutIds: [], sessions: [], notes: ''
  };

  const workouts = [];
  const slotsParType = [];
  bps.forEach((bp, bi) => {
    const choisis = construireSlots(bp, slots, [], gears);
    slotsParType.push(choisis);
    const w = nouvelleSeance(bp.title, bp.category);
    w.id = now + bi;
    choisis.forEach(s => w.exercises.push(exercicePour(s, palier(sc, s))));
    workouts.push(w);
    program.workoutIds.push(w.id);
  });
  if (workouts.every(w => !w.exercises.length)) throw new Error('Aucun exercice ne correspond au matériel choisi.');

  const jours = [...weekdays].sort((a, b) => WEEK_DAYS.indexOf(a) - WEEK_DAYS.indexOf(b));
  let seq = 0;
  for (let semaine = 1; semaine <= weeks; semaine++) {
    const decharge = estDecharge(level, semaine, weeks);
    bps.forEach((bp, bi) => {
      const dow = jours[bi] ?? jours[jours.length - 1] ?? 1;
      const date = plusJours(premierJourApres(startMs, dow, minuteOfDay), 7 * (semaine - 1));
      const items = slotsParType[bi].map(s => {
        const t = palier(sc, s);
        return {
          name: s.name,
          sets: decharge ? Math.max(2, Math.round(t.sets * 0.6)) : t.sets,
          // Une position tenue n'a pas de répétition à annoncer : c'est sa
          // durée de maintien qui s'affiche (holdSec).
          reps: s.holdSec > 0 ? 0 : decharge ? t.repLow : repsSemaine(t, semaine),
          recupSec: s.holdSec > 0 ? 20 : t.recupSec,
          holdSec: s.holdSec,
          hint: decharge ? 'Semaine de décharge — charges allégées'
            : 'Poids conseillé pendant la séance, selon ton RIR'
        };
      });
      program.sessions.push({
        id: now + (++seq) * 1000, week: semaine, dateMs: date,
        workoutId: program.workoutIds[bi], title: bp.title, category: bp.category,
        deload: decharge, items, doneAt: 0, skipped: false, eventId: 0
      });
    });
  }
  program.sessions.sort((a, b) => a.dateMs - b.dateMs);
  return { program, workouts };
}
