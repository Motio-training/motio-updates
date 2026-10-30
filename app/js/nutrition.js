/* ==========================================================================
   Nutrition — couche de données (Supabase + Open Food Facts).

   TABLES (sql/02_nutrition.sql), toutes privées (policy « moi ») :
     nutrition_goals  profil métabolique et objectif, une ligne par compte
     food_entries     journal : une ligne par aliment mangé, nutriments FIGÉS
                      pour la portion (modifier un aliment perso plus tard ne
                      réécrit pas l'historique)
     custom_foods     aliments créés par l'utilisateur, pour 100 g
     weight_logs      une pesée par jour ; private_metrics garde la dernière

   Les noms de table sont écrits ici et non dans CONFIG.TABLES : config.js est
   un fichier protégé qu'on n'écrase pas.

   Open Food Facts : API publique, gratuite, CORS ouvert, aucune clé. Les
   données sont saisies par des contributeurs — d'où la prudence sur les
   produits sans calories ou aux valeurs aberrantes (voir versAliment).
   ========================================================================== */

import { sb } from './supabase.js';
import { setWeight } from './api.js';
import { cleJour, decalerJour, calculerCible, penteHebdo, ajustementConseille,
         lisser, totaux, OBJECTIFS } from './nutrition-calc.js';
import { chercherDansBase } from './aliments.js';

export const REPAS = [
  ['petit-dej', 'Petit-déjeuner'],
  ['dejeuner', 'Déjeuner'],
  ['diner', 'Dîner'],
  ['collation', 'Collations']
];

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

/* ---------------------------------------------------------------- objectif */

export async function getObjectif(userId) {
  const r = unwrap(await sb.from('nutrition_goals').select('*').eq('user_id', userId).maybeSingle());
  if (!r) return null;
  return {
    sexe: r.sexe, anneeNaissance: r.annee_naissance, tailleCm: Number(r.taille_cm),
    activite: r.activite, objectif: r.objectif, rythmePct: Number(r.rythme_pct),
    ajustementKcal: r.ajustement_kcal || 0
  };
}

export async function saveObjectif(userId, p) {
  unwrap(await sb.from('nutrition_goals').upsert({
    user_id: userId, sexe: p.sexe, annee_naissance: p.anneeNaissance, taille_cm: p.tailleCm,
    activite: p.activite, objectif: p.objectif, rythme_pct: p.rythmePct,
    ajustement_kcal: p.ajustementKcal || 0, updated_at: new Date().toISOString()
  }, { onConflict: 'user_id' }));
}

/* ----------------------------------------------------------------- journal */

export async function entreesDuJour(userId, jour) {
  return unwrap(await sb.from('food_entries').select('*')
    .eq('user_id', userId).eq('jour', jour).order('created_at', { ascending: true })) || [];
}

export async function entreesPeriode(userId, depuis, jusqua) {
  return unwrap(await sb.from('food_entries').select('*')
    .eq('user_id', userId).gte('jour', depuis).lte('jour', jusqua)
    .order('jour', { ascending: true })) || [];
}

export async function ajouterEntree(userId, e) {
  return unwrap(await sb.from('food_entries').insert({
    user_id: userId, jour: e.jour, repas: e.repas, nom: e.nom, marque: e.marque || null,
    code_barres: e.codeBarres || null, grammes: e.grammes, kcal: e.kcal,
    proteines: e.proteines, glucides: e.glucides, lipides: e.lipides
  }).select().single());
}

export async function supprimerEntree(id) {
  unwrap(await sb.from('food_entries').delete().eq('id', id));
}

/** Totaux par jour sur une période, pour la barre « 7 derniers jours ». */
export function parJour(entrees) {
  const m = new Map();
  for (const e of entrees) {
    if (!m.has(e.jour)) m.set(e.jour, []);
    m.get(e.jour).push(e);
  }
  return new Map([...m.entries()].map(([j, l]) => [j, totaux(l)]));
}

/* ------------------------------------------------------- aliments perso */

export async function alimentsPerso(userId) {
  const l = unwrap(await sb.from('custom_foods').select('*')
    .eq('user_id', userId).order('nom', { ascending: true })) || [];
  return l.map(r => ({
    id: r.id, source: 'perso', nom: r.nom, marque: r.marque || '',
    kcal: Number(r.kcal100), proteines: Number(r.proteines100),
    glucides: Number(r.glucides100), lipides: Number(r.lipides100),
    portion: Number(r.portion_g) || 0
  }));
}

export async function creerAlimentPerso(userId, a) {
  return unwrap(await sb.from('custom_foods').insert({
    user_id: userId, nom: a.nom, marque: a.marque || null, kcal100: a.kcal,
    proteines100: a.proteines, glucides100: a.glucides, lipides100: a.lipides,
    portion_g: a.portion || null
  }).select().single());
}

export async function supprimerAlimentPerso(id) {
  unwrap(await sb.from('custom_foods').delete().eq('id', id));
}

/* ------------------------------------------------------------------ poids */

export async function pesees(userId, jours = 90) {
  const depuis = decalerJour(cleJour(), -jours);
  const l = unwrap(await sb.from('weight_logs').select('jour,weight_kg')
    .eq('user_id', userId).gte('jour', depuis).order('jour', { ascending: true })) || [];
  return l.map(r => ({ jour: r.jour, kg: Number(r.weight_kg) }));
}

/** Une pesée par jour (la dernière gagne). Si c'est aujourd'hui, le poids du
 *  compte suit aussi : il sert déjà aux exercices au poids du corps. */
export async function enregistrerPesee(userId, jour, kg) {
  unwrap(await sb.from('weight_logs').upsert(
    { user_id: userId, jour, weight_kg: kg }, { onConflict: 'user_id,jour' }));
  if (jour === cleJour()) await setWeight(userId, kg).catch(() => { /* pas bloquant */ });
}

export async function supprimerPesee(userId, jour) {
  unwrap(await sb.from('weight_logs').delete().eq('user_id', userId).eq('jour', jour));
}

/* ------------------------------------------------------------ Open Food Facts */

const OFF = 'https://world.openfoodfacts.org';
const CHAMPS_OFF = 'code,product_name,brands,nutriments,serving_quantity';

/** Un produit OFF → notre aliment. null si inexploitable : sans calories pour
 *  100 g on ne peut rien calculer, et au-delà de 900 kcal c'est une faute de
 *  saisie (l'huile pure plafonne à 900). */
export function versAliment(p) {
  const n = p?.nutriments || {};
  let kcal = Number(n['energy-kcal_100g']);
  if (!Number.isFinite(kcal) && Number.isFinite(Number(n['energy_100g']))) {
    kcal = Number(n['energy_100g']) / 4.184;   // kJ → kcal
  }
  const nom = (p?.product_name || '').trim();
  if (!nom || !Number.isFinite(kcal) || kcal < 0 || kcal > 900) return null;
  const v = k => { const x = Number(n[k]); return Number.isFinite(x) && x >= 0 ? x : 0; };
  return {
    id: `off-${p.code}`, source: 'off', codeBarres: String(p.code || ''),
    nom, marque: (p.brands || '').split(',')[0].trim(),
    kcal: Math.round(kcal), proteines: v('proteins_100g'),
    glucides: v('carbohydrates_100g'), lipides: v('fat_100g'),
    portion: Number(p.serving_quantity) || 0
  };
}

export async function chercherOFF(terme, { signal } = {}) {
  const url = `${OFF}/cgi/search.pl?search_terms=${encodeURIComponent(terme)}` +
    `&search_simple=1&action=process&json=1&page_size=20&lc=fr&fields=${CHAMPS_OFF}`;
  const rep = await fetch(url, { signal });
  if (!rep.ok) throw new Error(`Open Food Facts a répondu ${rep.status}`);
  const j = await rep.json();
  return (j.products || []).map(versAliment).filter(Boolean);
}

export async function produitParCode(code, { signal } = {}) {
  const rep = await fetch(`${OFF}/api/v2/product/${encodeURIComponent(code)}.json?fields=${CHAMPS_OFF}`, { signal });
  if (rep.status === 404) return null;
  if (!rep.ok) throw new Error(`Open Food Facts a répondu ${rep.status}`);
  const j = await rep.json();
  return j.status === 1 ? versAliment({ ...j.product, code }) : null;
}

/** Base embarquée + aliments perso, instantané et hors ligne. */
export function chercherLocal(terme, perso = []) {
  return chercherDansBase(terme, perso).concat(chercherDansBase(terme));
}

/* ----------------------------------------------------- résumé pour Moti */

const f1 = v => String(Math.round(v * 10) / 10).replace('.', ',');

/**
 * Bloc de texte ajouté à l'instantané du coach (athlete.js) : objectif, cible,
 * apports récents, tendance du poids. Vide tant que l'utilisateur n'a pas
 * réglé sa nutrition — le coach ne doit pas inventer de cible.
 */
export async function resumePourCoach(userId) {
  const objectif = await getObjectif(userId);
  if (!objectif) return '';
  const l = [];
  const tous = await pesees(userId, 60).catch(() => []);
  const poids = tous.length ? tous[tous.length - 1].kg : 0;
  const nom = OBJECTIFS[objectif.objectif]?.label || objectif.objectif;
  l.push(`Nutrition — objectif : ${nom}${objectif.rythmePct ? ` (${f1(objectif.rythmePct)} % du poids par semaine)` : ''}.`);

  if (poids) {
    const c = calculerCible(objectif, poids);
    l.push(`Cible quotidienne : ${c.kcal} kcal, ${c.proteines} g de protéines, ${c.glucides} g de glucides, ${c.lipides} g de lipides (dépense estimée ${c.tdee} kcal).`);
    const lisse = lisser(tous);
    l.push(`Poids actuel : ${f1(poids)} kg (tendance ${f1(lisse[lisse.length - 1].tendance)} kg).`);
    const pente = penteHebdo(tous);
    if (pente != null) {
      const aj = ajustementConseille({ objectif: objectif.objectif, rythmePct: objectif.rythmePct, poidsKg: poids, penteKgSem: pente });
      l.push(`Variation réelle du poids : ${pente > 0 ? '+' : ''}${f1(pente)} kg par semaine${aj?.kcal ? `, correction de cible suggérée : ${aj.kcal > 0 ? '+' : ''}${aj.kcal} kcal/jour` : ', conforme à l\'objectif'}.`);
    }
  }

  try {
    const fin = cleJour();
    const jours = parJour(await entreesPeriode(userId, decalerJour(fin, -6), fin));
    if (jours.size) {
      const moy = k => Math.round([...jours.values()].reduce((s, t) => s + t[k], 0) / jours.size);
      l.push(`Apports moyens sur les ${jours.size} jours renseignés des 7 derniers : ${moy('kcal')} kcal, ${moy('proteines')} g de protéines, ${moy('glucides')} g de glucides, ${moy('lipides')} g de lipides.`);
    } else {
      l.push('Aucun repas saisi ces 7 derniers jours.');
    }
  } catch { /* pas bloquant */ }
  return l.join('\n');
}
