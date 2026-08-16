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
    .select('id,username,display_name,avatar_url').eq('id', userId).maybeSingle());
}

export async function setUsername(userId, username) {
  const clean = username.trim().toLowerCase();
  return unwrap(await sb.from(T.profiles)
    .update({ username: clean }).eq('id', userId).select().single());
}

/** delete_my_account (RPC SECURITY DEFINER) : efface profil, abonnements et
 *  séances envoyées au serveur. Le carnet local (natif) n'est pas concerné —
 *  côté web il n'y a pas de copie locale distincte à effacer en plus. */
export async function deleteMyAccount() {
  const { error } = await sb.rpc('delete_my_account');
  if (error) throw error;
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

/* ------------------------------------------------------------------ défis */

/**
 * Classement sur [jours] jours — une seule requête, agrégée ici. Même
 * principe que Social.standings (Social.kt) : la RLS de shared_sessions ne
 * renvoie déjà que mes séances et celles des gens que je suis, donc aucun
 * filtre par abonnement à écrire côté client.
 */
export async function standings(jours) {
  const depuis = new Date();
  depuis.setHours(0, 0, 0, 0);
  depuis.setDate(depuis.getDate() - (jours - 1));
  const rows = unwrap(await sb.from(T.sharedSessions)
    .select('user_id,started_at,volume_kg')
    .gte('started_at', depuis.toISOString())
    .order('started_at', { ascending: false }).limit(2000));

  const sessions = {}, volume = {}, jourSet = {};
  for (const r of rows) {
    const uid = r.user_id;
    if (!uid) continue;
    sessions[uid] = (sessions[uid] || 0) + 1;
    volume[uid] = (volume[uid] || 0) + (r.volume_kg || 0);
    const j = new Date(r.started_at); j.setHours(0, 0, 0, 0);
    (jourSet[uid] || (jourSet[uid] = new Set())).add(j.getTime());
  }
  const ids = Object.keys(sessions);
  if (!ids.length) return [];
  const noms = await usernamesFor(ids);
  return ids.map(uid => ({
    userId: uid, username: noms[uid] || '?',
    sessions: sessions[uid], volume: volume[uid], activeDays: jourSet[uid].size
  }));
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

/* ==========================================================================
   Messages 1-à-1 — même table que l'app (`messages`), pas de temps réel côté
   serveur ici non plus : l'écran de fil relance un léger sondage tant qu'il
   reste ouvert, comme ChatScreens.kt. Réactions emoji omises (le web reste
   volontairement plus simple que le natif sur ce point).
   ========================================================================== */

export async function conversations(moiId) {
  const rows = unwrap(await sb.from(T.messages)
    .select('id,sender_id,recipient_id,body,workout_name,created_at,read_at')
    .order('created_at', { ascending: false }).limit(500));
  const byFriend = new Map();
  for (const r of rows) {
    const other = r.sender_id === moiId ? r.recipient_id : r.sender_id;
    const preview = r.workout_name ? `🏋 ${r.workout_name}` : (r.body || 'Séance envoyée');
    const unread = r.recipient_id === moiId && !r.read_at;
    const cur = byFriend.get(other);
    if (!cur) byFriend.set(other, { body: preview, at: r.created_at, unread: unread ? 1 : 0 });
    else if (unread) cur.unread++;
  }
  if (!byFriend.size) return [];
  const noms = await usernamesFor([...byFriend.keys()]);
  return [...byFriend.entries()]
    .map(([id, last]) => ({ id, username: noms[id] || '?', ...last }))
    .sort((a, b) => new Date(b.at) - new Date(a.at));
}

/** Total des messages non lus, tous correspondants confondus — pour le badge de l'onglet Messages. */
export async function unreadMessagesCount(moiId) {
  const convs = await conversations(moiId);
  return convs.reduce((t, c) => t + (c.unread || 0), 0);
}

export async function messageThread(moiId, friendId) {
  return unwrap(await sb.from(T.messages)
    .select('id,sender_id,recipient_id,body,workout_name,workout_data,created_at,read_at')
    .or(`and(sender_id.eq.${moiId},recipient_id.eq.${friendId}),and(sender_id.eq.${friendId},recipient_id.eq.${moiId})`)
    .order('created_at', { ascending: true }).limit(300));
}

export async function sendText(moiId, friendId, texte) {
  const clean = texte.trim();
  if (!clean) throw new Error('Message vide.');
  if (clean.length > 1000) throw new Error('Message trop long (1000 caractères maximum).');
  return unwrap(await sb.from(T.messages)
    .insert({ sender_id: moiId, recipient_id: friendId, body: clean }).select().single());
}

export async function sendWorkoutMessage(moiId, friendId, name, code) {
  return unwrap(await sb.from(T.messages)
    .insert({ sender_id: moiId, recipient_id: friendId, workout_name: name, workout_data: code }).select().single());
}

export async function markThreadRead(messageIds) {
  for (const id of messageIds) {
    try { await sb.rpc('mark_message_read', { mid: id }); } catch { /* pas bloquant */ }
  }
}

/* ==========================================================================
   Groupes d'entraînement — même tables/RPC que Groups.kt côté Android
   (`groups`, `group_members`, `group_messages`, RPC create_group/join_group/
   get_group_preview/regenerate_invite_code). Fil et classement filtrés par
   membres du groupe, même principe que le fil général plus haut.
   ========================================================================== */

async function memberIdsOf(groupId) {
  const rows = unwrap(await sb.from(T.groupMembers).select('user_id').eq('group_id', groupId));
  return rows.map(r => r.user_id);
}

async function memberCounts(groupIds) {
  if (!groupIds.length) return {};
  const rows = unwrap(await sb.from(T.groupMembers).select('group_id').in('group_id', groupIds));
  const out = {};
  for (const r of rows) out[r.group_id] = (out[r.group_id] || 0) + 1;
  return out;
}

export async function groupsMine(moiId) {
  const rows = unwrap(await sb.from(T.groupMembers)
    .select('groups(id,name,description,banner_url,owner_id,invite_code,created_at)')
    .eq('user_id', moiId));
  const groupes = rows.map(r => r.groups).filter(Boolean);
  const counts = await memberCounts(groupes.map(g => g.id));
  return groupes.map(g => ({ ...g, memberCount: counts[g.id] || 0, mine: g.owner_id === moiId }));
}

export async function groupsSearch(nom) {
  const q = nom.trim();
  if (q.length < 2) return [];
  const rows = unwrap(await sb.from(T.groups)
    .select('id,name,description,banner_url,invite_code')
    .ilike('name', `%${q}%`).limit(20));
  const counts = await memberCounts(rows.map(r => r.id));
  return rows.map(r => ({ ...r, memberCount: counts[r.id] || 0 }));
}

export async function groupCreate(name, description) {
  return unwrap(await sb.rpc('create_group', { p_name: name.trim(), p_description: description.trim() }));
}

export async function groupPreviewByCode(code) {
  const rows = unwrap(await sb.rpc('get_group_preview', { p_code: code.trim() }));
  return rows?.[0] || null;
}

export async function groupJoin(code) {
  return unwrap(await sb.rpc('join_group', { p_code: code.trim() }));
}

export async function groupLeave(groupId, moiId) {
  return unwrap(await sb.from(T.groupMembers).delete().eq('group_id', groupId).eq('user_id', moiId).select());
}

export async function groupDelete(groupId) {
  return unwrap(await sb.from(T.groups).delete().eq('id', groupId).select());
}

export async function groupMembersList(groupId) {
  const rows = unwrap(await sb.from(T.groupMembers)
    .select('user_id,role,joined_at').eq('group_id', groupId).order('joined_at', { ascending: true }));
  const noms = await usernamesFor(rows.map(r => r.user_id));
  return rows.map(r => ({ ...r, username: noms[r.user_id] || '?', isOwner: r.role === 'owner' }));
}

export async function groupRemoveMember(groupId, userId) {
  return unwrap(await sb.from(T.groupMembers).delete().eq('group_id', groupId).eq('user_id', userId).select());
}

export async function groupUpdateInfo(groupId, name, description) {
  return unwrap(await sb.from(T.groups)
    .update({ name: name.trim(), description: description.trim() }).eq('id', groupId).select().single());
}

export async function groupRegenerateCode(groupId) {
  return unwrap(await sb.rpc('regenerate_invite_code', { p_group_id: groupId }));
}

export async function groupFeed(groupId, limit = 60) {
  const memberIds = await memberIdsOf(groupId);
  if (!memberIds.length) return [];
  const rows = unwrap(await sb.from(T.sharedSessions).select(CHAMPS_SESSION)
    .in('user_id', memberIds).order('started_at', { ascending: false }).limit(limit));
  const noms = await usernamesFor(rows.map(r => r.user_id));
  return rows.map(r => ({ ...r, username: noms[r.user_id] || '?' }));
}

export async function groupStandings(groupId, days) {
  const memberIds = await memberIdsOf(groupId);
  if (!memberIds.length) return [];
  const since = new Date(Date.now() - (days - 1) * 86400000);
  since.setHours(0, 0, 0, 0);
  const rows = unwrap(await sb.from(T.sharedSessions).select('user_id,started_at,volume_kg')
    .in('user_id', memberIds).gte('started_at', since.toISOString())
    .order('started_at', { ascending: false }).limit(2000));
  const sessions = {}, volume = {}, jours = {};
  for (const r of rows) {
    sessions[r.user_id] = (sessions[r.user_id] || 0) + 1;
    volume[r.user_id] = (volume[r.user_id] || 0) + (r.volume_kg || 0);
    (jours[r.user_id] || (jours[r.user_id] = new Set())).add(new Date(r.started_at).toDateString());
  }
  const ids = Object.keys(sessions);
  if (!ids.length) return [];
  const noms = await usernamesFor(ids);
  return ids.map(id => ({
    userId: id, username: noms[id] || '?',
    sessions: sessions[id], volume: volume[id], activeDays: jours[id].size
  }));
}

export async function groupMessageThread(groupId, limit = 200) {
  const rows = unwrap(await sb.from(T.groupMessages)
    .select('id,sender_id,body,workout_name,workout_data,created_at')
    .eq('group_id', groupId).order('created_at', { ascending: true }).limit(limit));
  const noms = await usernamesFor(rows.map(r => r.sender_id));
  return rows.map(r => ({ ...r, username: noms[r.sender_id] || '?' }));
}

export async function groupSendText(groupId, moiId, body) {
  return unwrap(await sb.from(T.groupMessages).insert({ group_id: groupId, sender_id: moiId, body }).select());
}

export async function groupSendWorkout(groupId, moiId, name, code) {
  return unwrap(await sb.from(T.groupMessages)
    .insert({ group_id: groupId, sender_id: moiId, workout_name: name, workout_data: code }).select());
}

/* ==========================================================================
   Séance en direct — écriture dans `shared_sessions`, même forme que
   Social.push (Kotlin) : upsert sur (user_id, local_id), mêmes noms de
   colonnes, même format compact pour `details` (n = nom, s = séries
   {w,r,t,rir?}) puisque c'est ce que lit déjà partage.js/le fil Android.
   ========================================================================== */

export async function finishSession(userId, session) {
  const details = session.exercises
    .filter(e => e.sets.length)
    .map(e => ({
      n: e.name,
      s: e.sets.map(s => {
        const o = { w: s.weight, r: s.reps, t: s.tensionMs };
        if (s.rir >= 0) o.rir = s.rir;
        return o;
      })
    }));
  const row = {
    user_id: userId,
    local_id: session.uid,
    workout_name: session.workoutName,
    category: session.category,
    started_at: new Date(session.startedAt).toISOString(),
    duration_ms: Math.max(0, session.endedAt - session.startedAt),
    tension_ms: session.exercises.reduce((t, e) => t + e.sets.reduce((u, s) => u + (s.tensionMs || 0), 0), 0),
    volume_kg: session.exercises.reduce((t, e) => t + e.sets.reduce((u, s) => u + (s.weight || 0) * (s.reps || 0), 0), 0),
    exercise_count: session.exercises.filter(e => e.sets.length).length,
    set_count: session.exercises.reduce((t, e) => t + e.sets.length, 0),
    details
  };
  return unwrap(await sb.from(T.sharedSessions).upsert(row, { onConflict: 'user_id,local_id' }).select().single());
}
