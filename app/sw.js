/* ==========================================================================
   Service worker — installabilité + coquille disponible hors ligne.

   RÉSEAU D'ABORD, cache en secours — pas l'inverse. Un cache-d'abord a
   bloqué la toute première version installée en travers de tous les
   déploiements suivants (aucune mise à jour n'était plus jamais visible,
   quel que soit ce qui changeait sur le serveur). Le cache ne sert qu'hors
   ligne maintenant ; en ligne, chaque requête va d'abord vérifier le
   serveur. CACHE doit être incrémenté à chaque changement notable de
   l'appli : ça force le nettoyage de l'ancien cache à l'activation.

   « Réseau d'abord » ne suffit pas à lui seul : fetch(e.request) tel quel
   respecte encore le cache HTTP normal du navigateur (Cache-Control de
   GitHub Pages), donc « réseau d'abord » pouvait renvoyer une réponse
   déjà en cache côté navigateur sans jamais recontacter le serveur. D'où
   { cache: 'no-store' } explicite ci-dessous — la seule façon de garantir
   qu'une requête en ligne touche vraiment le réseau.

   Ne touche JAMAIS aux requêtes vers Supabase (l'API et l'authentification
   doivent toujours parler au réseau réel) : seuls les fichiers de la coquille
   (HTML/CSS/JS/icônes/polices de CE dossier) passent par le cache. Depuis la
   v89, le code du client Supabase en fait partie (js/vendor/) : il n'est plus
   servi par esm.sh.
   ========================================================================== */

const CACHE = 'motio-app-v100';

const COQUILLE = [
  './',
  'index.html',
  'manifest.json',
  'css/app.css',
  'js/vendor/supabase-2.118.0.js', 'js/consentement-ia.js',
  'js/main.js', 'js/router.js', 'js/supabase.js', 'js/config.js', 'js/api.js',
  'js/model.js', 'js/catalog.js', 'js/partage.js', 'js/ui.js', 'js/trophies.js',
  'js/reglages.js', 'js/timer.js', 'js/beeper.js', 'js/workout-share.js',
  'js/muscle-lexicon.js', 'js/muscle-map.js', 'js/bilan.js', 'js/changelog.js', 'js/numpad.js',
  'js/qr.js', 'js/backup.js', 'js/programme-ia.js', 'js/generateur-local.js',
  'js/run-state.js', 'js/stats.js', 'js/prefs-sync.js', 'js/exercise-visuals.js', 'js/athlete.js',
  'js/coach-guide.js', 'js/programme-edition.js', 'js/programme-bilan.js',
  'js/programme-build.js', 'js/charge.js',
  'js/forme.js', 'js/dictee.js', 'js/hors-ligne.js',
  'js/pager.js', 'js/substituts.js', 'js/seance-prevue.js',
  'js/views/connexion.js', 'js/views/nouveau-mdp.js', 'js/views/inscrits.js', 'js/views/fil.js', 'js/views/profil.js',
  'js/views/entrainement.js', 'js/views/lancer.js', 'js/views/minuteurs.js',
  // circuit.js est chargé à la demande par lancer.js quand la séance est un
  // circuit : sans lui dans le précache, un circuit serait injouable hors
  // ligne — or c'est précisément un format qu'on fait en salle, réseau ou pas.
  'js/views/circuit.js',
  'js/views/coach.js', 'js/views/messages.js', 'js/views/direct.js', 'js/views/groupes.js',
  'js/views/defis.js', 'js/views/onboarding.js', 'js/views/reglages.js',
  'js/views/programmes.js',
  'icons/icon-192.png', 'icons/icon-512.png',
  'fonts/outfit-variable.woff2', 'fonts/jbmono-variable.woff2'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(COQUILLE)).then(() => self.skipWaiting())
  );
});

/* La page peut demander à une version en attente de prendre la main tout de
   suite (main.js). skipWaiting() est déjà appelé à l'installation, mais un
   service worker installé AVANT cette ligne, lui, attend toujours : ce
   message est le seul moyen de le débloquer sans fermer l'application. */
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function estDistant(url) {
  return url.hostname.endsWith('supabase.co') ||
    url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('gstatic.com');
}

/* Réseau d'abord, copie gardée pour le hors ligne. Le code du client Supabase
   (js/vendor/, v89) passe par ici comme le reste de la coquille : sans lui,
   aucune page ne démarrait sans réseau — et lancer une séance en salle sans
   réseau est justement le but (hors-ligne.js). */
function reseauDabord(requete, options) {
  return fetch(requete, options).then((rep) => {
    if (rep.ok) caches.open(CACHE).then((c) => c.put(requete, rep.clone()));
    return rep;
  }).catch(() => caches.match(requete));
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin !== location.origin && !url.hostname.endsWith('gstatic.com')) return;
  if (estDistant(url)) return;   // laisse passer tel quel : jamais de cache pour l'API

  e.respondWith(reseauDabord(e.request, { cache: 'no-store' }));
});
