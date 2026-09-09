/* ==========================================================================
   LE COACH QUI PARLE PENDANT L'EXERCICE — portage de CoachGuide.kt.

   Première version : deux phrases figées, l'une au départ de l'effort, l'autre
   au départ du repos. Nicolas a demandé mieux, et il a raison — sur un
   chat-vache de trente secondes, ce qu'on attend d'un moniteur, ce n'est pas
   qu'il annonce le nom du mouvement puis se taise, c'est qu'il donne le tempo :
   quand inspirer, quand souffler, à quel moment creuser ou arrondir le dos.

   D'où ce guide, appelé par le moteur À CHAQUE SECONDE d'un enchaînement
   chronométré (Engine.guide). Il ne sait rien du temps : il reçoit où l'on en
   est et décide s'il y a quelque chose à dire.

   TROIS MOMENTS, et rien d'autre :
    - au départ d'un effort : le nom, puis le premier temps de respiration ;
    - pendant l'effort : le cycle de respiration, toutes les PAS_SEC secondes,
      en s'arrêtant avant le décompte final pour ne pas parler par-dessus ;
    - au départ d'un repos : soit « on repart pour le deuxième », soit la
      posture suivante ET sa consigne — c'est le seul vrai temps mort de la
      séance, donc le bon moment pour expliquer ce qui arrive. C'est ce qui
      permet de faire la séance entière sans jamais regarder l'écran.

   LA TABLE EST GÉNÉRÉE depuis CoachGuide.kt, elle n'est pas retapée à la main :
   les deux plateformes doivent dire exactement la même chose au même moment.
   ========================================================================== */

import { say, phraseDisponible, definirGuidageActif } from './beeper.js';
import { musNorm } from './muscle-lexicon.js';

/** Intervalle entre deux temps de respiration, en secondes. */
const PAS_SEC = 5;
/**
 * En deçà, on se tait : le décompte « trois, deux, un » arrive, et deux
 * phrases qui se chevauchent ne s'entendent ni l'une ni l'autre.
 *
 * Six et non trois : une consigne de cinq mots met deux à trois secondes à
 * être dite. Laisser partir la dernière à trois secondes de la fin revenait à
 * la faire couper par le décompte.
 */
const SILENCE_FIN_SEC = 6;

/** État posé par l'écran de séance — le moteur, lui, ne connaît que le temps. */
export const etat = { exercice: '', suivant: '', actif: false };

let derniereCle = '';
/**
 * Mouvement dont la consigne d'installation a DÉJÀ été donnée.
 *
 * Elle est normalement dite pendant le repos qui précède — le seul vrai temps
 * mort. Mais la première posture d'une séance n'a pas de repos avant elle :
 * sans ce repère, elle serait la seule à ne jamais être expliquée. Survit
 * volontairement à reinitialiser(), qui est appelé à chaque changement
 * d'exercice, c'est-à-dire juste après l'annonce.
 */
let consigneDonneePour = '';

/** Appelé par l'écran de séance juste après avoir posé `etat`. En profite pour
 *  dire au beeper si le guidage parle : c'est ce qui lui permet de compter
 *  « trois, deux, un » au lieu de siffler. */
export function reinitialiser() {
  derniereCle = '';
  definirGuidageActif(etat.actif);
}

const ORDINAUX = { 2: 'Deuxième', 3: 'Troisième', 4: 'Quatrième', 5: 'Cinquième' };

/**
 * Appelé par le moteur à chaque seconde d'un enchaînement chronométré.
 * `restant` et `duree` sont en secondes, `tour` commence à 1.
 */
export function seconde(effort, tour, tours, restant, duree) {
  if (!etat.actif || !phraseDisponible()) return;
  const ecoule = Math.max(0, duree - restant);
  const cle = `${effort ? 'E' : 'R'}${tour}-${ecoule}`;
  if (cle === derniereCle) return;
  derniereCle = cle;

  const g = guidagePour(etat.exercice);

  if (effort) {
    if (ecoule === 0) {
      // Le nom seul au deuxième tour : la consigne d'installation a déjà été
      // donnée, la répéter ferait bavard.
      if (tour <= 1) {
        say(etat.exercice || 'C’est parti');
        // Première posture de la séance : personne ne l'a expliquée pendant
        // un repos, puisqu'il n'y en a pas eu.
        if (consigneDonneePour !== etat.exercice && g.consigne) {
          say(g.consigne, true);
          consigneDonneePour = etat.exercice;
        }
      } else say(`${ORDINAUX[tour] || tour + 'e'} fois.`);
      if (g.cycle.length) say(texteCycle(g, 0, tour), true);
      return;
    }
    if (restant <= SILENCE_FIN_SEC) return;
    if (ecoule % PAS_SEC !== 0) return;
    if (!g.cycle.length) return;
    say(texteCycle(g, ecoule / PAS_SEC, tour));
    return;
  }

  /* ---- Repos ---- */
  if (ecoule !== 0) return;
  if (tour < tours) {
    // Encore un tour du MÊME mouvement : c'était le bug relevé par Nicolas, la
    // voix annonçait déjà l'exercice d'après entre deux séries de chat-vache.
    say(`Relâche. On repart dans ${restant} secondes.`);
    return;
  }
  // Dernier tour terminé : on le DIT. Le décompte « trois, deux, un » annonce
  // une fin, encore faut-il savoir laquelle — celle d'un tour ou celle de
  // l'exercice.
  if (!etat.suivant) { say('Fin de l’exercice. C’était la dernière.'); return; }
  say(`Fin de l’exercice. Ensuite : ${etat.suivant}.`);
  // Le repos est le seul vrai temps mort : c'est là qu'on explique la posture
  // qui arrive, pour ne pas avoir à lire l'écran en y arrivant.
  const gs = guidagePour(etat.suivant);
  if (gs.consigne && restant >= 8) { say(gs.consigne, true); consigneDonneePour = etat.suivant; }
}

/**
 * LE TEMPS DE RESPIRATION Nº `i`, EN ENTIER OU EN COURT.
 *
 * En entier au PREMIER cycle du PREMIER tour seulement — ce sont les points
 * techniques, ils se disent une fois quand on s'installe. Ensuite, et sur tous
 * les tours suivants, la première proposition seule : répéter « inspire,
 * creuse le dos, ouvre la poitrine, regarde devant » six fois d'affilée noie
 * la seule chose qui change encore à ce moment-là, le temps du souffle.
 * Demande de Nicolas, et c'est ainsi qu'un moniteur parle : il installe, puis
 * il rythme.
 */
function texteCycle(g, i, tour) {
  const phrase = g.cycle[i % g.cycle.length];
  return (tour <= 1 && i < g.cycle.length) ? phrase : court(phrase);
}

/**
 * La forme courte d'un temps de respiration : sa première proposition.
 *
 * « Inspire, creuse le dos, ouvre la poitrine » devient « Inspire », et
 * « Monte le bassin, garde la ligne » devient « Monte le bassin ». Dérivée
 * plutôt que saisie une deuxième fois dans la table : la règle est simple et
 * vraie sur toutes les entrées, une colonne de plus serait une occasion de
 * plus de les faire diverger.
 */
function court(phrase) {
  return phrase.split(',')[0].trim().replace(/\.$/, '');
}

const GENERIQUE = {
  consigne: 'Installe-toi, trouve une position stable.',
  cycle: ['Inspire par le nez, doucement.', 'Expire lentement, relâche les épaules.']
};

let index = null;
function indexer() {
  if (index) return index;
  index = new Map();
  for (const [nom, g] of TABLE) {
    const k = musNorm(nom);
    if (!index.has(k)) index.set(k, g);
  }
  return index;
}

/**
 * Le guidage d'un mouvement, avec repli. Même normalisation de nom que les
 * planches pour qu'un accent ou une majuscule ne fasse pas rater l'entrée ;
 * sans correspondance, un guidage générique — mieux vaut « respire lentement »
 * que le silence, et ça reste juste sur n'importe quelle position tenue.
 */
export function guidagePour(nom) {
  if (!nom) return GENERIQUE;
  const idx = indexer();
  const q = musNorm(nom);
  if (idx.has(q)) return idx.get(q);
  let best = -1, trouve = null;
  for (const [k, v] of idx) if (q.includes(k) && k.length > best) { best = k.length; trouve = v; }
  return trouve || GENERIQUE;
}

/* Consignes et respiration, mouvement par mouvement — GÉNÉRÉ depuis
   CoachGuide.kt (ordre du catalogue santé). Ne pas éditer ici : corriger le
   Kotlin et régénérer, sinon les deux plateformes divergent. */
const TABLE = [
  ['Chat-vache', {
    consigne: 'À quatre pattes, mains sous les épaules, genoux sous les hanches.',
    cycle: [
      'Inspire, creuse le dos, ouvre la poitrine, regarde devant.',
      'Expire, arrondis le dos, rentre le menton et le bassin.'
    ]
  }],
  ['Ouverture thoracique allongé sur le côté', {
    consigne: 'Sur le côté, genoux repliés à quatre-vingt-dix degrés, bras tendus devant.',
    cycle: [
      'Inspire, prépare-toi.',
      'Expire, ouvre le bras vers l\'arrière, laisse le buste tourner.',
      'Respire dans la position, laisse l\'épaule descendre.'
    ]
  }],
  ['Rotations d\'épaules bâton', {
    consigne: 'Bâton à deux mains, prise large, bras tendus.',
    cycle: [
      'Inspire, monte le bâton au-dessus de la tête.',
      'Expire, passe-le derrière sans forcer, coudes tendus.'
    ]
  }],
  ['Glissés d\'épaules au mur', {
    consigne: 'Dos au mur, bas du dos plaqué, coudes et poignets au contact.',
    cycle: [
      'Expire, monte les bras en gardant le contact au mur.',
      'Inspire, redescends lentement, serre les omoplates.'
    ]
  }],
  ['Mobilisation de cheville genou au mur', {
    consigne: 'Pied à une main du mur, talon collé au sol.',
    cycle: [
      'Avance le genou vers le mur, talon au sol.',
      'Reviens doucement, garde le pied bien à plat.'
    ]
  }],
  ['Position 90/90 hanches', {
    consigne: 'Assis, une jambe devant à quatre-vingt-dix degrés, l\'autre sur le côté.',
    cycle: [
      'Grandis le buste, respire calmement.',
      'Expire, laisse le genou avant descendre un peu plus.'
    ]
  }],
  ['Fente avec rotation thoracique', {
    consigne: 'En fente basse, main au sol à l\'intérieur du pied avant.',
    cycle: [
      'Inspire, prépare la rotation.',
      'Expire, ouvre le bras vers le ciel, suis la main du regard.'
    ]
  }],
  ['Squat profond tenu', {
    consigne: 'Pieds écartés, talons au sol, coudes à l\'intérieur des genoux.',
    cycle: [
      'Respire dans le ventre, laisse le bassin descendre.',
      'Expire, pousse les genoux vers l\'extérieur avec les coudes.'
    ]
  }],
  ['Cercles de hanche en quadrupédie', {
    consigne: 'À quatre pattes, dos neutre, un genou décollé du sol.',
    cycle: [
      'Dessine un grand cercle avec le genou, sans bouger le dos.',
      'Respire régulièrement, contrôle le mouvement.'
    ]
  }],
  ['Mobilisation du rachis en torsion assise', {
    consigne: 'Assis, une jambe croisée par-dessus l\'autre, dos grandi.',
    cycle: [
      'Inspire, grandis-toi.',
      'Expire, tourne un peu plus loin, épaules basses.'
    ]
  }],
  ['Étirement des ischio-jambiers', {
    consigne: 'Jambe tendue devant, talon au sol, bascule le bassin vers l\'avant.',
    cycle: [
      'Inspire par le nez, garde le dos plat.',
      'Expire lentement, laisse la tension s\'installer sans forcer.'
    ]
  }],
  ['Étirement des quadriceps debout', {
    consigne: 'Debout, talon vers la fesse, genoux serrés, bassin en rétroversion.',
    cycle: [
      'Rentre le bassin, ne cambre pas.',
      'Expire, rapproche le talon un peu plus.'
    ]
  }],
  ['Étirement du fessier assis (figure 4)', {
    consigne: 'Assis, une cheville sur le genou opposé, dos droit.',
    cycle: [
      'Inspire, grandis le buste.',
      'Expire, penche-toi vers l\'avant depuis les hanches.'
    ]
  }],
  ['Étirement du psoas en fente', {
    consigne: 'Genou arrière au sol, bassin en rétroversion. Ne cambre pas le bas du dos.',
    cycle: [
      'Rentre le bassin, serre la fesse arrière.',
      'Expire, avance le bassin, sens l\'avant de la cuisse.'
    ]
  }],
  ['Étirement des adducteurs (papillon)', {
    consigne: 'Assis, plantes de pieds l\'une contre l\'autre, talons vers toi.',
    cycle: [
      'Inspire, grandis le dos.',
      'Expire, laisse les genoux descendre, sans à-coups.'
    ]
  }],
  ['Étirement du mollet au mur', {
    consigne: 'Mains au mur, jambe arrière tendue, talon collé au sol.',
    cycle: [
      'Garde le talon au sol, avance le bassin.',
      'Expire, relâche le mollet dans l\'étirement.'
    ]
  }],
  ['Étirement des pectoraux au chambranle', {
    consigne: 'Avant-bras contre le montant, coude à hauteur d\'épaule.',
    cycle: [
      'Avance d\'un pas, ouvre la poitrine.',
      'Expire, laisse l\'épaule s\'ouvrir, sans monter l\'épaule.'
    ]
  }],
  ['Étirement du grand dorsal suspendu', {
    consigne: 'Suspendu à la barre, bras tendus, relâche les épaules.',
    cycle: [
      'Laisse le poids du corps ouvrir les côtes.',
      'Expire, relâche encore un peu les épaules.'
    ]
  }],
  ['Étirement du piriforme allongé', {
    consigne: 'Sur le dos, cheville sur le genou opposé, tire la cuisse vers toi.',
    cycle: [
      'Inspire calmement, garde la tête au sol.',
      'Expire, rapproche la cuisse de la poitrine.'
    ]
  }],
  ['Étirement du trapèze supérieur', {
    consigne: 'Assis ou debout, une main tire doucement la tête sur le côté.',
    cycle: [
      'Épaule opposée basse, ne monte pas les épaules.',
      'Expire, laisse la nuque s\'allonger.'
    ]
  }],
  ['Étirement des poignets et avant-bras', {
    consigne: 'À quatre pattes, doigts vers les genoux, paumes au sol.',
    cycle: [
      'Recule doucement le poids du corps.',
      'Expire, garde les paumes au contact.'
    ]
  }],
  ['Pince assise (chaîne postérieure)', {
    consigne: 'Assis, jambes tendues, dos long, penche-toi depuis les hanches.',
    cycle: [
      'Inspire, grandis la colonne.',
      'Expire, descends un peu plus, sans arrondir violemment.'
    ]
  }],
  ['Équilibre unipodal', {
    consigne: 'Sur un pied, regard fixé devant, pied bien ancré au sol.',
    cycle: [
      'Respire calmement, laisse la cheville travailler.',
      'Grandis-toi, garde le bassin de niveau.'
    ]
  }],
  ['Équilibre unipodal yeux fermés', {
    consigne: 'Sur un pied, yeux fermés. Reste près d\'un appui au cas où.',
    cycle: [
      'Respire, accepte les oscillations.',
      'Sens les appuis du pied, orteils relâchés.'
    ]
  }],
  ['Équilibre unipodal sur surface instable', {
    consigne: 'Sur un pied, sur le coussin, genou légèrement fléchi.',
    cycle: [
      'Genou souple, ne bloque pas l\'articulation.',
      'Respire, laisse le pied corriger tout seul.'
    ]
  }],
  ['Excursions du pied (Y-balance)', {
    consigne: 'En appui sur un pied, l\'autre part loin devant puis sur les côtés.',
    cycle: [
      'Va aussi loin que possible sans poser le pied.',
      'Reviens au centre, contrôle, puis repars.'
    ]
  }],
  ['Marche talon-pointe', {
    consigne: 'Marche sur une ligne, talon collé à la pointe du pied précédent.',
    cycle: [
      'Regard devant, pas sur les pieds.',
      'Avance lentement, contrôle chaque appui.'
    ]
  }],
  ['Fente avant avec arrêt contrôlé', {
    consigne: 'Grand pas en avant, genou dans l\'axe du pied, buste droit.',
    cycle: [
      'Descends et ARRÊTE-TOI en bas, deux secondes.',
      'Pousse pour revenir, sans déséquilibre.'
    ]
  }],
  ['Réception de saut amortie', {
    consigne: 'Petit saut, réception genoux fléchis, sans bruit.',
    cycle: [
      'Amortis avec les hanches et les genoux.',
      'Réception silencieuse, genoux dans l\'axe.'
    ]
  }],
  ['Sauts unipodaux avec réception stabilisée', {
    consigne: 'Impulsion sur un pied, réception sur le même pied, et tiens.',
    cycle: [
      'Stabilise une seconde avant de repartir.',
      'Genou dans l\'axe du pied, bassin de niveau.'
    ]
  }],
  ['Squat unipodal sur boîte', {
    consigne: 'Sur un pied devant la boîte, descends en contrôlant, effleure et remonte.',
    cycle: [
      'Descends lentement, genou dans l\'axe.',
      'Effleure seulement, puis pousse dans le talon.'
    ]
  }],
  ['Transferts de poids sur un pied', {
    consigne: 'Debout, passe lentement tout ton poids d\'un pied sur l\'autre.',
    cycle: [
      'Transfère doucement, sans à-coups.',
      'Marque un temps sur chaque appui.'
    ]
  }],
  ['Rotation externe d\'épaule à l\'élastique', {
    consigne: 'Coude collé au corps, à quatre-vingt-dix degrés, avant-bras devant.',
    cycle: [
      'Expire, ouvre vers l\'extérieur, coude collé au corps.',
      'Inspire, reviens en freinant, ne lâche pas l\'élastique.'
    ]
  }],
  ['Rotation interne d\'épaule à l\'élastique', {
    consigne: 'Coude collé au corps, avant-bras ouvert vers l\'extérieur.',
    cycle: [
      'Expire, ramène l\'avant-bras vers le ventre.',
      'Inspire, laisse repartir en contrôlant.'
    ]
  }],
  ['Élévation dans le plan de l\'omoplate', {
    consigne: 'Bras légèrement en avant du corps, pouce vers le haut.',
    cycle: [
      'Expire, monte jusqu\'à hauteur d\'épaule, pas plus.',
      'Inspire, redescends lentement.'
    ]
  }],
  ['Pallof press à l\'élastique', {
    consigne: 'De profil à l\'ancrage, mains à la poitrine, bassin verrouillé.',
    cycle: [
      'Expire, tends les bras devant, ne laisse pas le buste tourner.',
      'Inspire, reviens à la poitrine, gainage tenu.'
    ]
  }],
  ['Marche latérale à l\'élastique (monster walk)', {
    consigne: 'Élastique aux chevilles, genoux souples, pieds parallèles.',
    cycle: [
      'Petits pas de côté, garde la tension sur l\'élastique.',
      'Genoux vers l\'extérieur, ne laisse pas les pieds se rapprocher.'
    ]
  }],
  ['Y-T-W au sol', {
    consigne: 'À plat ventre, front au sol, bras tendus au-dessus de la tête.',
    cycle: [
      'Bras en Y, décolle, serre les omoplates, expire.',
      'Bras en T, décolle, épaules basses.',
      'Bras en W, coudes serrés vers les hanches.'
    ]
  }],
  ['Traction scapulaire', {
    consigne: 'Suspendu, bras tendus, coudes verrouillés pendant tout le mouvement.',
    cycle: [
      'Expire, descends les épaules, monte la poitrine.',
      'Inspire, relâche, laisse-toi redescendre.'
    ]
  }],
  ['Dead bug', {
    consigne: 'Sur le dos, bas du dos plaqué au sol, bras et genoux au-dessus.',
    cycle: [
      'Expire, descends un bras et la jambe opposée.',
      'Inspire, reviens, garde le bas du dos collé au sol.'
    ]
  }],
  ['Gainage latéral', {
    consigne: 'Sur le coude, corps aligné, bassin haut, épaule au-dessus du coude.',
    cycle: [
      'Respire normalement, ne bloque pas le souffle.',
      'Monte le bassin, garde la ligne tête-bassin-talons.'
    ]
  }],
  ['Pont fessier unipodal', {
    consigne: 'Sur le dos, un pied au sol, l\'autre jambe tendue.',
    cycle: [
      'Expire, monte le bassin en serrant la fesse.',
      'Inspire, redescends sans poser complètement.'
    ]
  }],
  ['Copenhagen (adducteurs)', {
    consigne: 'Sur le côté, jambe du dessus posée sur le banc, corps aligné.',
    cycle: [
      'Monte le bassin, serre l\'intérieur de cuisse.',
      'Respire, garde l\'alignement épaule-bassin-pied.'
    ]
  }],
  ['Nordic curl assisté', {
    consigne: 'À genoux, chevilles bloquées, corps gainé de la tête aux genoux.',
    cycle: [
      'Descends LENTEMENT en freinant avec les ischios.',
      'Rattrape avec les mains, remonte sans forcer le dos.'
    ]
  }],
  ['Mollets excentriques sur marche', {
    consigne: 'Avant-pied sur la marche, monte sur deux pieds, descends sur un.',
    cycle: [
      'Descends le talon lentement, cinq secondes.',
      'Remonte sur les deux pieds, puis recommence.'
    ]
  }],
  ['Relevés de pointes de pieds (tibial)', {
    consigne: 'Dos au mur, talons avancés, pieds à plat.',
    cycle: [
      'Expire, relève les pointes le plus haut possible.',
      'Inspire, redescends en contrôlant.'
    ]
  }],
  ['Chien tête en bas', {
    consigne: 'Mains et pieds au sol, bassin haut, dos long. Genoux fléchis si besoin.',
    cycle: [
      'Inspire, allonge la colonne, pousse le sol avec les mains.',
      'Expire, talons vers le sol, épaules loin des oreilles.'
    ]
  }],
  ['Chien tête en haut', {
    consigne: 'À plat ventre, mains sous les épaules, bassin décollé, jambes tendues.',
    cycle: [
      'Inspire, ouvre la poitrine, épaules basses.',
      'Expire, allonge la nuque, ne casse pas les lombaires.'
    ]
  }],
  ['Posture de l\'enfant', {
    consigne: 'À genoux, fesses sur les talons, bras tendus devant, front au sol.',
    cycle: [
      'Inspire dans le dos, sens les côtes s\'ouvrir.',
      'Expire longuement, relâche tout le buste.'
    ]
  }],
  ['Posture du guerrier I', {
    consigne: 'Grande fente, pied arrière à quarante-cinq degrés, bassin de face, bras au ciel.',
    cycle: [
      'Inspire, grandis-toi par les bras.',
      'Expire, ancre le pied arrière, descends le bassin.'
    ]
  }],
  ['Posture du guerrier II', {
    consigne: 'Grande fente, bras à l\'horizontale, regard sur la main avant.',
    cycle: [
      'Inspire, étire les bras dans les deux directions.',
      'Expire, plie un peu plus le genou avant, épaules basses.'
    ]
  }],
  ['Posture du guerrier III', {
    consigne: 'En appui sur une jambe, buste et jambe arrière à l\'horizontale.',
    cycle: [
      'Respire calmement, gaine le ventre.',
      'Allonge-toi de la tête jusqu\'au talon arrière.'
    ]
  }],
  ['Posture de l\'arbre', {
    consigne: 'Sur un pied, plante de l\'autre pied contre la cheville ou la cuisse.',
    cycle: [
      'Ancre le pied au sol, respire calmement.',
      'Grandis-toi, ouvre la poitrine.'
    ]
  }],
  ['Posture du pigeon', {
    consigne: 'Genou avant plié devant toi, jambe arrière allongée, bassin de face.',
    cycle: [
      'Inspire, grandis le buste.',
      'Expire, descends un peu plus sur l\'avant, relâche la fesse.'
    ]
  }],
  ['Posture du triangle', {
    consigne: 'Jambes écartées, une main vers le sol, l\'autre au ciel, buste ouvert.',
    cycle: [
      'Inspire, allonge les deux côtés du buste.',
      'Expire, ouvre la poitrine, regarde la main haute.'
    ]
  }],
  ['Posture du cobra', {
    consigne: 'À plat ventre, mains sous les épaules, coudes près du corps.',
    cycle: [
      'Inspire, décolle la poitrine, épaules basses.',
      'Expire, allonge la nuque, garde le bassin au sol.'
    ]
  }],
  ['Posture du chameau', {
    consigne: 'À genoux, mains aux talons ou aux reins, bassin poussé vers l\'avant.',
    cycle: [
      'Inspire, ouvre la poitrine vers le haut.',
      'Expire, garde les fessiers serrés, ne casse pas la nuque.'
    ]
  }],
  ['Posture de la chaise', {
    consigne: 'Pieds joints, fesses en arrière comme sur une chaise, bras au ciel.',
    cycle: [
      'Inspire, grandis les bras.',
      'Expire, descends un peu plus, poids sur les talons.'
    ]
  }],
  ['Torsion vertébrale assise', {
    consigne: 'Assis, une jambe croisée, coude en appui sur le genou.',
    cycle: [
      'Inspire, grandis la colonne.',
      'Expire, tourne un peu plus, épaules basses.'
    ]
  }],
  ['Salutation au soleil', {
    consigne: 'Debout, enchaîne les postures au rythme du souffle.',
    cycle: [
      'Inspire, bras au ciel, grandis-toi.',
      'Expire, penche-toi vers l\'avant.',
      'Inspire, planche, gaine le corps.',
      'Expire, chien tête en bas, talons vers le sol.'
    ]
  }],
  ['Respiration diaphragmatique', {
    consigne: 'Sur le dos, une main sur le ventre, une sur la poitrine.',
    cycle: [
      'Inspire par le nez, gonfle le ventre, quatre temps.',
      'Expire par la bouche, lentement, six temps.'
    ]
  }],
  ['Savasana (relâchement final)', {
    consigne: 'Sur le dos, bras le long du corps, paumes vers le ciel.',
    cycle: [
      'Laisse le souffle venir tout seul.',
      'Relâche les mâchoires, les épaules, les jambes.'
    ]
  }],
  ['Gainage', {
    consigne: 'Sur les coudes, corps aligné, bassin ni haut ni creusé.',
    cycle: [
      'Respire normalement, ne bloque pas le souffle.',
      'Serre les fessiers, rentre légèrement le bassin.'
    ]
  }],
  ['Bird Dog', {
    consigne: 'À quatre pattes, dos neutre, bras et jambe opposés tendus.',
    cycle: [
      'Expire, tends le bras et la jambe opposée.',
      'Inspire, reviens sans laisser le bassin tourner.'
    ]
  }],
];
