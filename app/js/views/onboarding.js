/* ==========================================================================
   Tutoriel de première ouverture — portage exact d'Onboarding.kt (mêmes six
   pages, mot pour mot). CURRENT doit rester synchronisé avec la valeur
   côté Android (Onboarding.kt) : l'incrémenter là-bas doit s'accompagner
   du même changement ici, sinon le web et le natif ne rejouent plus le
   tutoriel aux mêmes versions.
   ========================================================================== */

import { h, render } from '../ui.js';

const CLE = 'motio_onboarding_seen';
const CURRENT = 2;

export function pending() {
  return (parseInt(localStorage.getItem(CLE) || '0', 10)) < CURRENT;
}
export function markSeen() { localStorage.setItem(CLE, String(CURRENT)); }
export function reset() { localStorage.setItem(CLE, '0'); }

const PAGES = [
  {
    titre: 'Bienvenue dans Motio',
    corps: "Un chronomètre d'entraînement et un carnet de séances, pensés pour la salle. Tout fonctionne hors ligne : le compte en ligne est facultatif et n'arrive qu'à la fin.",
    astuce: 'Cinq écrans, une minute. Tu peux passer à tout moment.'
  },
  {
    titre: 'Les minuteurs',
    corps: 'Chronomètre, minuteur et Tabata, avec signaux sonores.',
    astuce: 'Premier onglet, en bas à gauche.'
  },
  {
    titre: 'Tes entraînements',
    corps: "Compose une séance, choisis les exercices dans le catalogue, et lance-la. Chaque série est enregistrée avec sa charge, ses répétitions et son temps sous tension.\n\nLe catalogue est modifiable : renomme, ajoute, réorganise, indique le matériel nécessaire.",
    astuce: 'Deuxième onglet. Relie deux exercices pour en faire une supersérie.'
  },
  {
    titre: 'Le programme automatique',
    corps: "Donne ton objectif, ton niveau, tes jours disponibles et ton matériel : l'application construit un programme complet sur plusieurs semaines, avec la progression des charges et les semaines de décharge.",
    astuce: 'Onglet Entraînement, bouton « Créer un programme ».'
  },
  {
    titre: 'Moti, ton coach IA',
    corps: "Salut, moi c'est Moti. Je connais ton programme, tes dernières séances et tes records, et je m'en sers vraiment pour te répondre, jamais des généralités.\n\nDemande-moi où tu en es, ce que tu dois faire aujourd'hui, ou décris-moi une séance précise : je te la structure et tu l'ajoutes direct à ton entraînement, à faire maintenant ou plus tard.",
    astuce: 'Carte Moti en haut de l\'onglet Entraînement.'
  },
  {
    titre: 'Analyse, amis et sauvegarde',
    corps: "Records, 1RM estimé, volume par groupe musculaire et courbes de progression : tout est calculé à partir de ce que tu notes.\n\nUn compte, facultatif, sauvegarde ton carnet en ligne et permet de suivre les séances de tes amis. Tu choisis ce que tu partages, et tu peux tout effacer d'un bouton.",
    astuce: 'Profil, en bas à droite.'
  }
];

export function vueOnboarding() {
  let page = 0;

  const el = h(`
    <section class="onb">
      <div class="onb-haut"><button class="lien-inline" data-passer type="button">Passer</button></div>
      <div class="onb-corps" data-corps></div>
      <div class="onb-points" data-points></div>
      <div class="onb-boutons" data-boutons></div>
      <p class="onb-page" data-pagenum></p>
    </section>`);

  const zoneCorps = el.querySelector('[data-corps]');
  const zonePoints = el.querySelector('[data-points]');
  const zoneBoutons = el.querySelector('[data-boutons]');
  const zonePage = el.querySelector('[data-pagenum]');

  function terminer() { markSeen(); location.hash = '#/seances'; }

  function dessiner() {
    const p = PAGES[page];
    const last = page === PAGES.length - 1;

    zoneCorps.innerHTML = `
      <h1>${p.titre}</h1>
      <p class="onb-texte">${p.corps.split('\n\n').map(par => `<span>${par}</span>`).join('<br><br>')}</p>
      <p class="onb-astuce">${p.astuce}</p>`;

    zonePoints.replaceChildren();
    PAGES.forEach((_, i) => {
      const b = h(`<button class="onb-point ${i === page ? 'on' : ''}" type="button" aria-label="Page ${i + 1}"></button>`);
      b.onclick = () => { page = i; dessiner(); };
      zonePoints.appendChild(b);
    });

    zoneBoutons.replaceChildren();
    if (page > 0) {
      const prec = h('<button class="btn btn-ghost" type="button">Précédent</button>');
      prec.onclick = () => { page--; dessiner(); };
      zoneBoutons.appendChild(prec);
    }
    const suiv = h(`<button class="btn btn-lg" type="button">${last ? 'Commencer' : 'Suivant'}</button>`);
    suiv.onclick = () => { if (last) terminer(); else { page++; dessiner(); } };
    zoneBoutons.appendChild(suiv);

    zonePage.textContent = `Page ${page + 1} sur ${PAGES.length}`;
  }

  el.querySelector('[data-passer]').onclick = terminer;

  /* Glissement horizontal, comme detectHorizontalDragGestures côté natif. */
  let x0 = null;
  zoneCorps.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  zoneCorps.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    const seuil = zoneCorps.clientWidth * 0.18;
    if (dx <= -seuil && page < PAGES.length - 1) { page++; dessiner(); }
    else if (dx >= seuil && page > 0) { page--; dessiner(); }
    x0 = null;
  }, { passive: true });

  dessiner();
  render(el);
}
