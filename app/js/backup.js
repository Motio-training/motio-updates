/* ==========================================================================
   Sauvegarde par fichier — port de Profile.kt::buildBackupJson/
   restoreBackupJson. Différence de fond avec le natif : là-bas le carnet vit
   d'abord en local (fichiers dans filesDir) et la sauvegarde cloud est une
   copie annexe ; ici tout vit déjà dans Supabase, donc « exporter » prend un
   instantané du compte et « importer » fusionne le contenu du fichier dans
   le compte — mêmes upserts que saveWorkout/saveProgram (onConflict sur
   user_id+local_id), qui donnent gratuitement la même règle de fusion que le
   natif : un id déjà présent est remplacé, un id nouveau est ajouté, rien
   n'est perdu.

   Mêmes clés de premier niveau que le fichier natif (version, categories,
   workouts, backupVersion, profile, programs) sauf poids/taille/catalogue,
   qui n'ont pas d'équivalent web — un fichier généré ici reste lisible par
   restoreBackupJson côté Android (champs inconnus simplement ignorés), et
   réciproquement un fichier natif s'importe ici (weight/height/catalog
   ignorés, sans erreur).
   ========================================================================== */

export function buildBackupJson({ workouts, programs, trainingLevel, trainingGoal }) {
  const categories = [...new Set(workouts.map(w => w.category).filter(Boolean))];
  const root = {
    version: 1,
    categories,
    workouts,
    backupVersion: 2,
    profile: { trainingLevel: trainingLevel || null, trainingGoal: trainingGoal || null },
    programs
  };
  return JSON.stringify(root, null, 2);
}

/** Fichier -> { workouts, programs, trainingLevel, trainingGoal }, ou null
 *  si le texte n'est même pas du JSON. Tolérant comme le natif : un champ
 *  absent (vieille sauvegarde, ou fichier natif sans profil web) ne fait pas
 *  échouer le reste. */
export function parseBackupJson(text) {
  let root;
  try { root = JSON.parse(text); } catch { return null; }
  if (!root || typeof root !== 'object') return null;
  const profil = root.profile || {};
  return {
    workouts: Array.isArray(root.workouts) ? root.workouts : [],
    programs: Array.isArray(root.programs) ? root.programs : [],
    trainingLevel: profil.trainingLevel || null,
    trainingGoal: profil.trainingGoal || null
  };
}
