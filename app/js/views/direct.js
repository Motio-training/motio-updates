/* ==========================================================================
   Suivi en direct d'un ami — portage de LiveSessionScreen.kt : statut,
   exercice courant en gras/vert, détail des séries déjà faites. Sondage
   toutes les 5 s tant que l'écran reste ouvert (même logique que
   messages.js), la fraîcheur de 90 s est déjà appliquée par directDe()
   (api.js). Écart assumé : pas de fil de discussion intégré sous la carte
   (ChatBody, natif) — un simple lien vers la conversation existante.
   ========================================================================== */

import { h, render, loading, esc } from '../ui.js';
import { directDe, getProfile } from '../api.js';
import { kg } from '../model.js';

function depuisLabel(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60000) return "à l'instant";
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h`;
}

/** setLabel (SocialScreens.kt). */
function labelSerie(st) {
  return st.w > 0 ? `${kg(st.w)} × ${st.r}` : `${st.r} répétition${st.r > 1 ? 's' : ''}`;
}

export async function vueDirect(params) {
  render(loading('Chargement'));
  const amiId = params.id;

  let profilAmi = null;
  try { profilAmi = await getProfile(amiId); } catch { /* on affiche quand même la page */ }
  const nomAmi = profilAmi?.username || 'cet ami';

  const el = h(`
    <section class="page page-etroite">
      <p class="eyebrow"><a class="lien-inline" href="#/profil/${esc(amiId)}">‹ ${esc(nomAmi)}</a></p>
      <h1>En direct</h1>
      <div data-corps></div>
      <a class="btn btn-ghost" href="#/messages/${esc(amiId)}" style="display:block;text-align:center;margin-top:1.5rem">Envoyer un message</a>
    </section>`);
  const corps = el.querySelector('[data-corps]');

  function dessiner(live) {
    if (!live) {
      corps.replaceChildren(h(`
        <p class="etat-mono">${esc(nomAmi)} n'est pas en séance en ce moment. Cette page
        se met à jour toute seule dès qu'il en commence une.</p>`));
      return;
    }
    const details = Array.isArray(live.details) ? live.details : [];
    const carte = h(`
      <div class="direct-carte">
        <div class="direct-entete">
          <span class="direct-point"></span>
          <span class="direct-label">EN DIRECT</span>
          <span class="direct-depuis" data-depuis></span>
        </div>
        <p class="direct-titre">${esc(live.workout_name || 'Séance')}</p>
        <div data-detail></div>
      </div>`);
    carte.querySelector('[data-depuis]').textContent = `Depuis ${depuisLabel(live.started_at)}`;

    const zoneDetail = carte.querySelector('[data-detail]');
    if (!details.length) {
      zoneDetail.appendChild(h(`
        <p class="direct-exo-meta">${esc(live.current_exercise || 'Échauffement')} · ${live.set_count || 0} série(s)</p>`));
    } else {
      details.forEach((ex, i) => {
        const courant = i === live.exercise_index;
        const bloc = h(`
          <div class="direct-exo">
            <p class="direct-exo-nom ${courant ? 'courant' : ''}">${esc(ex.n)}</p>
            <ul class="direct-series" data-liste></ul>
          </div>`);
        const ul = bloc.querySelector('[data-liste]');
        (ex.s || []).forEach((st, si) => ul.appendChild(h(`<li>${si + 1}.  ${esc(labelSerie(st))}</li>`)));
        if (courant) ul.appendChild(h(`<li class="direct-en-cours">${(ex.s || []).length + 1}.  Série en cours…</li>`));
        zoneDetail.appendChild(bloc);
      });
    }
    corps.replaceChildren(carte);
  }

  async function rafraichir() {
    if (!document.body.contains(el)) return; // écran quitté : plus la peine de sonder
    let live = null;
    try { live = await directDe(amiId); } catch { /* on garde le dernier affichage */ }
    if (!document.body.contains(el)) return;
    dessiner(live);
    setTimeout(rafraichir, 5000);
  }

  rafraichir();
  render(el);
}
