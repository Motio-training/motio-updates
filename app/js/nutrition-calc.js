/* ==========================================================================
   Nutrition — le calcul, sans réseau ni DOM.

   Tout ce qui décide d'une cible (métabolisme, dépense, déficit ou surplus,
   répartition des macros) et tout ce qui lit la courbe de poids vit ici, pour
   deux raisons : on peut le tester sous Node sans navigateur, et l'écran, le
   coach (athlete.js) et un futur portage Android s'appuient sur UNE seule
   définition de « combien manger ».

   Les chiffres sont des points de départ, pas des vérités : une formule
   prédictive se trompe de 10 % d'un individu à l'autre. C'est pourquoi la
   courbe de poids sert de juge (ajustementConseille) — la balance corrige la
   formule, pas l'inverse.
   ========================================================================== */

/** Énergie d'un kilo de masse corporelle gagné ou perdu — l'approximation
 *  classique, bonne à l'échelle de quelques semaines. */
export const KCAL_PAR_KG = 7700;

export const ACTIVITES = [
  { id: 'sedentaire', label: 'Sédentaire', aide: 'Travail assis, peu de marche.', facteur: 1.2 },
  { id: 'leger', label: 'Légère', aide: '1 à 3 séances par semaine.', facteur: 1.375 },
  { id: 'modere', label: 'Modérée', aide: '3 à 5 séances par semaine.', facteur: 1.55 },
  { id: 'intense', label: 'Intense', aide: '6 à 7 séances par semaine ou métier physique.', facteur: 1.725 },
  { id: 'extreme', label: 'Très intense', aide: 'Deux séances par jour ou métier très physique.', facteur: 1.9 }
];

/* `rythmes` : variation de poids visée par semaine, en % du poids du corps.
   Prise de masse lente = on gagne surtout du muscle ; sèche douce = on garde
   le muscle. Au-delà, on paie en gras (masse) ou en muscle (sèche). */
export const OBJECTIFS = {
  MASSE: {
    id: 'MASSE', label: 'Prise de masse', signe: 1,
    aide: 'Surplus calorique contrôlé pour gagner du muscle en limitant le gras.',
    rythmes: [0.15, 0.25, 0.4], rythmeDefaut: 0.25,
    proteinesParKg: 1.8, lipidesParKg: 1.0
  },
  SECHE: {
    id: 'SECHE', label: 'Sèche', signe: -1,
    aide: 'Déficit calorique pour perdre du gras en gardant le muscle.',
    rythmes: [0.3, 0.5, 0.75], rythmeDefaut: 0.5,
    proteinesParKg: 2.2, lipidesParKg: 0.8
  },
  MAINTIEN: {
    id: 'MAINTIEN', label: 'Maintien', signe: 0,
    aide: 'Apports égaux à la dépense : le poids reste stable.',
    rythmes: [0], rythmeDefaut: 0,
    proteinesParKg: 1.8, lipidesParKg: 0.9
  }
};

/** Planchers de prudence : en dessous, la sèche n'est plus un conseil que
 *  l'application doit donner toute seule. */
const PLANCHER_KCAL = { H: 1500, F: 1200 };
const KCAL_G = { p: 4, g: 4, l: 9 };

export function age(anneeNaissance, now = new Date()) {
  return now.getFullYear() - anneeNaissance;
}

/** Métabolisme de base, Mifflin-St Jeor (la formule la moins biaisée sur
 *  adultes d'aujourd'hui). `sexe` : 'H' ou 'F'. */
export function metabolismeBase({ sexe, poidsKg, tailleCm, ageAns }) {
  const base = 10 * poidsKg + 6.25 * tailleCm - 5 * ageAns;
  return Math.round(base + (sexe === 'F' ? -161 : 5));
}

export function depenseTotale(bmr, activiteId) {
  const a = ACTIVITES.find(x => x.id === activiteId) || ACTIVITES[1];
  return Math.round(bmr * a.facteur);
}

/** Écart quotidien en kcal pour un rythme hebdomadaire en % du poids. */
export function ecartQuotidien(poidsKg, rythmePct) {
  return Math.round((poidsKg * rythmePct / 100 * KCAL_PAR_KG) / 7);
}

/**
 * La cible complète. `profil` : { sexe, anneeNaissance, tailleCm, activite,
 * objectif, rythmePct, ajustementKcal }. `ajustementKcal` est la correction
 * apprise de la courbe de poids (voir ajustementConseille), appliquée par-dessus.
 */
export function calculerCible(profil, poidsKg, now = new Date()) {
  const obj = OBJECTIFS[profil.objectif] || OBJECTIFS.MAINTIEN;
  const bmr = metabolismeBase({
    sexe: profil.sexe, poidsKg, tailleCm: profil.tailleCm,
    ageAns: age(profil.anneeNaissance, now)
  });
  const tdee = depenseTotale(bmr, profil.activite);
  const rythme = obj.signe === 0 ? 0 : (profil.rythmePct ?? obj.rythmeDefaut);
  const ecart = obj.signe * ecartQuotidien(poidsKg, rythme);
  const brut = tdee + ecart + (profil.ajustementKcal || 0);
  const plancher = PLANCHER_KCAL[profil.sexe === 'F' ? 'F' : 'H'];
  const kcal = Math.round(Math.max(brut, plancher) / 10) * 10;

  // Protéines et lipides au kilo, glucides = ce qui reste. Si le budget ne
  // suffit pas (grosse sèche), on rogne les lipides jusqu'à 0,6 g/kg avant de
  // toucher aux protéines, qui protègent le muscle.
  const p = Math.round(obj.proteinesParKg * poidsKg);
  let l = Math.round(obj.lipidesParKg * poidsKg);
  let reste = kcal - p * KCAL_G.p - l * KCAL_G.l;
  if (reste < 0) {
    l = Math.max(Math.round(0.6 * poidsKg), Math.floor((kcal - p * KCAL_G.p) / KCAL_G.l));
    reste = kcal - p * KCAL_G.p - l * KCAL_G.l;
  }
  const g = Math.max(0, Math.round(reste / KCAL_G.g));

  return {
    bmr, tdee, ecart, kcal, proteines: p, glucides: g, lipides: l,
    plancherAtteint: brut < plancher
  };
}

/* ------------------------------------------------------------ journal */

/** Clé de jour locale « AAAA-MM-JJ » — jamais toISOString(), qui bascule en
 *  UTC et attribue le repas de 0 h 30 à la veille. */
export function cleJour(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function decalerJour(cle, n) {
  const [a, m, j] = cle.split('-').map(Number);
  return cleJour(new Date(a, m - 1, j + n));
}

/** Nutriments d'une portion à partir d'un aliment exprimé pour 100 g. */
export function pourPortion(aliment, grammes) {
  const k = (Number(grammes) || 0) / 100;
  const r = v => Math.round((Number(v) || 0) * k * 10) / 10;
  return {
    kcal: Math.round((Number(aliment.kcal) || 0) * k),
    proteines: r(aliment.proteines),
    glucides: r(aliment.glucides),
    lipides: r(aliment.lipides)
  };
}

export function totaux(entrees) {
  const t = { kcal: 0, proteines: 0, glucides: 0, lipides: 0 };
  for (const e of entrees) {
    t.kcal += Number(e.kcal) || 0;
    t.proteines += Number(e.proteines) || 0;
    t.glucides += Number(e.glucides) || 0;
    t.lipides += Number(e.lipides) || 0;
  }
  t.kcal = Math.round(t.kcal);
  for (const k of ['proteines', 'glucides', 'lipides']) t[k] = Math.round(t[k]);
  return t;
}

/* ------------------------------------------------------------ poids */

/**
 * Courbe lissée (moyenne mobile exponentielle) : le poids du matin oscille de
 * 1 à 2 kg avec l'eau et le sel, la tendance, non. `pesees` : [{jour, kg}].
 */
export function lisser(pesees, alpha = 0.25) {
  const tri = [...pesees].sort((a, b) => a.jour.localeCompare(b.jour));
  let prec = null;
  return tri.map(p => {
    prec = prec == null ? p.kg : prec + alpha * (p.kg - prec);
    return { jour: p.jour, kg: p.kg, tendance: Math.round(prec * 100) / 100 };
  });
}

function joursEntre(a, b) {
  const t = c => { const [y, m, d] = c.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((t(b) - t(a)) / 86400000);
}

/**
 * Pente de la tendance en kg/semaine, par régression sur les `fenetre`
 * derniers jours. Rend null tant que la courbe ne tient pas debout : moins de
 * 4 pesées ou moins de 10 jours d'écart, on ne pose pas de pente.
 */
export function penteHebdo(pesees, fenetre = 28) {
  const lisse = lisser(pesees);
  if (!lisse.length) return null;
  const fin = lisse[lisse.length - 1].jour;
  const pts = lisse.filter(p => joursEntre(p.jour, fin) <= fenetre);
  if (pts.length < 4) return null;
  const x0 = pts[0].jour;
  if (joursEntre(x0, fin) < 10) return null;
  const xs = pts.map(p => joursEntre(x0, p.jour));
  const ys = pts.map(p => p.tendance);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  if (den === 0) return null;
  return Math.round(num / den * 7 * 100) / 100;
}

/**
 * Faut-il corriger la cible ? Compare le rythme réel au rythme visé et traduit
 * l'écart en kcal/jour, arrondi à 50, plafonné à ±300 pour ne jamais lancer
 * de virage brutal. Sous 100 kcal d'écart, la mesure est dans le bruit : on
 * ne conseille rien.
 */
export function ajustementConseille({ objectif, rythmePct, poidsKg, penteKgSem }) {
  if (penteKgSem == null) return null;
  const obj = OBJECTIFS[objectif] || OBJECTIFS.MAINTIEN;
  const vise = obj.signe * (rythmePct ?? obj.rythmeDefaut) / 100 * poidsKg; // kg/sem
  const ecartKgSem = vise - penteKgSem;
  let kcal = Math.round((ecartKgSem * KCAL_PAR_KG / 7) / 50) * 50;
  kcal = Math.max(-300, Math.min(300, kcal));
  if (Math.abs(kcal) < 100) return { kcal: 0, vise, reel: penteKgSem };
  return { kcal, vise: Math.round(vise * 100) / 100, reel: penteKgSem };
}
