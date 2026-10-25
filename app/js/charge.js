/* ==========================================================================
   CHARGE CONSEILLÉE — portage de LoadCoach (Coaching.kt) et de
   StrengthTransfer (StrengthTransfer.kt). Les deux doivent dire la même chose.

   Tout passe par le 1RM : une charge n'a de sens que rapportée à un nombre de
   répétitions. Les sources, dans cet ordre :
    1. l'historique de l'exercice. Objectif proche de la dernière fois (± 3
       reps) : 1RM de la dernière série, RIR compris, ramené aux reps visées.
       Objectif LOIN (4 × 15 après des séries de 5) : une vraie série récente
       dans cette zone de répétitions, sinon extrapolation depuis le 1RM avec
       une répétition de marge — signalé par Nicolas, 120 kg proposés pour 15
       reps parce que la dernière fois il en faisait 5 ;
    2. un 1RM saisi à la main ;
    3. exercice jamais fait : d'après les exercices proches (même famille de
       mouvement) ou travaillant le même muscle principal, poids libres
       seulement — une charge machine dépend de la machine ;
    4. rien : pas de chiffre inventé (StrengthDefaults dépend de réglages
       natifs absents du web : poids de corps, niveau).
   ========================================================================== */

import { musNorm, musclesDuLexique } from './muscle-lexicon.js';
import { devineMateriel } from './catalog.js';
import { oneRmManuel, tousOneRmManuels } from './reglages.js';
import { formeDuJour } from './forme.js';

const ECART_FIABLE = 3;
const RECENT_MS = 183 * 24 * 3600 * 1000;

/** Epley SANS le plafond de 12 reps d'estime1RM (model.js) : voir Coaching.kt. */
const epley = (poids, reps) => poids * (1 + Math.min(30, Math.max(1, reps)) / 30);
export const chargeDepuis1RM = (rm, reps) => rm / (1 + Math.min(30, Math.max(1, reps)) / 30);

/** 1RM d'une série, RIR compris, borné à +10 % du 1RM brut (oneRmFromSet). */
export function rmDeSerie(poids, reps, rir) {
  const brut = epley(poids, reps);
  const avecMarge = epley(poids, reps + Math.min(5, Math.max(0, rir ?? 0)));
  return Math.min(Math.max(brut, avecMarge), brut * 1.10);
}

const kg = (v) => `${String(Math.round(v * 10) / 10).replace('.', ',')} kg`;
const serieLabel = (s) => `${kg(s.weight)} × ${s.reps}${(s.rir ?? -1) >= 0 ? `, RIR ${s.rir}` : ''}`;
const arrondi = (nom, v) => {
  const pas = devineMateriel(nom) === 'BARRE' ? 2.5 : 1.0;
  return Math.round(v / pas) * pas;
};

/**
 * L'historique de chaque exercice, TOUTES séances confondues (comme
 * WorkoutStore.all côté natif), d'après les séances partagées :
 * nom → [{ quand, sets:[{weight,reps,rir}] }], la plus récente d'abord.
 */
export function historiqueDesExercices(sessions) {
  const parNom = new Map();
  for (const s of sessions || []) {
    const quand = new Date(s.started_at).getTime();
    for (const ex of (Array.isArray(s.details) ? s.details : [])) {
      const sets = (ex.s || [])
        .filter(st => st.r > 0 && st.w > 0)
        .map(st => ({ weight: st.w, reps: st.r, rir: st.rir ?? -1 }));
      if (!sets.length) continue;
      if (!parNom.has(ex.n)) parNom.set(ex.n, []);
      parNom.get(ex.n).push({ quand, sets });
    }
  }
  for (const liste of parNom.values()) liste.sort((a, b) => b.quand - a.quand);
  return parNom;
}

/* ------------------------------------------------------- transfert de force */

/** Même table que StrengthTransfer.kt : coefficient = 1RM habituel rapporté
 *  au développé couché barre, haltères comptés PAR HALTÈRE. */
const TABLE = [
  ['developpe couche | bench press | couche barre', 'presse_h', 1.00],
  ['developpe couche haltere | couche haltere | dumbbell bench', 'presse_h', 0.38],
  ['developpe couche prise serree | close grip bench | bench prise serree', 'presse_h', 0.88],
  ['developpe incline | incline bench | incline press', 'presse_h', 0.82],
  ['developpe incline haltere | incline dumbbell', 'presse_h', 0.32],
  ['developpe decline | decline press', 'presse_h', 1.05],
  ['developpe decline haltere', 'presse_h', 0.40],
  ['ecarte | fly haltere | chest fly | ecarte incline', 'ecarte', 0.15],
  ['pullover haltere | pullover | pull over', 'pullover', 0.30],
  ['developpe militaire | military press | overhead press | developpe nuque | push press', 'presse_v', 0.62],
  ['developpe haltere | developpe epaule haltere | developpe assis haltere | developpe militaire haltere', 'presse_v', 0.25],
  ['arnold press | developpe arnold', 'presse_v', 0.22],
  ['elevation laterale | lateral raise', 'elevation', 0.10],
  ['elevation frontale | front raise', 'elevation', 0.12],
  ['oiseau | rear delt | reverse fly', 'elevation', 0.09],
  ['rowing menton | upright row', 'rowing_menton', 0.45],
  ['barre front | skull crusher', 'triceps', 0.40],
  ['extension nuque | french press', 'triceps', 0.25],
  ['kickback haltere | kickback triceps', 'triceps', 0.08],
  ['rowing barre | barbell row | rowing pendlay | pendlay row', 'tirage_h', 0.85],
  ['rowing haltere | dumbbell row | rowing un bra', 'tirage_h', 0.40],
  ['curl barre | curl ez | barbell curl', 'curl', 0.42],
  ['curl pupitre | larry scott | preacher curl', 'curl', 0.38],
  ['curl haltere | curl alterne | dumbbell curl', 'curl', 0.19],
  ['curl marteau | hammer curl', 'curl', 0.20],
  ['curl incline', 'curl', 0.15],
  ['curl concentration | spider curl', 'curl', 0.15],
  ['shrug barre | shrug', 'shrug', 1.30],
  ['shrug haltere', 'shrug', 0.50],
  ['squat | back squat | squat barre', 'squat', 1.30],
  ['front squat', 'squat', 1.08],
  ['goblet squat', 'squat', 0.35],
  ['bulgarian split squat | squat bulgare | split squat', 'fente', 0.28],
  ['fente | lunge | fente marchee | fente deplacement', 'fente', 0.28],
  ['souleve terre | deadlift', 'charniere', 1.55],
  ['souleve terre sumo | sumo deadlift', 'charniere', 1.55],
  ['souleve terre trap barre | trap bar deadlift | trap bar', 'charniere', 1.60],
  ['souleve terre roumain | romanian deadlift | rdl', 'charniere', 1.15],
  ['souleve terre jambe tendue | stiff leg | sdt jambe tendue', 'charniere', 1.05],
  ['good morning', 'charniere', 0.55],
  ['hip thrust | hip thrust barre', 'hip_thrust', 1.50]
].map(([spec, famille, k]) => ({
  variantes: spec.split('|').map(v => musNorm(v).trim().split(' ').filter(Boolean)).filter(v => v.length),
  famille, k
}));

function refDe(nom) {
  const n = musNorm(nom);
  let best = null, bestScore = 0;
  for (const ref of TABLE) {
    for (const v of ref.variantes) {
      if (v.every(w => n.includes(` ${w} `))) {
        const score = v.reduce((t, w) => t + w.length, 0) * 100 + v.length;
        if (score > bestScore) { bestScore = score; best = ref; }
      }
    }
  }
  return best;
}

const poidsLibre = (nom) => ['BARRE', 'HALTERES'].includes(devineMateriel(nom));

function musclePrincipal(nom) {
  const z = musclesDuLexique(nom);
  if (!z) return null;
  return Object.entries(z).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

/** 1RM connus : séance la plus récente de chaque exercice (six derniers
 *  mois), puis les 1RM saisis à la main, qui priment (knownOneRms). */
export function rmConnus(historique) {
  const limite = Date.now() - RECENT_MS;
  const out = new Map();
  for (const [nom, seances] of historique) {
    const derniere = seances[0];
    if (!derniere || derniere.quand < limite) continue;
    const top = derniere.sets.reduce((a, b) => (b.weight > a.weight ? b : a));
    out.set(nom, rmDeSerie(top.weight, top.reps, top.rir));
  }
  for (const [nom, v] of Object.entries(tousOneRmManuels())) if (v > 0) out.set(nom, v);
  return out;
}

/** Estimation d'un exercice jamais fait (StrengthTransfer.estimate). */
export function estimerParTransfert(cible, connus) {
  if (!poidsLibre(cible)) return null;
  const refC = refDe(cible);
  if (!refC) return null;
  const muscleC = musclePrincipal(cible);
  const cands = [];
  for (const [nom, rm] of connus) {
    if (nom === cible || !(rm > 0) || !poidsLibre(nom)) continue;
    const refS = refDe(nom);
    if (!refS) continue;
    const memeFamille = refS.famille === refC.famille;
    if (!memeFamille && (!muscleC || musclePrincipal(nom) !== muscleC)) continue;
    cands.push({ nom, rm, est: rm * refC.k / refS.k * (memeFamille ? 0.90 : 0.80), memeFamille });
  }
  const palier = cands.some(c => c.memeFamille) ? cands.filter(c => c.memeFamille) : cands;
  if (!palier.length) return null;
  palier.sort((a, b) => a.est - b.est);
  return palier[Math.floor(palier.length / 2)];
}

/* ------------------------------------------------------- charge conseillée */

/**
 * suggestedWeight (LoadCoach, Coaching.kt) : { poids, raison } ou null,
 * MÉTÉO DE LA FORME COMPRISE (forme.js) — allégée de 5 à 10 % quand la forme
 * est moyenne ou basse, et la raison le dit.
 * `historique` : historiqueDesExercices(...). Les exercices au poids du corps
 * sont traités à part par l'appelant (pdcEffectif).
 */
export function chargeConseillee(nom, historique, cibleReps) {
  const brut = chargeBrute(nom, historique, cibleReps);
  if (!brut) return null;
  const forme = formeDuJour();
  if (forme.facteur >= 1) return brut;
  return { poids: arrondi(nom, brut.poids * forme.facteur), raison: `${brut.raison} ; ${forme.allegement}` };
}

function chargeBrute(nom, historique, cibleReps) {
  const cible = Math.min(30, Math.max(1, cibleReps || 8));
  const seances = historique.get(nom) || [];

  if (seances.length) {
    const top = seances[0].sets.reduce((a, b) => (b.weight > a.weight ? b : a));
    if (Math.abs(cible - top.reps) <= ECART_FIABLE) {
      return {
        poids: arrondi(nom, chargeDepuis1RM(rmDeSerie(top.weight, top.reps, top.rir), cible)),
        raison: `d'après ta dernière série (${serieLabel(top)})${top.reps !== cible ? `, ramenée à ${cible} répétitions` : ''}`
      };
    }
    const limite = Date.now() - RECENT_MS;
    for (const s of seances) {
      if (s.quand < limite) break;
      const proches = s.sets.filter(x => Math.abs(x.reps - cible) <= 2);
      if (!proches.length) continue;
      const p = proches.reduce((a, b) => (b.weight > a.weight ? b : a));
      return {
        poids: arrondi(nom, chargeDepuis1RM(rmDeSerie(p.weight, p.reps, p.rir), cible)),
        raison: `d'après ta dernière série à ${p.reps} répétitions (${serieLabel(p)})`
      };
    }
    const rm = rmDeSerie(top.weight, top.reps, top.rir);
    return {
      poids: arrondi(nom, chargeDepuis1RM(rm, cible + 1)),
      raison: `première fois à ${cible} répétitions : estimé depuis ton 1RM (≈ ${kg(Math.round(rm))}, d'après ${serieLabel(top)}), avec une répétition de marge`
    };
  }

  const manuel = oneRmManuel(nom);
  if (manuel) {
    return {
      poids: arrondi(nom, chargeDepuis1RM(manuel, cible)),
      raison: `d'après ton 1RM de ${kg(manuel)}, pour ${cible} répétitions`
    };
  }

  const est = estimerParTransfert(nom, rmConnus(historique));
  if (est) {
    return {
      poids: arrondi(nom, chargeDepuis1RM(est.est, cible + 1)),
      raison: `nouvel exercice : estimé d'après « ${est.nom} » (1RM ≈ ${kg(Math.round(est.rm))}), à ajuster dès la première série`
    };
  }
  return null;
}
