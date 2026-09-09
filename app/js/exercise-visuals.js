/* ==========================================================================
   VISUELS DE MOUVEMENT — une planche par exercice.

   Port fidèle d'ExerciseVisuals.kt (C:\chrono). Chaque planche montre les DEUX
   positions sur la même image : la première dessinée à l'encre, la seconde en
   vert, et une flèche qui donne le sens. Les fichiers vivent dans `app/exos/`
   et sont servis par le même dépôt que l'appli ; le service worker les met en
   cache au premier affichage, donc une planche déjà vue reste disponible hors
   ligne sans alourdir l'installation.

   FOND BLANC ASSUMÉ. Les planches sont à l'encre sur blanc : elles se posent
   sur une plaque claire, la même en thème clair et en thème sombre. Les
   afficher sur le fond sombre de l'application ferait disparaître les aplats
   noirs (short, banc, chaussures).

   LE PROBLÈME N'EST PAS L'IMAGE, C'EST LE NOM. La saisie libre existe : un
   exercice peut s'appeler n'importe comment. La table couvre les 84 exercices
   du catalogue par défaut, plus les variantes françaises courantes renvoyées
   vers la planche du MÊME mouvement. visualFor rattrape le reste par une
   cascade — nom exact, nom contenu, puis faute de frappe. Quand rien ne
   correspond, on n'affiche RIEN : montrer le mauvais mouvement serait pire que
   ne rien montrer, surtout à quelqu'un qui vient vérifier sa technique.

   La MÊME table existe côté Android dans ExerciseVisuals.kt : les deux doivent
   rester identiques.
   ========================================================================== */

import { musNorm, lev } from './muscle-lexicon.js';
import { h, esc } from './ui.js';

const BASE = 'exos/';

/** Nom français → fichier de la planche. */
const TABLE = [
  // ---- les 84 illustrations, dans l'ordre du catalogue ----
  ["Développé couché barre", "01_developpe_couche_barre"],
  ["Développé incliné haltères", "02_developpe_incline_haltere"],
  ["Développé décliné barre", "03_developpe_decline_barre"],
  ["Écarté haltères", "04_ecarte_haltere"],
  ["Écarté à la poulie (vis-à-vis)", "05_ecarte_poulie_vis_a_vis"],
  ["Pec Deck", "06_pec_deck"],
  ["Dips buste penché", "07_dips_buste_penche"],
  ["Pompes", "08_pompes"],
  ["Développé militaire", "09_developpe_militaire"],
  ["Développé haltères", "10_developpe_haltere"],
  ["Élévations latérales", "11_elevations_laterales"],
  ["Élévations frontales", "12_elevations_frontales"],
  ["Oiseau haltères", "13_oiseau_halteres"],
  ["Face Pull", "14_face_pull"],
  ["Élévations latérales à la poulie", "15_elevations_laterales_poulie"],
  ["Machine développé épaules", "16_machine_developpe_epaules"],
  ["Développé couché prise serrée", "17_developpe_couche_prise_serree"],
  ["Barre au front (Skull Crusher)", "18_barre_au_front"],
  ["Extension poulie haute corde", "19_extension_poulie_haute_corde"],
  ["Extension poulie haute barre", "20_extension_poulie_haute_barre"],
  ["Dips", "21_dips_triceps"],
  ["Extension nuque haltère", "22_extension_nuque_haltere"],
  ["Extension unilatérale poulie", "23_extension_unilaterale_poulie"],
  ["Machine à dips", "24_machine_a_dips"],
  ["Tractions pronation", "25_tractions_pronation"],
  ["Tirage vertical poitrine", "26_tirage_vertical_poitrine"],
  ["Rowing barre", "27_rowing_barre"],
  ["Rowing haltère un bras", "28_rowing_haltere_un_bras"],
  ["Tirage horizontal poulie", "29_tirage_horizontal_poulie"],
  ["T-Bar Row", "30_t_bar_row"],
  ["Pullover à la poulie", "31_pullover_a_la_poulie"],
  ["Machine convergente de tirage", "32_machine_convergente_tirage"],
  ["Curl barre", "33_curl_barre"],
  ["Curl haltères alterné", "34_curl_haltere_alterne"],
  ["Curl pupitre (Larry Scott)", "35_curl_pupitre_larry_scott"],
  ["Curl incliné", "36_curl_incline"],
  ["Curl marteau", "37_curl_marteau"],
  ["Curl à la poulie basse", "38_curl_poulie_basse"],
  ["Curl concentration", "39_curl_concentration"],
  ["Curl à la machine", "40_curl_machine"],
  ["Shrugs haltères", "41_shrugs_halteres"],
  ["Shrugs barre", "42_shrugs_barre"],
  ["Rowing menton", "43_rowing_menton"],
  ["Tirage horizontal prise large", "44_tirage_horizontal_prise_large"],
  ["Soulevé de terre", "45_souleve_de_terre"],
  ["Farmer's Walk", "46_farmers_walk"],
  ["Oiseau sur banc incliné", "47_oiseau_banc_incline"],
  ["Squat", "48_squat"],
  ["Front Squat", "49_front_squat"],
  ["Presse à cuisses", "50_presse_a_cuisses"],
  ["Hack Squat", "51_hack_squat"],
  ["Fentes", "52_fentes"],
  ["Bulgarian Split Squat", "53_bulgarian_split_squat"],
  ["Extension de jambes (Leg Extension)", "54_leg_extension"],
  ["Goblet Squat", "55_goblet_squat"],
  ["Soulevé de terre roumain", "56_souleve_de_terre_roumain"],
  ["Leg Curl allongé", "57_leg_curl_allonge"],
  ["Leg Curl assis", "58_leg_curl_assis"],
  ["Good Morning", "59_good_morning"],
  ["Soulevé de terre jambes tendues", "60_souleve_de_terre_jambes_tendues"],
  ["Nordic Curl", "61_nordic_curl"],
  ["Glute Ham Raise", "62_glute_ham_raise"],
  ["Kettlebell Swing", "63_kettlebell_swing"],
  ["Hip Thrust", "64_hip_thrust"],
  ["Fentes marchées", "65_fentes_marchees"],
  ["Kickback à la poulie", "66_kickback_a_la_poulie"],
  ["Presse à cuisses pieds hauts", "67_presse_a_cuisses_pieds_hauts"],
  ["Abduction de hanche machine", "68_abduction_hanche_machine"],
  ["Mollets debout machine", "69_mollets_debout_machine"],
  ["Mollets assis machine", "70_mollets_assis_machine"],
  ["Mollets à la presse", "71_mollets_a_la_presse"],
  ["Élévations debout haltères", "72_elevations_debout_halteres_mollets"],
  ["Élévations unilatérales", "73_elevations_unilaterales_mollets"],
  ["Donkey Calf Raise", "74_donkey_calf_raise"],
  ["Mollets à la Smith Machine", "75_mollets_smith_machine"],
  ["Sauts à la corde", "76_sauts_a_la_corde"],
  ["Crunch", "77_crunch"],
  ["Relevés de jambes suspendu", "78_releves_de_jambes_suspendu"],
  ["Gainage", "79_gainage"],
  ["Crunch à la poulie", "80_crunch_a_la_poulie"],
  ["Russian Twist", "81_russian_twist"],
  ["Roue abdominale (Ab Wheel)", "82_roue_abdominale"],
  ["Extensions lombaires au banc", "83_extensions_lombaires_au_banc"],
  ["Bird Dog", "84_bird_dog"],

  // ---- variantes et synonymes : meme mouvement, materiel ou reglage different ----
  ["Développé couché haltères", "01_developpe_couche_barre"],
  ["Développé couché Smith", "01_developpe_couche_barre"],
  ["Développé machine", "01_developpe_couche_barre"],
  ["Développé incliné barre", "02_developpe_incline_haltere"],
  ["Développé décliné haltères", "03_developpe_decline_barre"],
  ["Écarté incliné haltères", "04_ecarte_haltere"],
  ["Écarté décliné haltères", "04_ecarte_haltere"],
  ["Écarté à la poulie basse", "05_ecarte_poulie_vis_a_vis"],
  ["Pompes déclinées", "08_pompes"],
  ["Pompes inclinées", "08_pompes"],
  ["Pompes diamant", "08_pompes"],
  ["Pompes prise large", "08_pompes"],
  ["Développé Arnold", "10_developpe_haltere"],
  ["Développé militaire assis", "09_developpe_militaire"],
  ["Développé nuque", "09_developpe_militaire"],
  ["Push Press", "09_developpe_militaire"],
  ["Élévations latérales assis", "11_elevations_laterales"],
  ["Élévations latérales un bras", "11_elevations_laterales"],
  ["Oiseau à la poulie", "13_oiseau_halteres"],
  ["Oiseau machine", "13_oiseau_halteres"],
  ["Développé couché prise serrée Smith", "17_developpe_couche_prise_serree"],
  ["Extension triceps couché barre", "18_barre_au_front"],
  ["Extension triceps couché haltères", "18_barre_au_front"],
  ["Extension triceps poulie corde au-dessus de la tête", "22_extension_nuque_haltere"],
  ["Extension triceps machine", "24_machine_a_dips"],
  ["Dips sur banc", "21_dips_triceps"],
  ["Dips aux barres parallèles", "21_dips_triceps"],
  ["Traction supination", "25_tractions_pronation"],
  ["Tractions lestées", "25_tractions_pronation"],
  ["Traction prise neutre", "25_tractions_pronation"],
  ["Tirage vertical prise serrée", "26_tirage_vertical_poitrine"],
  ["Tirage vertical supination", "26_tirage_vertical_poitrine"],
  ["Tirage vertical un bras", "26_tirage_vertical_poitrine"],
  ["Tirage nuque", "26_tirage_vertical_poitrine"],
  ["Rowing haltères", "27_rowing_barre"],
  ["Rowing Yates", "27_rowing_barre"],
  ["Rowing Smith", "27_rowing_barre"],
  ["Rowing kettlebell", "28_rowing_haltere_un_bras"],
  ["Rowing machine", "32_machine_convergente_tirage"],
  ["Pull over haltère", "31_pullover_a_la_poulie"],
  ["Curl EZ", "33_curl_barre"],
  ["Curl inversé", "33_curl_barre"],
  ["Curl assis haltères", "34_curl_haltere_alterne"],
  ["Curl Zottman", "34_curl_haltere_alterne"],
  ["Curl araignée", "35_curl_pupitre_larry_scott"],
  ["Curl pupitre machine", "35_curl_pupitre_larry_scott"],
  ["Curl marteau poulie", "37_curl_marteau"],
  ["Curl poulie haute", "38_curl_poulie_basse"],
  ["Squat barre", "48_squat"],
  ["Squat au poids du corps", "48_squat"],
  ["Squat Smith", "48_squat"],
  ["Box Squat", "48_squat"],
  ["Squat sumo", "48_squat"],
  ["Squat sauté", "48_squat"],
  ["Zercher Squat", "48_squat"],
  ["Presse à cuisses prise serrée", "50_presse_a_cuisses"],
  ["Fentes barre", "52_fentes"],
  ["Fentes arrière", "52_fentes"],
  ["Extension unilatérale de jambe", "54_leg_extension"],
  ["Soulevé de terre sumo", "45_souleve_de_terre"],
  ["Soulevé de terre haltères", "45_souleve_de_terre"],
  ["Rack Pull", "45_souleve_de_terre"],
  ["Marche du fermier", "46_farmers_walk"],
  ["Leg Curl debout", "57_leg_curl_allonge"],
  ["Leg Curl ballon", "57_leg_curl_allonge"],
  ["Good Morning assis", "59_good_morning"],
  ["Hip Thrust une jambe", "64_hip_thrust"],
  ["Pont fessier", "64_hip_thrust"],
  ["Relevé de bassin", "64_hip_thrust"],
  ["Fentes marchées barre", "65_fentes_marchees"],
  ["Mollets debout barre", "69_mollets_debout_machine"],
  ["Mollets assis barre", "70_mollets_assis_machine"],
  ["Mollets assis une jambe", "70_mollets_assis_machine"],
  ["Corde à sauter", "76_sauts_a_la_corde"],
  ["Crunch inversé", "77_crunch"],
  ["Crunch décliné", "77_crunch"],
  ["Crunch oblique", "77_crunch"],
  ["Crunch machine", "77_crunch"],
  ["Sit Up", "77_crunch"],
  ["Relevés de jambes au sol", "78_releves_de_jambes_suspendu"],
  ["Relevés de genoux aux barres", "78_releves_de_jambes_suspendu"],
  ["Twist avec disque", "81_russian_twist"],
  ["Rollout barre", "82_roue_abdominale"],
  ["Extensions lombaires inversées", "83_extensions_lombaires_au_banc"],
  ["Squat bulgare", "53_bulgarian_split_squat"],
  ["Fente bulgare", "53_bulgarian_split_squat"],
  ["Tirage poitrine", "26_tirage_vertical_poitrine"],
  ["Lat pulldown", "26_tirage_vertical_poitrine"],
  ["Rowing assis", "29_tirage_horizontal_poulie"],
  ["Bench press", "01_developpe_couche_barre"],
  ["Deadlift", "45_souleve_de_terre"],
  ["Pull up", "25_tractions_pronation"],
  ["Leg press", "50_presse_a_cuisses"],
  ["Overhead press", "09_developpe_militaire"],
  ["Plank", "79_gainage"],

  /* ---- Mobilité, étirements, proprioception, prévention, yoga (85 à 146) ----
     Second lot de planches, dans l'ordre du catalogue santé (catalog.js).
     Même convention que le premier lot pour les mouvements ; pour une position
     TENUE, une seule silhouette avec la zone travaillée en vert Motio et pas de
     flèche — il n'y a pas de sens à indiquer sur un étirement qu'on maintient. */
  ["Chat-vache", "85_chat_vache"],
  ["Ouverture thoracique allongé sur le côté", "86_ouverture_thoracique"],
  ["Rotations d'épaules bâton", "87_rotations_epaules_baton"],
  ["Glissés d'épaules au mur", "88_glisses_epaules_mur"],
  ["Mobilisation de cheville genou au mur", "89_mobilisation_cheville_mur"],
  ["Position 90/90 hanches", "90_position_90_90_hanches"],
  ["Fente avec rotation thoracique", "91_fente_rotation_thoracique"],
  ["Squat profond tenu", "92_squat_profond_tenu"],
  ["Cercles de hanche en quadrupédie", "93_cercles_hanche_quadrupedie"],
  ["Mobilisation du rachis en torsion assise", "94_torsion_rachis_assise"],
  ["Étirement des ischio-jambiers", "95_etirement_ischios"],
  ["Étirement des quadriceps debout", "96_etirement_quadriceps"],
  ["Étirement du fessier assis (figure 4)", "97_etirement_fessier_assis"],
  ["Étirement du psoas en fente", "98_etirement_psoas_fente"],
  ["Étirement des adducteurs (papillon)", "99_etirement_adducteurs"],
  ["Étirement du mollet au mur", "100_etirement_mollet_mur"],
  ["Étirement des pectoraux au chambranle", "101_etirement_pectoraux_chambranle"],
  ["Étirement du grand dorsal suspendu", "102_etirement_grand_dorsal"],
  ["Étirement du piriforme allongé", "103_etirement_piriforme"],
  ["Étirement du trapèze supérieur", "104_etirement_trapeze_superieur"],
  ["Étirement des poignets et avant-bras", "105_etirement_poignets_avant_bras"],
  ["Pince assise (chaîne postérieure)", "106_pince_assise"],
  ["Équilibre unipodal", "107_equilibre_unipodal"],
  ["Équilibre unipodal yeux fermés", "108_equilibre_unipodal_yeux_fermes"],
  ["Équilibre unipodal sur surface instable", "109_equilibre_surface_instable"],
  ["Excursions du pied (Y-balance)", "110_excursions_pied_y_balance"],
  ["Marche talon-pointe", "111_marche_talon_pointe"],
  ["Fente avant avec arrêt contrôlé", "112_fente_avant_arret_controle"],
  ["Réception de saut amortie", "113_reception_saut_amortie"],
  ["Sauts unipodaux avec réception stabilisée", "114_sauts_unipodaux_reception"],
  ["Squat unipodal sur boîte", "115_squat_unipodal_boite"],
  ["Transferts de poids sur un pied", "116_transferts_poids_un_pied"],
  ["Rotation externe d'épaule à l'élastique", "117_rotation_externe_epaule_elastique"],
  ["Rotation interne d'épaule à l'élastique", "118_rotation_interne_epaule_elastique"],
  ["Élévation dans le plan de l'omoplate", "119_elevation_plan_omoplate"],
  ["Pallof press à l'élastique", "120_pallof_press_elastique"],
  ["Marche latérale à l'élastique (monster walk)", "121_marche_laterale_elastique"],
  ["Y-T-W au sol", "122_y_t_w_au_sol"],
  ["Traction scapulaire", "123_traction_scapulaire"],
  ["Dead bug", "124_dead_bug"],
  ["Gainage latéral", "125_gainage_lateral"],
  ["Pont fessier unipodal", "126_pont_fessier_unipodal"],
  ["Copenhagen (adducteurs)", "127_copenhagen_adducteurs"],
  ["Nordic curl assisté", "128_nordic_curl_assiste"],
  ["Mollets excentriques sur marche", "129_mollets_excentriques_marche"],
  ["Relevés de pointes de pieds (tibial)", "130_releves_pointes_pieds"],
  ["Chien tête en bas", "131_chien_tete_en_bas"],
  ["Chien tête en haut", "132_chien_tete_en_haut"],
  ["Posture de l'enfant", "133_posture_enfant"],
  ["Posture du guerrier I", "134_guerrier_1"],
  ["Posture du guerrier II", "135_guerrier_2"],
  ["Posture du guerrier III", "136_guerrier_3"],
  ["Posture de l'arbre", "137_posture_arbre"],
  ["Posture du pigeon", "138_posture_pigeon"],
  ["Posture du triangle", "139_posture_triangle"],
  ["Posture du cobra", "140_posture_cobra"],
  ["Posture du chameau", "141_posture_chameau"],
  ["Posture de la chaise", "142_posture_chaise"],
  /* Proche du 94 (le même mouvement, rangé en mobilité d'un côté et en yoga de
     l'autre) mais dessinée à part : chacune garde donc sa planche. */
  ["Torsion vertébrale assise", "143_torsion_vertebrale_assise"],
  ["Salutation au soleil", "144_salutation_soleil"],
  ["Respiration diaphragmatique", "145_respiration_diaphragmatique"],
  ["Savasana (relâchement final)", "146_savasana"],
];

/* Table indexée sur la forme normalisée du nom. Map conserve l'ordre
   d'insertion, donc deux entrées de même longueur se départagent toujours de
   la même façon. */
let INDEX = null;
function index() {
  if (INDEX) return INDEX;
  INDEX = new Map();
  for (const [nom, fichier] of TABLE) {
    const k = musNorm(nom);
    if (!INDEX.has(k)) INDEX.set(k, fichier);
  }
  return INDEX;
}

/** Mémorisation des recherches : appelées depuis des listes. */
const CACHE = new Map();

/**
 * La planche d'un exercice, ou null si aucune correspondance n'est SÛRE.
 *
 * Cascade, du plus fiable au plus tolérant :
 *  1. nom exact (après normalisation) ;
 *  2. une entrée de la table est contenue dans le nom demandé — « squat
 *     bulgare lesté » retrouve « squat » ; la plus longue gagne ;
 *  3. le nom demandé est contenu dans une entrée — « développé couché »
 *     retrouve « développé couché barre » ; la plus courte gagne ;
 *  4. faute de frappe (Levenshtein ≤ 2), et seulement sur des noms assez
 *     longs pour que deux corrections ne mènent pas à un autre mouvement.
 */
export function visualFor(nom) {
  const q = musNorm(nom);
  if (!q.trim()) return null;
  if (CACHE.has(q)) return CACHE.get(q);

  const idx = index();
  let fichier = idx.get(q) || null;

  if (!fichier) {
    let best = -1;
    for (const [k, f] of idx) if (q.includes(k) && k.length > best) { best = k.length; fichier = f; }
  }
  if (!fichier) {
    let best = Infinity;
    for (const [k, f] of idx) if (k.includes(q) && k.length < best) { best = k.length; fichier = f; }
  }
  if (!fichier && q.length >= 10) {
    for (const [k, f] of idx) if (lev(q, k, 2) <= 2) { fichier = f; break; }
  }

  const v = fichier ? { fichier, image: BASE + fichier + '.jpg' } : null;
  CACHE.set(q, v);
  return v;
}

/** Vrai si l'exercice a une planche — pour n'ouvrir la porte que si elle mène quelque part. */
export function hasVisual(nom) { return visualFor(nom) !== null; }

/* ================================================================ affichage */

/**
 * Vignette de la planche, ou null quand l'exercice n'en a pas : une case vide
 * dans une liste n'ajouterait que du bruit. `loading="lazy"` parce qu'un
 * catalogue complet affiche près de cent vignettes d'un coup.
 */
export function vignetteExercice(nom, taille = 30) {
  const v = visualFor(nom);
  if (!v) return null;
  const img = h(`<img class="exo-vignette" src="${v.image}" alt="" loading="lazy"
    width="${taille}" height="${taille}">`);
  return img;
}

/**
 * La planche du mouvement, en grand.
 *
 * Pas de légende « départ » / « arrivée » : d'une planche à l'autre, c'est
 * tantôt la position de départ tantôt celle d'arrivée qui est dessinée en
 * vert. La flèche, elle, donne toujours le sens — c'est donc elle qu'on
 * annonce, et rien de plus.
 */
export function ouvrirPlanche(nom) {
  const v = visualFor(nom);
  const modale = h(`
    <div class="modale" role="dialog" aria-label="Mouvement de l'exercice">
      <div class="modale-boite">
        <div class="modale-tete">
          <h2>${esc(nom || 'Exercice')}</h2>
          <button class="lien-inline" data-fermer type="button">Fermer</button>
        </div>
        ${v
          ? `<img class="exo-planche" src="${v.image}" alt="Mouvement de l'exercice ${esc(nom)}">
             <p class="etat-mono exo-planche-legende">Les deux positions du mouvement. La flèche indique le sens.</p>`
          : `<p class="etat-mono">Pas encore de visuel pour cet exercice.</p>`}
      </div>
    </div>`);
  modale.querySelector('[data-fermer]').onclick = () => modale.remove();
  modale.addEventListener('click', (e) => { if (e.target === modale) modale.remove(); });
  document.addEventListener('keydown', function fermeEch(e) {
    if (e.key === 'Escape') { modale.remove(); document.removeEventListener('keydown', fermeEch); }
  });
  document.body.appendChild(modale);
  return modale;
}
