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

import { GROUPES, CATEGORIES_CATALOGUE, devineMateriel } from './catalog.js';
import { nouvelleSeance, nouvelExercice } from './model.js';

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

/** groupsOfCategory : groupes musculaires d'une catégorie ; repli sur tout le
 *  catalogue pour une catégorie personnalisée que le catalogue ne connaît pas. */
function groupesDeCategorie(nomCat) {
  const cible = norm(nomCat);
  const cat = CATEGORIES_CATALOGUE.find(c => norm(c.nom) === cible);
  if (!cat || cat.tous) return [...GROUPES];
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
        lower: estBasDuCorps(g.nom), minor: estPetitGroupe(g.nom)
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
  choisis.forEach(s => {
    const t = palier(sc, s);
    const ex = nouvelExercice(s.name);
    ex.mode = 'MINUTEUR';
    ex.plannedSets = t.sets;
    ex.targetReps = t.repLow;
    ex.recupSec = t.recupSec;
    w.exercises.push(ex);
  });
  return w;
}
