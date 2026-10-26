/* ==========================================================================
   ÉCRIRE UN PROGRAMME EN DEUX TEMPS, SANS TENIR LA LIGNE OUVERTE.
   Portage de ProgramBuild.kt : les deux doivent dire la même chose.

   Le 26 octobre 2026, un programme de douze semaines à cinq séances a été
   construit par le serveur en 129 secondes, renvoyé correctement... et jeté,
   parce que le client avait cessé d'écouter à 90. Deux problèmes distincts,
   deux réponses — et il fallait les deux :

   - LE DÉCOUPAGE : écrire tout d'un coup frôlait les 150 secondes auxquelles
     la plateforme coupe une fonction serveur. Le travail se fait désormais en
     deux appels au modèle, les SÉANCES puis la PÉRIODISATION, chacun
     largement sous le plafond ;
   - LA FILE : le travail ne vit plus dans une requête HTTP mais dans une
     table, côté serveur. On le démarre, puis on le fait avancer d'une étape
     par appel. Une connexion qui tombe ne coûte plus que la reprise de
     l'étape en cours : ce qui est déjà écrit est en base, et `reprendre` y
     retourne.

   Ce qui sort à la fin a exactement la forme que renvoyait l'ancienne
   génération d'un seul tenant : `construireDraft` ne change pas.
   ========================================================================== */

import { sb } from './supabase.js';

/**
 * supabase-js masque le corps des réponses non-2xx d'une fonction Edge : sans
 * cela on lirait « Edge Function returned a non-2xx status code » au lieu du
 * motif réel. Copie volontaire de `motifLisible` (programme-ia.js) : l'y
 * importer créerait un cycle entre les deux modules, pour huit lignes.
 */
async function motifLisible(error) {
  try {
    const corps = await error?.context?.json?.();
    if (corps?.error) return new Error(corps.error);
  } catch { /* corps illisible : on garde le message d'origine */ }
  return error instanceof Error ? error : new Error(String(error));
}

/** Sécurité contre une boucle sans fin : deux étapes sont prévues, on en
 *  tolère quelques-unes de plus (une reprise après un verrou périmé, par
 *  exemple) et on s'arrête. */
const ETAPES_MAX = 6;

/** Erreur d'une étape, qui porte de quoi reprendre là où on s'est arrêté. */
export class ErreurEtape extends Error {
  constructor(message, jobId) {
    super(message);
    this.name = 'ErreurEtape';
    this.jobId = jobId;
  }
}

/**
 * Démarre le travail puis le mène jusqu'au bout. `demande` est le corps
 * complet (objectif, niveau, catalogue, carnet…), celui qu'on n'envoie
 * qu'UNE fois : les étapes suivantes ne transportent plus que l'identifiant
 * du travail. `onEtape` reçoit l'étape en cours ('seances' | 'phases').
 */
export async function construire(demande, onEtape = () => {}) {
  const { data, error } = await sb.functions.invoke('program-build', {
    body: { action: 'start', ...demande }
  });
  if (error) throw await motifLisible(error);
  const jobId = data?.job_id;
  if (!jobId) throw new Error("Le serveur n'a pas pu démarrer la génération.");
  onEtape('seances');
  return reprendre(jobId, onEtape);
}

/**
 * Fait avancer un travail déjà démarré jusqu'à son terme. Appelable tel quel
 * après un échec réseau : le serveur reprend là où il s'était arrêté, et
 * l'étape déjà payée n'est pas refaite.
 */
export async function reprendre(jobId, onEtape = () => {}) {
  for (let reste = ETAPES_MAX; reste > 0; reste--) {
    let data, error;
    try {
      ({ data, error } = await sb.functions.invoke('program-build', {
        body: { action: 'step', job_id: jobId }
      }));
    } catch (e) {
      throw new ErreurEtape(e.message || 'La connexion au serveur a été perdue.', jobId);
    }
    if (error) throw new ErreurEtape((await motifLisible(error)).message, jobId);
    if (!data) throw new ErreurEtape('Réponse vide du serveur.', jobId);

    if (data.statut === 'termine') {
      if (!data.resultat) throw new ErreurEtape('Programme reçu mais vide.', jobId);
      return data.resultat;
    }
    if (data.statut === 'erreur') {
      throw new Error(data.erreur || 'La génération a échoué.');
    }
    // Une autre étape tourne déjà (reprise trop rapide après une coupure) :
    // on ne relance rien, on laisse finir.
    if (data.occupe) {
      throw new ErreurEtape(
        'Une génération est déjà en cours pour ce programme. Laisse-lui une minute, puis reprends.',
        jobId
      );
    }
    onEtape(data.etape || 'phases');
  }
  throw new ErreurEtape("La génération n'a pas abouti.", jobId);
}
