/* ==========================================================================
   Couche de données. Calquée sur Social.kt et Account.kt : mêmes tables,
   mêmes colonnes, mêmes conventions. Les vues ne connaissent aucun nom de table.

   TABLES EXISTANTES (déjà utilisées par l'application Android) :
     profiles         id, username, display_name
     follows          follower_id, following_id
     shared_sessions  id, user_id, local_id, workout_name, category, started_at,
                      duration_ms, tension_ms, volume_kg, exercise_count,
                      set_count, details (jsonb)
     kudos            session_id, user_id
     comments         id, session_id, user_id, body, created_at

   TABLES À CRÉER (sql/01_schema.sql) :
     synced_workouts  modèles de séance
     synced_programs  programmes

   Deux principes repris de l'app :
   - pas de jointure imbriquée PostgREST vers `profiles` : depuis l'arrivée de
     kudos et comments il existe plusieurs chemins possibles et PostgREST
     répond 300 « choix multiples ». On résout les pseudos par une requête
     séparée, qui ne dépend d'aucun nom de contrainte ;
   - le filtrage du fil n'est PAS écrit ici, c'est la RLS qui le fait.
   ========================================================================== */

import { sb } from './supabase.js';
import { CONFIG } from './config.js';

const T = CONFIG.TABLES;

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

/* ---------------------------------------------------------------- profils */

export async function getProfile(userId) {
  return unwrap(await sb.from(T.profiles)
    .select('id,username,display_name').eq('id', userId).maybeSingle());
}

export async function setUsername(userId, username) {
  const clean = username.trim().toLowerCase();
  return unwrap(await sb.from(T.profiles)
    .update({ username: clean }).eq('id', userId).select().single());
}

export async function searchProfiles(terme) {
  const q = terme.trim().toLowerCase();
  if (q.length < 2) return [];
  return unwrap(await sb.from(T.profiles)
    .select('id,username').ilike('username', `%${q}%`).limit(20));
}

/** Pseudos correspondant à une liste d'identifiants, en une requête. */
export async function usernamesFor(ids) {
  const clean = [...new Set(ids.filter(Boolean))];
  if (!clean.length) return {};
  const rows = unwrap(await sb.from(T.profiles).select('id,username').in('id', clean));
  return Object.fromEntries(rows.map(r => [r.id, r.username]));
}

/* ------------------------------------------------------------ abonnements */

export async function following(userId) {
  const liens = unwrap(await sb.from(T.follows)
    .select('following_id').eq('follower_id', userId));
  const ids = liens.map(l => l.following_id).filter(Boolean);
  if (!ids.length) return [];
  const profils = unwrap(await sb.from(T.profiles).select('id,username').in('id', ids));
  return profils.sort((a, b) => (a.username || '').localeCompare(b.username || ''));
}

export async function followers(userId) {
  const liens = unwrap(await sb.from(T.follows)
    .select('follower_id').eq('following_id', userId));
  return liens.map(l => l.follower_id).filter(Boolean);
}

export async function follow(userId, cibleId) {
  return unwrap(await sb.from(T.follows)
    .upsert({ follower_id: userId, following_id: cibleId },
            { onConflict: 'follower_id,following_id' }).select());
}

export async function unfollow(userId, cibleId) {
  return unwrap(await sb.from(T.follows).delete()
    .eq('follower_id', userId).eq('following_id', cibleId).select());
}

/* ------------------------------------------------------ séances partagées */

const CHAMPS_SESSION =
  'id,user_id,workout_name,category,started_at,duration_ms,tension_ms,' +
  'volume_kg,exercise_count,set_count,details';

/**
 * Le fil : mes séances et celles des gens que je suis. Le filtrage vient de la
 * politique RLS, pas de la requête — une requête forgée à la main ne
 * renverrait rien de plus.
 */
export async function feed({ limit = 60, before = null } = {}) {
  let q = sb.from(T.sharedSessions).select(CHAMPS_SESSION)
    .order('started_at', { ascending: false }).limit(limit);
  if (before) q = q.lt('started_at', before);
  const rows = unwrap(await q);
  const noms = await usernamesFor(rows.map(r => r.user_id));
  return rows.map(r => ({ ...r, username: noms[r.user_id] || '?' }));
}

/** Historique d'une personne : le mien, ou celui d'un abonné. */
export async function sessionsOf(userId, { limit = 200 } = {}) {
  return unwrap(await sb.from(T.sharedSessions).select(CHAMPS_SESSION)
    .eq('user_id', userId).order('started_at', { ascending: false }).limit(limit));
}

/* ------------------------------------------------------------------ kudos */

export async function kudosFor(sessionIds, moiId) {
  if (!sessionIds.length) return {};
  const rows = unwrap(await sb.from(T.kudos)
    .select('session_id,user_id').in('session_id', sessionIds));
  const out = {};
  for (const r of rows) {
    const k = out[r.session_id] || (out[r.session_id] = { count: 0, mine: false });
    k.count++;
    if (r.user_id === moiId) k.mine = true;
  }
  return out;
}

export async function addKudo(sessionId, userId) {
  return unwrap(await sb.from(T.kudos)
    .upsert({ session_id: sessionId, user_id: userId },
            { onConflict: 'session_id,user_id' }).select());
}

export async function removeKudo(sessionId, userId) {
  return unwrap(await sb.from(T.kudos).delete()
    .eq('session_id', sessionId).eq('user_id', userId).select());
}

/* ----------------------------------------------------------- commentaires */

export async function commentCounts(sessionIds) {
  if (!sessionIds.length) return {};
  const rows = unwrap(await sb.from(T.comments)
    .select('session_id').in('session_id', sessionIds));
  const out = {};
  for (const r of rows) out[r.session_id] = (out[r.session_id] || 0) + 1;
  return out;
}

export async function comments(sessionId) {
  const rows = unwrap(await sb.from(T.comments)
    .select('id,user_id,body,created_at')
    .eq('session_id', sessionId).order('created_at', { ascending: true }));
  const noms = await usernamesFor(rows.map(r => r.user_id));
  return rows.map(r => ({ ...r, username: noms[r.user_id] || '?' }));
}

export async function addComment(sessionId, userId, texte) {
  const clean = texte.trim();
  if (!clean) throw new Error('Commentaire vide.');
  if (clean.length > 500) throw new Error('Commentaire trop long (500 caractères maximum).');
  return unwrap(await sb.from(T.comments)
    .insert({ session_id: sessionId, user_id: userId, body: clean }).select().single());
}

export async function deleteComment(id) {
  return unwrap(await sb.from(T.comments).delete().eq('id', id).select());
}

/* ==========================================================================
   Modèles de séance et programmes — tables à créer.

   local_id reprend l'identifiant local de l'app (Workout.id / Program.id, des
   millisecondes) sous forme de texte. L'unicité (user_id, local_id) rend
   l'écriture idempotente, exactement comme shared_sessions.

   Le contenu part dans une colonne jsonb qui reprend mot pour mot ce qu'écrit
   WorkoutStore.workoutToJson / ProgramStore.toJson. Ajouter un champ au modèle
   Kotlin ne demandera donc aucune migration SQL.
   ========================================================================== */

export async function listWorkouts(userId) {
  return unwrap(await sb.from(T.workouts)
    .select('id,local_id,name,category,data,updated_at')
    .eq('user_id', userId).is('deleted_at', null)
    .order('updated_at', { ascending: false }));
}

export async function getWorkout(userId, localId) {
  return unwrap(await sb.from(T.workouts)
    .select('id,local_id,name,category,data,updated_at')
    .eq('user_id', userId).eq('local_id', String(localId)).maybeSingle());
}

/** `seance` est l'objet au format WorkoutStore : { id, name, category, exercises, history }. */
export async function saveWorkout(userId, seance) {
  const row = {
    user_id: userId,
    local_id: String(seance.id),
    name: seance.name,
    category: seance.category,
    data: seance,
    // Pas d'updated_at : c'est le déclencheur Postgres qui le tient. Une
    // horloge de navigateur en avance fausserait le repère de synchronisation
    // d'Android, qui manquerait alors des modifications.
    deleted_at: null
  };
  return unwrap(await sb.from(T.workouts)
    .upsert(row, { onConflict: 'user_id,local_id' }).select().single());
}

/**
 * Suppression DOUCE. Un vrai DELETE serait ressuscité par le premier téléphone
 * hors ligne qui renverrait sa copie locale.
 */
export async function deleteWorkout(userId, localId) {
  return unwrap(await sb.from(T.workouts)
    .update({ deleted_at: new Date().toISOString() })
    .eq('user_id', userId).eq('local_id', String(localId)).select().single());
}

export async function listPrograms(userId) {
  return unwrap(await sb.from(T.programs)
    .select('id,local_id,name,data,updated_at')
    .eq('user_id', userId).is('deleted_at', null)
    .order('updated_at', { ascending: false }));
}

export async function saveProgram(userId, programme) {
  const row = {
    user_id: userId,
    local_id: String(programme.id),
    name: programme.name,
    data: programme,
    deleted_at: null
  };
  return unwrap(await sb.from(T.programs)
    .upsert(row, { onConflict: 'user_id,local_id' }).select().single());
}

export async function deleteProgram(userId, localId) {
  return unwrap(await sb.from(T.programs)
    .update({ deleted_at: new Date().toISOString() })
    .eq('user_id', userId).eq('local_id', String(localId)).select().single());
}
