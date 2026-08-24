/* ==========================================================================
   Calculs de l'écran Analyse — portage de Stats.kt (onglets Volume et
   Progression, calculateur de disques). Records/1RM restent dans profil.js
   (déjà portés) ; ce module ne couvre que ce qui manquait.

   Comme côté natif, rien n'est stocké : tout est recalculé à l'affichage
   depuis les séances déjà chargées (sessionsOf) — ça ne peut jamais devenir
   faux. Seule différence de source : le natif lit WorkoutStore.all(ctx) (tout
   le carnet local, illimité) ; le web lit les séances PARTAGÉES de l'utilisateur
   (sessionsOf, limite 200) — un écart déjà assumé ailleurs sur cet écran
   (records, « Aucun détail de séries partagé » si le partage est coupé).
   ========================================================================== */

import { estime1RM } from './model.js';
import { GROUPES } from './catalog.js';

/* ---------------------------------------------------------------- semaines */

/** weekStart (Stats.kt) : lundi 00:00 (heure locale) de la semaine contenant `ms`. */
export function weekStart(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  const shift = (d.getDay() + 6) % 7; // jours écoulés depuis lundi (dimanche=0 -> 6)
  d.setDate(d.getDate() - shift);
  return d.getTime();
}

export function plusDays(ms, jours) {
  const d = new Date(ms);
  d.setDate(d.getDate() + jours);
  return d.getTime();
}

/* ------------------------------------------------------- groupe musculaire */

let groupeParExercice = null;
/** Rattachement d'un exercice à son groupe de catalogue (GROUPES, catalog.js) :
 *  correspondance EXACTE sur le nom, comme côté natif (CatalogStore.groups) —
 *  les exercices vivent tous deux dans le même catalogue partagé, une
 *  correspondance floue n'a pas lieu d'être. Un nom présent dans plusieurs
 *  groupes (ex. « Squat ») retombe sur le DERNIER groupe qui le déclare, même
 *  ordre d'écrasement que le forEach natif. Un exercice absent du catalogue
 *  (renommé, importé) va dans « Autres » plutôt que d'être ignoré — sinon le
 *  total afficherait moins que la réalité. */
function groupeDe(nomExercice) {
  if (!groupeParExercice) {
    groupeParExercice = new Map();
    for (const g of GROUPES) {
      for (const nom of (g.exercices || [])) groupeParExercice.set(nom, g.nom);
    }
  }
  return groupeParExercice.get(nomExercice) || 'Autres';
}

/* ------------------------------------------------ volume hebdomadaire par groupe */

/**
 * Séries et tonnage par groupe musculaire, sur la semaine commençant à
 * `weekStartMs` (voir weekStart). `seances` : résultat de sessionsOf (les plus
 * récentes d'abord, peu importe ici — on filtre par date).
 */
export function volumeHebdo(seances, weekStartMs) {
  const fin = plusDays(weekStartMs, 7);
  const sets = new Map();
  const vol = new Map();
  for (const s of seances) {
    const quand = new Date(s.started_at).getTime();
    if (quand < weekStartMs || quand >= fin) continue;
    for (const ex of (Array.isArray(s.details) ? s.details : [])) {
      const faites = (ex.s || []).filter(st => st.r > 0);
      if (!faites.length) continue;
      const g = groupeDe(ex.n);
      sets.set(g, (sets.get(g) || 0) + faites.length);
      const v = faites.reduce((t, st) => t + (st.w || 0) * (st.r || 0), 0);
      vol.set(g, (vol.get(g) || 0) + v);
    }
  }
  return [...sets.keys()]
    .map(g => ({ groupe: g, sets: sets.get(g), volumeKg: vol.get(g) || 0 }))
    .sort((a, b) => b.sets - a.sets);
}

/* --------------------------------------------------- progression d'un exercice */

/** Les exercices déjà pratiqués, du plus fréquent au moins fréquent —
 *  practisedExercises (Stats.kt). */
export function exercicesPratiques(seances) {
  const compte = new Map();
  for (const s of seances) {
    for (const ex of (Array.isArray(s.details) ? s.details : [])) {
      if (ex.n && (ex.s || []).some(st => st.r > 0)) {
        compte.set(ex.n, (compte.get(ex.n) || 0) + 1);
      }
    }
  }
  return [...compte.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'));
}

/** L'historique d'un exercice, du plus ancien au plus récent — progressOf
 *  (Stats.kt). */
export function progressionDe(seances, nomExercice) {
  const out = [];
  for (const s of seances) {
    const ex = (Array.isArray(s.details) ? s.details : []).find(e => e.n === nomExercice);
    if (!ex) continue;
    const faites = (ex.s || []).filter(st => st.r > 0);
    if (!faites.length) continue;
    out.push({
      whenMs: new Date(s.started_at).getTime(),
      topWeight: Math.max(...faites.map(st => st.w || 0)),
      volume: faites.reduce((t, st) => t + (st.w || 0) * (st.r || 0), 0),
      totalReps: faites.reduce((t, st) => t + (st.r || 0), 0),
      oneRm: Math.max(...faites.map(st => estime1RM(st.w || 0, st.r || 0)))
    });
  }
  return out.sort((a, b) => a.whenMs - b.whenMs);
}

/* ------------------------------------------------------ calculateur de disques */

/** Les disques réellement disponibles — DEFAULT_PLATES (Stats.kt) : le 25 kg
 *  a été volontairement retiré (pas dans la salle où l'appli est utilisée). */
export const DISQUES_PAR_DEFAUT = [20, 15, 10, 5, 2.5, 1.25];

/** computePlates (Stats.kt) : algorithme glouton, du plus lourd au plus léger. */
export function calculerDisques(cible, barre = 20, disques = DISQUES_PAR_DEFAUT) {
  if (cible <= barre) return { barre, parCote: [], reste: 0 };
  let parCote = (cible - barre) / 2;
  const out = [];
  for (const d of [...disques].sort((a, b) => b - a)) {
    if (d <= 0) continue;
    const n = Math.floor(parCote / d + 1e-9);
    if (n > 0) { out.push({ disque: d, nb: n }); parCote -= n * d; }
  }
  const reste = parCote < 0.001 ? 0 : parCote * 2;
  return { barre, parCote: out, reste };
}

export function totalDisques(r) {
  return r.barre + 2 * r.parCote.reduce((t, pc) => t + pc.disque * pc.nb, 0);
}

/** platesLabel (Stats.kt) : « 20 + 10 + 1,25 », dans l'ordre de chargement. */
export function libelleDisques(r) {
  if (!r.parCote.length) return 'barre à vide';
  const liste = [];
  for (const pc of r.parCote) for (let i = 0; i < pc.nb; i++) liste.push(pc.disque);
  return liste.map(kgCourt).join(' + ');
}

/** warmupFor (Stats.kt) : montée en charge par paliers, barre à vide d'abord.
 *  Rien en dessous de 1,5× le poids de la barre — il n'y a rien à échauffer
 *  par paliers sur une charge aussi légère. */
export function echauffementPour(chargeTravail, poidsBarre = 20, pas = 2.5) {
  if (chargeTravail <= poidsBarre * 1.5) return [];
  const arrondi = v => Math.round(v / pas) * pas;
  const plan = [[0, 8], [40, 5], [60, 3], [80, 2]];
  const out = [];
  for (const [pct, reps] of plan) {
    const w = pct === 0 ? poidsBarre : arrondi(chargeTravail * pct / 100);
    if (w >= poidsBarre && (!out.length || w > out[out.length - 1].poids)) {
      out.push({ poids: w, reps, pourcentage: pct });
    }
  }
  return out;
}

export function tonnageEchauffement(series) {
  return series.reduce((t, s) => t + s.poids * s.reps, 0);
}

/** kgShort (Stats.kt) : « 62,5 » et non « 62.500000 » — formatage court propre
 *  au calculateur de disques (les autres écrans utilisent kg() de model.js). */
export function kgCourt(v) {
  if (Number.isInteger(v)) return String(v);
  let s = v.toFixed(2).replace('.', ',');
  s = s.replace(/0+$/, '').replace(/[,.]$/, '');
  return s;
}
