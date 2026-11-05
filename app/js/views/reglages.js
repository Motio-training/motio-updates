/* ==========================================================================
   ÉCRAN RÉGLAGES — tout ce qui se règle, au même endroit.

   Portage de SettingsScreen.kt (C:\chrono). Avant, le thème et le son
   vivaient derrière deux petites icônes de l'en-tête, et la mise à jour, les
   nouveautés, le tutoriel et les mentions légales tout au fond du Profil : il
   fallait savoir lequel des deux endroits regarder. Une seule roue crantée,
   en haut à droite, mène maintenant à tout. Le Profil ne parle plus que de la
   personne, de son carnet et de son compte.

   Les deux premières lignes affichent leur valeur courante en sous-titre :
   l'état se lit sans ouvrir la fenêtre.
   ========================================================================== */

import { h, render, esc, toast } from '../ui.js';
import { currentUser } from '../supabase.js';
import { bloques, debloquer, exporterMesDonnees } from '../api.js';
import { consentementIA, accepterConsentementIA, retirerConsentementIA,
         texteConsentementIA } from '../consentement-ia.js';
import { ouvrirTheme, ouvrirReglagesBips, themeActuel, reglagesBips } from '../reglages.js';
import { CHANGELOG } from '../changelog.js';
import { reset as reinitialiserOnboarding } from './onboarding.js';
import * as beeper from '../beeper.js';

const LIBELLE_THEME = { sombre: 'Sombre', clair: 'Clair', systeme: 'Comme l\u2019appareil' };

function resumeTheme() { return LIBELLE_THEME[themeActuel()] || 'Comme l\u2019appareil'; }
function resumeSon() {
  return reglagesBips().voix ? 'Voix du coach' : 'Sifflet synth\u00e9tis\u00e9';
}

export async function vueReglages() {
  const el = h(`
    <section class="page page-etroite">
      <h1>Réglages</h1>

      <div class="bloc">
        <p class="bloc-titre">Apparence et son</p>
        <div class="menu-groupe">
          <button class="menu-ligne" data-theme type="button">
            <span class="corps"><b>Thème</b><span data-resume-theme>${esc(resumeTheme())}</span></span>
            <span class="chevron">›</span>
          </button>
          <button class="menu-ligne" data-son type="button">
            <span class="corps"><b>Son de séance</b><span data-resume-son>${esc(resumeSon())}</span></span>
            <span class="chevron">›</span>
          </button>
        </div>
      </div>

      <div class="bloc" data-bloc-confidentialite hidden>
        <p class="bloc-titre">Confidentialité</p>
        <div class="menu-groupe">
          <button class="menu-ligne" data-consentement type="button">
            <span class="corps"><b>Moti et tes données</b><span data-resume-consentement>Ce que l'IA reçoit, et ton accord</span></span>
            <span class="chevron">›</span>
          </button>
          <button class="menu-ligne" data-bloques type="button">
            <span class="corps"><b>Comptes bloqués</b><span>Les personnes qui ne peuvent plus te suivre ni t'écrire</span></span>
            <span class="chevron">›</span>
          </button>
          <button class="menu-ligne" data-export type="button">
            <span class="corps"><b>Télécharger toutes mes données</b><span data-resume-export>Profil, séances partagées, messages, Moti, nutrition : un fichier lisible</span></span>
            <span class="chevron">›</span>
          </button>
        </div>
      </div>

      <div class="bloc">
        <p class="bloc-titre">Application</p>
        <div class="menu-groupe">
          <a class="menu-ligne" href="#/reglages/maj">
            <span class="corps"><b>Mise à jour</b><span>À jour</span></span>
            <span class="chevron">›</span>
          </a>
          <a class="menu-ligne" href="#/reglages/nouveautes">
            <span class="corps"><b>Nouveautés</b><span>Ce qui a changé, version par version</span></span>
            <span class="chevron">›</span>
          </a>
          <button class="menu-ligne" data-tuto type="button">
            <span class="corps"><b>Revoir le tutoriel</b></span>
            <span class="chevron">›</span>
          </button>
          <a class="menu-ligne" href="../confidentialite/index.html" target="_blank" rel="noopener">
            <span class="corps"><b>Confidentialité</b></span>
            <span class="chevron">›</span>
          </a>
          <a class="menu-ligne" href="../conditions/index.html" target="_blank" rel="noopener">
            <span class="corps"><b>Conditions d'utilisation</b></span>
            <span class="chevron">›</span>
          </a>
          <a class="menu-ligne" href="../mentions-legales/index.html" target="_blank" rel="noopener">
            <span class="corps"><b>Mentions légales</b></span>
            <span class="chevron">›</span>
          </a>
        </div>
      </div>
    </section>`);

  /* Les deux fenêtres se referment sans prévenir personne : on rafraîchit le
     résumé à la fermeture, sinon la ligne resterait sur l'ancienne valeur
     après un changement de thème ou de son. */
  const rafraichir = () => {
    el.querySelector('[data-resume-theme]').textContent = resumeTheme();
    el.querySelector('[data-resume-son]').textContent = resumeSon();
  };

  el.querySelector('[data-theme]').onclick = () => {
    ouvrirTheme();
    // La modale de thème n'a pas de rappel de fermeture : on suit sa
    // disparition du DOM plutôt que d'inventer une API pour si peu.
    surFermetureModale(rafraichir);
  };
  el.querySelector('[data-son]').onclick = () => {
    ouvrirReglagesBips(beeper);
    surFermetureModale(rafraichir);
  };
  el.querySelector('[data-tuto]').onclick = () => {
    reinitialiserOnboarding();
    location.hash = '#/onboarding';
  };

  /* Confidentialité du COMPTE (audit du 5 novembre 2026) : l'accord donné à
     Moti, les comptes bloqués, et l'export complet. Sans connexion, rien de
     tout ça n'existe sur le serveur : la section reste cachée. */
  const moi = await currentUser().catch(() => null);
  if (moi) {
    el.querySelector('[data-bloc-confidentialite]').hidden = false;
    const resume = el.querySelector('[data-resume-consentement]');
    const majResume = async () => {
      try {
        const le = await consentementIA();
        resume.textContent = le ? 'Accord donné, retirable à tout moment' : "Pas d'accord donné : Moti est en pause";
      } catch { /* on garde le texte neutre */ }
    };
    majResume();
    el.querySelector('[data-consentement]').onclick = () => ouvrirConsentement(majResume);
    el.querySelector('[data-bloques]').onclick = () => ouvrirBloques(moi);
    const btnExport = el.querySelector('[data-export]');
    btnExport.onclick = async () => {
      const zone = el.querySelector('[data-resume-export]');
      const avant = zone.textContent;
      btnExport.disabled = true;
      zone.textContent = 'Préparation du fichier…';
      try {
        const donnees = await exporterMesDonnees();
        const blob = new Blob([JSON.stringify(donnees, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `motio-mes-donnees-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        toast('Toutes tes données sont dans le fichier téléchargé.');
      } catch (err) {
        toast("L'export n'a pas abouti : " + (err?.message || 'réseau indisponible'));
      } finally {
        zone.textContent = avant;
        btnExport.disabled = false;
      }
    };
  }

  render(el);
}

/** Réglages › Confidentialité › Moti et tes données : voir, donner ou retirer l'accord. */
async function ouvrirConsentement(apres) {
  let le = '';
  try { le = await consentementIA(); } catch { /* affiché comme sans accord */ }
  const modale = h(`
    <div class="modale" role="dialog" aria-label="Moti et tes données">
      <div class="modale-boite modale-boite-etroite">
        <div class="modale-tete"><h2>Moti et tes données</h2></div>
        <div class="modale-corps">
          <p><b data-etat></b></p>
          ${texteConsentementIA()}
        </div>
        <div class="modale-pied" style="justify-content:flex-end;gap:1.2rem">
          <button class="lien-inline" data-fermer type="button">Fermer</button>
          <button class="btn" data-basculer type="button"></button>
        </div>
      </div>
    </div>`);
  const etat = modale.querySelector('[data-etat]');
  const bouton = modale.querySelector('[data-basculer]');
  const dessiner = () => {
    etat.textContent = le
      ? `Accord donné le ${new Date(le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}.`
      : "Tu n'as pas donné ton accord : Moti est en pause.";
    bouton.textContent = le ? 'Retirer mon accord' : 'Donner mon accord';
  };
  dessiner();
  const fermer = () => { modale.remove(); apres?.(); };
  modale.addEventListener('click', (e) => { if (e.target === modale) fermer(); });
  modale.querySelector('[data-fermer]').onclick = fermer;
  bouton.onclick = async () => {
    bouton.disabled = true;
    try {
      if (le) { await retirerConsentementIA(); le = ''; }
      else { await accepterConsentementIA(); le = await consentementIA(); }
      dessiner();
    } catch (err) { toast(err?.message || "Ça n'a pas fonctionné."); }
    finally { bouton.disabled = false; }
  };
  document.body.appendChild(modale);
}

/** Réglages › Confidentialité › Comptes bloqués. */
async function ouvrirBloques(moi) {
  const modale = h(`
    <div class="modale" role="dialog" aria-label="Comptes bloqués">
      <div class="modale-boite modale-boite-etroite">
        <div class="modale-tete"><h2>Comptes bloqués</h2></div>
        <div class="modale-corps" data-liste><p class="etat-mono">Chargement…</p></div>
        <div class="modale-pied" style="justify-content:flex-end">
          <button class="lien-inline" data-fermer type="button">Fermer</button>
        </div>
      </div>
    </div>`);
  const fermer = () => modale.remove();
  modale.addEventListener('click', (e) => { if (e.target === modale) fermer(); });
  modale.querySelector('[data-fermer]').onclick = fermer;
  document.body.appendChild(modale);

  const zone = modale.querySelector('[data-liste]');
  const dessiner = async () => {
    let liste;
    try { liste = await bloques(moi.id); }
    catch (err) { zone.replaceChildren(h(`<p class="etat-mono">${esc(err?.message || 'Lecture impossible.')}</p>`)); return; }
    if (!liste.length) {
      zone.replaceChildren(h(`<p class="etat-mono">Tu n'as bloqué personne. Pour bloquer quelqu'un, ouvre son profil.</p>`));
      return;
    }
    const ul = h('<ul class="liste"></ul>');
    for (const p of liste) {
      const li = h(`
        <li class="ligne" style="display:flex;align-items:center;gap:.65rem">
          <span class="ligne-titre" style="flex:1;min-width:0">${esc(p.username || 'sans pseudo')}</span>
          <button class="btn btn-sm btn-ghost" type="button">Débloquer</button>
        </li>`);
      const b = li.querySelector('button');
      b.onclick = async () => {
        b.disabled = true;
        try { await debloquer(moi.id, p.id); dessiner(); }
        catch (err) { toast(err?.message || "Le déblocage n'a pas abouti."); b.disabled = false; }
      };
      ul.appendChild(li);
    }
    zone.replaceChildren(ul);
  };
  dessiner();
}

/** Rappelle [fn] quand la dernière modale ouverte quitte le DOM. */
function surFermetureModale(fn) {
  const ouvertes = document.querySelectorAll('.modale');
  const modale = ouvertes[ouvertes.length - 1];
  if (!modale) { fn(); return; }
  const obs = new MutationObserver(() => {
    if (!modale.isConnected) { obs.disconnect(); fn(); }
  });
  obs.observe(document.body, { childList: true });
}

/** Mise à jour — l'espace web se met à jour tout seul (service worker), donc
 *  la page ne promet rien d'autre qu'un « À jour » et un bouton pour forcer
 *  la vérification tout de suite. Reprise telle quelle de l'ancien
 *  #/profil/maj, seul le fil d'Ariane change. */
export async function vueReglagesMaj() {
  let version = '';
  try { version = (await fetch(`./version.txt?_=${Date.now()}`, { cache: 'no-store' }).then(r => r.text())).trim(); }
  catch { /* pas grave, la carte affiche juste « À jour » sans numéro */ }

  const el = h(`
    <section class="page page-etroite">
      ${enTeteReglages('Mise à jour')}

      <div class="tonnage-carte" style="margin-top:1.5rem">
        <span>${version ? `Version ${esc(version)}` : 'Motio'}</span>
        <b style="color:var(--accent)">À jour</b>
      </div>

      <button class="btn" data-verifier type="button" style="width:100%;margin-top:1rem">Vérifier maintenant</button>
      <p class="etat-mono" data-msg style="margin-top:.6rem"></p>

      <a class="btn btn-ghost" href="#/reglages/nouveautes" style="display:block;text-align:center;margin-top:1.5rem">Nouveautés</a>
    </section>`);

  el.querySelector('[data-verifier]').onclick = async () => {
    const msg = el.querySelector('[data-msg]');
    msg.textContent = 'Vérification…';
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
      msg.textContent = 'À jour — la page se recharge…';
      setTimeout(() => location.reload(), 700);
    } catch {
      msg.textContent = 'Déjà à jour.';
    }
  };

  render(el);
}

/** Nouveautés (ChangelogDialog, Changelog.kt) : le plus récent en premier. */
export async function vueReglagesNouveautes() {
  const el = h(`
    <section class="page">
      ${enTeteReglages('Nouveautés')}
      <div class="menu-groupe" data-liste style="margin-top:1.5rem;background:none"></div>
    </section>`);

  const zone = el.querySelector('[data-liste]');
  [...CHANGELOG].reverse().forEach(entree => {
    zone.appendChild(h(`
      <div class="bloc" style="margin-top:1.4rem;padding-top:0;border-top:none">
        <p class="bloc-titre" style="margin-bottom:.3rem">${esc(entree.versions)} · ${esc(entree.date)}</p>
        <ul class="liste" style="gap:.4rem">
          ${entree.items.map(it => `<li class="ligne" style="padding:.6rem .8rem">${esc(it)}</li>`).join('')}
        </ul>
      </div>`));
  });

  render(el);
}

function enTeteReglages(titre) {
  return `
    <p class="eyebrow"><a class="lien-inline" href="#/reglages">‹ Réglages</a></p>
    <h1>${esc(titre)}</h1>`;
}
