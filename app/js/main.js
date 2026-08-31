import { route, setNotFound, before, start, resolve, currentPath } from './router.js';
import { currentSession, onAuthChange, CLE_ERREUR_AUTH } from './supabase.js';
import { $, $$, h, render, empty } from './ui.js';
import { appliquerTheme, ouvrirTheme, ouvrirReglagesBips } from './reglages.js';
import { etatBrut as seanceEnCours } from './run-state.js';
import { syncPrefs } from './prefs-sync.js';
import * as beeper from './beeper.js';

/* Avant tout le reste : évite un flash du mauvais thème au premier rendu. */
appliquerTheme();
matchMedia('(prefers-color-scheme:dark)').addEventListener('change', appliquerTheme);

import { vueConnexion } from './views/connexion.js';
import { vueFil } from './views/fil.js';
import { vueProfil, vueAmis, vueProfilAnalyse, vueProfilCompte,
         vueProfilMaj, vueProfilNouveautes } from './views/profil.js';
import { vueSeances, vueToutesSeances, vueSeanceEdition, vueProgrammes,
         vueProgrammeNouveau, vueHistorique, vueImporterSeance, vueHistoriqueSeance } from './views/entrainement.js';
import { vueLancerSeance } from './views/lancer.js';
import { vueCoach } from './views/coach.js';
import { vueMessages, vueMessageThread } from './views/messages.js';
import { vueDirect } from './views/direct.js';
import { vueGroupes, vueGroupeDetail, vueGroupeRejoindre } from './views/groupes.js';
import { vueDefis } from './views/defis.js';
import { vueMinuteurs } from './views/minuteurs.js';
import { vueOnboarding, pending as onboardingPending } from './views/onboarding.js';

const PUBLIQUES = ['/connexion'];

/* --- routes --- */
route('/', () => { location.hash = '#/seances'; });
route('/connexion', vueConnexion);
route('/onboarding', vueOnboarding);
route('/minuteurs', vueMinuteurs);
route('/fil', vueFil);
route('/amis', vueAmis);
route('/profil', vueProfil);
route('/profil/analyse', vueProfilAnalyse);
route('/profil/compte', vueProfilCompte);
route('/profil/maj', vueProfilMaj);
route('/profil/nouveautes', vueProfilNouveautes);
route('/profil/:id', vueProfil);
route('/coach', vueCoach);
route('/messages', vueMessages);
route('/messages/:id', vueMessageThread);
route('/direct/:id', vueDirect);
route('/groupes', vueGroupes);
route('/groupes/rejoindre/:code', vueGroupeRejoindre);
route('/groupes/:id', vueGroupeDetail);
route('/defis', vueDefis);
route('/seances', vueSeances);
/* Avant /seances/:id : sans ça, « toutes » serait pris pour l'id d'une séance
   à éditer (même précaution que les sous-écrans de /profil). */
route('/seances/toutes', vueToutesSeances);
route('/seances/importer/:code', vueImporterSeance);
route('/seances/:id', vueSeanceEdition);
route('/seances/:id/lancer', vueLancerSeance);
route('/seances/:id/historique', vueHistoriqueSeance);
route('/programmes', vueProgrammes);
route('/programmes/nouveau', vueProgrammeNouveau);
route('/historique', vueHistorique);

setNotFound(() => render(empty(
  'Page introuvable',
  'Ce lien ne mène nulle part.',
  { href: '#/seances', label: 'Retour à Entraînement' }
)));

/* --- garde : pas de session, pas d'espace web --- */
before(async (path) => {
  const session = await currentSession();
  if (!session && !PUBLIQUES.includes(path)) return '/connexion';
  if (session && path === '/connexion') return '/seances';
  // Tutoriel de première ouverture : passe devant tout le reste, comme côté
  // natif (OnboardingScreen s'affiche par-dessus l'app tant qu'il est dû).
  if (session && path !== '/onboarding' && onboardingPending()) return '/onboarding';
  majChrome(!!session && path !== '/onboarding', path);
  return null;
});

/* --- barre de navigation --- */

/* Regroupement des routes sous les 4 destinations de la barre du bas —
   une section (ex. Entraînement) reste "active" même sur un sous-écran
   (ex. /seances/xxx/lancer), exactement comme les onglets natifs. */
const GROUPES_ROUTE = {
  minuteurs: ['/minuteurs'],
  entrainement: ['/seances', '/programmes', '/historique'],
  social: ['/fil', '/amis', '/messages', '/groupes', '/defis', '/direct'],
  profil: ['/profil']
};
function groupeDe(path) {
  for (const [g, prefixes] of Object.entries(GROUPES_ROUTE)) {
    if (prefixes.some(p => path === p || path.startsWith(p + '/'))) return g;
  }
  return null;
}

function majChrome(connecte, path) {
  document.body.classList.toggle('connecte', connecte);
  $$('.nav a').forEach(a => {
    a.setAttribute('aria-current', a.getAttribute('href') === '#' + path ? 'page' : 'false');
  });
  const groupe = groupeDe(path);
  $$('.bottombar a').forEach(a => {
    a.setAttribute('aria-current', a.dataset.groupe === groupe ? 'page' : 'false');
  });
  majOngletEntrainement();
  mesurerBarreBas();
}

/* Tant qu'une séance est en cours (run-state.js), l'onglet Entraînement de la
   barre du bas ramène À CETTE SÉANCE, pas à la liste — comme l'onglet natif,
   qui retrouve l'écran là où on l'avait laissé. Sans ça, un aller-retour par
   Social ou Profil faisait retomber sur la liste, séance perdue. */
function majOngletEntrainement() {
  const lien = document.querySelector('.bottombar a[data-groupe="entrainement"]');
  if (!lien) return;
  const seance = seanceEnCours();
  lien.setAttribute('href', seance ? `#/seances/${seance.workoutId}/lancer` : '#/seances');
}

/* Hauteur réelle de la barre du bas, publiée en variable CSS : les éléments
   qui doivent se poser JUSTE au-dessus (champ de saisie d'une discussion,
   écran de séance) s'y adossent au pixel près au lieu de deviner une valeur
   en rem — c'est ce décalage deviné qui laissait un grand vide entre le champ
   de message et la barre, signalé par Nicolas. */
function mesurerBarreBas() {
  const barre = document.querySelector('.bottombar');
  const visible = barre && getComputedStyle(barre).display !== 'none';
  document.documentElement.style.setProperty('--barre-bas', visible ? `${barre.offsetHeight}px` : '0px');
  /* L'en-tête est sticky : il mange en permanence le haut du viewport. Un
     écran qui veut occuper toute la hauteur utile (la séance en direct) doit
     retirer cette hauteur en plus de celle de la barre du bas. */
  const entete = document.querySelector('.appbar');
  document.documentElement.style.setProperty('--haut-appbar', entete ? `${entete.offsetHeight}px` : '0px');
}

/* Hauteur RÉELLEMENT visible, clavier virtuel déduit. `100dvh` ne suffit pas :
   il tient compte des barres du navigateur, pas du clavier. Sur Android,
   `interactive-widget=resizes-content` (index.html) règle le problème à la
   source ; Safari iOS ignore ce réglage, et là seule l'API VisualViewport dit
   la vérité. Publiée en variable CSS, elle sert de hauteur aux écrans qui
   doivent tenir dans l'écran sans déborder derrière le clavier — les
   discussions (coach et messages), où un grand vide s'installait entre la
   barre du bas et le clavier, signalé par Nicolas.
   Seul `resize` est écouté : la hauteur ne change pas au défilement, et
   VisualViewport émet des `scroll` en rafale sur iOS. */
function mesurerHauteurVisible() {
  const vv = window.visualViewport;
  document.documentElement.style.setProperty(
    '--haut-visuel', `${Math.round(vv ? vv.height : innerHeight)}px`
  );
}
window.visualViewport?.addEventListener('resize', mesurerHauteurVisible);
addEventListener('resize', mesurerHauteurVisible);
mesurerHauteurVisible();
addEventListener('resize', mesurerBarreBas);

$('#menu')?.addEventListener('click', () => {
  document.body.classList.toggle('menu-ouvert');
});
$('#btn-theme')?.addEventListener('click', ouvrirTheme);
$('#btn-bips')?.addEventListener('click', () => ouvrirReglagesBips(beeper));
$('#vue')?.addEventListener('click', () => {
  document.body.classList.remove('menu-ouvert');
});

/* Après un retour d'OAuth, l'URL contient le jeton : on rejoue la route.
   C'est aussi le moment où les réglages du compte redescendent — la même
   fonction est rappelée à la déconnexion, où elle se contente d'arrêter
   d'écrire. */
onAuthChange((session) => { resolve(); syncPrefs(session); });

/* ==========================================================================
   RETOUR D'UN FOURNISSEUR D'IDENTITÉ (Google)

   Le fournisseur repasse par cette page avec, selon le flux configuré côté
   Supabase, un jeton dans le fragment (`#access_token=…`), un code dans la
   requête (`?code=…`), ou une erreur dans l'un des deux. Aucune de ces trois
   formes n'est une route : sans le bloc ci-dessous, le routeur ne reconnaît
   rien, la garde renvoie sur /connexion, et l'utilisateur voit l'écran de
   connexion revenir sans un mot — le symptôme exact d'un clic « qui ne fait
   rien ». Trois choses, donc, avant de démarrer le routeur :

   1. attendre que le client Supabase ait fini de lire l'URL. `getSession()`
      attend l'initialisation en interne, ce qui supprime la course entre la
      détection du jeton et le premier `resolve()` ;
   2. retenir le message d'erreur pour que l'écran de connexion l'affiche, au
      lieu de le perdre en même temps que le fragment ;
   3. rendre au routeur un hash qu'il sait lire.
   ========================================================================== */

function lireRetourAuth() {
  const frag = new URLSearchParams(location.hash.replace(/^#\/?/, ''));
  const query = new URLSearchParams(location.search);
  const lire = (cle) => frag.get(cle) ?? query.get(cle);
  const erreur = lire('error_description') || lire('error');
  const jeton = lire('access_token') || lire('code');
  return { present: !!(erreur || jeton), erreur };
}

const retourAuth = lireRetourAuth();
if (retourAuth.present) {
  let session = null;
  try { session = await currentSession(); } catch { /* traité juste après */ }

  if (retourAuth.erreur) {
    try { sessionStorage.setItem(CLE_ERREUR_AUTH, retourAuth.erreur); } catch { /* stockage refusé */ }
  } else if (!session) {
    /* Cas muet : le fournisseur a bien renvoyé quelque chose, mais Supabase
       n'en a pas tiré de session. En pratique c'est l'adresse de retour qui
       n'est pas dans la liste blanche du projet, ou le code qui ne trouve
       plus son `code_verifier` parce que le domaine a changé entre l'aller
       et le retour. */
    try {
      sessionStorage.setItem(CLE_ERREUR_AUTH,
        "Connexion non aboutie : le fournisseur a répondu, mais aucune session n'a pu être ouverte.");
    } catch { /* stockage refusé */ }
  }

  history.replaceState(null, '', location.pathname + (session ? '#/seances' : '#/connexion'));
}

start();

/* Session déjà ouverte au chargement. onAuthStateChange émet bien un
   INITIAL_SESSION, mais ne pas en dépendre coûte une ligne et syncPrefs est
   idempotente pour un même compte. */
currentSession().then(syncPrefs).catch(() => { /* hors ligne : le local fait foi */ });

/* ==========================================================================
   CONTRÔLE DE VERSION — la ceinture, en plus des bretelles du service worker.

   Constaté sur le téléphone de Nicolas : dans l'application installée depuis
   l'espace web (WebAPK Samsung Internet), demander `registration.update()` ne
   suffit PAS. Plusieurs redémarrages complets d'affilée continuaient
   d'afficher une version dépassée ; seul un « tirer pour rafraîchir » manuel
   faisait avancer d'une version. Autrement dit : compter sur le cycle de vie
   du service worker pour livrer une mise à jour n'est pas fiable ici.

   Ce contrôle-ci ne dépend de rien : on demande un petit fichier texte avec
   une URL toujours différente (donc jamais servie par un cache, ni HTTP ni
   service worker), et si le numéro ne correspond pas à celui embarqué dans ce
   fichier, on vide les caches, on désinscrit le service worker et on recharge.
   Une seule fois : `dejaRecharge` empêche toute boucle si quelque chose se
   passe mal.

   À CHAQUE PUBLICATION : incrémenter VERSION ici ET dans app/version.txt (et
   le cache de sw.js, qui suit le même numéro).
   ========================================================================== */
const VERSION = '59';

/* Mémoire de tentative : sessionStorage survit à location.reload() mais pas à
   la fermeture de l'application. Une version publiée ne peut donc déclencher
   qu'UN SEUL rechargement par lancement.

   Sans ce verrou, la première version de ce contrôle a boucle : elle vidait
   les caches, désinscrivait le service worker et rechargeait ; le navigateur
   resservait le même ancien main.js depuis son propre cache HTTP (GitHub
   Pages répond avec une durée de fraîcheur de quelques minutes), donc la
   version embarquée ne changeait pas et le rechargement repartait aussitôt.
   Écran blanc, application inutilisable. Vu sur le téléphone, corrigé ici. */
const CLE_MAJ = 'motio.maj-tentee';

let dejaRecharge = false;

async function verifierVersion() {
  if (dejaRecharge) return;
  let publiee;
  try {
    const rep = await fetch(`version.txt?t=${Date.now()}`, { cache: 'no-store' });
    if (!rep.ok) return;
    publiee = (await rep.text()).trim();
  } catch { return; }               // hors ligne : on garde ce qu'on a
  if (!publiee || publiee === VERSION) return;
  try { if (sessionStorage.getItem(CLE_MAJ) === publiee) return; } catch { return; }

  dejaRecharge = true;
  try { sessionStorage.setItem(CLE_MAJ, publiee); } catch { /* stockage refusé */ }
  /* On ne vide RIEN et on ne désinscrit RIEN : le service worker va déjà
     chercher le réseau en premier, et tout casser pour une mise à jour
     laisserait l'application sans coquille hors ligne. On demande juste au
     service worker de se mettre à jour, puis on recharge une fois. */
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.() ?? [];
    await Promise.all(regs.map(r => r.update()));
  } catch { /* on recharge quand même */ }
  location.reload();
}

verifierVersion();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') verifierVersion();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    let reg;
    try { reg = await navigator.serviceWorker.register('sw.js'); } catch { return; }

    /* CHERCHER la mise à jour, explicitement.
       Constaté sur le téléphone de Nicolas : l'application installée depuis
       l'espace web (WebAPK Samsung Internet) restait bloquée sur une version
       vieille de plusieurs publications, alors que le même lien ouvert dans
       Chrome affichait la dernière — deux redémarrages complets n'y ont rien
       changé. Enregistrer le service worker ne suffit pas : tant que
       personne ne demande `update()`, le navigateur peut garder le sien
       pendant très longtemps. On le demande donc au démarrage, à chaque
       retour au premier plan, et une fois par heure si l'app reste ouverte.
       Le rechargement, lui, est déjà géré par `controllerchange` ci-dessous. */
    const chercherMaj = () => reg.update().catch(() => {});
    chercherMaj();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') chercherMaj();
    });
    setInterval(chercherMaj, 60 * 60 * 1000);

    /* Une version déjà téléchargée qui attend son tour ne doit pas attendre
       la fermeture de tous les onglets : on lui dit de prendre la main. */
    const activerEnAttente = () => reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
    activerEnAttente();
    reg.addEventListener('updatefound', () => {
      const nouveau = reg.installing;
      nouveau?.addEventListener('statechange', () => {
        if (nouveau.state === 'installed' && navigator.serviceWorker.controller) activerEnAttente();
      });
    });
  });
  // Dès qu'une nouvelle version prend la main (activate + clients.claim()
  // côté sw.js), on recharge une fois : sans ça, l'onglet déjà ouvert garde
  // en mémoire le JS de l'ancienne version jusqu'à sa prochaine fermeture.
  // Même drapeau que le contrôle de version ci-dessus : un seul rechargement,
  // quel que soit celui des deux mécanismes qui déclenche.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (dejaRecharge) return;
    dejaRecharge = true;
    location.reload();
  });
}
