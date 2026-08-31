/* Petits outils partagés par les vues. Aucun framework : le squelette doit
   rester lisible et modifiable sans chaîne de build. */

/* router.js n'importe rien : pas de cycle à craindre en lisant la route ici. */
import { currentPath } from './router.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* Remonter en haut n'a de sens qu'en CHANGEANT d'écran. Or chaque vue se rend
   deux fois — render(loading()) puis render(contenu) quand les données
   arrivent — et le second rendu annulait le défilement en cours : pendant la
   seconde ou deux que dure le chargement, tout geste était ramené en haut, au
   pavé tactile comme au doigt. Vu de l'écran, l'application « ne défilait
   pas », sur tous les écrans et sur les deux plateformes (signalé par
   Nicolas).

   On ne remet donc en haut que lorsque la route a réellement changé : un
   rafraîchissement de la vue courante laisse le lecteur où il est. La
   restauration explicite de position (redessiner(), entrainement.js) continue
   de fonctionner, puisque render ne touche plus au défilement à écran
   constant. */
let cheminDernierRendu = null;

export function render(node) {
  const outlet = $('#vue');
  outlet.replaceChildren(node);
  outlet.focus({ preventScroll: true });

  const chemin = currentPath();
  if (chemin !== cheminDernierRendu) {
    cheminDernierRendu = chemin;
    window.scrollTo(0, 0);
  }
}

export function loading(label = 'Chargement') {
  return h(`<div class="etat"><p class="etat-mono">${esc(label)}…</p></div>`);
}

/** Un écran vide invite à agir, il ne s'excuse pas. */
export function empty(titre, texte, action) {
  const el = h(`
    <div class="etat">
      <h2>${esc(titre)}</h2>
      <p>${esc(texte)}</p>
    </div>`);
  if (action) {
    el.appendChild(h(`<a class="btn" href="${esc(action.href)}">${esc(action.label)}</a>`));
  }
  return el;
}

/** Une erreur dit ce qui s'est passé et ce qu'on peut en faire. */
export function failure(err, quoi) {
  console.error(err);
  const msg = err?.message || 'Erreur inconnue';
  return h(`
    <div class="etat etat-erreur">
      <h2>${esc(quoi)}</h2>
      <p class="etat-mono">${esc(msg)}</p>
      <p>Vérifie la connexion, puis recharge la page. Si le message parle de
         permission, c'est la Row Level Security qui a refusé la requête.</p>
    </div>`);
}

export function toast(texte) {
  const el = h(`<div class="toast">${esc(texte)}</div>`);
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('parti'), 2400);
  setTimeout(() => el.remove(), 2800);
}

/* -------- formatage -------- */

export function dateCourte(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

export function dateLongue(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit'
  });
}

export function duree(secondes) {
  if (secondes == null) return '—';
  const h_ = Math.floor(secondes / 3600);
  const m = Math.floor(secondes / 60) % 60;
  const s = Math.floor(secondes) % 60;
  const p = n => String(n).padStart(2, '0');
  return h_ ? `${h_}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

/* ==========================================================================
   Formats du fil et du classement — portage EXACT de SocialScreens.kt
   (durLabel, kgLabel, whenLabel) et de ProgramModel.kt (shortDate).

   Le web affichait ses propres formats (« 25:59 », « 6000 kg », « il y a
   5 h ») là où l'application affiche « 25 min », « 6 000 kg », « aujourd'hui
   10:29 ». Comparés côte à côte sur le même téléphone, ces trois écarts
   sautaient aux yeux sur chaque carte du fil.
   ========================================================================== */

const JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avril', 'mai', 'juin',
                     'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** shortDate (ProgramModel.kt) : « dim. 16 août ». */
export function dateBreve(ms) {
  const d = new Date(ms);
  return `${JOURS_COURTS[d.getDay()]} ${d.getDate()} ${MOIS_COURTS[d.getMonth()]}`;
}

/** durLabel (SocialScreens.kt) : « 25 min » ou « 1 h 13 ». */
export function dureeMin(ms) {
  const m = Math.floor((ms || 0) / 60000);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`;
}

/** kgLabel (SocialScreens.kt) : entier, espace comme séparateur de milliers. */
export function kgBrut(kg) {
  const v = Math.trunc(kg || 0);
  return v >= 1000 ? `${v.toLocaleString('fr-FR').replace(/ | /g, ' ')} kg` : `${v} kg`;
}

/** whenLabel (SocialScreens.kt) : « aujourd'hui 10:29 », « hier 09:22 », sinon date brève. */
export function quandLabel(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const now = new Date();
  const memeJour = (a, b) => a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const heure = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (memeJour(d, now)) return `aujourd'hui ${heure}`;
  const hier = new Date(now); hier.setDate(hier.getDate() - 1);
  if (memeJour(d, hier)) return `hier ${heure}`;
  return dateBreve(ms);
}

/* ------------------------------------------------------------ onglets Social */

/**
 * Fil → Messages → Défis → Groupes → Amis : mêmes 5 destinations, dans le
 * même ordre, que SMode/PresetChip (SocialScreens.kt). Natif : un seul écran
 * à onglets. Ici : 5 routes séparées, mais ce bandeau les rend commutables
 * en un appui au lieu d'être caché dans le menu ✎.
 */
const SOCIAL_TABS = [
  ['fil', 'Fil', '#/fil'],
  ['messages', 'Messages', '#/messages'],
  ['defis', 'Défis', '#/defis'],
  ['groupes', 'Groupes', '#/groupes'],
  ['amis', 'Amis', '#/amis']
];

/** onActualiser (facultatif) : SocialRoot.refresh (SocialScreens.kt
 *  ~108-116) — ici, simplement rejouer le chargement de l'écran courant
 *  (chaque vue refait déjà son propre fetch au montage, donc « recharger
 *  l'écran » revient au même effet visible que le refresh multi-ressources
 *  natif). Le bouton se désactive et affiche « … » pendant l'appel. */
export function socialHeader(titre, actif, unread = 0, onActualiser = null, amisCount = null) {
  const chips = SOCIAL_TABS.map(([id, label, href]) => {
    // « Amis (N) » comme le natif (SocialScreens.kt : `Amis (${friends.size})`) —
    // N = nombre de personnes suivies, jamais affiché tant qu'il n'est pas
    // fourni par l'écran appelant (évite un « Amis (0) » qui clignote avant
    // que le chargement ne réponde).
    const texte = id === 'messages' && unread ? `${label} (${unread})`
      : id === 'amis' && amisCount != null ? `${label} (${amisCount})`
      : label;
    return `<a class="chip-cat social-tab ${id === actif ? 'on' : ''}" href="${href}">${esc(texte)}</a>`;
  }).join('');
  const el = h(`
    <div class="social-entete">
      ${onActualiser ? `
      <div class="social-titre-rangee" style="justify-content:flex-end">
        <button class="lien-inline" data-actualiser type="button">Actualiser</button>
      </div>` : ''}
      <div class="social-tabs">${chips}</div>
    </div>`);
  if (onActualiser) {
    const btn = el.querySelector('[data-actualiser]');
    btn.onclick = async () => {
      btn.disabled = true; btn.textContent = '…';
      try { await onActualiser(); }
      catch { btn.disabled = false; btn.textContent = 'Actualiser'; }
    };
  }
  return el;
}
