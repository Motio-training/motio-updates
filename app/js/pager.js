/* ==========================================================================
   PAGER (v87) — des pages côte à côte qu'on fait défiler au doigt, comme le
   HorizontalPager de l'application (Aujourdhui.kt, SeancePrevue.kt).

   Ce que demande Nicolas, et ce que fait ce composant :
   - la page SUIT LE DOIGT : elle se déplace avec lui, comme s'il la tenait ;
   - droite vers gauche pour la suite, gauche vers droite pour revenir ;
   - aux DEUX BOUTS, ça bloque : le doigt tire un peu sur la page, qui revient
     en place au relâchement. Jamais de tour complet ;
   - relâché, la page se cale sur la voisine si on est allé assez loin ou assez
     vite, sinon elle revient.

   Les gestes verticaux restent ceux de la page (`touch-action: pan-y`) : le
   pager ne se déclenche que sur un geste d'abord horizontal. Un appui sans
   glissement reste un appui — les boutons des pages continuent de répondre,
   et un glissement ne déclenche jamais le bouton sur lequel il a commencé.
   Souris comprise : on peut tirer la page avec le pointeur sur ordinateur.
   ========================================================================== */

const SEUIL_DISTANCE = 0.22;    // fraction de la largeur
const SEUIL_VITESSE = 0.45;     // px par milliseconde
const AMORCE = 8;               // px avant de décider du sens du geste
const FREIN_AUX_BOUTS = 0.25;   // le doigt tire, la page ne suit qu'à ce quart

/**
 * @param pages      éléments DOM, un par page
 * @param depart     page affichée au départ
 * @param ecart      espace entre deux pages, en px
 * @param auChangement  appelé avec le numéro de la page quand elle change
 * @returns { racine, aller(k), courant() }
 */
export function creerPager({ pages, depart = 0, ecart = 16, auChangement }) {
  const n = pages.length;
  const racine = document.createElement('div');
  racine.className = 'pager';
  racine.style.setProperty('--pager-ecart', `${ecart}px`);
  const piste = document.createElement('div');
  piste.className = 'pager-piste';
  pages.forEach(contenu => {
    const page = document.createElement('div');
    page.className = 'pager-page';
    page.appendChild(contenu);
    piste.appendChild(page);
  });
  racine.appendChild(piste);

  let i = Math.min(n - 1, Math.max(0, depart));

  /* Le pourcentage d'un translateX se rapporte à la largeur de la piste, qui
     est celle du pager : aucune mesure à faire, la page de départ est bonne
     dès le premier affichage, même dans une fenêtre qui s'ouvre. */
  function poser(dx, anime) {
    piste.style.transition = anime ? 'transform .28s cubic-bezier(.2,.8,.2,1)' : 'none';
    piste.style.transform = `translate3d(calc(${-i} * (100% + ${ecart}px) + ${dx}px),0,0)`;
  }
  poser(0, false);

  function aller(k, anime = true) {
    const cible = Math.min(n - 1, Math.max(0, k));
    const change = cible !== i;
    i = cible;
    poser(0, anime);
    if (change) auChangement?.(i);
  }

  let debut = null;      // { x, y, t, id }
  let glisse = false;
  let aGlisse = false;

  const freiner = (dx) => {
    const largeur = racine.clientWidth + ecart;
    const auBout = (i === 0 && dx > 0) || (i === n - 1 && dx < 0);
    const v = auBout ? dx * FREIN_AUX_BOUTS : dx;
    return Math.max(-largeur, Math.min(largeur, v));
  };

  racine.addEventListener('pointerdown', (e) => {
    if (n < 2 || (e.pointerType === 'mouse' && e.button !== 0)) return;
    debut = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId };
    glisse = false;
  });

  racine.addEventListener('pointermove', (e) => {
    if (!debut || e.pointerId !== debut.id) return;
    const dx = e.clientX - debut.x;
    const dy = e.clientY - debut.y;
    if (!glisse) {
      if (Math.abs(dx) < AMORCE && Math.abs(dy) < AMORCE) return;
      // Geste d'abord vertical : c'est le défilement de la page, pas le nôtre.
      if (Math.abs(dy) > Math.abs(dx)) { debut = null; return; }
      glisse = true;
      racine.classList.add('glisse');
      try { racine.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
    }
    poser(freiner(dx), false);
  });

  function relacher(e, annule) {
    if (!debut || e.pointerId !== debut.id) return;
    const dx = e.clientX - debut.x;
    const duree = Math.max(1, e.timeStamp - debut.t);
    const etaitGlisse = glisse;
    debut = null; glisse = false;
    racine.classList.remove('glisse');
    if (!etaitGlisse) return;
    aGlisse = true;
    setTimeout(() => { aGlisse = false; }, 60);
    if (annule) return aller(i);
    const loin = Math.abs(dx) > racine.clientWidth * SEUIL_DISTANCE;
    const vite = Math.abs(dx / duree) > SEUIL_VITESSE && Math.abs(dx) > 24;
    if (loin || vite) aller(dx < 0 ? i + 1 : i - 1);   // aux bouts : aller() reste sur place
    else aller(i);
  }
  racine.addEventListener('pointerup', (e) => relacher(e, false));
  racine.addEventListener('pointercancel', (e) => relacher(e, true));

  // Le glissement qui s'achève ne doit pas « cliquer » ce qu'il survolait.
  racine.addEventListener('click', (e) => {
    if (aGlisse) { e.stopPropagation(); e.preventDefault(); }
  }, true);

  return { racine, aller, courant: () => i, nombre: n };
}

/** Les petits points sous un pager : la page courante en vert, un appui y mène. */
export function pointsDuPager(pager) {
  const zone = document.createElement('div');
  zone.className = 'pager-points';
  const points = [];
  for (let k = 0; k < pager.nombre; k++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pager-point';
    b.setAttribute('aria-label', `Séance ${k + 1} sur ${pager.nombre}`);
    b.onclick = () => pager.aller(k);
    zone.appendChild(b);
    points.push(b);
  }
  const maj = (c) => points.forEach((b, k) => b.classList.toggle('on', k === c));
  maj(pager.courant());
  return { zone, maj };
}
