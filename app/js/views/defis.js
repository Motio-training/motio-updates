/* ==========================================================================
   Défis — classement des abonnements sur une période, repris de SMode.DEFIS
   (SocialScreens.kt) : 3 périodes (7/30/90 jours) × 3 façons de compter
   (tonnage, séances, régularité). Aucune table de défis : tout se calcule à
   la volée depuis shared_sessions, déjà filtré par la RLS aux gens qu'on
   suit — voir standings() dans api.js.
   ========================================================================== */

import { h, render, loading, failure, esc, socialHeader } from '../ui.js';
import { standings, unreadMessagesCount } from '../api.js';
import { currentUser } from '../supabase.js';
import { kg } from '../model.js';

const PERIODES = [7, 30, 90];
const GENRES = [
  ['tonnage', 'Tonnage', 'Kilos déplacés sur la période.'],
  ['sessions', 'Séances', 'Nombre de séances enregistrées.'],
  ['regularity', 'Régularité', 'Jours distincts avec au moins une séance — la constance, pas le volume.']
];

export async function vueDefis() {
  render(loading('Chargement des défis'));
  const moi = await currentUser();

  let unread = 0;
  try { unread = await unreadMessagesCount(moi.id); } catch { /* pas bloquant */ }

  const el = h(`<section class="page"></section>`);
  el.appendChild(socialHeader('Défis', 'defis', unread));

  const zoneChips1 = h('<div class="rangee rangee-serree" style="margin-bottom:.6rem"></div>');
  const zoneChips2 = h('<div class="rangee rangee-serree" style="margin-bottom:.6rem"></div>');
  const explication = h('<p class="etat-mono" style="margin-bottom:1rem"></p>');
  const zoneListe = h('<div></div>');
  el.append(zoneChips1, zoneChips2, explication, zoneListe);

  let periode = 30, genre = 'tonnage';

  function dessinerChips() {
    zoneChips1.replaceChildren();
    PERIODES.forEach(j => {
      const b = h(`<button class="chip-cat ${periode === j ? 'on' : ''}" type="button">${j} jours</button>`);
      b.onclick = () => { periode = j; dessinerChips(); charger(); };
      zoneChips1.appendChild(b);
    });
    zoneChips2.replaceChildren();
    GENRES.forEach(([id, label, aide]) => {
      const b = h(`<button class="chip-cat ${genre === id ? 'on' : ''}" type="button">${esc(label)}</button>`);
      b.onclick = () => { genre = id; dessinerChips(); dessinerListe(); };
      zoneChips2.appendChild(b);
      if (genre === id) explication.textContent = aide;
    });
  }

  let classement = [];
  async function charger() {
    zoneListe.replaceChildren(h('<p class="etat-mono">Chargement…</p>'));
    try {
      classement = await standings(periode);
      dessinerListe();
    } catch (e) {
      zoneListe.replaceChildren(failure(e, "Le classement n'a pas pu être chargé"));
    }
  }

  function valeur(st) {
    if (genre === 'tonnage') return st.volume;
    if (genre === 'sessions') return st.sessions;
    return st.activeDays;
  }
  function texteValeur(st) {
    if (genre === 'tonnage') return kg(st.volume);
    if (genre === 'sessions') return `${st.sessions}`;
    return `${st.activeDays} j`;
  }

  function dessinerListe() {
    zoneListe.replaceChildren();
    if (!classement.length) {
      zoneListe.appendChild(h(`<p class="etat-mono">Personne n'a encore de séance sur cette période. Abonne-toi à quelqu'un pour lancer le défi.</p>`));
      return;
    }
    const trie = [...classement].sort((a, b) => valeur(b) - valeur(a));
    const ul = h('<ul class="liste liste-serree" data-classement></ul>');
    trie.forEach((st, i) => {
      const mien = st.userId === moi.id;
      const li = h(`
        <li class="standing ${mien ? 'standing-mine' : ''}">
          <span class="standing-rang ${i < 3 ? 'standing-top' : ''}">${i + 1}</span>
          <span class="standing-corps">
            <b class="${mien ? 'standing-nom-moi' : ''}">${mien ? 'Toi' : esc(st.username)}</b>
            <span class="standing-meta">${st.sessions} séance${st.sessions > 1 ? 's' : ''} · ${st.activeDays} jour${st.activeDays > 1 ? 's' : ''} actif${st.activeDays > 1 ? 's' : ''}</span>
          </span>
          <span class="standing-valeur">${esc(texteValeur(st))}</span>
        </li>`);
      ul.appendChild(li);
    });
    zoneListe.appendChild(ul);
  }

  dessinerChips();
  render(el);
  charger();
}
