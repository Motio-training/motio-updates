/* ==========================================================================
   Réglages qui suivent le COMPTE et non l'appareil.

   Jusqu'ici tout vivait dans localStorage, donc dans une seule origine et un
   seul navigateur : changer de téléphone, réinstaller la PWA ou passer du web
   à l'appli faisait repartir de zéro. Les séances, elles, sont déjà dans
   Supabase et reviennent toutes seules — d'où l'impression bancale d'un compte
   qui retrouve tout sauf les 1RM et les records épinglés.

   Ce qui monte : niveau, objectif, 1RM manuels, records épinglés, portée du
   fil, thème. Ce qui reste local, volontairement :

   - les bips (`motio_bips`) : le volume qui convient dans une salle bruyante
     sur un téléphone n'est pas celui d'un ordinateur au calme. C'est un
     réglage d'appareil, le synchroniser gênerait plus qu'il n'aiderait ;
   - la séance en cours (run-state.js) : elle s'écrit à chaque seconde, deux
     appareils qui écrivent la même séance produiraient des conflits en
     permanence.

   Stockage : table `user_settings`, une ligne par utilisateur, lisible de son
   seul propriétaire. PAS une colonne de `profiles` — la policy de lecture de
   `profiles` est ouverte à tous les comptes non bloqués pour alimenter les
   profils publics et le fil, et des 1RM sont des performances personnelles.
   Même modèle que `private_metrics` et `backups`.

   Conflits : le dernier écrivain gagne. Un seul utilisateur écrit ses propres
   réglages, il n'y a pas de quoi sortir une machinerie de fusion.
   ========================================================================== */

import { sb } from './supabase.js';
import { instantanePrefs, appliquerPrefs, surChangementPrefs } from './reglages.js';

const TABLE = 'user_settings';

/* Écrire à chaque frappe du curseur de réglage inonderait le réseau : on
   attend que ça se calme. */
const DELAI_ECRITURE = 1500;

let compteEnCours = null;
let minuteur = null;

/** Premier passage pour ce compte : le serveur fait foi, le local complète. */
async function tirer() {
  const { data, error } = await sb
    .from(TABLE)
    .select('settings')
    .eq('user_id', compteEnCours)
    .maybeSingle();

  if (error) return false;

  const distant = data?.settings ?? null;
  const local = instantanePrefs();

  if (!distant) {
    /* Compte encore vierge côté serveur : cet appareil sert de point de
       départ. C'est le cas d'un compte qui existait avant cette synchro. */
    await pousser(local);
    return true;
  }

  appliquerPrefs(distant);

  /* Une clé réglée ici mais absente du serveur (réglage ajouté depuis, ou
     appareil resté en arrière) ne doit pas être effacée par la descente : on
     la renvoie. Le serveur reste prioritaire sur ce qu'il connaît déjà. */
  const manquantes = Object.fromEntries(
    Object.entries(local).filter(([cle]) => distant[cle] === undefined)
  );
  if (Object.keys(manquantes).length) await pousser({ ...distant, ...manquantes });

  return true;
}

async function pousser(prefs) {
  if (!compteEnCours) return;
  await sb.from(TABLE).upsert({
    user_id: compteEnCours,
    settings: prefs ?? instantanePrefs(),
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id' });
}

function planifierEcriture() {
  if (!compteEnCours) return;
  clearTimeout(minuteur);
  minuteur = setTimeout(() => { pousser().catch(() => { /* réessai au prochain changement */ }); }, DELAI_ECRITURE);
}

/**
 * À appeler au démarrage et à chaque changement d'état d'authentification.
 * Idempotent : rappelée avec le même compte, elle ne refait pas la descente.
 */
export async function syncPrefs(session) {
  const id = session?.user?.id ?? null;

  if (!id) {
    /* Déconnexion : on cesse d'écrire, et on ne touche PAS au localStorage.
       Effacer les réglages à la déconnexion donnerait une application nue à
       quelqu'un qui se reconnecte deux secondes plus tard. */
    compteEnCours = null;
    clearTimeout(minuteur);
    return;
  }

  if (id === compteEnCours) return;
  compteEnCours = id;

  surChangementPrefs(planifierEcriture);
  try { await tirer(); } catch { /* hors ligne : le local continue de faire foi */ }
}
