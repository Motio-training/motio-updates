/* ==========================================================================
   Séance en cours — persistance locale (RunStatePersist.kt côté natif).

   Sans ça, quitter l'écran de séance (aller voir le fil, le profil, ou
   simplement recharger la page) perdait tout : séries déjà faites, chrono
   global, exercice courant. Signalé par Nicolas : « je retombe sur la page
   principale entraînement et non pas sur la séance en cours, l'entraînement
   s'était réinitialisé ».

   Tout est écrit dans localStorage à chaque seconde de séance (le tick du
   chrono global suffit — il tourne déjà). Les temps sont des horodatages
   ABSOLUS (epoch), jamais des durées restantes : un décompte de récupération
   reprend donc pile où il en était, même après un rechargement complet, sans
   qu'on ait à rattraper le temps passé hors écran. Même choix que côté natif
   (SessionEngine.EngineState).

   L'état est jeté au-delà de PEREMPTION_MS : une séance oubliée la veille ne
   doit pas ressurgir le lendemain comme si elle continuait.
   ========================================================================== */

const CLE = 'motio.seance-en-cours';
const PEREMPTION_MS = 12 * 3600 * 1000;

/** État brut, sans contrôle d'utilisateur — pour la barre du bas, qui doit
 *  savoir en synchrone s'il faut pointer vers la séance plutôt que la liste. */
export function etatBrut() {
  try {
    const s = localStorage.getItem(CLE);
    if (!s) return null;
    const etat = JSON.parse(s);
    if (!etat?.workoutId || !etat.savedAt) return null;
    if (Date.now() - etat.savedAt > PEREMPTION_MS) { effacerEtat(); return null; }
    return etat;
  } catch { return null; }
}

/** État de CET utilisateur pour CETTE séance, ou null. */
export function lireEtat(userId, workoutId) {
  const etat = etatBrut();
  if (!etat) return null;
  if (etat.userId !== userId) { effacerEtat(); return null; }
  if (String(etat.workoutId) !== String(workoutId)) return null;
  return etat;
}

export function ecrireEtat(etat) {
  try { localStorage.setItem(CLE, JSON.stringify({ ...etat, savedAt: Date.now() })); }
  catch { /* quota plein ou stockage refusé : la séance continue quand même */ }
}

export function effacerEtat() {
  try { localStorage.removeItem(CLE); } catch { /* rien à faire */ }
}
