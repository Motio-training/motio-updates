/* ==========================================================================
   CONSENTEMENT EXPLICITE À L'USAGE DES DONNÉES PAR L'IA
   (audit du 5 novembre 2026, portage de ConsentementIA.kt)

   Moti reçoit des données qui peuvent être de santé (une douleur, une
   blessure) et les envoie chez Anthropic, aux États-Unis : le RGPD (article
   9.2.a) demande pour cela un accord EXPLICITE. Le serveur fait foi : la table
   `ai_consents` garde l'accord, et chaque fonction IA le vérifie avant
   d'appeler le modèle. Sans accord, elle répond 403 `consentement_requis` ;
   `invoquerIA` ouvre alors la fenêtre d'accord et relance la demande si la
   personne accepte. Les appels n'ont rien d'autre à savoir.

   Changer le texte de façon notable = monter VERSION ici, dans
   ConsentementIA.kt et dans CONSENTEMENT_VERSION des fonctions Edge.
   ========================================================================== */

import { sb, currentUser } from './supabase.js';
import { h } from './ui.js';

export const VERSION = 1;

/** Date d'acceptation, '' sans accord. */
export async function consentementIA() {
  const moi = await currentUser();
  if (!moi) return '';
  const { data, error } = await sb.from('ai_consents')
    .select('version,accepted_at').eq('user_id', moi.id).maybeSingle();
  if (error) throw error;
  return data && data.version >= VERSION ? data.accepted_at : '';
}

export async function accepterConsentementIA() {
  const { error } = await sb.rpc('accepter_consentement_ia', { p_version: VERSION });
  if (error) throw error;
}

export async function retirerConsentementIA() {
  const { error } = await sb.rpc('retirer_consentement_ia');
  if (error) throw error;
}

/** Le texte de l'accord, en HTML échappé (la fenêtre et les Réglages). */
export function texteConsentementIA() {
  return `
    <p>Pour te répondre, Moti s'appuie sur un modèle d'intelligence artificielle d'Anthropic,
      aux États-Unis. Chaque demande lui envoie :</p>
    <ul>
      <li>tes derniers messages, ou ta demande de programme ;</li>
      <li>un résumé de ton entraînement : pseudo, niveau, objectif, programme, séances récentes,
        records ;</li>
      <li>pour le plan nutrition (application Android), ta cible de calories et ce que tu écris
        dans tes préférences.</li>
    </ul>
    <p class="etat-mono">Si tu parles d'une douleur, d'une blessure ou d'une allergie, ce sont des
      données de santé : elles ne partent qu'avec ton accord. Ni ton e-mail ni ton identifiant de
      compte ne sont envoyés, et Anthropic ne s'en sert pas pour entraîner ses modèles.</p>
    <p class="etat-mono">Tu peux retirer ton accord à tout moment dans Réglages › Confidentialité :
      Moti s'arrête alors, et tout le reste continue de fonctionner.</p>`;
}

let enCours = null;

/** Ouvre la fenêtre d'accord ; résout à true si l'accord est donné ET enregistré. */
export function demanderConsentementIA() {
  if (enCours) return enCours;
  enCours = new Promise((resoudre) => {
    const modale = h(`
      <div class="modale" role="dialog" aria-label="Moti et tes données">
        <div class="modale-boite modale-boite-etroite">
          <div class="modale-tete"><h2>Moti et tes données</h2></div>
          <div class="modale-corps">${texteConsentementIA()}<p class="etat-mono" data-erreur hidden style="color:var(--accent2)"></p></div>
          <div class="modale-pied" style="justify-content:flex-end;gap:1.2rem">
            <button class="lien-inline" data-refuser type="button">Pas maintenant</button>
            <button class="btn" data-accepter type="button">J'accepte</button>
          </div>
        </div>
      </div>`);
    const fin = (ok) => { modale.remove(); enCours = null; resoudre(ok); };
    modale.addEventListener('click', (e) => { if (e.target === modale) fin(false); });
    modale.querySelector('[data-refuser]').onclick = () => fin(false);
    const btn = modale.querySelector('[data-accepter]');
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        await accepterConsentementIA();
        fin(true);
      } catch (err) {
        const zone = modale.querySelector('[data-erreur]');
        zone.textContent = err?.message || "L'accord n'a pas pu être enregistré.";
        zone.hidden = false;
        btn.disabled = false;
      }
    };
    document.body.appendChild(modale);
  });
  return enCours;
}

/** Le code d'erreur d'une réponse de fonction Edge, sans consommer son corps. */
async function codeErreur(error) {
  try {
    const corps = await error?.context?.clone?.().json?.();
    return corps?.code || '';
  } catch { return ''; }
}

const MESSAGE_REFUS = "Moti a besoin de ton accord pour fonctionner. Tu peux le donner quand tu veux " +
  'dans Réglages › Confidentialité › Moti et tes données.';

/**
 * `sb.functions.invoke`, plus la fenêtre d'accord quand le serveur la réclame.
 * Si la personne refuse, l'erreur rendue porte un message clair, au même
 * format que celles du serveur (lu par motifLisible).
 */
export async function invoquerIA(nom, options) {
  let r = await sb.functions.invoke(nom, options);
  if (r.error && (await codeErreur(r.error)) === 'consentement_requis') {
    if (await demanderConsentementIA()) {
      r = await sb.functions.invoke(nom, options);
    } else {
      const erreur = new Error(MESSAGE_REFUS);
      erreur.context = new Response(JSON.stringify({ error: MESSAGE_REFUS, code: 'consentement_refuse' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } });
      r = { data: null, error: erreur };
    }
  }
  return r;
}
