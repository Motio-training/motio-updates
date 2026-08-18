/* Petits outils partagés par les vues. Aucun framework : le squelette doit
   rester lisible et modifiable sans chaîne de build. */

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

export function render(node) {
  const outlet = $('#vue');
  outlet.replaceChildren(node);
  outlet.focus({ preventScroll: true });
  window.scrollTo(0, 0);
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
export function socialHeader(titre, actif, unread = 0, onActualiser = null) {
  const chips = SOCIAL_TABS.map(([id, label, href]) => {
    const texte = id === 'messages' && unread ? `${label} (${unread})` : label;
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
