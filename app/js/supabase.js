import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { CONFIG } from './config.js';

export const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

export async function currentSession() {
  const { data } = await sb.auth.getSession();
  return data.session ?? null;
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
