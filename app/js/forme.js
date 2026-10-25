/* ==========================================================================
   MÉTÉO DE LA FORME — pendant web de Forme.kt, SANS Health Connect (une page
   web n'y a pas accès) : la réponse du matin et le ressenti de la dernière
   séance. Même barème, mêmes niveaux, même allègement des charges conseillées
   (charge.js), toujours dit avec sa raison — choix de Nicolas : « alléger et
   expliquer ».
   ========================================================================== */

const CLE_REPONSE = 'motio.forme-reponse';     // { jour, valeur } — 0 en forme, 1 moyen, 2 fatigué
const CLE_RESSENTI = 'motio.forme-ressenti';   // { quand, mood } — dernière séance, mood 1 à 5

const minuit = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const lire = (cle) => { try { return JSON.parse(localStorage.getItem(cle) || 'null'); } catch { return null; } };
const ecrire = (cle, v) => { try { localStorage.setItem(cle, JSON.stringify(v)); } catch { /* stockage refusé */ } };

export const NIVEAUX = {
  BONNE: { label: 'Bonne forme', facteur: 1.0, classe: 'bonne' },
  MOYENNE: { label: 'Forme moyenne', facteur: 0.95, classe: 'moyenne' },
  BASSE: { label: 'Forme basse', facteur: 0.90, classe: 'basse' }
};

export function repondre(valeur) {
  ecrire(CLE_REPONSE, { jour: minuit(Date.now()), valeur: Math.min(2, Math.max(0, valeur)) });
}

/** Le ressenti noté à la fin de la séance la plus récente (l'écran
 *  Entraînement le relève à chaque passage dans l'historique des séances). */
export function noterRessenti(quand, mood) {
  if (!(mood > 0)) return;
  const avant = lire(CLE_RESSENTI);
  if (!avant || quand >= avant.quand) ecrire(CLE_RESSENTI, { quand, mood });
}

export function formeDuJour() {
  let points = 0;
  const raisons = [];
  const mesures = [];
  const r = lire(CLE_RESSENTI);
  if (r && Date.now() - r.quand < 48 * 3600 * 1000) {
    if (r.mood === 1) { points += 2; raisons.push('dernière séance épuisante'); }
    if (r.mood === 2) { points += 1; raisons.push('fatigué à la dernière séance'); }
    mesures.push(`Dernière séance ${['', '😩', '😕', '😐', '🙂', '💪'][r.mood] || ''}`);
  }
  const rep = lire(CLE_REPONSE);
  const reponse = rep && rep.jour === minuit(Date.now()) ? rep.valeur : -1;
  if (reponse === 1) { points += 1; raisons.push('tu te sens moyen'); }
  if (reponse === 2) { points += 2; raisons.push('tu te sens fatigué'); }
  const niveau = points >= 4 ? NIVEAUX.BASSE : points >= 2 ? NIVEAUX.MOYENNE : NIVEAUX.BONNE;
  return {
    ...niveau, raisons, mesures, reponse,
    allegement: `forme du jour ${niveau === NIVEAUX.BASSE ? 'basse' : 'moyenne'} (${raisons.join(', ')}), charge allégée de ${Math.round((1 - niveau.facteur) * 100)} %`
  };
}
