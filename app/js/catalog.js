/* ==========================================================================
   Catalogue d'exercices — portage de ExerciseCatalog.kt et Equipment.kt.

   ATTENTION : côté Android le catalogue vit dans filesDir/exercise_catalog.json
   et l'utilisateur peut le modifier. Ce fichier n'est donc que le catalogue
   PAR DÉFAUT. Tant que le catalogue personnalisé n'est pas synchronisé, le web
   propose la liste d'origine — un exercice ajouté sur le téléphone n'apparaît
   pas ici, mais rien ne casse : un exercice n'est qu'un nom.
   ========================================================================== */

export const GEARS = {
  BARRE: { label: 'Barre et banc', short: 'barre' },
  HALTERES: { label: 'Haltères', short: 'haltères' },
  MACHINE: { label: 'Machines et poulies', short: 'machine' },
  LIBRE: { label: 'Poids du corps', short: 'libre' }
};

function norm(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * guessGear — l'ordre des règles est le cœur de la fonction. Les machines
 * d'abord (« Machine à dips » est une machine, « Dips » du poids du corps),
 * les haltères avant la barre (« Rowing haltère un bras »).
 */
export function devineMateriel(nom) {
  const n = norm(nom);
  const a = (...k) => k.some(x => n.includes(x));

  if (a('machine', 'poulie', 'presse', 'pec deck', 'leg extension', 'leg curl',
        'hack', 'smith', 'tirage', 't-bar', 'convergente', 'abduction',
        'adduction', 'face pull', 'cable', 'butterfly', 'chest press', 'donkey'))
    return 'MACHINE';

  if (a('traction', 'dips', 'pompe', 'gainage', 'crunch', 'releve de jambe',
        'releves de jambe', 'russian twist', 'roue abdominale', 'bird dog',
        'corde a sauter', 'nordic', 'glute ham', 'extension lombaire',
        'extensions lombaires', 'muscle up', 'chaise', 'planche', 'australienne'))
    return 'LIBRE';

  if (a('haltere', 'kettlebell', 'goblet', 'farmer', 'marteau', 'concentration',
        'oiseau', 'bulgarian', 'fente', 'elevation', 'swing'))
    return 'HALTERES';

  return 'BARRE';
}

/* ---- seedDefaults() ---- */

export const GROUPES = [
  { id: 'pecs', nom: 'Pectoraux', exercices: [
    'Développé couché barre', 'Développé incliné haltères', 'Développé décliné barre',
    'Écarté haltères', 'Écarté à la poulie (vis-à-vis)', 'Pec Deck',
    'Dips buste penché', 'Pompes'] },
  { id: 'epaules', nom: 'Épaules', exercices: [
    'Développé militaire', 'Développé haltères', 'Élévations latérales',
    'Élévations frontales', 'Oiseau haltères', 'Face Pull',
    'Élévations latérales à la poulie', 'Machine développé épaules'] },
  { id: 'triceps', nom: 'Triceps', exercices: [
    'Développé couché prise serrée', 'Barre au front (Skull Crusher)',
    'Extension poulie haute corde', 'Extension poulie haute barre', 'Dips',
    'Extension nuque haltère', 'Extension unilatérale poulie', 'Machine à dips'] },
  { id: 'dos', nom: 'Dorsaux', exercices: [
    'Tractions pronation', 'Tirage vertical poitrine', 'Rowing barre',
    'Rowing haltère un bras', 'Tirage horizontal poulie', 'T-Bar Row',
    'Pullover à la poulie', 'Machine convergente de tirage'] },
  { id: 'biceps', nom: 'Biceps', exercices: [
    'Curl barre', 'Curl haltères alterné', 'Curl pupitre (Larry Scott)',
    'Curl incliné', 'Curl marteau', 'Curl à la poulie basse',
    'Curl concentration', 'Curl à la machine'] },
  { id: 'trap', nom: 'Trapèzes', exercices: [
    'Shrugs haltères', 'Shrugs barre', 'Rowing menton', 'Face Pull',
    'Tirage horizontal prise large', 'Soulevé de terre', "Farmer's Walk",
    'Oiseau sur banc incliné'] },
  { id: 'quadri', nom: 'Quadriceps', exercices: [
    'Squat', 'Front Squat', 'Presse à cuisses', 'Hack Squat', 'Fentes',
    'Bulgarian Split Squat', 'Extension de jambes (Leg Extension)', 'Goblet Squat'] },
  { id: 'ischios', nom: 'Ischios-jambiers', exercices: [
    'Soulevé de terre roumain', 'Leg Curl allongé', 'Leg Curl assis',
    'Good Morning', 'Soulevé de terre jambes tendues', 'Nordic Curl',
    'Glute Ham Raise', 'Kettlebell Swing'] },
  { id: 'fessiers', nom: 'Fessiers', exercices: [
    'Hip Thrust', 'Squat', 'Soulevé de terre roumain', 'Fentes marchées',
    'Bulgarian Split Squat', 'Kickback à la poulie',
    'Presse à cuisses pieds hauts', 'Abduction de hanche machine'] },
  { id: 'mollets', nom: 'Mollets', exercices: [
    'Mollets debout machine', 'Mollets assis machine', 'Mollets à la presse',
    'Élévations debout haltères', 'Élévations unilatérales', 'Donkey Calf Raise',
    'Mollets à la Smith Machine', 'Sauts à la corde'] },
  { id: 'abdos', nom: 'Abdominaux / Lombaires', exercices: [
    'Crunch', 'Relevés de jambes suspendu', 'Gainage', 'Crunch à la poulie',
    'Russian Twist', 'Roue abdominale (Ab Wheel)',
    'Extensions lombaires au banc', 'Bird Dog'] }
];

export const CATEGORIES_CATALOGUE = [
  { id: 'full', nom: 'Full body', tous: true, groupes: [] },
  { id: 'push', nom: 'Push', groupes: ['pecs', 'epaules', 'triceps'] },
  { id: 'pull', nom: 'Pull', groupes: ['dos', 'biceps', 'trap'] },
  { id: 'legs', nom: 'Legs', groupes: ['quadri', 'ischios', 'fessiers', 'mollets'] }
];

/** Tous les exercices à plat, avec leur groupe et leur matériel. */
export function tousLesExercices() {
  const out = [];
  for (const g of GROUPES) {
    for (const nom of g.exercices) {
      out.push({ nom, groupe: g.nom, groupeId: g.id, materiel: devineMateriel(nom) });
    }
  }
  return out;
}

/** Recherche plein texte, insensible à la casse et aux accents. */
export function chercher(terme) {
  const q = norm(terme.trim());
  if (!q) return [];
  return tousLesExercices().filter(e => norm(e.nom).includes(q) || norm(e.groupe).includes(q));
}
