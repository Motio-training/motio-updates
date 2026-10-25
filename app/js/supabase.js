import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { CONFIG } from './config.js';

export const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

/* Un retour d'OAuth qui échoue perd son message en même temps que le fragment
   de l'URL. main.js le dépose ici, l'écran de connexion le ramasse : sans ça
   l'échec est parfaitement muet. sessionStorage et non localStorage — le
   message ne vaut que pour la tentative en cours. */
export const CLE_ERREUR_AUTH = 'motio.erreur-auth';

/* HORS LIGNE (hors-ligne.js). Le jeton d'accès expire au bout d'une heure ;
   pour le renouveler, getSession() appelle le serveur et, sans réseau, retente
   pendant près de 30 secondes avant d'abandonner en rendant… aucune session.
   En salle, ça renvoyait sur l'écran de connexion. Tant que le client garde
   la session dans le stockage (il ne l'efface que sur une vraie déconnexion
   ou un jeton révoqué), elle reste bonne pour s'entraîner hors ligne : les
   lectures passent par les copies locales, les écritures par la file, et le
   jeton se renouvelle tout seul au retour du réseau. */
function sessionGardee() {
  try {
    const cle = sb.auth.storageKey ||
      `sb-${new URL(CONFIG.SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
    const brut = JSON.parse(localStorage.getItem(cle) || 'null');
    const s = brut?.currentSession || brut;
    return s?.user ? s : null;
  } catch { return null; }
}

// Réseau qui traîne : pendant une minute, on ne réessaie pas à chaque écran.
let lentJusqua = 0;

export async function currentSession() {
  const gardee = sessionGardee();
  if (gardee && (navigator.onLine === false || Date.now() < lentJusqua)) return gardee;
  const lecture = sb.auth.getSession().then(({ data }) => data.session ?? null);
  // Pas de session gardée (première connexion, retour d'OAuth) : rien à
  // rendre à la place, on attend le client quoi qu'il arrive.
  if (!gardee) return lecture;
  const s = await Promise.race([lecture, new Promise(r => setTimeout(() => r(undefined), 4000))]);
  if (s === undefined) { lentJusqua = Date.now() + 60_000; return gardee; }
  return s ?? sessionGardee();
}

export async function currentUser() {
  const s = await currentSession();
  return s?.user ?? null;
}

export function onAuthChange(fn) {
  return sb.auth.onAuthStateChange((_evt, session) => fn(session));
}

/**
 * Inscription. Le pseudo voyage dans les métadonnées : c'est le déclencheur
 * `handle_new_user` du schéma qui crée la ligne dans `profiles`. Même
 * convention que Supabase.signUp côté Android — la clé DOIT rester
 * « username », sinon le profil naît sans pseudo.
 */
export async function signUp(email, password, username) {
  const { error } = await sb.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: { username: username.trim().toLowerCase() },
      emailRedirectTo: CONFIG.SITE_URL
    }
  });
  if (error) throw new Error(traduire(error.message));
}

export async function signIn(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(traduire(error.message));
}

export async function signInWithGoogle() {
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: CONFIG.SITE_URL }
  });
  if (error) throw new Error(traduire(error.message));
}

export async function signOut() {
  await sb.auth.signOut();
  location.hash = '#/connexion';
}

/** Les mêmes messages qu'Android, pour ne pas dire deux choses différentes. */
export function traduire(m = '') {
  const c = (s) => m.toLowerCase().includes(s);
  if (c('invalid login credentials')) return 'Adresse e-mail ou mot de passe incorrect.';
  if (c('email not confirmed')) return 'Adresse non confirmée : ouvre le lien reçu par e-mail.';
  if (c('user already registered')) return 'Un compte existe déjà avec cette adresse.';
  if (c('password should be')) return 'Mot de passe trop court (6 caractères minimum).';
  if (c('duplicate key') && c('username')) return 'Ce pseudo est déjà pris.';
  if (c('row-level security')) return 'Action refusée par le serveur.';
  if (c('does not exist') && c('relation')) return "Table absente : le script SQL n'a pas été exécuté.";
  if (c('does not exist') && c('column')) return "Colonne absente : une migration SQL n'a pas été exécutée.";
  return m;
}
