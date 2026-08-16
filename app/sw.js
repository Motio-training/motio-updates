/* ==========================================================================
   Service worker — installabilité + coquille disponible hors ligne.

   RÉSEAU D'ABORD, cache en secours — pas l'inverse. Un cache-d'abord a
   bloqué la toute première version installée en travers de tous les
   déploiements suivants (aucune mise à jour n'était plus jamais visible,
   quel que soit ce qui changeait sur le serveur). Le cache ne sert qu'hors
   ligne maintenant ; en ligne, chaque requête va d'abord vérifier le
   serveur. CACHE doit être incrémenté à chaque changement notable de
   l'appli : ça force le nettoyage de l'ancien cache à l'activation.

   Ne touche JAMAIS aux requêtes vers Supabase ou esm.sh (le client Supabase
   et l'authentification doivent toujours parler au réseau réel) : seuls les
   fichiers de la coquille (HTML/CSS/JS/icônes/polices de CE dossier) passent
   par le cache.
   ========================================================================== */

const CACHE = 'motio-app-v4';

const COQUILLE = [
  './',
  'index.html',
  'manifest.json',
  'css/app.css',
  'js/main.js', 'js/router.js', 'js/supabase.js', 'js/config.js', 'js/api.js',
  'js/model.js', 'js/catalog.js', 'js/partage.js', 'js/ui.js', 'js/trophies.js',
  'js/timer.js', 'js/beeper.js', 'js/workout-share.js',
  'js/views/connexion.js', 'js/views/fil.js', 'js/views/profil.js',
  'js/views/entrainement.js', 'js/views/lancer.js', 'js/views/minuteurs.js',
  'js/views/coach.js', 'js/views/messages.js', 'js/views/groupes.js',
  'js/views/defis.js', 'js/views/onboarding.js',
  'icons/icon-192.png', 'icons/icon-512.png',
  'fonts/outfit-variable.woff2', 'fonts/jbmono-variable.woff2'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(COQUILLE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function estDistant(url) {
  return url.hostname.endsWith('supabase.co') || url.hostname === 'esm.sh' ||
    url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('gstatic.com');
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin && !url.hostname.endsWith('gstatic.com')) return;
  if (estDistant(url)) return;   // laisse passer tel quel : jamais de cache pour l'API

  e.respondWith(
    fetch(e.request).then((rep) => {
      if (rep.ok) caches.open(CACHE).then((c) => c.put(e.request, rep.clone()));
      return rep;
    }).catch(() => caches.match(e.request))
  );
});
