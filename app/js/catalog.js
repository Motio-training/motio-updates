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
  LIBRE: { label: 'Poids du corps', short: 'libre' },
  /* Arrivé avec les exercices de prévention et de réathlétisation : ranger
     une rotation externe d'épaule dans « poids du corps » aurait été faux —
     on ne la fait pas les mains vides — et dans « machines », absurde. */
  ELASTIQUE: { label: 'Élastiques', short: 'élastique' }
};

function norm(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Matériel DÉCLARÉ, pas deviné.
 *
 * La déduction par mot-clé marche parce que le vocabulaire de la musculation
 * est régulier (« ... barre », « ... haltères », « ... poulie »). Celui de la
 * mobilité et du yoga ne l'est pas : « Cercles de hanche en quadrupédie » n'a
 * aucun mot qui trahisse son matériel, et « Fente avec rotation thoracique »
 * serait capté par « fente » comme un exercice d'haltères.
 *
 * Côté Android l'équivalent est le matériel donné exercice par exercice dans
 * `CatalogStore.seedSante` (ExerciseCatalog.kt) : les deux listes doivent
 * dire la même chose, sinon un même exercice serait filtré ici et pas là.
 */
const MATERIEL_DECLARE = {
  "rotations d'epaules baton": 'LIBRE',
  "glisses d'epaules au mur": 'LIBRE',
  'fente avec rotation thoracique': 'LIBRE',
  'squat profond tenu': 'LIBRE',
  'cercles de hanche en quadrupedie': 'LIBRE',
  'pince assise (chaine posterieure)': 'LIBRE',
  'excursions du pied (y-balance)': 'LIBRE',
  'marche talon-pointe': 'LIBRE',
  'fente avant avec arret controle': 'LIBRE',
  'transferts de poids sur un pied': 'LIBRE',
  'y-t-w au sol': 'LIBRE',
  'mollets excentriques sur marche': 'LIBRE',
  'releves de pointes de pieds (tibial)': 'LIBRE',
  'savasana (relachement final)': 'LIBRE',
  "elevation dans le plan de l'omoplate": 'ELASTIQUE'
};

/**
 * guessGear — l'ordre des règles est le cœur de la fonction. Les machines
 * d'abord (« Machine à dips » est une machine, « Dips » du poids du corps),
 * les haltères avant la barre (« Rowing haltère un bras »).
 */
export function devineMateriel(nom) {
  const n = norm(nom);
  const declare = MATERIEL_DECLARE[n];
  if (declare) return declare;
  const a = (...k) => k.some(x => n.includes(x));

  /* L'élastique avant tout le reste : c'est le mot qui décide, et sans cette
     règle « Rotation externe d'épaule à l'élastique » retombait sur la barre
     par défaut. */
  if (a('elastique', 'bande de resistance', 'mini-bande', 'mini bande'))
    return 'ELASTIQUE';

  if (a('machine', 'poulie', 'presse', 'pec deck', 'leg extension', 'leg curl',
        'hack', 'smith', 'tirage', 't-bar', 'convergente', 'abduction',
        'adduction', 'face pull', 'cable', 'butterfly', 'chest press', 'donkey'))
    return 'MACHINE';

  /* Les mots de la mobilité, des étirements, de la proprioception et du yoga
     entrent ici, et AVANT les haltères pour que « Étirement des mollets » ne
     soit pas capté par « elevation » ou « fente ». */
  if (a('traction', 'dips', 'pompe', 'gainage', 'crunch', 'releve de jambe',
        'releves de jambe', 'russian twist', 'roue abdominale', 'bird dog',
        'corde a sauter', 'nordic', 'glute ham', 'extension lombaire',
        'extensions lombaires', 'muscle up', 'chaise', 'planche', 'australienne',
        'etirement', 'mobilite', 'mobilisation', 'posture', 'equilibre',
        'yoga', 'chien tete', 'guerrier', 'pigeon', 'cobra', 'chat-vache',
        'salutation', 'respiration', 'dead bug', 'pallof', 'copenhagen',
        'unipodal', 'proprioception', 'ouverture thoracique', '90/90',
        'torsion', 'amorti', 'reception'))
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
    'Extensions lombaires au banc', 'Bird Dog'] },

  /* Mobilité, étirements, proprioception, prévention et yoga — les groupes
     que Moti pioche pour une gêne, une raideur ou une reprise. Ils sont
     marqués `sante: true` : le générateur local les EXCLUT d'une séance de
     force tirée au sort (voir estGroupeSante), sans quoi « Posture du
     pigeon » apparaîtrait au milieu d'un Full body. */
  { id: 'mobilite', nom: 'Mobilité articulaire', sante: true, exercices: [
    'Chat-vache', 'Ouverture thoracique allongé sur le côté',
    "Rotations d'épaules bâton", "Glissés d'épaules au mur",
    'Mobilisation de cheville genou au mur', 'Position 90/90 hanches',
    'Fente avec rotation thoracique', 'Squat profond tenu',
    'Cercles de hanche en quadrupédie',
    'Mobilisation du rachis en torsion assise'] },
  { id: 'etirements', nom: 'Étirements', sante: true, exercices: [
    'Étirement des ischio-jambiers', 'Étirement des quadriceps debout',
    'Étirement du fessier assis (figure 4)', 'Étirement du psoas en fente',
    'Étirement des adducteurs (papillon)', 'Étirement du mollet au mur',
    'Étirement des pectoraux au chambranle', 'Étirement du grand dorsal suspendu',
    'Étirement du piriforme allongé', 'Étirement du trapèze supérieur',
    'Étirement des poignets et avant-bras', 'Pince assise (chaîne postérieure)'] },
  { id: 'proprio', nom: 'Proprioception et équilibre', sante: true, exercices: [
    'Équilibre unipodal', 'Équilibre unipodal yeux fermés',
    'Équilibre unipodal sur surface instable', 'Excursions du pied (Y-balance)',
    'Marche talon-pointe', 'Fente avant avec arrêt contrôlé',
    'Réception de saut amortie', 'Sauts unipodaux avec réception stabilisée',
    'Squat unipodal sur boîte', 'Transferts de poids sur un pied'] },
  { id: 'prevention', nom: 'Renforcement préventif', sante: true, exercices: [
    "Rotation externe d'épaule à l'élastique",
    "Rotation interne d'épaule à l'élastique",
    "Élévation dans le plan de l'omoplate",
    "Pallof press à l'élastique",
    "Marche latérale à l'élastique (monster walk)",
    'Y-T-W au sol', 'Traction scapulaire', 'Dead bug', 'Gainage latéral',
    'Pont fessier unipodal', 'Copenhagen (adducteurs)', 'Nordic curl assisté',
    'Mollets excentriques sur marche', 'Relevés de pointes de pieds (tibial)'] },
  { id: 'yoga', nom: 'Yoga', sante: true, exercices: [
    'Chien tête en bas', 'Chien tête en haut', "Posture de l'enfant",
    'Posture du guerrier I', 'Posture du guerrier II', 'Posture du guerrier III',
    "Posture de l'arbre", 'Posture du pigeon', 'Posture du triangle',
    'Posture du cobra', 'Posture du chameau', 'Posture de la chaise',
    'Torsion vertébrale assise', 'Salutation au soleil',
    'Respiration diaphragmatique', 'Savasana (relâchement final)'] }
];

/** Groupe de mobilité, d'étirement, de proprioception, de prévention ou de
 *  yoga — voir la remarque sur `sante` ci-dessus. */
export function estGroupeSante(groupeOuId) {
  const id = typeof groupeOuId === 'string' ? groupeOuId : groupeOuId?.id;
  return !!GROUPES.find(g => g.id === id)?.sante;
}

/** Durée de maintien par défaut d'un exercice de ces groupes-là, en secondes
 *  (0 = exercice compté en répétitions). Même valeur que le générateur
 *  maison côté Android (ProgramGenerator.holdSecFor). */
export const MAINTIEN_DEFAUT_SEC = 30;

export const CATEGORIES_CATALOGUE = [
  { id: 'full', nom: 'Full body', tous: true, groupes: [] },
  { id: 'push', nom: 'Push', groupes: ['pecs', 'epaules', 'triceps'] },
  { id: 'pull', nom: 'Pull', groupes: ['dos', 'biceps', 'trap'] },
  { id: 'legs', nom: 'Legs', groupes: ['quadri', 'ischios', 'fessiers', 'mollets'] },
  { id: 'mobi', nom: 'Mobilité', groupes: ['mobilite', 'etirements'] },
  { id: 'prev', nom: 'Prévention', groupes: ['prevention', 'proprio'] },
  { id: 'yoga', nom: 'Yoga', groupes: ['yoga'] }
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
