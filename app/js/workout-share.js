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
