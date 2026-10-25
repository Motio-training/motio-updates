/* ==========================================================================
   HORS LIGNE (v77) — lancer une séance prévue en salle, sans réseau.

   Trois pièces, toutes utilisées par api.js et jamais par les vues :

   - LECTURES : chaque lecture utile à l'entraînement (carnet, programmes,
     historique, catégories, poids) garde sa dernière réponse dans le
     stockage du navigateur. Réseau absent ou qui traîne (salle en sous-sol,
     une barre de réseau) : on rend cette copie au lieu d'un écran d'erreur ;

   - ÉCRITURES : une séance terminée, un modèle ou un programme enregistré
     sans réseau part dans une FILE D'ATTENTE, et la copie locale est mise à
     jour tout de suite — l'écran suivant voit déjà la séance faite et la
     séance prévue cochée. La file part dès que le réseau revient
     (api.js, envoyerEnAttente) ;

   - DÉLAI : sur un réseau qui traîne, le client Supabase peut attendre de
     longues secondes avant d'échouer (il retente de renouveler le jeton de
     connexion). Au-delà de quelques secondes, on considère qu'on est hors
     ligne plutôt que de laisser l'écran bloqué.

   La file ne garde qu'UNE écriture par objet (la dernière) : un modèle
   enregistré trois fois hors ligne ne part qu'une fois, dans son dernier état.
   ========================================================================== */

const PREFIXE = 'motio.hl.';
const CLE_FILE = 'file';

/** Échec réseau reconnaissable, quel que soit le navigateur. */
export class HorsLigne extends Error {
  constructor(m = 'Hors ligne') { super(m); this.name = 'HorsLigne'; }
}

export function estHorsLigne() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function estErreurReseau(err) {
  if (err instanceof HorsLigne || estHorsLigne()) return true;
  const m = String(err?.message || err || '');
  // Chrome / Edge : Failed to fetch ; Firefox : NetworkError ; Safari : Load failed.
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(m);
}

export function lire(cle) {
  try {
    const v = localStorage.getItem(PREFIXE + cle);
    return v == null ? undefined : JSON.parse(v);
  } catch { return undefined; }
}

export function ecrire(cle, valeur) {
  try { localStorage.setItem(PREFIXE + cle, JSON.stringify(valeur)); } catch { /* quota : l'ancienne copie reste */ }
}

/** La promesse, ou une erreur HorsLigne au bout de `ms`. La requête lancée
 *  continue sa vie : si elle aboutit plus tard, son résultat est perdu pour
 *  cet écran mais pas pour le serveur. */
export function avecDelai(promesse, ms) {
  let minuteur;
  const delai = new Promise((_, rejeter) => {
    minuteur = setTimeout(() => rejeter(new HorsLigne('Réseau trop lent')), ms);
  });
  return Promise.race([promesse, delai]).finally(() => clearTimeout(minuteur));
}

/**
 * Lecture « réseau d'abord, dernière copie en secours ». `fusion` repasse
 * les écritures encore en file sur la réponse du serveur, qui ne les connaît
 * pas encore.
 */
export async function lecture(cle, fn, { fusion = (v) => v, delai = 7000 } = {}) {
  const copie = lire(cle);
  // Hors ligne pour de bon : le client Supabase retenterait trois fois une
  // lecture vouée à l'échec (7 secondes d'écran figé) avant de renoncer.
  if (estHorsLigne()) {
    if (copie !== undefined) return fusion(copie);
    throw new HorsLigne();
  }
  const requete = fn().then((v) => { ecrire(cle, v); return v; });
  try {
    // Sans copie, rien à rendre à la place : on attend le réseau sans délai.
    return fusion(copie === undefined ? await requete : await avecDelai(requete, delai));
  } catch (e) {
    if (!estErreurReseau(e) || copie === undefined) throw e;
    requete.catch(() => { /* déjà traité : la copie a été rendue */ });
    return fusion(copie);
  }
}

/* ------------------------------------------------------------ copies locales */

/** Remplace (ou ajoute en tête) la ligne de même local_id dans une liste en cache. */
export function majLigne(cle, ligne) {
  const rows = lire(cle);
  if (!Array.isArray(rows)) return;
  const i = rows.findIndex(r => String(r.local_id) === String(ligne.local_id));
  if (i >= 0) rows[i] = { ...rows[i], ...ligne };
  else rows.unshift(ligne);
  ecrire(cle, rows);
}

/* ------------------------------------------------------------ file d'attente */

const abonnes = new Set();

/** Prévenu à chaque changement de la file (bandeau « en attente »). */
export function suivreFile(fn) { abonnes.add(fn); return () => abonnes.delete(fn); }
function signaler() { const n = file().length; abonnes.forEach(fn => { try { fn(n); } catch { /* écouteur fautif */ } }); }

export function file() {
  const f = lire(CLE_FILE);
  return Array.isArray(f) ? f : [];
}

/** Ajoute une écriture ; celle du même objet déjà en file est remplacée. */
export function mettreEnFile(op) {
  const f = file();
  const i = f.findIndex(o => o.type === op.type && o.userId === op.userId && o.cle === op.cle);
  const entree = { ...op, a: Date.now(), essais: 0 };
  if (i >= 0) f[i] = entree; else f.push(entree);
  ecrire(CLE_FILE, f);
  signaler();
}

/** Retire l'écriture de cet objet : partie, ou dépassée par une plus récente
 *  envoyée directement. */
export function retirer(type, userId, cle) {
  const f = file();
  const reste = f.filter(o => !(o.type === type && o.userId === userId && o.cle === cle));
  if (reste.length !== f.length) { ecrire(CLE_FILE, reste); signaler(); }
}

export function compterEssai(op) {
  const f = file();
  const o = f.find(x => x.type === op.type && x.userId === op.userId && x.cle === op.cle);
  if (!o) return 0;
  o.essais = (o.essais || 0) + 1;
  ecrire(CLE_FILE, f);
  return o.essais;
}

/** Les lignes en attente d'un type, pour un compte. */
export function enAttente(type, userId) {
  return file().filter(o => o.type === type && o.userId === userId).map(o => o.row);
}

/* ------------------------------------------------------------ planches */

const dejaPrecharges = new Set();

/** Met en cache (par le service worker, qui garde toute image demandée) les
 *  planches des séances à venir : en salle sans réseau, elles s'affichent
 *  quand même. Deux à la fois, quand le navigateur n'a rien de mieux à faire. */
export function prechargerImages(urls) {
  if (estHorsLigne() || !navigator.serviceWorker?.controller) return;
  const aFaire = [...new Set(urls)].filter(u => u && !dejaPrecharges.has(u));
  if (!aFaire.length) return;
  aFaire.forEach(u => dejaPrecharges.add(u));
  const suivant = () => {
    const u = aFaire.shift();
    if (u) fetch(u).catch(() => {}).finally(suivant);
  };
  const plusTard = window.requestIdleCallback || ((f) => setTimeout(f, 1500));
  plusTard(() => { suivant(); suivant(); });
}
