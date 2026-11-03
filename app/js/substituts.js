/* ==========================================================================
   REMPLACER UN EXERCICE PAR UN AUTRE QUI LUI RESSEMBLE (v87) — portage de
   Substituts.kt. Les deux doivent dire la même chose.

   La machine est prise, le banc occupé : on ne veut pas parcourir tout le
   catalogue, on veut deux ou trois exercices qui font le même travail.

   LA RESSEMBLANCE mêle trois choses, de la plus lourde à la plus légère :
    - les MUSCLES travaillés (muscle-lexicon.js) : similarité cosinus entre les
      deux vecteurs de zones, et seuil d'entrée — en dessous de SEUIL_MUSCLES un
      exercice n'est jamais proposé ;
    - le NOM : les mots partagés hors matériel. « Développé couché haltères »
      ressemble plus à « Développé couché barre » qu'à « Dips » ;
    - le MATÉRIEL : à ressemblance égale, le même matériel passe devant — mais
      seulement à égalité : si la barre est prise, les haltères sont
      justement ce qu'on cherche.

   Exemple voulu : développé couché barre → développé couché haltères,
   développé incliné barre, développé incliné haltères.
   ========================================================================== */

import { musNorm, musclesDuLexique } from './muscle-lexicon.js';
import { devineMateriel, tousLesExercices } from './catalog.js';

const SEUIL_MUSCLES = 0.60;
const P_MUSCLES = 0.55;
const P_NOM = 0.35;
const P_MATERIEL = 0.10;

const MOTS_VIDES = new Set(['a', 'au', 'aux', 'de', 'du', 'des', 'la', 'le', 'les', 'en', 'et', 'avec', 'sur', 'un', 'une', 'd', 'l']);
const MOTS_MATERIEL = new Set(['barre', 'haltere', 'poulie', 'machine', 'smith', 'ez', 'kettlebell', 'kb', 'elastique', 'bande']);

/** Les mots qui DISENT l'exercice : sans accents, sans pluriel, sans matériel. */
function mots(nom) {
  return new Set(
    musNorm(nom).trim().split(' ')
      .filter(m => m && !MOTS_VIDES.has(m))
      .map(m => (m.length > 3 && m.endsWith('s') ? m.slice(0, -1) : m))
      .filter(m => !MOTS_MATERIEL.has(m))
  );
}

function cosinus(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (const [z, w] of Object.entries(a)) { na += w * w; dot += w * (b[z] || 0); }
  for (const w of Object.values(b)) nb += w * w;
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Jusqu'à `max` exercices proches de `nom`, du plus ressemblant au moins
 * ressemblant. `exclure` : ceux déjà dans la séance — en proposer un reviendrait
 * à le faire deux fois. `candidats` : [{ nom, materiel, groupeId }].
 */
export function classer(nom, exclure, candidats, max = 3) {
  const clef = musNorm(nom).trim();
  const interdits = new Set([...exclure, nom].map(x => musNorm(x).trim()));
  const musclesBase = musclesDuLexique(nom);
  const motsBase = mots(nom);
  const materielBase = devineMateriel(nom);
  const groupeBase = candidats.find(c => musNorm(c.nom).trim() === clef)?.groupeId ?? null;

  const vus = new Set();
  const propositions = [];
  for (const e of candidats) {
    const cle = musNorm(e.nom).trim();
    if (!cle || interdits.has(cle) || vus.has(cle)) continue;
    vus.add(cle);

    const musclesE = musclesDuLexique(e.nom);
    // Sans muscles connus d'un côté ou de l'autre, on se rabat sur le groupe
    // du catalogue : même groupe vaut « assez proche ».
    let muscles;
    if (musclesBase && musclesE) muscles = cosinus(musclesBase, musclesE);
    else if (groupeBase && e.groupeId === groupeBase) muscles = SEUIL_MUSCLES + 0.05;
    else muscles = 0;
    if (muscles < SEUIL_MUSCLES) continue;

    const motsE = mots(e.nom);
    const union = new Set([...motsBase, ...motsE]).size;
    const commun = [...motsBase].filter(m => motsE.has(m)).length;
    const nomSim = union === 0 ? 0 : commun / union;
    const score = P_MUSCLES * muscles + P_NOM * nomSim + (e.materiel === materielBase ? P_MATERIEL : 0);
    propositions.push({ nom: e.nom, score, memesMuscles: muscles >= 0.9, materiel: e.materiel });
  }
  return propositions.sort((a, b) => b.score - a.score).slice(0, max);
}

/** Les exercices les plus proches de `nom` dans le catalogue de Motio. */
export function substituts(nom, exclure = [], max = 3) {
  return classer(nom, exclure, tousLesExercices(), max);
}
