/* ==========================================================================
   CE QUE MOTI SAIT DE L'ATHLÈTE — l'instantané envoyé avec chaque demande.

   Port de CoachChat.kt::snapshot (C:\chrono). Reconstruit à chaque envoi,
   jamais mis en cache : c'est ce qui distingue un coach qui connaît
   réellement l'utilisateur d'un assistant générique.

   Deux usages, un seul texte : le chat (views/coach.js) et la GÉNÉRATION DE
   PROGRAMME (programme-ia.js). Sans lui, la génération ne connaît que
   l'objectif et le niveau déclaré : elle écrit des séries et des répétitions
   justes, mais elle DEVINE les charges et ignore ce qui est réellement
   pratiqué — c'est exactement ce qui rendait les programmes génériques.

   L'historique détaillé vient du champ `details` des séances partagées, le
   même que celui qui alimente la charge conseillée (charge.js) : rien de
   nouveau ne part sur le réseau, on se contente de résumer ce qui est déjà là.
   ========================================================================== */

import { getProfile, sessionsOf, listPrograms } from './api.js';
import { historiqueDesExercices, rmConnus } from './charge.js';
import { tousOneRmManuels } from './reglages.js';

/** « il y a 3 jours », « hier », « aujourd'hui ». */
function relDate(ms) {
  const jours = Math.round((Date.now() - ms) / 86400000);
  if (jours <= 0) return "aujourd'hui";
  if (jours === 1) return 'hier';
  if (jours < 7) return `il y a ${jours} jours`;
  const sem = Math.round(jours / 7);
  return sem === 1 ? 'il y a 1 semaine' : `il y a ${sem} semaines`;
}

function kg(v) {
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ',');
}

/**
 * L'instantané, en texte. Chaque bloc est facultatif : un carnet vide donne
 * un texte court mais valide, et aucune panne de lecture ne doit empêcher
 * l'envoi — d'où les try/catch, un coach sans contexte vaut mieux que pas de
 * coach du tout.
 */
export async function instantaneAthlete(moi) {
  const lignes = [];
  const now = new Date();
  lignes.push(
    `Date et heure actuelles : ${now.toLocaleDateString('fr-FR')} à ` +
    `${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
  );

  try {
    const p = await getProfile(moi.id);
    lignes.push(`Prénom/pseudo : ${p?.display_name || p?.username || 'cet utilisateur'}`);
  } catch { /* pas bloquant */ }

  try {
    const prog = (await listPrograms(moi.id))[0];
    if (prog?.data) {
      const d = prog.data;
      const total = (d.sessions || []).length;
      // Même prédicat que l'écran Programmes : une séance est faite quand
      // elle porte une date de réalisation.
      const faites = (d.sessions || []).filter(s => (s.doneAt || 0) > 0).length;
      lignes.push(`Programme en cours : « ${d.name || 'Programme'} », ${faites}/${total} séances faites.`);
    } else {
      lignes.push('Aucun programme actif actuellement.');
    }
  } catch { /* pas bloquant */ }

  let seances = [];
  try { seances = await sessionsOf(moi.id, { limit: 200 }); } catch { /* pas bloquant */ }

  if (seances.length) {
    lignes.push('Dernières séances réalisées :');
    seances.slice(0, 5).forEach(s => {
      const durMin = Math.round((s.duration_ms || 0) / 60000);
      lignes.push(`- ${s.workout_name || 'Séance'}, ${relDate(new Date(s.started_at).getTime())}, ${durMin} min`);
    });
  } else {
    lignes.push("Aucune séance enregistrée pour l'instant.");
  }

  // FRÉQUENCE CONSTATÉE, pas déclarée. « Trois séances par semaine » coché
  // dans un assistant ne dit rien de ce qui est réellement fait : c'est
  // l'écart entre les deux qui permet de calibrer un volume tenable.
  const il28 = Date.now() - 28 * 86400000;
  const recentes = seances.filter(s => new Date(s.started_at).getTime() >= il28);
  if (recentes.length) {
    lignes.push(
      `Fréquence réelle des 4 dernières semaines : ${recentes.length} séances, ` +
      `soit ${(recentes.length / 4).toFixed(1).replace('.', ',')} par semaine.`
    );
  }

  // CHARGES DE TRAVAIL RÉELLES, exercice par exercice : la donnée qui sépare
  // un programme calibré d'un programme deviné.
  const histo = historiqueDesExercices(seances);
  if (histo.size) {
    const parRecence = [...histo.entries()]
      .sort((a, b) => (b[1][0]?.quand || 0) - (a[1][0]?.quand || 0))
      .slice(0, 15);
    lignes.push("Dernière charge de travail par exercice (ce sur quoi il travaille vraiment en ce moment) :");
    for (const [nom, seancesEx] of parRecence) {
      const derniere = seancesEx[0];
      const top = derniere.sets.reduce((a, b) => (b.weight > a.weight ? b : a));
      const rir = top.rir >= 0 ? `, RIR ${top.rir}` : '';
      lignes.push(`- ${nom} : ${kg(top.weight)} kg × ${top.reps}${rir} (${relDate(derniere.quand)})`);
    }

    const noms = [...histo.keys()];
    lignes.push(`Exercices déjà pratiqués au moins une fois (${noms.length}) : ${noms.slice(0, 40).join(', ')}.`);

    // rmConnus mélange volontairement estimations et 1RM saisis à la main :
    // on retire ici les seconds, qui ont leur propre section plus bas et ne
    // doivent pas être présentés comme des estimations.
    const manuelsMap = tousOneRmManuels();
    const rms = [...rmConnus(histo).entries()]
      .filter(([nom]) => !(manuelsMap[nom] > 0))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    if (rms.length) {
      lignes.push('Meilleurs 1RM estimés (calculés à partir des séries réalisées) :');
      rms.forEach(([nom, v]) => lignes.push(`- ${nom} : ${kg(v)} kg`));
    }
  }

  /* 1RM réellement testés (saisis dans Analyse et records) : la donnée la plus
     fiable pour calibrer des charges — à distinguer explicitement des 1RM
     estimés par formule, qui sous-estiment presque toujours un vrai maxi. */
  const manuels = Object.entries(tousOneRmManuels()).filter(([, v]) => v > 0);
  if (manuels.length) {
    lignes.push("1RM réellement testés (valeurs saisies par l'utilisateur, plus fiables que toute estimation) :");
    manuels.forEach(([exercice, v]) => lignes.push(`- ${exercice} : ${kg(v)} kg`));
  }

  return lignes.join('\n');
}
