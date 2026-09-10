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

import { h, render, esc } from '../ui.js';
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

  render(el);
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
