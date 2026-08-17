/* ==========================================================================
   Générateur de programme par IA — port d'AiProgramGenerator.kt. La fonction
   Edge Supabase `generate-program` (déjà déployée, appelée par l'app depuis
   la v2.11) interroge Claude avec un schéma strict (tool-use forcé) et
   renvoie un programme structuré ; rien n'est inventé côté client, la
   conversion ci-dessous produit exactement la même forme de `Program`/
   `Workout` que le reste de l'appli (mêmes clés que ProgramModel.kt::toJson,
   donc directement compatibles avec saveProgram/saveWorkout).

   Contrat exact de la fonction (lu depuis Supabase, la fonction n'est pas
   versionnée dans ce dépôt) :
     entrée  { goal_text, level, days_per_week, weeks, gears, catalog }
     sortie  { name, notes, sessions:[{title,category,exercises:[{name}]}],
               phases:[{label,week_start,week_end,deload,
                        sessions:[{exercises:[{sets,reps,recup_sec}]}]}] }
   ========================================================================== */

import { sb } from './supabase.js';
import { GROUPES, devineMateriel } from './catalog.js';
import { nouvelleSeance, nouvelExercice } from './model.js';

/** Jours de la semaine dans l'ordre français (lundi d'abord), avec la
 *  numérotation de Date.getDay() (0 = dimanche) — pas besoin de conversion
 *  pour dater les séances avec le Date natif du navigateur. */
export const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 0];
export const WEEK_DAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/** defaultDaysFor (ProgramModel.kt) : jours proposés par défaut selon le
 *  nombre de séances par semaine. */
export function defaultDaysFor(n) {
  switch (n) {
    case 2: return [1, 4];
    case 3: return [1, 3, 5];
    case 4: return [1, 2, 4, 5];
    case 5: return [1, 2, 3, 5, 6];
    default: return [1, 2, 3, 4, 5, 6];
  }
}

function minuit(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }

/** firstDayOfWeekAfter (ProgramModel.kt) : première occurrence du jour de
 *  semaine `dow` à partir de `fromMs` (incluse), à l'heure minuteOfDay. */
function premierJourApres(fromMs, dow, minuteOfDay) {
  const d = new Date(minuit(fromMs));
  let garde = 0;
  while (d.getDay() !== dow && garde < 7) { d.setDate(d.getDate() + 1); garde++; }
  d.setMinutes(d.getMinutes() + minuteOfDay);
  return d.getTime();
}

/** plusDays (ProgramModel.kt) : addition calendaire (setDate), pas une
 *  simple addition de millisecondes — reste correct au changement d'heure. */
function plusJours(ms, jours) {
  const d = new Date(ms);
  d.setDate(d.getDate() + jours);
  return d.getTime();
}

/** catalogJson (AiProgramGenerator.kt) : catalogue filtré par matériel
 *  disponible, {group, exercises[]} — mêmes règles que le filtre du
 *  générateur maison, pour que l'IA ne propose jamais un exercice
 *  infaisable avec le matériel indiqué. */
function catalogueFiltre(gears) {
  return GROUPES
    .map(g => ({
      group: g.nom,
      exercises: g.exercices.filter(nom => !gears.length || gears.includes(devineMateriel(nom)))
    }))
    .filter(g => g.exercises.length);
}

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/** parse (AiProgramGenerator.kt) : réponse JSON de la fonction Edge ->
 *  { program, workouts }, prêt pour saveProgram/saveWorkout. */
function construireDraft(root, { level, daysPerWeek, weeks, weekdays, minuteOfDay, startMs }) {
  const name = (root.name || '').trim() || 'Programme personnalisé';

  const sessionsArr = Array.isArray(root.sessions) ? root.sessions : [];
  if (!sessionsArr.length) throw new Error('aucune séance reçue');
  const sessionDefs = sessionsArr.map((s, i) => {
    const title = (s.title || '').trim() || `Séance ${i + 1}`;
    const exercices = (Array.isArray(s.exercises) ? s.exercises : [])
      .map(e => (e?.name || '').trim()).filter(Boolean);
    return { title, category: (s.category || '').trim() || title, exercices };
  });

  const phasesArr = Array.isArray(root.phases) ? root.phases : [];
  if (!phasesArr.length) throw new Error('aucune phase reçue');
  const phases = phasesArr.map((p, i) => {
    const parSeance = (Array.isArray(p.sessions) ? p.sessions : []).map(s =>
      (Array.isArray(s?.exercises) ? s.exercises : []).map(e => ({
        sets: clamp(Math.round(e.sets ?? 3), 1, 10),
        reps: clamp(Math.round(e.reps ?? 8), 1, 30),
        recupSec: clamp(Math.round(e.recup_sec ?? 90), 15, 600)
      })));
    return {
      label: (p.label || '').trim() || `Bloc ${i + 1}`,
      debut: p.week_start ?? 1, fin: p.week_end ?? weeks,
      deload: !!p.deload, parSeance
    };
  });

  const CRENEAU_DEFAUT = { sets: 3, reps: 8, recupSec: 90 };
  const creneauPour = (phase, iSeance, iEx) => phase.parSeance[iSeance]?.[iEx] || CRENEAU_DEFAUT;
  const phaseDe = (semaine) => phases.find(p => semaine >= p.debut && semaine <= p.fin) || phases[phases.length - 1];

  const now = Date.now();
  const program = {
    id: now, name, goal: 'PERSONNALISE', level, weeks, daysPerWeek, createdAt: now,
    workoutIds: [], sessions: []
  };

  const premierePhase = phases[0];
  const workouts = sessionDefs.map((def, bi) => {
    const w = nouvelleSeance(def.title, def.category);
    w.id = now + bi;
    def.exercices.forEach((exName, ei) => {
      const creneau = creneauPour(premierePhase, bi, ei);
      const ex = nouvelExercice(exName);
      ex.plannedSets = creneau.sets; ex.targetReps = creneau.reps; ex.recupSec = creneau.recupSec;
      w.exercises.push(ex);
    });
    program.workoutIds.push(w.id);
    return w;
  });

  const jours = [...weekdays].sort((a, b) => WEEK_DAYS.indexOf(a) - WEEK_DAYS.indexOf(b));
  let seq = 0;
  for (let semaine = 1; semaine <= weeks; semaine++) {
    const phase = phaseDe(semaine);
    sessionDefs.forEach((def, bi) => {
      const dow = jours[bi] ?? jours[jours.length - 1] ?? 1;
      const premier = premierJourApres(startMs, dow, minuteOfDay);
      const date = plusJours(premier, 7 * (semaine - 1));
      const items = def.exercices.map((exName, ei) => {
        const creneau = creneauPour(phase, bi, ei);
        return {
          name: exName, sets: creneau.sets, reps: creneau.reps, recupSec: creneau.recupSec,
          hint: phase.deload ? 'Semaine de décharge — charges allégées'
            : `${phase.label} — poids conseillé pendant la séance, selon ton RIR`
        };
      });
      program.sessions.push({
        id: now + (++seq) * 1000, week: semaine, dateMs: date,
        workoutId: program.workoutIds[bi], title: def.title, category: def.category,
        deload: phase.deload, items, doneAt: 0, skipped: false, eventId: 0
      });
    });
  }
  program.sessions.sort((a, b) => a.dateMs - b.dateMs);
  return { program, workouts };
}

/** generate (AiProgramGenerator.kt) : appelle la fonction Edge, renvoie
 *  { draft: {program, workouts}, notes } ou lève une erreur explicite. */
export async function genererProgrammeIA({ goalText, level, daysPerWeek, weeks, gears, weekdays, minuteOfDay, startMs }) {
  const catalog = catalogueFiltre(gears);
  if (!catalog.length) throw new Error('Aucun exercice ne correspond au matériel choisi.');

  const { data, error } = await sb.functions.invoke('generate-program', {
    body: {
      goal_text: goalText, level, days_per_week: daysPerWeek, weeks,
      gears, catalog
    }
  });
  if (error) throw error;
  if (!data) throw new Error('Réponse vide du générateur.');

  let draft;
  try {
    draft = construireDraft(data, { level, daysPerWeek, weeks, weekdays, minuteOfDay, startMs });
  } catch (e) {
    throw new Error(`Programme reçu mais illisible (${e.message || 'format inattendu'}).`);
  }
  return { draft, notes: (data.notes || '').trim() };
}
