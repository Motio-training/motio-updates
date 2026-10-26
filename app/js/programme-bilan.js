/* ==========================================================================
   LE BILAN — Moti mène l'entretien avant d'écrire le programme.
   Portage de ProgramInterview.kt : les deux doivent dire la même chose.

   Jusqu'ici, créer un programme voulait dire décrire son objectif dans un
   champ et regarder ce qui sortait. Celui qui n'est pas du métier ne sait pas
   quoi écrire, et ne sait pas davantage juger ce qu'il reçoit : il relance,
   reformule, et finit par garder un programme sans savoir s'il lui convient.

   Ici c'est l'inverse : c'est Moti qui pose les questions, une à la fois,
   comme à un premier rendez-vous avec un coach — objectif, échéance, temps
   réellement disponible, matériel, blessures, ce qu'on aime et ce qu'on
   déteste. Il rebondit sur les réponses, et il ne demande jamais ce que le
   carnet lui dit déjà.

   Ce que l'entretien produit n'est pas un programme mais un CAHIER DES
   CHARGES, qui repart ensuite dans la génération ordinaire
   (genererProgrammeIA) comme le ferait une description écrite à la main :
   toute la périodisation par blocs et la lecture du carnet restent les mêmes.
   Une seule chaîne de génération, deux façons d'y entrer.
   ========================================================================== */

import { sb, currentUser } from './supabase.js';
import { instantaneAthlete } from './athlete.js';
import {
  genererProgrammeIA, motifLisible, defaultDaysFor, WEEK_DAYS,
  premierJourApres, JOURS_IA
} from './programme-ia.js';

const MATERIELS = ['BARRE', 'HALTERES', 'MACHINE', 'LIBRE', 'ELASTIQUE'];
const NIVEAUX = ['DEBUTANT', 'INTERMEDIAIRE', 'AVANCE'];

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/**
 * Le tour suivant de l'entretien. `tours` vide lance le bilan : Moti pose
 * alors sa première question. Rend { type: 'question', ... } ou
 * { type: 'brief', ... }, et lève une erreur explicite.
 *
 * Chaque tour est { deMoti: bool, texte: string }.
 */
export async function tourSuivant(tours) {
  /* Le carnet, comme pour la génération et le chat : c'est ce qui permet à
     Moti de ne PAS demander ce qu'il sait déjà, et c'est ce qui fait la
     différence entre un entretien et un questionnaire. */
  let athlete = '';
  try {
    const moi = await currentUser();
    if (moi) athlete = await instantaneAthlete(moi);
  } catch { /* l'entretien se fait quand même, en demandant davantage */ }

  /* Fonction à part : l'entretien n'a besoin ni du catalogue ni du schéma de
     programme, et dix questions feraient dix envois du catalogue entier pour
     rien (voir l'en-tête de program-interview). */
  const { data, error } = await sb.functions.invoke('program-interview', {
    body: {
      history: tours.map(t => ({ role: t.deMoti ? 'assistant' : 'user', content: t.texte })),
      athlete_context: athlete
    }
  });
  if (error) throw await motifLisible(error);
  if (!data) throw new Error('Réponse vide de Moti.');

  if (data.type === 'brief') return lireBilan(data);
  return lireQuestion(data);
}

function lireQuestion(d) {
  const texte = String(d.question || '').trim();
  if (!texte) throw new Error('question vide');
  return {
    type: 'question',
    texte,
    // Ce que Moti va faire de la réponse, affiché en petit sous la question :
    // c'est ce qui fait comprendre qu'on répond à un coach et pas à un
    // formulaire.
    pourquoi: String(d.pourquoi || '').trim(),
    suggestions: (Array.isArray(d.suggestions) ? d.suggestions : [])
      .map(s => String(s || '').trim()).filter(Boolean).slice(0, 5),
    avancement: clamp(Math.round(d.avancement ?? 0), 0, 100)
  };
}

function lireBilan(d) {
  const cahier = String(d.cahier_des_charges || '').trim();
  if (!cahier) throw new Error('cahier des charges vide');

  const jours = (Array.isArray(d.jours) ? d.jours : [])
    .map(j => JOURS_IA.indexOf(String(j || '').trim().toLowerCase()))
    .filter(i => i >= 0)
    .map(i => WEEK_DAYS[i]);
  const materiel = (Array.isArray(d.materiel) ? d.materiel : [])
    .map(m => String(m || '').trim().toUpperCase())
    .filter(m => MATERIELS.includes(m));
  const niveauBrut = String(d.niveau || '').trim().toUpperCase();
  const parSemaine = clamp(Math.round(d.jours_par_semaine ?? (jours.length || 3)), 2, 6);

  return {
    type: 'brief',
    // Ce que Moti a retenu, relu et corrigible avant de lancer.
    recapitulatif: String(d.recapitulatif || '').trim(),
    cahierDesCharges: cahier,
    // 0 : Moti décide de la durée à la génération.
    semaines: clamp(Math.round(d.semaines ?? 0), 0, 52),
    dateObjectif: String(d.date_objectif || '').trim(),
    joursParSemaine: parSemaine,
    jours: ajusterJours([...new Set(jours)], parSemaine),
    niveau: NIVEAUX.includes(niveauBrut) ? niveauBrut : 'INTERMEDIAIRE',
    materiel: materiel.length ? [...new Set(materiel)] : [...MATERIELS]
  };
}

/** Autant de jours que de séances : on garde ceux que Moti a choisis, et on
 *  complète (ou on coupe) avec la répartition par défaut. Un décalage ici
 *  ferait échouer la génération sur un détail que l'athlète n'a jamais vu. */
function ajusterJours(choisis, n) {
  const out = choisis.slice(0, n);
  if (out.length < n) {
    for (const j of defaultDaysFor(n)) if (out.length < n && !out.includes(j)) out.push(j);
    for (const j of WEEK_DAYS) if (out.length < n && !out.includes(j)) out.push(j);
  }
  return out.sort((a, b) => WEEK_DAYS.indexOf(a) - WEEK_DAYS.indexOf(b));
}

/** Le premier des jours retenus, à partir d'aujourd'hui — la même règle que
 *  l'assistant ordinaire, qui démarre lui aussi à la première occurrence du
 *  premier jour coché. */
export function departParDefaut(jours) {
  const premier = [...jours].sort((a, b) => WEEK_DAYS.indexOf(a) - WEEK_DAYS.indexOf(b))[0] ?? 1;
  return premierJourApres(Date.now(), premier, 0);
}

/**
 * Lance la génération à partir du bilan. C'est exactement l'appel que fait
 * l'assistant ordinaire : seul le texte d'objectif change, puisqu'il vient de
 * l'entretien au lieu du champ de description.
 */
export function genererDepuisBilan(bilan, { minuteOfDay = 18 * 60, sansHeure = false } = {}) {
  return genererProgrammeIA({
    goalText: bilan.cahierDesCharges,
    level: bilan.niveau,
    daysPerWeek: bilan.joursParSemaine,
    weeks: bilan.semaines,
    gears: bilan.materiel,
    weekdays: bilan.jours,
    minuteOfDay,
    startMs: departParDefaut(bilan.jours),
    targetDate: bilan.dateObjectif,
    sansHeure
  });
}
