import { route, setNotFound, before, start, resolve, currentPath } from './router.js';
import { currentSession, onAuthChange } from './supabase.js';
import { $, $$, h, render, empty } from './ui.js';
import { appliquerTheme, ouvrirTheme, ouvrirReglagesBips } from './reglages.js';
import { etatBrut as seanceEnCours } from './run-state.js';
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
addEventListener('resize', mesurerBarreBas);

$('#menu')?.addEventListener('click', () => {
  document.body.classList.toggle('menu-ouvert');
});
$('#btn-theme')?.addEventListener('click', ouvrirTheme);
$('#btn-bips')?.addEventListener('click', () => ouvrirReglagesBips(beeper));
$('#vue')?.addEventListener('click', () => {
  document.body.classList.remove('menu-ouvert');
});

/* Après un retour d'OAuth, l'URL contient le jeton : on rejoue la route. */
onAuthChange(() => resolve());

start();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
  // Dès qu'une nouvelle version prend la main (activate + clients.claim()
  // côté sw.js), on recharge une fois : sans ça, l'onglet déjà ouvert garde
  // en mémoire le JS de l'ancienne version jusqu'à sa prochaine fermeture.
  let dejaRecharge = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (dejaRecharge) return;
    dejaRecharge = true;
    location.reload();
  });
}
