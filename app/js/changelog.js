/* ==========================================================================
   Journal des nouveautes -- portage mecanique de Changelog.kt (meme texte,
   meme ordre chronologique -- le plus ancien en premier, l'ecran inverse a
   l'affichage). Genere par script depuis le fichier Kotlin source, pas
   retype a la main -- recopier le meme script au prochain ajout de version
   plutot que d'editer cette liste directement au clavier.
   ========================================================================== */

export const CHANGELOG = [
  { date: "28 juillet 2026", versions: "v1.0 → v1.8", items: [
                "Chronomètre, minuteur et Tabata en une seule application",
                "Bulle flottante qui reste visible par-dessus les autres applications",
                "Bips qui continuent écran éteint",
                "Sons au volume multimédia, mêlés à la musique",
                "Sifflet de moniteur à la place du bip",
                "Onglets et préréglages de minuteur",
                "Durée libre au-delà des préréglages",
                "Carnet d'entraînement",
                "Séances enregistrées et historique daté",
                "Temps sous tension mesuré série par série",
                "Bilan de fin de séance"
            ] },
  { date: "29 juillet 2026", versions: "v1.9 → v1.18", items: [
                "Décompte de mise en place avant chaque exercice",
                "Saisie des répétitions pendant la récupération",
                "Report automatique des charges d'une série à l'autre",
                "Catégories d'entraînement personnalisables",
                "Ajout d'un exercice en pleine séance",
                "Choix du son : canard ou sifflet réglable",
                "Profil avec tonnage semaine, mois et total",
                "Trophées",
                "Sauvegarde exportable et restauration",
                "Mise à jour de l'application depuis l'application"
            ] },
  { date: "30 juillet 2026", versions: "v1.19 → v1.27", items: [
                "Thèmes de couleurs",
                "Réordonner les exercices par glissé",
                "Répétitions cible par exercice",
                "Catalogue d'exercices par groupe musculaire",
                "Mode clair et mode sombre"
            ] },
  { date: "1er août 2026", versions: "v1.28 → v1.35", items: [
                "Chronomètre global de séance",
                "Mode paysage",
                "Estimation de la durée d'une séance",
                "Navigation entre séries par glissement",
                "Réglage séparé du décompte et du départ",
                "Rappel de la dernière performance sous chaque saisie",
                "Pause en cours de séance",
                "Écran d'échauffement à l'arrivée sur un exercice",
                "Bilan modifiable après coup",
                "Suppression d'une séance de l'historique",
                "Trophées à paliers, six familles et dix-huit étoiles",
                "Partage d'une séance à un ami",
                "Bilan partageable en story, en une image"
            ] },
  { date: "2 août 2026", versions: "v1.36 → v1.39", items: [
                "Import automatique d'une séance reçue",
                "QR code de séance à scanner sur place",
                "Détail des répétitions et des charges sur l'image de bilan",
                "Historique des nouveautés dans le menu Mise à jour"
            ] },
  { date: "2 août 2026 — Motio", versions: "v1.40", items: [
                "Nouveau nom et nouveau logo : l'application devient Motio",
                "Thème Motio : clair crème et vert olive, par défaut",
                "Logotype dans l'en-tête et nouvelle icône",
                "Icônes dans la barre de navigation",
                "Cartes de séance redessinées avec pavé de catégorie",
                "Zone d'import en pointillés"
            ] },
  { date: "3 août 2026", versions: "v1.41", items: [
                "Écran d'ouverture avec le logo, aux couleurs du thème",
                "Import de séance en bouton compact à côté de « Nouvel entraînement »",
                "Écran d'accueil et profil allégés",
                "Numéro de version déplacé dans la zone Mise à jour",
                "Splash animé : fondu du fond, barre de chargement, logo",
                "Splash à chaque retour depuis la tâche de fond",
                "Logo M et MOTIO sur l'image de bilan partagée"
            ] },
  { date: "2 août 2026", versions: "v1.43 → v1.44", items: [
                "Générateur de programme : objectif, niveau, jours disponibles",
                "Split choisi automatiquement (Full body, Push/Pull/Legs) selon la fréquence",
                "Exercices piochés dans ton propre catalogue, les lourds en premier",
                "Séries, répétitions et récupération adaptées à l'objectif",
                "Progression semaine après semaine et semaines de décharge",
                "Planning daté, séance lancée en un appui, cochée une fois faite",
                "Retour à l'exercice précédent pendant la séance"
            ] },
  { date: "2 août 2026", versions: "v1.45", items: [
                "Compte en ligne : inscription par e-mail ou connexion Google",
                "Pseudo public, modifiable, qui servira à se retrouver entre amis",
                "Suppression de compte depuis l'application",
                "Identifiant stable sur chaque séance réalisée (préparation de la synchronisation)"
            ] },
  { date: "3 août 2026", versions: "v1.46", items: [
                "Correction : l'écran restait bloqué après une connexion Google",
                "Connexion Google terminée automatiquement au redémarrage de l'appli",
                "Adresse du serveur nettoyée si le préfixe https a été collé en double"
            ] },
  { date: "3 août 2026", versions: "v1.47", items: [
                "Nouvel onglet Amis : le fil des séances de ceux que tu suis",
                "Recherche de quelqu'un par son pseudo, abonnement et désabonnement",
                "Tes séances terminées partent automatiquement sur le serveur",
                "Seul le résumé est envoyé : le détail des séries reste sur le téléphone"
            ] },
  { date: "3 août 2026", versions: "v1.48", items: [
                "Appuie sur une séance du fil pour voir le détail complet",
                "Chaque exercice avec ses séries : poids, répétitions, temps sous tension",
                "La série la plus lourde de l'exercice est mise en évidence",
                "Les charges sont désormais visibles des personnes qui te suivent"
            ] },
  { date: "3 août 2026", versions: "v1.49", items: [
                "Chaque exercice porte son matériel : barre, haltères, machine, poids du corps",
                "Le générateur ne propose que ce que tu peux faire là où tu t'entraînes",
                "Matériel déduit automatiquement, modifiable depuis le catalogue",
                "Programme exportable vers l'agenda du téléphone (Google, Samsung, Outlook…)",
                "Séances déplacées ou supprimées : l'agenda suit",
                "Interrupteur pour partager, ou non, le détail de ses séances"
            ] },
  { date: "3 août 2026", versions: "v1.50", items: [
                "Les mises à jour proviennent désormais du dépôt Motio",
                "Nouvelle adresse pour la page des liens de partage",
                "Version de transition : à installer pour continuer à recevoir les mises à jour"
            ] },
  { date: "4 août 2026", versions: "v1.51", items: [
                "Le détail d'une séance planifiée rappelle ta dernière charge sur chaque exercice",
                "Référence relue à chaque ouverture : elle suit ta progression"
            ] },
  { date: "4 août 2026", versions: "v1.52", items: [
                "Sauvegarde du carnet dans ton compte, visible de toi seul",
                "Envoi automatique au lancement quand le carnet a changé",
                "Restauration sur un nouveau téléphone en un bouton",
                "Le catalogue d'exercices et les programmes sont enfin sauvegardés",
                "Cela vaut aussi pour l'export en fichier, jusqu'ici incomplet"
            ] },
  { date: "4 août 2026", versions: "v1.53", items: [
                "Nouvel écran Analyse : Profil › Analyse et records",
                "1RM estimé par exercice, formule d'Epley",
                "Bandeau « nouveau record » au moment où tu valides la série",
                "Volume hebdomadaire par groupe musculaire, semaine par semaine",
                "Courbe de progression : 1RM, charge max, volume ou répétitions",
                "Calculateur de disques et échauffement suggéré"
            ] },
  { date: "4 août 2026", versions: "v1.54", items: [
                "Ressenti de fin de séance : cinq émojis, d'épuisé à excellent",
                "Note libre par séance (douleur, mauvaise nuit…)",
                "Ressenti et note visibles dans l'historique",
                "Remplacer un exercice en cours de séance quand la machine est prise",
                "Les séries déjà faites restent sous l'ancien exercice"
            ] },
  { date: "4 août 2026", versions: "v1.55", items: [
                "Répétitions en réserve (RIR) par série, à saisir pendant la récup",
                "Le RPE correspondant s'affiche : RIR 2 = RPE 8",
                "Correction : le bandeau de record ne se déclenchait qu'au changement d'exercice",
                "Le RIR apparaît dans le détail des séances partagées"
            ] },
  { date: "4 août 2026", versions: "v1.56", items: [
                "Kudos sur les séances du fil",
                "Commentaires, avec suppression par l'auteur ou le propriétaire de la séance",
                "Profil d'un abonné : ses statistiques, ses records, ses dernières séances",
                "Appuie sur un pseudo dans le fil pour l'ouvrir"
            ] },
  { date: "4 août 2026", versions: "v1.57", items: [
                "Correction : le fil restait vide avec une erreur 300 depuis l'ajout des kudos",
                "Messages d'erreur du serveur enfin lisibles"
            ] },
  { date: "4 août 2026", versions: "v1.58 → v1.59", items: [
                "Superséries et circuits : « ＋ enchaîner » entre deux exercices de l'éditeur",
                "En séance, les exercices d'un bloc s'enchaînent sans repos",
                "La récupération ne démarre qu'après le dernier du tour",
                "Nouvel onglet Défis : tonnage, séances ou régularité, sur 7, 30 ou 90 jours",
                "Le classement ne contient que les personnes que tu suis",
                "Carte musculaire en fin de séance : face et dos, colorés selon le travail fourni",
                "La même carte dans Analyse › Volume, pour la semaine entière"
            ] },
  { date: "4 août 2026", versions: "v1.60", items: [
                "Tutoriel à la première ouverture, avec un bouton Passer",
                "Rejouable à tout moment depuis Profil › Revoir le tutoriel",
                "Écran Confidentialité : ce qui part, qui le voit, comment tout effacer",
                "Lien vers la politique complète avant la création d'un compte"
            ] },
  { date: "4 août 2026", versions: "v1.61", items: [
                "Récupération affichée en minutes:secondes partout",
                "Temps de récup rappelé en haut de la séance (r 2:00)",
                "Flèche ► pour consulter l'exercice suivant sans perdre sa récup",
                "Les deux flèches ne coupent plus le décompte en cours",
                "Pavé numérique enfin utilisable en écran paysage",
                "Tutoriel : changement de page au glissement du doigt"
            ] },
  { date: "4 août 2026", versions: "v1.62", items: [
                "Bouton « Renvoyer toutes mes séances » dans le profil",
                "Le détail manquant est désormais expliqué au lieu d'être masqué",
                "Le bouton Détail est toujours visible dans le fil"
            ] },
  { date: "4 août 2026", versions: "v1.63", items: [
                "La séance continue quand tu passes sur Amis ou Profil",
                "Seul « Terminer la séance » y met fin",
                "L'en-tête ne coupe plus une information en deux entre deux lignes",
                "Temps de récupération saisi au pavé, en minutes:secondes",
                "Revenir sur un exercice sauté, même en fin de séance, et y faire ses séries",
                "Retirer une ligne d'exercice depuis le bilan",
                "Numéro devant chaque exercice dans les listes"
            ] },
  { date: "4 août 2026", versions: "v1.64", items: [
                "Carte musculaire refaite sur une vraie planche anatomique",
                "Treize muscles colorés séparément, face et dos",
                "Trait adapté au thème clair comme au thème sombre"
            ] },
  { date: "6 août 2026", versions: "v1.65", items: [
                "Carte musculaire : les exercices écrits à la main sont enfin reconnus",
                "Environ 200 familles d'exercices comprises, fautes de frappe tolérées",
                "Un exercice colore tous ses muscles, moteurs et assistants",
                "Couleurs sur une échelle fixe : une séance légère a l'air légère",
                "Détail chiffré des séries par muscle sous la silhouette",
                "Un exercice non reconnu se signale et se rattache en un appui"
            ] },
  { date: "6 août 2026", versions: "v1.66", items: [
                "Avant et arrière d'épaule colorés séparément",
                "Les muscles assistants pèsent moins : fini les pectoraux allumés par un pullover",
                "La mâchoire du personnage n'est plus colorée avec le cou"
            ] },
  { date: "6 août 2026", versions: "v1.67", items: [
                "Séances et programmes synchronisés avec le compte",
                "Retrouver son carnet entier sur un téléphone neuf",
                "Ce qui est créé hors ligne part à la prochaine connexion",
                "Une séance supprimée le reste, sur tous les appareils",
                "Carte « Séances et programmes » dans le profil",
                "Site web : consulter et créer depuis un ordinateur"
            ] },
  { date: "6 août 2026", versions: "v1.68", items: [
                "Profil repensé : identité en haut, trophées juste en dessous",
                "Trophées en grille, avec le détail des trois paliers au toucher",
                "Compte, sauvegarde et mise à jour rangés dans leurs propres écrans",
                "Séances, heures cumulées et étoiles visibles d'un coup d'œil",
                "Le bouton retour ramène au profil au lieu de quitter l'appli"
            ] },
  { date: "7 août 2026", versions: "v1.69", items: [
                "Épingler une séance pour la garder en haut de la liste",
                "Fini les doublons : modifier une séance en route n'en crée plus une",
                "Le bilan propose d'enregistrer la variante, au lieu de l'imposer",
                "Menu de séance allégé, avec boutons épingler et partager",
                "Partage regroupé : lien à envoyer ou QR code",
                "QR code redessiné, avec le logo Motio au centre",
                "Fil des amis : toute la carte ouvre le détail de la séance"
            ] },
  { date: "7 août 2026", versions: "v1.70", items: [
                "Le bilan peut mettre à jour la séance avec ce qui a été fait",
                "Ranger le carnet : regrouper les séances en double d'un appui",
                "La fusion conserve tout l'historique des séances regroupées",
                "Les séances d'un programme sont écartées du rangement"
            ] },
  { date: "7 août 2026", versions: "v1.71", items: [
                "Poids et répétitions repris de la dernière séance",
                "Récapitulatif de la dernière fois sur l'écran d'échauffement",
                "RIR de la dernière séance pré-coché, en grisé tant qu'il n'est pas confirmé",
                "Le compteur de séries n'annonce plus la série suivante",
                "Les flèches défilent série par série pour corriger en direct",
                "Durée estimée ajustée, puis remplacée par la moyenne réelle",
                "Choix de la silhouette homme ou femme dans le profil"
            ] },
  { date: "7 août 2026", versions: "v1.72", items: [
                "Carte musculaire féminine, quatorze muscles redécoupés",
                "Le réglage de silhouette change enfin le dessin"
            ] },
  { date: "10 août 2026", versions: "v1.73", items: [
                "Cartes musculaires refaites, homme et femme",
                "Chaque muscle suit exactement le tracé de la planche",
                "Zones attribuées une à une, plus aucune approximation",
                "Gauche et droite strictement symétriques"
            ] },
  { date: "10 août 2026", versions: "v1.75", items: [
                "Cartes musculaires nettes : bords lissés, triple définition",
                "Quadriceps arrêté au genou, sur les deux silhouettes",
                "Face avant du tibia laissée neutre",
                "Silhouette féminine allégée : stries internes retirées"
            ] },
  { date: "10 août 2026", versions: "v1.76", items: [
                "Correction des trous blancs dans les muscles de la silhouette féminine"
            ] },
  { date: "10 août 2026", versions: "v1.77", items: [
                "Silhouette féminine redessinée dans le style de la masculine",
                "Chaque muscle a son contour, aucun n'est strié"
            ] },
  { date: "10 août 2026", versions: "v1.78", items: [
                "Couleur des muscles posée par-dessus le dessin",
                "Stries masquées sans retoucher la planche, contours préservés"
            ] },
  { date: "11 août 2026", versions: "v1.79", items: [
                "Mon profil : sexe, poids et taille, en touchant sa carte",
                "Poids du corps repris automatiquement sur tractions, dips et pompes",
                "Lestage : on ne saisit que le supplément, affiché « PDC +10 »",
                "Carte féminine nettoyée : plus de stries ni de bruit",
                "Calculateur de disques : le 25 kg retiré, 20 kg maximum"
            ] },
  { date: "11 août 2026", versions: "v1.80", items: [
                "Carte musculaire : la silhouette féminine est en refonte",
                "En attendant, le dessin masculin est utilisé dans les deux cas"
            ] },
  { date: "11 août 2026", versions: "v1.82", items: [
                "Supersérie repensée : les exercices liés forment un seul écran",
                "Plus besoin de toucher l'écran entre les deux exercices",
                "Un appui lance, un appui déclenche la récupération",
                "Poids, répétitions et RIR de chaque exercice pendant le repos",
                "Séries prévues et récupération données par le premier du bloc"
            ] },
  { date: "11 août 2026", versions: "v1.83", items: [
                "Écran de supersérie compacté : le chrono reste entier",
                "Titre et lignes de saisie resserrés quand deux exercices sont liés",
                "Le compteur d'exercices compte le bloc pour un seul"
            ] },
  { date: "12 août 2026", versions: "v1.84", items: [
                "Supersérie : tout est regroupé sous le nom de chaque exercice",
                "RIR puis poids et répétitions se suivent, sans phrase inutile",
                "Titre du bloc raccourci, il n'est plus tronqué"
            ] },
  { date: "13 août 2026", versions: "v1.85", items: [
                "Profil rejoint Minuteurs, Entraînement et Amis dans la barre du bas",
                "Arrondis harmonisés sur toute l'appli, plus d'improvisation écran par écran",
                "Icône du thème refaite pour coller au reste de la navigation",
                "Couleurs de repos et de record étendues aux fenêtres du système"
            ] },
  { date: "13 août 2026", versions: "v1.86", items: [
                "Carte musculaire affichée en direct pendant la création d'une séance",
                "Appui sur un muscle (colorié ou non) : son nom s'affiche dans une bulle",
                "Développé couché et dips colorent aussi un peu les biceps et les abdos",
                "Silhouette féminine dédiée : toujours à l'étude, en attente d'une planche exploitable"
            ] },
  { date: "13 août 2026", versions: "v1.87", items: [
                "Carte musculaire : pincer pour zoomer jusqu'au plein écran",
                "Beaucoup plus facile de toucher le bon muscle sur un grand écran",
                "Le nom du muscle touché reste affiché en haut, lisible même très zoomé"
            ] },
  { date: "13 août 2026", versions: "v1.88", items: [
                "Correction : le plein écran de la carte musculaire ne s'affichait pas correctement",
                "Le zoom utilise maintenant tout l'écran, plus de zone recadrée au centre",
                "Le clic sur un muscle refonctionne une fois zoomé"
            ] },
  { date: "13 août 2026", versions: "v1.89", items: [
                "Le plein écran démarre au niveau de zoom déjà atteint en pinçant, avec une ouverture en douceur",
                "Une fois zoomé, glisser latéralement passe de la silhouette avant à la silhouette arrière",
                "Le nom du muscle touché s'affiche directement sur lui, plus dans un bandeau"
            ] },
  { date: "13 août 2026", versions: "v1.90", items: [
                "Reconnaissance du muscle touché au pixel près, plus de nom voisin par erreur",
                "L'ouverture du plein écran grandit depuis la carte plutôt que de s'ouvrir par-dessus",
                "Une fois zoomé, glisser d'un doigt retourne la silhouette comme une page (avant/dos)",
                "Déplacement dans l'image désormais à deux doigts, pour ne plus confondre avec le retournement"
            ] },
  { date: "13 août 2026", versions: "v1.91", items: [
                "Correction : les images des muscles étaient lues à la mauvaise échelle, ce qui faisait rater l'étiquette sur une bonne partie de chaque muscle",
                "Plus de zone morte entre appui et glissement : un appui qui tremble un peu reste reconnu"
            ] },
  { date: "13 août 2026", versions: "v1.92", items: [
                "Correction : la silhouette dérivait hors du centre en dézoomant sur la carte musculaire",
                "Le cadrage reste maintenant stable quel que soit le niveau de zoom"
            ] },
  { date: "13 août 2026", versions: "v1.93", items: [
                "Le plein écran affiche une seule silhouette, en grand : le retournement est net, sans voir l'autre passer",
                "Le glissement vertical sur la carte fait de nouveau défiler la page du bilan",
                "Temps restant estimé affiché sous la croix pendant la séance",
                "Supersérie : cases poids, reps et RIR resserrées pour garder le chrono visible"
            ] },
  { date: "13 août 2026", versions: "v1.94", items: [
                "Les séances partent vers les amis toutes seules, sans passer par l'onglet Amis",
                "Le carnet se sauvegarde tout seul : plus de bouton Sauvegarder ni Restaurer",
                "Sur un nouveau téléphone, il suffit de se connecter : tout redescend automatiquement",
                "L'écran Compte indique simplement où en est la synchronisation"
            ] },
  { date: "13 août 2026", versions: "v1.95", items: [
                "La sauvegarde par fichier rejoint l'écran Compte : une seule entrée pour tout le carnet",
                "Rubrique Données retirée du menu Profil"
            ] },
  { date: "13 août 2026", versions: "v1.96", items: [
                "Ménage interne : navigation du Profil sécurisée, briques d'interface partagées",
                "Rien ne change à l'usage, mais les prochaines évolutions seront plus sûres"
            ] },
  { date: "13 août 2026", versions: "v1.97", items: [
                "Blocs d'entraînement : les séances d'un même programme sont regroupées à l'accueil",
                "Dans un bloc, la catégorie (Push, Pull, Legs) devient le titre de la carte",
                "La séance dont c'est le tour remonte en tête et porte le marqueur « à faire »",
                "« il y a 2 jours » remplace « fait 2× » : ce qui aide vraiment à choisir",
                "Un bloc peut être mis en avant pour apparaître en premier",
                "Vos séances de même nom ont été regroupées automatiquement, les autres restent seules"
            ] },
  { date: "13 août 2026", versions: "v1.98", items: [
                "Les séances sont visibles dès l'ouverture, sans avoir à faire défiler",
                "Créer une séance, importer et ouvrir le programme sont passés sous la liste"
            ] },
  { date: "13 août 2026", versions: "v1.99", items: [
                "Les nouveautés s'affichent de la plus récente à la plus ancienne",
                "Plus besoin de dérouler toute la liste pour voir ce qui vient de changer"
            ] },
  { date: "13 août 2026", versions: "v2.0", items: [
                "Nouveau visuel du bilan de séance partagé : fond olive foncé, cadran de chronomètre autour du tonnage",
                "Typographies Outfit et JetBrains Mono, identiques à celles du site compagnon",
                "Détail des exercices en pointillés, plafonné à sept lignes sur les grosses séances",
                "Même identité visuelle que le site web pour partager sa séance"
            ] },
  { date: "14 août 2026", versions: "v2.1 → v2.9", items: [
                "Suggestion de charge du coach pendant la séance, à partir de ta dernière performance",
                "Profil d'entraînement : niveau et objectif, dans Compte",
                "Génération d'une séance isolée, sans passer par un programme complet",
                "Bouton « Générer une séance » directement depuis la liste des entraînements"
            ] },
  { date: "14 août 2026", versions: "v2.10 → v2.11", items: [
                "Écran d'aperçu avant de valider un programme généré",
                "Le générateur ne sauvegarde plus rien tant que tu n'as pas validé",
                "Nettoyage automatique des modèles de séance inutilisés à la suppression d'un programme",
                "Nouveau générateur par phrase libre : décris ton objectif, l'IA propose un programme complet"
            ] },
  { date: "14 août 2026", versions: "v2.12 → v2.13", items: [
                "Coach IA : nouvel onglet Moti, accessible depuis Profil",
                "Discussion en langage naturel, motivation et conseils sur tes séances récentes"
            ] },
  { date: "14 août 2026", versions: "v2.14 → v2.16", items: [
                "Carte de séance partagée : silhouette dessinée directement dans l'appli, plus besoin d'image externe",
                "Nouvelle disposition : silhouette au centre, trois tuiles de chiffres autour",
                "Texte agrandi, taille adaptée au format story, nouveau slogan"
            ] },
  { date: "14 août 2026", versions: "v2.17 → v2.19", items: [
                "Liste d'exercices de la carte partagée répartie sur deux colonnes équilibrées",
                "Notification sonore quand un message arrive pendant l'entraînement",
                "Une rafale de bips par message reçu, plus facile à remarquer",
                "Le coach IA connaît désormais la date et l'heure de tes séances récentes"
            ] },
  { date: "15 août 2026", versions: "v2.20", items: [
                "Bulle Coach IA flottante, accessible pendant la séance sans la quitter",
                "Le clavier ne cache plus le champ de saisie du chat",
                "Moti peut proposer une séance directement dans la discussion, à ouvrir en un appui"
            ] },
  { date: "15 août 2026", versions: "v2.21", items: [
                "Moti se présente au premier lancement de l'application",
                "Le coach IA se présente sous ce nom dans toutes les discussions",
                "Nouvelle section « Découvre Moti » sur le site compagnon"
            ] },
  { date: "15 août 2026", versions: "v2.22 → v2.24", items: [
                "Nouvel onglet Groupes : créer un groupe avec nom, description et bannière",
                "Invitation par lien ou QR code, adhésion immédiate",
                "Rejoindre un groupe en cherchant simplement son nom",
                "Fil et classement propres à chaque groupe, canal de discussion dédié",
                "Le propriétaire peut retirer un membre ou supprimer le groupe"
            ] },
  { date: "15 août 2026", versions: "v2.25 → v2.26", items: [
                "Portrait de Moti intégré partout dans l'appli : carte coach, avatar",
                "Recadrage puis version sans fond, plus nette sur toutes les tailles",
                "Même portrait repris sur le site compagnon"
            ] },
  { date: "16 août 2026", versions: "v2.27", items: [
                "Journal des nouveautés remis à jour jusqu'à la version actuelle",
                "Sur iPhone : le lien envoyé par un ami ouvre désormais un espace web qui reprend l'appli (entraînement, minuteurs, coach, messages, groupes)"
            ] },
  { date: "16 août 2026", versions: "v2.28", items: [
                "Retrait des puces de filtre par catégorie sur l'écran Entraînement, jamais utilisées",
                "La couleur par catégorie sur les cartes reste : elle se lit sans avoir à cliquer"
            ] },
  { date: "16 août 2026", versions: "v2.29", items: [
                "Thème Motio sombre éclairci : fond et panneaux remontés d'un cran, moins écrasant",
                "Espace web iPhone : mêmes réglages Thème et Son que l'appli, jusque-là absents"
            ] },
  { date: "17 août 2026", versions: "v2.30", items: [
                "La conversation avec le coach IA se synchronise maintenant entre l'appli et l'espace web"
            ] },
  { date: "17 août 2026", versions: "v2.31", items: [
                "Profil public : tes séances peuvent apparaître dans le fil et le classement de tout le monde, pas seulement de tes abonnés",
                "Filtre Amis/Tous dans le fil et le classement",
                "Cartes du fil plus compactes, avec un titre de séance basé sur les muscles travaillés"
            ] },
  { date: "17 août 2026", versions: "v2.32", items: [
                "Correction : le nombre de série affiché pendant la récupération",
                "Correction : le bouton « Quitter sans enregistrer » ne fermait pas la fenêtre",
                "Correction : « Enchaîner » ne fait plus remonter la page en haut, bouton agrandi",
                "Correction : le champ de saisie du chat n'était pas complètement visible",
                "RIR modifiable après coup sur une série déjà faite (glissement)",
                "Séances récentes affichées avant les records sur le profil d'un ami, avec un lien vers les autres séances et le détail de chaque séance",
                "Suppression d'une séance : elle disparaît aussi du fil et du classement de tes abonnés",
                "En-tête du fil allégé (le doublon avec les onglets est retiré)",
                "Les 3 minuteurs (Chrono/Minuteur/Tabata) partagent maintenant la même présentation",
                "Génération d'une séance individuelle par IA, directement depuis l'écran Entraînement",
                "Moti (coach IA) répond avec plus de précision aux questions techniques de préparation physique, et garde un ton plus tenu"
            ] },
  { date: "18 août 2026", versions: "v2.33", items: [
                "Notification quand quelqu'un aime ou commente une de tes séances, et quand tu reçois un message",
                "Nouveau menu Notifications dans Compte et données : chaque type se coupe ou s'active séparément",
                "1RM testé : touche « Modifier » dans Analyse et records pour saisir ton vrai maxi",
                "Moti connaît tes 1RM testés et s'en sert pour les charges conseillées et tes programmes"
            ] },
  { date: "31 août 2026", versions: "v2.52", items: [
                "Le lien de partage d'une séance tient enfin sur une ligne : sept caractères au lieu de trois cents. Fini le pavé illisible qui avait l'air d'un lien douteux dans une messagerie",
                "QR code de séance bien plus lisible et plus rapide à scanner, puisqu'il a beaucoup moins à encoder",
                "Les liens déjà envoyés continuent de fonctionner, et sans réseau le partage repart tout seul sur l'ancien format : il ne peut pas échouer"
            ] },
];
