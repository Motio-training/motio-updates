/* ==========================================================================
   MODIFIER UN PROGRAMME — à la main ou en le demandant à Moti.
   Portage fidèle de ProgramEdit.kt : les deux doivent dire la même chose.

   Un programme, c'est deux choses liées : quelques MODÈLES de séance rangés
   dans le carnet (Push, Pull, Legs…) et un PLANNING de séances datées qui
   portent, semaine par semaine, les séries et répétitions de chaque exercice.
   Modifier un modèle sans toucher au planning le laissait mentir. Tout passe
   donc par ici, qui garde les deux d'accord.

   On travaille sur une COPIE (l'« état » : { program, workouts, original }) :
   rien n'est enregistré avant `enregistrer`, on peut annuler à tout moment.
   Même écran pour l'aperçu d'un programme qui vient d'être généré et pour un
   programme déjà en cours.

   Règle d'or : une séance déjà FAITE n'est jamais touchée.
   ========================================================================== */

import { sb } from './supabase.js';
import { CIRCUIT_WORK_SEC } from './model.js';
import { getWorkout, saveWorkout, deleteWorkout, saveProgram, listPrograms } from './api.js';
import {
  WEEK_DAYS, JOURS_IA, minuit, premierJourApres, plusJours, catalogueFiltre,
  construireDraft, motifLisible
} from './programme-ia.js';

export const JOURS_LONGS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
export const libelleJour = (dow) => JOURS_LONGS[WEEK_DAYS.indexOf(dow)] || 'Lundi';

const HINT_DECHARGE = 'Semaine de décharge — charges allégées';
const HINT_DEFAUT = 'Poids conseillé pendant la séance, selon ton RIR';

/* ================================================================ copies */

export const copie = (o) => JSON.parse(JSON.stringify(o));

export function copierEtat(e) {
  return { program: copie(e.program), workouts: copie(e.workouts), original: e.original };
}

/** Un programme tout juste généré, pas encore enregistré. */
export function etatDepuisBrouillon({ program, workouts }) {
  return { program, workouts: [...workouts], original: null };
}

/** Un programme enregistré, copié pour être modifié. `lignes` : les séances
 *  du carnet (listWorkouts). Un modèle retiré du carnet entre-temps est
 *  reconstruit d'après sa dernière séance prévue, pour que le programme reste
 *  modifiable au lieu de perdre une séance en silence. */
export function etatPourProgramme(program, lignes) {
  const p = copie(program);
  const workouts = [];
  (p.workoutIds || []).forEach(id => {
    const row = lignes.find(r => String(r.local_id) === String(id));
    if (row) { workouts.push(copie(row.data)); return; }
    const s = (p.sessions || []).filter(x => x.workoutId === id).sort((a, b) => b.dateMs - a.dateMs)[0];
    if (!s) return;
    workouts.push({
      id, name: s.title, category: s.category, history: [], notes: '',
      circuit: false, rounds: 3, roundRestSec: 60,
      exercises: (s.items || []).map(it => it.holdSec > 0
        ? { name: it.name, mode: 'MAINTIEN', plannedSets: it.sets, targetReps: 0, recupSec: it.recupSec,
            workSec: it.holdSec, restSec: it.recupSec, tabataSeries: it.sets, groupId: 0, sets: [] }
        : { name: it.name, mode: 'MINUTEUR', plannedSets: it.sets, targetReps: it.reps, recupSec: it.recupSec,
            workSec: 20, restSec: 10, tabataSeries: 8, groupId: 0, sets: [] })
    });
  });
  return { program: p, workouts, original: program };
}

/* ================================================================ lecture */

const faite = (s) => (s.doneAt || 0) > 0;

/** Jour de la semaine (getDay) où tombe ce modèle de séance. */
export function jourDe(p, wid) {
  const ss = p.sessions.filter(s => s.workoutId === wid);
  const aVenir = ss.filter(s => !faite(s)).sort((a, b) => a.dateMs - b.dateMs)[0];
  const ref = aVenir || ss.sort((a, b) => a.dateMs - b.dateMs)[0];
  return ref ? new Date(ref.dateMs).getDay() : 1;
}

/** Heure des séances, en minutes depuis minuit. */
export function minuteDuJour(p) {
  const tri = [...p.sessions].sort((a, b) => a.dateMs - b.dateMs);
  const ref = tri.find(s => !faite(s)) || tri[0];
  if (!ref) return 18 * 60;
  const d = new Date(ref.dateMs);
  return d.getHours() * 60 + d.getMinutes();
}

/** Minuit du premier jour du programme : la référence de la semaine 1. */
export function debut(p) {
  const t = p.sessions.length ? Math.min(...p.sessions.map(s => s.dateMs)) : Date.now();
  return minuit(t);
}

/** Dernière semaine déjà entamée (séance faite ou passée), 0 si aucune. */
export function semainesEntamees(p) {
  const auj = minuit(Date.now());
  return p.sessions.filter(s => faite(s) || s.dateMs < auj).reduce((m, s) => Math.max(m, s.week), 0);
}

export const intact = (p) => semainesEntamees(p) === 0;

/** Modèles dans l'ordre de la semaine (lundi d'abord). */
export function parJour(etat) {
  return [...etat.workouts].sort((a, b) =>
    WEEK_DAYS.indexOf(jourDe(etat.program, a.id)) - WEEK_DAYS.indexOf(jourDe(etat.program, b.id)));
}

/** Nombre de séries prévues, quel que soit le mode (toursPrevus, WorkoutModel.kt). */
export function toursPrevus(e) {
  return (e.mode === 'TABATA' || e.mode === 'MAINTIEN') ? e.tabataSeries : e.plannedSets;
}
const seriesDe = (w, e) => (w.circuit ? w.rounds : toursPrevus(e));
const tenu = (w, e) => !!w.circuit || e.mode === 'MAINTIEN';

/** La ligne du planning d'un exercice tel que le modèle le décrit. */
function prevuDepuis(w, e, decharge, hint) {
  const h = decharge ? HINT_DECHARGE : hint;
  if (tenu(w, e)) {
    return { name: e.name, sets: seriesDe(w, e), reps: 0, recupSec: e.restSec, hint: h,
      holdSec: e.workSec > 0 ? e.workSec : CIRCUIT_WORK_SEC };
  }
  const n = seriesDe(w, e);
  return {
    name: e.name,
    sets: decharge ? Math.min(n, Math.max(Math.min(2, n), Math.round(n * 0.6))) : n,
    reps: e.targetReps, recupSec: e.recupSec, hint: h, holdSec: 0
  };
}

/* ======================================================= modifications */

/**
 * Répercute sur le planning la modification d'un modèle de séance
 * (applyTemplateEdit, ProgramEdit.kt) : rapprochement par nom, puis
 * remplacement à la même place pour ce qui reste — le nouvel exercice reprend
 * la progression de l'ancien. Un réglage changé s'applique en ÉCART à chaque
 * semaine (une série de plus chaque semaine), ce qui garde la progression
 * prévue. Seules les séances pas encore faites changent.
 */
export function appliquerModele(p, avant, apres) {
  const b = avant.exercises || [];
  const a = apres.exercises || [];
  const match = a.map(() => -1);
  const prisB = b.map(() => false);
  a.forEach((ea, j) => {
    const i = b.findIndex((eb, k) => !prisB[k] && eb.name === ea.name);
    if (i >= 0) { match[j] = i; prisB[i] = true; }
  });
  const libresA = a.map((_, j) => j).filter(j => match[j] < 0);
  const libresB = b.map((_, i) => i).filter(i => !prisB[i]);
  libresA.forEach((j, k) => { if (k < libresB.length) { match[j] = libresB[k]; prisB[libresB[k]] = true; } });

  p.sessions.filter(s => s.workoutId === apres.id && !faite(s)).forEach(s => {
    const reserve = [...(s.items || [])];
    const hint = (s.items || []).find(it => it.hint && it.hint !== HINT_DECHARGE)?.hint || HINT_DEFAUT;
    s.items = a.map((ea, j) => {
      const i = match[j];
      let ancien = null;
      if (i >= 0) {
        const k = reserve.findIndex(it => it.name === b[i].name);
        if (k >= 0) ancien = reserve.splice(k, 1)[0];
      }
      if (!ancien) return prevuDepuis(apres, ea, s.deload, hint);
      return ajuster(ancien, avant, b[i], apres, ea, s.deload, hint);
    });
    s.title = apres.name;
    s.category = apres.category;
  });
}

function ajuster(ancien, wb, eb, wa, ea, decharge, hint) {
  if (tenu(wa, ea) !== tenu(wb, eb)) return prevuDepuis(wa, ea, decharge, hint);
  const out = { ...ancien, name: ea.name };
  const dSeries = seriesDe(wa, ea) - seriesDe(wb, eb);
  if (dSeries) out.sets = Math.min(100, Math.max(1, out.sets + dSeries));
  if (tenu(wa, ea)) {
    const tenue = ea.workSec > 0 ? ea.workSec : CIRCUIT_WORK_SEC;
    const tenueB = eb.workSec > 0 ? eb.workSec : CIRCUIT_WORK_SEC;
    if (tenue !== tenueB || !(out.holdSec > 0)) out.holdSec = tenue;
    if (ea.restSec !== eb.restSec) out.recupSec = ea.restSec;
    out.reps = 0;
  } else {
    if (ea.targetReps !== eb.targetReps) {
      out.reps = !ea.targetReps ? 0 : !out.reps ? ea.targetReps
        : Math.min(100, Math.max(1, out.reps + ea.targetReps - eb.targetReps));
    }
    if (ea.recupSec !== eb.recupSec) out.recupSec = ea.recupSec;
    out.holdSec = 0;
  }
  return out;
}

/** Remplace le modèle dans l'état et répercute sur le planning. */
export function remplacerModele(etat, apres) {
  const i = etat.workouts.findIndex(w => w.id === apres.id);
  if (i < 0) return;
  appliquerModele(etat.program, etat.workouts[i], apres);
  etat.workouts[i] = apres;
}

export function renommer(etat, wid, nom) {
  const n = String(nom || '').trim();
  const w = etat.workouts.find(x => x.id === wid);
  if (!w || !n) return;
  w.name = n;
  etat.program.sessions.filter(s => s.workoutId === wid && !faite(s)).forEach(s => { s.title = n; });
}

function lundiDe(ms) {
  const d = new Date(minuit(ms));
  while (d.getDay() !== 1) d.setDate(d.getDate() - 1);
  return d.getTime();
}
function aLaMinute(jourMs, minute) {
  const d = new Date(minuit(jourMs));
  d.setMinutes(minute);
  return d.getTime();
}
function minuteDe(ms) { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); }

/** La même heure, un autre jour : glisser une séance dans la vue mois (moveToDay). */
export function deplacerAuJour(dateMs, jourMs) { return aLaMinute(jourMs, minuteDe(dateMs)); }

/** Déplace un modèle sur un autre jour de la MÊME semaine calendaire ; une
 *  séance qui tomberait dans le passé part à la semaine suivante. */
export function changerJour(p, wid, dow) {
  const auj = minuit(Date.now());
  p.sessions.filter(s => s.workoutId === wid && !faite(s)).forEach(s => {
    let d = aLaMinute(plusJours(lundiDe(s.dateMs), WEEK_DAYS.indexOf(dow)), minuteDe(s.dateMs));
    if (d < auj) d = plusJours(d, 7);
    s.dateMs = d;
  });
  p.sessions.sort((a, b) => a.dateMs - b.dateMs);
}

/** Change l'heure de toutes les séances à venir. */
export function changerHeure(p, minute) {
  p.sessions.filter(s => !faite(s)).forEach(s => { s.dateMs = aLaMinute(s.dateMs, minute); });
}

/** Décale tout le programme — seulement s'il n'a pas commencé, jamais avant aujourd'hui. */
export function decalerSemaines(p, n) {
  if (!intact(p) || !n || !p.sessions.length) return false;
  const premier = Math.min(...p.sessions.map(s => s.dateMs));
  if (plusJours(premier, 7 * n) < minuit(Date.now())) return false;
  p.sessions.forEach(s => { s.dateMs = plusJours(s.dateMs, 7 * n); });
  return true;
}

function nouvelIdSeance(p, k) {
  const max = p.sessions.reduce((m, s) => Math.max(m, s.id), 0);
  return Math.max(Date.now(), max + 1000) + k * 1000;
}

/** Ajoute un modèle de séance, chaque semaine au jour donné, à partir
 *  d'aujourd'hui. Le modèle peut être vide : on y met ses exercices juste
 *  après, et `appliquerModele` remplit alors le planning. */
export function ajouterModele(etat, w, dow) {
  const p = etat.program;
  etat.workouts.push(w);
  p.workoutIds.push(w.id);
  const auj = minuit(Date.now());
  const premier = premierJourApres(debut(p), dow, minuteDuJour(p));
  let k = 0;
  for (let semaine = 1; semaine <= p.weeks; semaine++) {
    const date = plusJours(premier, 7 * (semaine - 1));
    if (date < auj) continue;
    const decharge = p.sessions.some(s => s.week === semaine && s.deload);
    p.sessions.push({
      id: nouvelIdSeance(p, ++k), week: semaine, dateMs: date, workoutId: w.id,
      title: w.name, category: w.category, deload: decharge,
      items: (w.exercises || []).map(e => prevuDepuis(w, e, decharge, '')),
      doneAt: 0, skipped: false, eventId: 0
    });
  }
  p.daysPerWeek = etat.workouts.length;
  p.sessions.sort((a, b) => a.dateMs - b.dateMs);
}

/** Retire un modèle : ses séances à venir disparaissent, celles déjà faites restent. */
export function retirerModele(etat, wid) {
  const p = etat.program;
  etat.workouts = etat.workouts.filter(w => w.id !== wid);
  p.workoutIds = p.workoutIds.filter(id => id !== wid);
  p.sessions = p.sessions.filter(s => s.workoutId !== wid || faite(s));
  p.daysPerWeek = Math.max(1, etat.workouts.length);
}

/** Ce qui empêche d'enregistrer, ou null. */
export function probleme(etat) {
  if (!etat.workouts.length) return 'Le programme doit garder au moins une séance.';
  const vide = etat.workouts.find(w => !(w.exercises || []).length);
  if (vide) return `« ${vide.name} » n'a encore aucun exercice.`;
  if (!String(etat.program.name || '').trim()) return 'Donne un nom au programme.';
  return null;
}

/* =========================================================== enregistrement */

/**
 * Enregistre les modifications (commit, ProgramEdit.kt). Les modèles déjà dans
 * le carnet gardent leur historique : on ne recopie que leur définition, sur
 * la version la plus fraîche du serveur. Un modèle retiré du programme part
 * du carnet s'il n'a jamais servi.
 */
export async function enregistrer(moiId, etat) {
  for (const w of etat.workouts) {
    const row = etat.original ? await getWorkout(moiId, w.id).catch(() => null) : null;
    if (!row) { await saveWorkout(moiId, w); continue; }
    const frais = row.data || {};
    Object.assign(frais, {
      name: w.name, category: w.category, notes: w.notes || '',
      circuit: !!w.circuit, rounds: w.rounds ?? 3, roundRestSec: w.roundRestSec ?? 60,
      exercises: (w.exercises || []).map(e => ({ ...e, sets: [] }))
    });
    await saveWorkout(moiId, frais);
  }
  const retires = (etat.original?.workoutIds || []).filter(id => !etat.workouts.some(w => w.id === id));
  for (const id of retires) {
    const row = await getWorkout(moiId, id).catch(() => null);
    if (row && !((row.data || {}).history || []).length) await deleteWorkout(moiId, id).catch(() => {});
  }
  etat.program.daysPerWeek = Math.max(1, etat.workouts.length);
  etat.program.sessions.sort((a, b) => a.dateMs - b.dateMs);
  await saveProgram(moiId, etat.program);
  return etat.program;
}

/**
 * Un modèle modifié DEPUIS LE CARNET (écran de séance ordinaire) : les
 * programmes qui l'utilisent suivent (onTemplateSaved, ProgramEdit.kt).
 */
export async function suivreModele(moiId, programmes, avant, apres) {
  for (const row of programmes) {
    const p = row.data;
    if (!p || !(p.workoutIds || []).some(id => String(id) === String(apres.id))) continue;
    const suivant = copie(p);
    appliquerModele(suivant, avant, apres);
    await saveProgram(moiId, suivant);
  }
}

/* ===================================================== séance prévue */

/* Séance lancée depuis le planning d'un programme : l'écran du programme le
   note ici juste avant d'ouvrir la séance, l'écran de séance applique les
   séries de la semaine au démarrage et coche la séance à la fin. Le repère
   n'est pris en compte que s'il est FRAIS au démarrage — une séance lancée
   plus tard depuis le carnet ne doit pas hériter d'un vieux repère. */
const CLE_PREVUE = 'motio.seance-prevue';

export function annoncerSeancePrevue(programId, sessionId, workoutId) {
  try {
    localStorage.setItem(CLE_PREVUE, JSON.stringify({ programId, sessionId, workoutId, at: Date.now() }));
  } catch { /* stockage indisponible : la séance se fera aux valeurs du modèle */ }
}

/** Le repère pour cette séance, ou null. `fraiche` : posé il y a moins de
 *  deux minutes (démarrage), sinon simplement le même modèle (reprise). */
export function seancePrevuePour(workoutId, fraiche) {
  try {
    const m = JSON.parse(localStorage.getItem(CLE_PREVUE) || 'null');
    if (!m || String(m.workoutId) !== String(workoutId)) return null;
    if (fraiche && Date.now() - (m.at || 0) > 120000) return null;
    return m;
  } catch { return null; }
}

export function oublierSeancePrevue() {
  try { localStorage.removeItem(CLE_PREVUE); } catch { /* rien à oublier */ }
}

/** Coche dans le planning la séance qui vient d'être faite (markDone). */
export async function marquerSeancePrevueFaite(moiId, workoutId) {
  const m = seancePrevuePour(workoutId, false);
  oublierSeancePrevue();
  if (!m) return;
  const rows = await listPrograms(moiId);
  const p = rows.find(r => String(r.local_id) === String(m.programId))?.data;
  const s = p?.sessions?.find(x => x.id === m.sessionId);
  if (!s) return;
  s.doneAt = Date.now();
  s.skipped = false;
  await saveProgram(moiId, p);
}

/** La séance prévue telle qu'elle doit se dérouler, ou null. */
export async function seancePrevueDe(moiId, marque) {
  const rows = await listPrograms(moiId);
  return rows.find(r => String(r.local_id) === String(marque.programId))
    ?.data?.sessions?.find(x => x.id === marque.sessionId) || null;
}

/** sessionFor (ProgramGenerator.kt) : le modèle du carnet, avec les séries et
 *  répétitions prévues pour CETTE semaine. */
export function exercicesDeLaSemaine(w, prevue) {
  return (w.exercises || []).map(e => {
    const ex = { ...e, sets: [] };
    const plan = (prevue.items || []).find(it => it.name === e.name);
    if (plan) {
      ex.plannedSets = plan.sets;
      ex.targetReps = plan.reps;
      if (plan.recupSec > 0) ex.recupSec = plan.recupSec;
      // Maintien : le nombre de tours suit le plan de la semaine, comme
      // plannedSets pour les autres modes.
      if (ex.mode === 'MAINTIEN') {
        ex.tabataSeries = plan.sets;
        if (plan.holdSec > 0) ex.workSec = plan.holdSec;
      }
    }
    return ex;
  });
}

/* ================================================================ Moti */

/**
 * Le programme au format de l'outil create_program, avec le jour de chaque
 * séance (toAiJson, ProgramEdit.kt). Les phases sont reconstruites depuis le
 * planning : les semaines consécutives identiques forment un bloc.
 */
export function versIA(etat) {
  const p = etat.program;
  const ws = parJour(etat);
  const sessions = ws.map(w => {
    const s = {
      title: w.name, category: w.category,
      day: JOURS_IA[WEEK_DAYS.indexOf(jourDe(p, w.id))] || 'lundi',
      notes: w.notes || '',
      exercises: (w.exercises || []).map(e => tenu(w, e)
        ? { name: e.name, hold_sec: e.workSec > 0 ? e.workSec : CIRCUIT_WORK_SEC, hold_rest_sec: e.restSec }
        : { name: e.name })
    };
    if (w.circuit) Object.assign(s, { circuit: true, rounds: w.rounds, round_rest_sec: w.roundRestSec });
    return s;
  });

  const signature = (semaine) => ws.map(w => {
    const ss = p.sessions.find(s => s.week === semaine && s.workoutId === w.id);
    return (w.exercises || []).map(e => {
      const it = ss?.items?.find(x => x.name === e.name);
      return [
        it?.sets ?? seriesDe(w, e),
        Math.max(tenu(w, e) ? 1 : 0, it?.reps ?? e.targetReps ?? 0),
        it?.recupSec ?? e.recupSec
      ];
    });
  });
  const decharge = (semaine) => p.sessions.some(s => s.week === semaine && s.deload);
  const etiquette = (semaine) => {
    const h = p.sessions.find(s => s.week === semaine)?.items?.[0]?.hint || '';
    const l = h.split(' — ')[0];
    return l && !l.startsWith('Semaine de décharge') && !l.startsWith('Poids conseillé') ? l : null;
  };

  const phases = [];
  let debutBloc = 1;
  while (debutBloc <= p.weeks) {
    const sig = JSON.stringify(signature(debutBloc));
    const dl = decharge(debutBloc);
    let fin = debutBloc;
    while (fin + 1 <= p.weeks && JSON.stringify(signature(fin + 1)) === sig && decharge(fin + 1) === dl) fin++;
    phases.push({
      label: etiquette(debutBloc) || (debutBloc === fin ? `Semaine ${debutBloc}` : `Semaines ${debutBloc} à ${fin}`),
      week_start: debutBloc, week_end: fin, deload: dl,
      sessions: JSON.parse(sig).map(exs => ({
        exercises: exs.map(([sets, reps, recup]) => ({ sets, reps, recup_sec: recup }))
      }))
    });
    debutBloc = fin + 1;
  }
  return { name: p.name, notes: p.notes || '', sessions, phases };
}

const norm = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Recolle au programme le résultat d'une modification demandée à Moti
 * (mergeAi, ProgramEdit.kt) : chaque séance renvoyée retrouve son modèle
 * d'origine (même nom, sinon même rang s'il a été renommé), les séances faites
 * ou passées restent telles quelles, les séances à venir qui correspondent à
 * une séance existante reprennent son identifiant — l'agenda est ainsi mis à
 * jour plutôt que doublé.
 */
export function fusionnerIA(etat, draft) {
  const p = etat.program;
  const np = draft.program;
  const anciens = [...etat.workouts];
  const pris = new Set();
  const titresNeufs = new Set(draft.workouts.map(w => norm(w.name)));
  const ids = new Map();
  draft.workouts.forEach((nw, i) => {
    const parTitre = anciens.find(w => !pris.has(w.id) && norm(w.name) === norm(nw.name));
    const parRang = anciens[i] && !pris.has(anciens[i].id) && !titresNeufs.has(norm(anciens[i].name)) ? anciens[i] : null;
    const ancien = parTitre || parRang;
    if (ancien) pris.add(ancien.id);
    ids.set(nw.id, ancien ? ancien.id : nw.id);
  });
  const workouts = draft.workouts.map(nw => {
    const id = ids.get(nw.id);
    const ancien = anciens.find(w => w.id === id);
    return { ...nw, id, notes: nw.notes || ancien?.notes || '' };
  });

  const auj = minuit(Date.now());
  const garde = p.sessions.filter(s => faite(s) || s.dateMs < auj);
  const reutilisables = p.sessions.filter(s => !(faite(s) || s.dateMs < auj));
  const ajout = np.sessions
    .map(s => ({ ...s, workoutId: ids.get(s.workoutId) ?? s.workoutId }))
    .filter(n => n.dateMs >= auj && !garde.some(k => k.week === n.week && k.workoutId === n.workoutId));
  ajout.forEach(n => {
    const k = reutilisables.findIndex(r => r.week === n.week && r.workoutId === n.workoutId);
    if (k >= 0) {
      const r = reutilisables.splice(k, 1)[0];
      n.id = r.id; n.eventId = r.eventId || 0; n.skipped = !!r.skipped;
    }
  });

  p.sessions = [...garde, ...ajout].sort((a, b) => a.dateMs - b.dateMs);
  if ((np.name || '').trim()) p.name = np.name;
  if ((np.notes || '').trim()) p.notes = np.notes;
  p.weeks = Math.max(np.weeks, garde.reduce((m, s) => Math.max(m, s.week), 0));
  p.workoutIds = workouts.map(w => w.id);
  p.daysPerWeek = Math.max(1, workouts.length);
  etat.workouts = workouts;
}

/**
 * MODIFIER UN PROGRAMME EN LE DEMANDANT À MOTI (modify, AiProgramGenerator.kt).
 * Travaille sur `etat` en place : l'appelant lui passe une COPIE et ne la
 * garde qu'en cas de succès. Renvoie ce que Moti dit avoir changé.
 */
export async function modifierProgrammeIA(etat, instruction) {
  const p = etat.program;
  const { data, error } = await sb.functions.invoke('generate-program', {
    body: {
      mode: 'modify', instruction,
      current_program: versIA(etat),
      level: p.level, weeks: p.weeks, weeks_started: semainesEntamees(p),
      // Le matériel choisi à la création n'est pas conservé avec le
      // programme : Moti voit tout le catalogue et se cale sur l'existant.
      gears: [], catalog: catalogueFiltre([])
    }
  });
  if (error) throw await motifLisible(error);
  if (!data) throw new Error('Réponse vide de Moti.');
  let draft;
  try {
    draft = construireDraft(data, {
      level: p.level, daysPerWeek: etat.workouts.length, weeks: p.weeks,
      weekdays: etat.workouts.map(w => jourDe(p, w.id)),
      minuteOfDay: minuteDuJour(p), startMs: debut(p), modifie: true
    });
  } catch (e) {
    throw new Error(`Réponse reçue mais illisible (${e.message || 'format inattendu'}).`);
  }
  fusionnerIA(etat, draft);
  return (data.changes || '').trim() || 'Programme modifié.';
}
