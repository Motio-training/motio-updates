/* ==========================================================================
   Petite base d'aliments courants, embarquée : elle répond sans réseau et
   couvre ce qu'un sportif pèse tous les jours (féculents, viandes, laitages,
   fruits, légumes, corps gras). Valeurs pour 100 g, ordre de grandeur de la
   table Ciqual — des repères, pas des analyses de laboratoire. Pour un produit
   de marque, la recherche Open Food Facts (nutrition.js) prend le relais.

   [nom, kcal, protéines, glucides, lipides, portion usuelle en g (ou 0)]
   Les féculents et viandes sont notés « cuit » sauf mention contraire : on
   pèse le plus souvent dans l'assiette, pas dans le paquet.
   ========================================================================== */

const BRUT = [
  // Féculents
  ['Riz blanc cuit', 130, 2.7, 28, 0.3, 150],
  ['Riz blanc cru', 360, 7, 79, 0.7, 70],
  ['Pâtes cuites', 131, 5, 25, 1.1, 180],
  ['Pâtes crues', 358, 12.5, 72, 1.5, 80],
  ['Pomme de terre vapeur', 86, 1.9, 19, 0.1, 150],
  ['Patate douce cuite', 90, 1.6, 21, 0.1, 150],
  ['Quinoa cuit', 120, 4.4, 21, 1.9, 150],
  ['Flocons d\'avoine', 372, 13, 60, 7, 50],
  ['Pain complet', 250, 9, 45, 3, 40],
  ['Pain blanc (baguette)', 270, 9, 55, 1.2, 50],
  ['Galette de riz', 380, 8, 80, 3, 9],
  ['Lentilles cuites', 116, 9, 20, 0.4, 150],
  ['Pois chiches cuits', 139, 8, 22, 2.6, 150],
  ['Haricots rouges cuits', 127, 8.7, 22, 0.5, 150],
  // Viandes, poissons, oeufs
  ['Blanc de poulet cuit', 165, 31, 0, 3.6, 120],
  ['Blanc de poulet cru', 110, 23, 0, 1.5, 150],
  ['Escalope de dinde cuite', 150, 30, 0, 3, 120],
  ['Boeuf haché 5 % cuit', 170, 27, 0, 6, 125],
  ['Boeuf haché 15 % cuit', 250, 26, 0, 16, 125],
  ['Steak de boeuf maigre cuit', 190, 29, 0, 8, 130],
  ['Filet mignon de porc cuit', 170, 28, 0, 6, 120],
  ['Jambon blanc', 110, 19, 1, 3, 45],
  ['Saumon cuit', 206, 22, 0, 13, 120],
  ['Cabillaud cuit', 105, 23, 0, 1, 130],
  ['Thon au naturel (boîte)', 110, 25, 0, 1, 110],
  ['Crevettes cuites', 99, 24, 0.2, 0.3, 100],
  ['Oeuf entier', 143, 12.5, 0.7, 10, 50],
  ['Blanc d\'oeuf', 52, 11, 0.7, 0.2, 33],
  ['Tofu ferme', 120, 13, 2, 7, 100],
  // Laitages
  ['Skyr nature', 63, 11, 4, 0.2, 150],
  ['Fromage blanc 0 %', 45, 7.5, 4, 0.2, 100],
  ['Cottage cheese', 98, 11, 3.4, 4.3, 100],
  ['Yaourt nature', 60, 4, 5, 3, 125],
  ['Lait demi-écrémé', 47, 3.3, 4.8, 1.6, 250],
  ['Lait entier', 64, 3.3, 4.8, 3.6, 250],
  ['Whey (poudre)', 390, 78, 6, 6, 30],
  ['Emmental', 380, 28, 1, 29, 30],
  ['Mozzarella', 250, 18, 1, 19, 125],
  // Fruits
  ['Banane', 90, 1.1, 20, 0.3, 120],
  ['Pomme', 52, 0.3, 12, 0.2, 150],
  ['Orange', 47, 0.9, 10, 0.2, 150],
  ['Fraises', 33, 0.7, 6, 0.3, 150],
  ['Raisins secs', 300, 3, 70, 0.5, 30],
  // Légumes
  ['Brocoli cuit', 35, 2.4, 4, 0.4, 150],
  ['Haricots verts cuits', 31, 1.8, 5, 0.2, 150],
  ['Courgette cuite', 17, 1.2, 2.5, 0.3, 150],
  ['Épinards cuits', 23, 3, 1.5, 0.4, 150],
  ['Carotte crue', 41, 0.9, 8, 0.2, 80],
  ['Tomate', 18, 0.9, 3, 0.2, 120],
  ['Salade verte', 15, 1.4, 2, 0.2, 50],
  ['Avocat', 160, 2, 1.8, 15, 100],
  // Corps gras, oléagineux
  ['Huile d\'olive', 900, 0, 0, 100, 10],
  ['Beurre', 745, 0.7, 0.5, 82, 10],
  ['Amandes', 580, 21, 9, 50, 30],
  ['Noix', 690, 15, 7, 65, 30],
  ['Noix de cajou', 570, 18, 26, 44, 30],
  ['Beurre de cacahuète', 600, 25, 10, 50, 15],
  ['Houmous', 230, 7, 12, 17, 50],
  // Plaisir
  ['Chocolat noir 70 %', 565, 8, 35, 40, 20],
  ['Miel', 305, 0.3, 76, 0, 20],
  ['Sucre', 400, 0, 100, 0, 5]
];

export const ALIMENTS = BRUT.map(([nom, kcal, proteines, glucides, lipides, portion], i) => ({
  id: `base-${i}`, source: 'base', nom, marque: '', kcal, proteines, glucides, lipides,
  portion: portion || 0
}));

/** Minuscules sans accents : « epinards » doit trouver « Épinards ». */
export function normaliser(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

/** Tous les mots saisis doivent apparaître dans le nom (ordre libre). */
export function chercherDansBase(terme, liste = ALIMENTS) {
  const mots = normaliser(terme).split(/\s+/).filter(Boolean);
  if (!mots.length) return [];
  return liste
    .filter(a => { const n = normaliser(`${a.nom} ${a.marque}`); return mots.every(m => n.includes(m)); })
    .sort((a, b) => normaliser(a.nom).indexOf(mots[0]) - normaliser(b.nom).indexOf(mots[0]));
}
