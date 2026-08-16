import { route, setNotFound, before, start, resolve, currentPath } from './router.js';
import { currentSession, onAuthChange } from './supabase.js';
import { $, $$, h, render, empty } from './ui.js';

import { vueConnexion } from './views/connexion.js';
import { vueFil } from './views/fil.js';
import { vueProfil, vueAmis } from './views/profil.js';
import { vueSeances, vueSeanceEdition, vueProgrammes,
         vueProgrammeNouveau, vueHistorique } from './views/entrainement.js';
import { vueLancerSeance } from './views/lancer.js';
import { vueCoach } from './views/coach.js';
import { vueMessages, vueMessageThread } from './views/messages.js';
import { vueGroupes, vueGroupeDetail } from './views/groupes.js';
import { vueMinuteurs } from './views/minuteurs.js';

const PUBLIQUES = ['/connexion'];

/* --- routes --- */
route('/', () => { location.hash = '#/fil'; });
route('/connexion', vueConnexion);
route('/minuteurs', vueMinuteurs);
route('/fil', vueFil);
route('/amis', vueAmis);
route('/profil', vueProfil);
route('/profil/:id', vueProfil);
route('/coach', vueCoach);
route('/messages', vueMessages);
route('/messages/:id', vueMessageThread);
route('/groupes', vueGroupes);
route('/groupes/:id', vueGroupeDetail);
route('/seances', vueSeances);
route('/seances/:id', vueSeanceEdition);
route('/seances/:id/lancer', vueLancerSeance);
route('/programmes', vueProgrammes);
route('/programmes/nouveau', vueProgrammeNouveau);
route('/historique', vueHistorique);

setNotFound(() => render(empty(
  'Page introuvable',
  'Ce lien ne mène nulle part.',
  { href: '#/fil', label: 'Retour au fil' }
)));

/* --- garde : pas de session, pas d'espace web --- */
before(async (path) => {
  const session = await currentSession();
  if (!session && !PUBLIQUES.includes(path)) return '/connexion';
  if (session && path === '/connexion') return '/fil';
  majChrome(!!session, path);
  return null;
});

/* --- barre de navigation --- */

/* Regroupement des routes sous les 4 destinations de la barre du bas —
   une section (ex. Entraînement) reste "active" même sur un sous-écran
   (ex. /seances/xxx/lancer), exactement comme les onglets natifs. */
const GROUPES_ROUTE = {
  minuteurs: ['/minuteurs'],
  entrainement: ['/seances', '/programmes', '/historique'],
  social: ['/fil', '/amis', '/messages', '/groupes'],
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
}

$('#menu')?.addEventListener('click', () => {
  document.body.classList.toggle('menu-ouvert');
});
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
