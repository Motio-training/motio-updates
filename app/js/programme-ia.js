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
     sortie  { name, notes,
               sessions:[{title,category,notes,
                          exercises:[{name,hold_sec?,hold_rest_sec?}]}],
               phases:[{label,week_start,week_end,deload,
                        sessions:[{exercises:[{sets,reps,recup_sec}]}]}] }

   `notes` — l'explication écrite par le coach, au niveau du programme ET de
   chaque séance. Elle est CONSERVÉE avec eux (Workout.notes, Program.notes),
   pas seulement montrée à la génération : c'est en semaine 5 qu'on se demande
   pourquoi le volume baisse. `hold_sec` — les positions tenues (étirement,
   gainage, équilibre, posture de yoga), qui sortent en mode MAINTIEN.
   ========================================================================== */

import { sb, currentUser } from './supabase.js';
import { GROUPES, devineMateriel } from './catalog.js';
import { nouvelleSeance, nouvelExercice, CIRCUIT_WORK_SEC } from './model.js';
import { toursPour, toursCircuitPour } from './coach-guide.js';
import { instantaneAthlete } from './athlete.js';

/** Jours de la semaine dans l'ordre français (lundi d'abord), avec la
 *  numérotation de Date.getDay() (0 = dimanche) — pas besoin de conversion
 *  pour dater les séances avec le Date natif du navigateur. */
export const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 0];
export const WEEK_DAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/** MINUTE_LIBRE (ProgramModel.kt) : l'heure à laquelle sont datées les séances
 *  d'un programme « dans la journée ». Midi plutôt que minuit — une séance
 *  datée à 0 h se lirait comme passée dès le matin. Elle n'est jamais
 *  affichée (Program.sansHeure). */
export const MINUTE_LIBRE = 12 * 60;

/** hourText (ProgramModel.kt) : « 18:30 », ou « dans la journée » quand aucune
 *  heure n'est imposée. */
export function heureTexte(sansHeure, minuteOfDay) {
  if (sansHeure) return 'dans la journée';
  return `${String(Math.floor(minuteOfDay / 60)).padStart(2, '0')}:${String(minuteOfDay % 60).padStart(2, '0')}`;
}

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

export function minuit(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }

/** firstDayOfWeekAfter (ProgramModel.kt) : première occurrence du jour de
 *  semaine `dow` à partir de `fromMs` (incluse), à l'heure minuteOfDay. */
export function premierJourApres(fromMs, dow, minuteOfDay) {
  const d = new Date(minuit(fromMs));
  let garde = 0;
  while (d.getDay() !== dow && garde < 7) { d.setDate(d.getDate() + 1); garde++; }
  d.setMinutes(d.getMinutes() + minuteOfDay);
  return d.getTime();
}

/** plusDays (ProgramModel.kt) : addition calendaire (setDate), pas une
 *  simple addition de millisecondes — reste correct au changement d'heure. */
export function plusJours(ms, jours) {
  const d = new Date(ms);
  d.setDate(d.getDate() + jours);
  return d.getTime();
}

/** catalogJson (AiProgramGenerator.kt) : catalogue filtré par matériel
 *  disponible, {group, exercises[]} — mêmes règles que le filtre du
 *  générateur maison, pour que l'IA ne propose jamais un exercice
 *  infaisable avec le matériel indiqué. */
export function catalogueFiltre(gears) {
  return GROUPES
    .map(g => ({
      group: g.nom,
      exercises: g.exercices.filter(nom => !gears.length || gears.includes(devineMateriel(nom)))
    }))
    .filter(g => g.exercises.length);
}

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/** Jours tels que Moti les écrit (contrat de generate-program, champ `day`). */
export const JOURS_IA = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

/** Filet de sécurité quand un exercice n'a pas de créneau correspondant dans
 *  une phase (réponse mal formée) : mieux vaut une valeur raisonnable qu'un
 *  programme inexploitable. */
const CRENEAU_DEFAUT = { sets: 3, reps: 8, recupSec: 90, name: '', mode: '', method: '', linkNext: false, holdSec: -1, holdRestSec: -1 };

/** readSession (AiProgramGenerator.kt) : la définition de RÉFÉRENCE d'une
 *  séance — celle dont les blocs s'écartent. */
function lireSeance(s, i) {
  const title = (s.title || '').trim() || `Séance ${i + 1}`;
  const exercices = (Array.isArray(s.exercises) ? s.exercises : [])
    .map(e => ({
      name: (e?.name || '').trim(),
      // 0 = exercice compté en répétitions, c'est l'immense majorité.
      holdSec: clamp(Math.round(e?.hold_sec ?? 0), 0, 600),
      holdRestSec: clamp(Math.round(e?.hold_rest_sec ?? 20), 0, 600),
      mode: '', method: '', linkNext: false
    }))
    .filter(e => e.name);
  const iJour = JOURS_IA.indexOf(String(s.day || '').trim().toLowerCase());
  return {
    title, category: (s.category || '').trim() || title,
    notes: (s.notes || '').trim(),
    day: iJour >= 0 ? WEEK_DAYS[iJour] : null,
    // Séance en circuit : les exercices deviennent des stations qui
    // s'enchaînent seules, sans charge ni répétitions (circuit.js).
    circuit: !!s.circuit,
    rounds: clamp(Math.round(s.rounds ?? 3), 1, 20),
    roundRestSec: clamp(Math.round(s.round_rest_sec ?? 60), 0, 600),
    exercices
  };
}

/** readPhase (AiProgramGenerator.kt) : un CYCLE, avec son nom, sa raison
 *  d'être, et ce qu'il change séance par séance. */
function lirePhase(p, i, borne) {
  const parSeance = (Array.isArray(p.sessions) ? p.sessions : []).map(s => ({
    title: (s?.title || '').trim(),
    notes: (s?.notes || '').trim(),
    // undefined quand la phase ne dit rien du circuit : on garde la référence.
    circuit: Object.prototype.hasOwnProperty.call(s || {}, 'circuit') ? !!s.circuit : undefined,
    rounds: clamp(Math.round(s?.rounds ?? 3), 1, 20),
    roundRestSec: clamp(Math.round(s?.round_rest_sec ?? 60), 0, 600),
    creneaux: (Array.isArray(s?.exercises) ? s.exercises : []).map(e => ({
      sets: clamp(Math.round(e.sets ?? 3), 1, 10),
      reps: clamp(Math.round(e.reps ?? 8), 1, 30),
      recupSec: clamp(Math.round(e.recup_sec ?? 90), 15, 600),
      /* Ce qu'un BLOC peut redéfinir (v2.84) : le mouvement lui-même, son
         format de chronométrage, sa méthode d'intensification et son
         enchaînement en supersérie avec le suivant. C'est ce qui fait qu'un
         cycle de force et un cycle de volume ne se ressemblent pas. */
      name: (e.name || '').trim(),
      mode: (e.mode || '').trim(),
      method: (e.method || '').trim().slice(0, 60),
      linkNext: !!e.link_next,
      // -1 = la phase ne donne pas de durée, celle de la référence tient.
      holdSec: e.hold_sec === undefined || e.hold_sec === null ? -1 : clamp(Math.round(e.hold_sec), 0, 600),
      holdRestSec: e.hold_rest_sec === undefined || e.hold_rest_sec === null ? -1 : clamp(Math.round(e.hold_rest_sec), 0, 600)
    }))
  }));
  return {
    label: (p.label || '').trim() || `Bloc ${i + 1}`,
    goal: (p.goal || '').trim(),
    debut: clamp(Math.round(p.week_start ?? 1), 1, 52),
    fin: clamp(Math.round(p.week_end ?? borne), 1, 52),
    deload: !!p.deload,
    parSeance
  };
}

/** effective (AiProgramGenerator.kt) : la séance telle qu'elle se fait DANS CE
 *  BLOC — la référence, corrigée de ce que la phase redéfinit. Une phase qui
 *  ne redéfinit rien rend la référence inchangée, et c'est le cas de toute
 *  réponse d'avant la v2.84. */
function effective(base, ps) {
  if (!ps) return base;
  const n = Math.max(base.exercices.length, ps.creneaux.length);
  const exercices = [];
  for (let i = 0; i < n; i++) {
    const cr = ps.creneaux[i];
    const b = base.exercices[i];
    const nom = (cr && cr.name) || (b && b.name) || '';
    if (!nom) continue;
    /* Un exercice qui en REMPLACE un autre ne garde pas ses durées :
       « 30 s de maintien » n'a aucun sens repris sur un squat. */
    const remplace = !!b && nom.toLowerCase() !== b.name.toLowerCase();
    exercices.push({
      name: nom,
      holdSec: cr && cr.holdSec >= 0 ? cr.holdSec : (remplace ? 0 : (b ? b.holdSec : 0)),
      holdRestSec: cr && cr.holdRestSec >= 0 ? cr.holdRestSec : (b ? b.holdRestSec : 20),
      mode: (cr && cr.mode) || '',
      method: (cr && cr.method) || '',
      linkNext: !!(cr && cr.linkNext)
    });
  }
  const circuit = ps.circuit === undefined ? base.circuit : ps.circuit;
  return {
    ...base,
    title: ps.title || base.title,
    notes: ps.notes || base.notes,
    circuit,
    rounds: ps.circuit === true ? ps.rounds : base.rounds,
    roundRestSec: ps.circuit === true ? ps.roundRestSec : base.roundRestSec,
    exercices
  };
}

/** signature (AiProgramGenerator.kt) : ce qui distingue deux MODÈLES de
 *  séance — le nom, le format, les mouvements. Volontairement pas les séries
 *  ni les répétitions, qui vivent dans le planning : deux blocs qui ne
 *  diffèrent que par le volume partagent donc le même modèle. */
function signature(d) {
  return [d.title, d.category, d.circuit, d.rounds, d.roundRestSec]
    .concat(d.exercices.map(e => [e.name, e.mode.toUpperCase(), e.holdSec, e.holdRestSec, e.linkNext].join('~')))
    .join('|');
}

function maintienPour(ex, creneau) {
  /* Filet posé côté application : un exercice unilatéral réclame un nombre
     PAIR de tours, un par côté. Il suffit que le modèle l'oublie une fois pour
     qu'une séance entière se fasse d'un seul côté. */
  const tours = toursPour(ex.name, creneau.sets);
  const e = nouvelExercice(ex.name);
  e.mode = 'MAINTIEN';
  e.plannedSets = tours; e.targetReps = 0;
  e.recupSec = ex.holdRestSec;
  e.workSec = ex.holdSec > 0 ? ex.holdSec : 30;
  e.restSec = ex.holdRestSec;
  e.tabataSeries = tours;
  return e;
}

/** exerciseFor (AiProgramGenerator.kt) : l'exercice du modèle, dans le format
 *  que le bloc lui donne. */
function exercicePour(def, ex, creneau) {
  const e = nouvelExercice(ex.name);
  if (def.circuit) {
    /* Station de circuit : l'effort se mesure en secondes, le reste (tours,
       ordre) appartient au circuit. */
    e.mode = 'MAINTIEN';
    e.plannedSets = 1; e.targetReps = 0;
    e.recupSec = ex.holdRestSec;
    e.workSec = ex.holdSec > 0 ? ex.holdSec : CIRCUIT_WORK_SEC;
    e.restSec = ex.holdRestSec;
    e.tabataSeries = 1;
    return e;
  }
  switch (ex.mode.toUpperCase()) {
    // En EMOM l'intervalle EST la récupération : une minute par défaut, c'est
    // ce que le nom du format annonce.
    case 'EMOM':
      e.mode = 'EMOM';
      e.plannedSets = creneau.sets; e.targetReps = creneau.reps;
      e.workSec = ex.holdSec > 0 ? ex.holdSec : 60;
      e.recupSec = creneau.recupSec;
      return e;
    case 'TABATA':
      e.mode = 'TABATA';
      e.plannedSets = creneau.sets; e.targetReps = 0;
      e.recupSec = creneau.recupSec;
      e.workSec = ex.holdSec > 0 ? ex.holdSec : 20;
      e.restSec = ex.holdRestSec > 0 ? ex.holdRestSec : 10;
      e.tabataSeries = creneau.sets;
      return e;
    case 'MAINTIEN':
      return maintienPour(ex, creneau);
    default:
      if (ex.holdSec > 0) return maintienPour(ex, creneau);
      e.plannedSets = creneau.sets;
      e.targetReps = creneau.reps;
      e.recupSec = creneau.recupSec;
      return e;
  }
}

/** buildWorkout (AiProgramGenerator.kt). */
function construireModele(id, def, creneaux, notesProgramme, section) {
  const w = nouvelleSeance(def.title, def.category);
  w.id = id;
  /* L'explication de CETTE séance ; à défaut, celle du programme entier — une
     séance générée seule (genererSeanceIA, weeks = 1) n'a que celle-là, et
     repartir les mains vides serait le manque qu'on comble. */
  w.notes = def.notes || notesProgramme;
  // Le nom du cycle regroupe les séances du bloc à l'accueil (Workout.section).
  w.section = section;
  w.circuit = def.circuit;
  w.rounds = def.rounds;
  w.roundRestSec = def.roundRestSec;
  def.exercices.forEach((ex, ei) => {
    w.exercises.push(exercicePour(def, ex, creneaux[ei] || CRENEAU_DEFAUT));
  });
  /* SUPERSÉRIES : un exercice marqué « enchaîné » partage son identifiant de
     bloc avec le suivant (Exercise.groupId). Sans objet en circuit, où tout
     s'enchaîne déjà. */
  if (!def.circuit) {
    let groupe = 0;
    def.exercices.forEach((ex, ei) => {
      if (!ex.linkNext || ei >= w.exercises.length - 1) return;
      const g = w.exercises[ei].groupId || ++groupe;
      w.exercises[ei].groupId = g;
      w.exercises[ei + 1].groupId = g;
    });
  }
  // Un circuit d'un seul tour comportant une station unilatérale ne ferait
  // qu'un côté : on en impose deux (voir coach-guide.js).
  if (w.circuit) w.rounds = toursCircuitPour(w.exercises.map(e => e.name), w.rounds);
  return w;
}

/** hintFor (AiProgramGenerator.kt) : la consigne affichée sous l'exercice,
 *  dans le planning comme pendant la séance. Elle porte le nom du cycle — ce
 *  qui rappelle, en semaine 7, dans quel bloc on est — et la méthode
 *  d'intensification quand le bloc en impose une : c'est là qu'elle a une
 *  chance d'être lue. */
function consigne(phase, def, ex) {
  if (phase.deload) {
    return ex.method ? `Décharge — ${ex.method}` : 'Semaine de décharge — charges allégées';
  }
  let corps;
  if (ex.method) corps = ex.method;
  else if (def.circuit) corps = `circuit, ${def.rounds} tours`;
  else if (ex.holdSec > 0 || ex.mode.toUpperCase() === 'MAINTIEN') corps = 'tenir la position sans forcer';
  else corps = 'poids conseillé pendant la séance, selon ton RIR';
  return `${phase.label} — ${corps}`;
}

/** parse (AiProgramGenerator.kt) : réponse JSON de la fonction Edge ->
 *  { program, workouts }, prêt pour saveProgram/saveWorkout.
 *
 *  `modifie` : réponse à une demande de MODIFICATION d'un programme existant
 *  (programme-edition.js). Le jour de chaque séance vient alors de Moti
 *  (champ `day`) et la durée du programme de ses phases — il a pu ajouter une
 *  séance ou allonger le programme à la demande.
 *
 *  `weeks` à 0 : durée laissée à Moti, lue elle aussi dans les phases.
 *  `sansHeure` : séances « dans la journée », datées à midi mais sans heure
 *  affichée (Program.sansHeure, ProgramModel.kt). */
export function construireDraft(root, { level, daysPerWeek, weeks, weekdays, minuteOfDay, startMs, modifie = false, sansHeure = false }) {
  const name = (root.name || '').trim() || 'Programme personnalisé';

  const sessionsArr = Array.isArray(root.sessions) ? root.sessions : [];
  if (!sessionsArr.length) throw new Error('aucune séance reçue');
  const sessionDefs = sessionsArr.map(lireSeance);

  const phasesArr = Array.isArray(root.phases) ? root.phases : [];
  if (!phasesArr.length) throw new Error('aucune phase reçue');
  const borne = weeks > 0 ? weeks : 24;
  const phases = phasesArr
    .map((p, i) => lirePhase(p, i, borne))
    .sort((a, b) => a.debut - b.debut);

  const semaines = modifie || weeks <= 0
    ? clamp(Math.max(...phases.map(p => p.fin)), 1, 52)
    : weeks;

  const now = Date.now();
  const notes = (root.notes || '').trim();
  const program = {
    id: now, name, goal: 'PERSONNALISE', level, weeks: semaines,
    daysPerWeek: modifie ? sessionDefs.length : daysPerWeek, createdAt: now,
    workoutIds: [], sessions: [], notes, sansHeure,
    /* LES CYCLES du programme (ProgramBlock, ProgramModel.kt) : leur nom et la
       raison de leur présence, affichés en tête de bloc dans le planning.
       C'est ce qui fait voir que le programme est périodisé et pas recopié. */
    blocks: phases.filter(p => p.debut <= semaines).map(p => ({
      label: p.label, goal: p.goal,
      weekStart: clamp(p.debut, 1, semaines),
      weekEnd: clamp(p.fin, 1, semaines),
      deload: p.deload
    }))
  };

  /* UN MODÈLE DE SÉANCE PAR BLOC — mais seulement quand le bloc change vraiment
     quelque chose. Deux blocs qui ne diffèrent que par le volume se partagent
     le même modèle, donc un programme sans variation d'exercices tient
     toujours en `daysPerWeek` modèles, comme avant la v2.84. */
  const defs = new Map();          // "phase:séance" -> définition du bloc
  const ids = new Map();           // "phase:séance" -> identifiant du modèle
  const parSignature = new Map();
  const partages = new Set();
  const titresPris = new Set();
  const workouts = [];
  let prochainId = now;
  const plusieursBlocs = phases.length > 1;

  phases.forEach((phase, pi) => {
    sessionDefs.forEach((base, si) => {
      const cle = `${pi}:${si}`;
      const eff = effective(base, phase.parSeance[si]);
      const sig = `${si}|${signature(eff)}`;
      const deja = parSignature.get(sig);
      if (deja !== undefined) {
        ids.set(cle, deja);
        partages.add(deja);
        defs.set(cle, { ...eff, title: workouts.find(w => w.id === deja).name });
        return;
      }
      /* Deux blocs peuvent donner le même nom à des séances différentes : le
         nom du cycle les distingue, sans quoi la reprise d'un programme ne
         saurait plus les apparier (fusionnerIA, programme-edition.js). */
      let titre = eff.title;
      if (plusieursBlocs && titresPris.has(titre.toLowerCase())) titre = `${titre} — ${phase.label}`;
      else titresPris.add(titre.toLowerCase());
      const w = construireModele(
        prochainId++, { ...eff, title: titre },
        (phase.parSeance[si] || {}).creneaux || [], notes,
        plusieursBlocs ? phase.label : ''
      );
      workouts.push(w);
      parSignature.set(sig, w.id);
      ids.set(cle, w.id);
      defs.set(cle, { ...eff, title: titre });
    });
  });
  // Un modèle que plusieurs blocs se partagent n'appartient à aucun : il ne
  // porte donc pas de nom de cycle dans le carnet.
  workouts.filter(w => partages.has(w.id)).forEach(w => { w.section = ''; });
  program.workoutIds = workouts.map(w => w.id);

  const jours = [...weekdays].sort((a, b) => WEEK_DAYS.indexOf(a) - WEEK_DAYS.indexOf(b));
  /* Jour de chaque séance. À la création : les jours cochés, dans l'ordre. En
     modification : celui que Moti a donné, et à défaut le premier jour encore
     libre de la semaine. */
  let dows;
  if (modifie) {
    const pris = new Set(sessionDefs.map(d => d.day).filter(d => d !== null));
    dows = sessionDefs.map(def => {
      if (def.day !== null) return def.day;
      const libre = WEEK_DAYS.find(d => !pris.has(d)) ?? 1;
      pris.add(libre);
      return libre;
    });
  } else {
    dows = sessionDefs.map((_, bi) => jours[bi] ?? jours[jours.length - 1] ?? 1);
  }

  // « Dans la journée » : il faut bien une heure pour trier un planning, c'est
  // midi, mais elle ne s'affiche jamais (MINUTE_LIBRE, ProgramModel.kt).
  const minute = sansHeure ? MINUTE_LIBRE : minuteOfDay;
  let seq = 0;
  for (let semaine = 1; semaine <= semaines; semaine++) {
    let pi = phases.findIndex(p => semaine >= p.debut && semaine <= p.fin);
    if (pi < 0) pi = phases.length - 1;
    const phase = phases[pi];
    sessionDefs.forEach((_, si) => {
      const cle = `${pi}:${si}`;
      const def = defs.get(cle);
      const wid = ids.get(cle);
      if (!def || wid === undefined) return;
      const modele = workouts.find(w => w.id === wid);
      const creneaux = (phase.parSeance[si] || {}).creneaux || [];
      const tours = modele ? modele.rounds : def.rounds;
      const premier = premierJourApres(startMs, dows[si], minute);
      const date = plusJours(premier, 7 * (semaine - 1));
      const items = def.exercices.map((ex, ei) => {
        const creneau = creneaux[ei] || CRENEAU_DEFAUT;
        // L'EMOM se compte en répétitions : sa durée est l'intervalle, pas un
        // maintien.
        const emom = ex.mode.toUpperCase() === 'EMOM';
        const chrono = ex.mode.toUpperCase() === 'MAINTIEN' || ex.mode.toUpperCase() === 'TABATA';
        const tenu = !emom && (def.circuit || chrono || ex.holdSec > 0);
        let duree;
        if (emom) duree = 0;
        else if (def.circuit && !ex.holdSec) duree = CIRCUIT_WORK_SEC;
        else if (tenu && ex.holdSec <= 0) duree = ex.mode.toUpperCase() === 'TABATA' ? 20 : 30;
        else duree = ex.holdSec;
        return {
          // En circuit, le « nombre de séries » d'une station EST le nombre de
          // tours : c'est autant de fois qu'on y repassera.
          name: ex.name, sets: def.circuit ? tours : creneau.sets,
          reps: tenu ? 0 : creneau.reps,
          recupSec: tenu ? ex.holdRestSec : creneau.recupSec,
          hint: consigne(phase, def, ex),
          holdSec: duree
        };
      });
      program.sessions.push({
        id: now + (++seq) * 1000, week: semaine, dateMs: date,
        workoutId: wid,
        title: modele ? modele.name : def.title,
        category: modele ? modele.category : def.category,
        deload: phase.deload, items, doneAt: 0, skipped: false, eventId: 0
      });
    });
  }
  program.sessions.sort((a, b) => a.dateMs - b.dateMs);
  return { program, workouts };
}

/** generate (AiProgramGenerator.kt) : appelle la fonction Edge, renvoie
 *  { draft: {program, workouts}, notes } ou lève une erreur explicite. */
export async function genererProgrammeIA({
  goalText, level, daysPerWeek, weeks, gears, weekdays, minuteOfDay, startMs,
  /* `weeks` à 0 : c'est Moti qui décide de la durée, d'après l'objectif.
     `targetDate` : une échéance (compétition, course, test) vers laquelle le
     programme doit amener, affûtage compris. */
  targetDate = '', sansHeure = false
}) {
  const catalog = catalogueFiltre(gears);
  if (!catalog.length) throw new Error('Aucun exercice ne correspond au matériel choisi.');

  // CE QUI REND LE PROGRAMME NON GÉNÉRIQUE. Sans cet instantané, la fonction
  // ne connaît que l'objectif et le niveau déclaré : elle écrit des séries et
  // des répétitions justes, mais elle DEVINE les charges et ignore ce qui est
  // réellement pratiqué. Jamais bloquant : mieux vaut une génération un peu
  // moins informée qu'une génération qui échoue.
  let athlete = '';
  try {
    const moi = await currentUser();
    if (moi) athlete = await instantaneAthlete(moi);
  } catch { /* on génère quand même */ }

  const { data, error } = await sb.functions.invoke('generate-program', {
    body: {
      goal_text: goalText, level, days_per_week: daysPerWeek, weeks,
      gears, catalog, athlete_context: athlete,
      ...(targetDate ? { target_date: targetDate } : {})
    }
  });
  if (error) throw await motifLisible(error);
  if (!data) throw new Error('Réponse vide du générateur.');

  let draft;
  try {
    draft = construireDraft(data, { level, daysPerWeek, weeks, weekdays, minuteOfDay, startMs, sansHeure });
  } catch (e) {
    throw new Error(`Programme reçu mais illisible (${e.message || 'format inattendu'}).`);
  }
  return { draft, notes: (data.notes || '').trim() };
}

/**
 * Génération d'UNE séance isolée par IA — pas de programme ni de
 * planification, juste un modèle prêt à être relu et modifié. C'est ce que
 * déclenche le bouton « Générer une séance », côté natif comme ici, quand
 * l'abonnement est actif et la description remplie ; sinon le même bouton
 * retombe sur le générateur local à règles fixes (generateur-local.js) —
 * voir `ouvrirGenerationSeance` (entrainement.js).
 * Sous le capot : la même fonction Edge `generate-program`, appelée avec
 * weeks=1/daysPerWeek=1 ; on ne garde que le premier workout du résultat et
 * on jette tout ce qui est planification (program/sessions datées).
 */
export async function genererSeanceIA({ goalText, level, gears, category = '' }) {
  const now = new Date();
  /* Le type de séance choisi dans la fenêtre (Full body, Push…) n'a pas de
     champ à lui dans le contrat de la fonction Edge : il part dans la demande,
     à l'identique du natif (AiProgramGenerator.generateOne). */
  const demande = category ? `${goalText}\n(Une seule séance, de type « ${category} ».)` : goalText;
  const { draft, notes } = await genererProgrammeIA({
    goalText: demande, level, daysPerWeek: 1, weeks: 1, gears,
    weekdays: [now.getDay()], minuteOfDay: now.getHours() * 60 + now.getMinutes(),
    startMs: now.getTime()
  });
  const workout = draft.workouts[0];
  if (!workout) throw new Error('Aucune séance reçue.');
  return { workout, notes };
}

/**
 * supabase-js masque le corps des réponses non-2xx d'une fonction Edge : sans
 * cela l'utilisateur lit « Edge Function returned a non-2xx status code » au
 * lieu du motif réel — « réservé aux abonnés », par exemple. On rouvre la
 * réponse pour en extraire le message.
 */
export async function motifLisible(error) {
  try {
    const corps = await error?.context?.json?.();
    if (corps?.error) return new Error(corps.error);
  } catch { /* corps illisible : on garde le message d'origine */ }
  return error instanceof Error ? error : new Error(String(error));
}
