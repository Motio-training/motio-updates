/* ==========================================================================
   Encodage/décodage du code de séance partagée — portage exact de
   WorkoutShare.encode/decode (Sharing.kt) : JSON compact {v,n,c,e:[...]}
   compressé en deflate (zlib, PAS raw : Deflater() par défaut) puis en
   base64 URL-safe sans padding. CompressionStream('deflate') du navigateur
   produit exactement ce format, donc rien à réimplémenter à la main.

   Utilisé partout où une séance voyage en dehors de son propriétaire :
   messages 1-à-1, canal de groupe — même `workout_data` que l'app Android.
   ========================================================================== */

async function deflate(bytes) {
  const cs = new CompressionStream('deflate');
  const writer = cs.writable.getWriter();
  writer.write(bytes); writer.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}
async function inflate(bytes) {
  const ds = new DecompressionStream('deflate');
  const writer = ds.writable.getWriter();
  writer.write(bytes); writer.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

function b64urlEncode(bytes) {
  let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s) {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encode(workout) {
  const root = {
    v: 1, n: workout.name, c: workout.category,
    e: workout.exercises.map(ex => ({
      n: ex.name, m: ex.mode, ps: ex.plannedSets, tr: ex.targetReps,
      rc: ex.recupSec, ws: ex.workSec, rs: ex.restSec, tb: ex.tabataSeries
    }))
  };
  const bytes = await deflate(new TextEncoder().encode(JSON.stringify(root)));
  return b64urlEncode(bytes);
}

/** Code → séance neuve (nouvel id, sans historique), ou null si illisible. */
export async function decode(code) {
  try {
    const bytes = await inflate(b64urlDecode(code.trim()));
    const o = JSON.parse(new TextDecoder().decode(bytes));
    const exercises = (o.e || []).map(eo => ({
      name: eo.n || '', mode: eo.m || 'MINUTEUR',
      plannedSets: eo.ps ?? 4, targetReps: eo.tr ?? 0,
      recupSec: eo.rc ?? 90, workSec: eo.ws ?? 20, restSec: eo.rs ?? 10,
      tabataSeries: eo.tb ?? 8, groupId: 0, sets: []
    }));
    if (!exercises.length) return null;
    return { id: Date.now(), name: o.n || '', category: o.c || 'Push', exercises, history: [] };
  } catch { return null; }
}

/* ==========================================================================
   LIENS COURTS

   Le code ci-dessus porte la séance entière : 300 à 500 caractères dans
   l'adresse, illisibles dans une messagerie. On le dépose donc une fois sur
   le serveur (`create_share_link`), qui rend un identifiant de 7 caractères.

   Ce qui voyage : la DÉFINITION de la séance seule, jamais l'historique.

   Même contrat que Sharing.kt côté Android, y compris le repli : si le
   serveur ne répond pas, on repart sur le code long, qui n'a besoin de
   personne. Un partage ne doit pas échouer faute de réseau.
   ========================================================================== */

/** Alphabet des identifiants courts, sans caractère ambigu (ni 0/O, ni 1/I/L).
 *  Doit rester identique à `share_link_id()` en base et à SHORT_ALPHABET
 *  (Sharing.kt). */
const ALPHABET_COURT = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const RE_ID_COURT = new RegExp(`^[${ALPHABET_COURT}]{7}$`, 'i');

export function estIdCourt(s) {
  return typeof s === 'string' && RE_ID_COURT.test(s.trim());
}

/** Dépose un code de séance et rend son identifiant court, ou null. */
export async function creerLienCourt(workout, code) {
  try {
    const { sb } = await import('./supabase.js');
    const { data, error } = await sb.rpc('create_share_link', {
      p_code: code,
      p_name: workout.name || '',
      p_category: workout.category || '',
      p_exercises: (workout.exercises || []).length
    });
    if (error) return null;
    return estIdCourt(data) ? data : null;
  } catch { return null; }
}

/** Identifiant court → code long d'origine, ou null (inconnu, hors ligne). */
export async function resoudreLienCourt(id) {
  try {
    const { sb } = await import('./supabase.js');
    const { data, error } = await sb.rpc('resolve_share_link', { p_id: String(id).trim().toUpperCase() });
    if (error || !data || !data.length) return null;
    return data[0].code || null;
  } catch { return null; }
}

/**
 * Séance derrière un code reçu, quelle que soit sa forme : code long (décodé
 * sur place) ou identifiant court (une requête). Pendant de
 * `WorkoutShare.workoutFor` (Sharing.kt).
 */
export async function seancePour(code) {
  const direct = await decode(code);
  if (direct) return direct;
  if (!estIdCourt(code)) return null;
  const long = await resoudreLienCourt(code);
  return long ? decode(long) : null;
}
