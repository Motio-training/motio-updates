import { h, render, loading, empty, failure, esc, toast, socialHeader, duree } from '../ui.js';
import { feed, kudosFor, commentCounts, comments, addKudo, removeKudo,
         addComment, deleteComment, unreadMessagesCount } from '../api.js';
import { currentUser } from '../supabase.js';
import { kg, libelleRir } from '../model.js';

const COULEUR_CAT = { Push: 'var(--accent)', Pull: 'var(--accent2)', Legs: 'var(--dore)' };
function catColor(cat) { return COULEUR_CAT[cat] || 'var(--encre-2)'; }

/** whenLabel (SocialScreens.kt) : « à l'instant »/« il y a Xmin »/date courte au-delà. */
function whenLabel(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60000) return "à l'instant";
  const min = Math.floor(ms / 60000);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.floor(h / 24);
  if (j < 7) return `il y a ${j} j`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

export async function vueFil() {
  render(loading('Chargement du fil'));
  const moi = await currentUser();

  let seances, unread = 0;
  try {
    [seances, unread] = await Promise.all([
      feed({ limit: 60 }),
      unreadMessagesCount(moi.id).catch(() => 0)
    ]);
  } catch (e) { return render(failure(e, "Le fil n'a pas pu être chargé")); }

  const el = h(`<section class="page"></section>`);
  el.appendChild(socialHeader('Fil', 'fil', unread));

  if (!seances.length) {
    el.appendChild(empty(
      'Le fil est vide',
      'Suis quelqu\'un, ou termine une séance dans l\'application : elle remontera ici.',
      { href: '#/amis', label: 'Trouver des amis' }
    ));
    return render(el);
  }

  const ids = seances.map(s => s.id).filter(Boolean);
  const [kud, nbCom] = await Promise.all([
    kudosFor(ids, moi.id).catch(() => ({})),
    commentCounts(ids).catch(() => ({}))
  ]);

  const liste = h('<div class="rangee-feed"></div>');
  seances.forEach(s => liste.appendChild(carteSeance(s, moi, kud[s.id], nbCom[s.id] || 0)));
  el.appendChild(liste);

  render(el);
}

/** FeedCard (SocialScreens.kt) : avatar + pastille catégorie + auteur, titre,
 *  4 chiffres, puis kudos/commenter — toute la carte ouvre le détail. */
export function carteSeance(s, moi, kudo, nbCommentaires) {
  const k = kudo || { count: 0, mine: false };
  const detail = Array.isArray(s.details) ? s.details : [];
  const aDuDetail = detail.some(e => (e.s || []).length);
  const mien = s.user_id === moi.id;
  const initiale = mien ? 'T' : (s.username || '?')[0].toUpperCase();

  const carte = h(`
    <article class="feed-carte" data-ouvrir>
      <div class="feed-tete">
        <span class="feed-avatar">${esc(initiale)}</span>
        <span class="feed-pastille" style="background:${catColor(s.category)}"></span>
        <a class="feed-auteur ${mien ? 'feed-auteur-moi' : ''}" href="#/profil/${esc(s.user_id)}">${mien ? 'Toi' : esc(s.username)}</a>
        <span class="feed-quand">${esc(whenLabel(s.started_at))}</span>
      </div>

      <p class="feed-titre">${esc(s.workout_name || 'Séance')}</p>

      <div class="feed-stats">
        <span>Durée<b>${esc(duree((s.duration_ms || 0) / 1000))}</b></span>
        <span>Tonnage<b>${esc(kg(s.volume_kg))}</b></span>
        <span>Séries<b>${s.set_count || 0}</b></span>
        <span>Exos<b>${s.exercise_count || 0}</b></span>
      </div>

      <div class="feed-bas">
        <span class="feed-kudo ${k.mine ? 'feed-kudo-on' : ''}" data-kudo>
          <span data-kudo-icone>${k.mine ? '★' : '☆'}</span>&nbsp;<span data-kudo-nb>${k.count}</span>
        </span>
        <span class="feed-commenter" data-com>Commenter${nbCommentaires ? ` (${nbCommentaires})` : ''}</span>
        <span class="feed-chevron">›</span>
      </div>

      <div class="carte-detail" data-zone-detail hidden></div>
      <div class="carte-detail" data-zone-com hidden></div>
    </article>`);

  /* ---- kudos : ne doit pas ouvrir le détail (stopPropagation) ---- */
  const btnKudo = carte.querySelector('[data-kudo]');
  const nb = carte.querySelector('[data-kudo-nb]');
  const icone = carte.querySelector('[data-kudo-icone]');
  let mienKudo = k.mine, compte = k.count;
  btnKudo.onclick = async (e) => {
    e.stopPropagation();
    try {
      if (mienKudo) { await removeKudo(s.id, moi.id); compte--; mienKudo = false; }
      else { await addKudo(s.id, moi.id); compte++; mienKudo = true; }
      nb.textContent = compte;
      icone.textContent = mienKudo ? '★' : '☆';
      btnKudo.classList.toggle('feed-kudo-on', mienKudo);
    } catch (err) { toast(err.message); }
  };

  /* ---- pseudo : lien direct, ne doit pas non plus ouvrir le détail ---- */
  carte.querySelector('.feed-auteur').addEventListener('click', (e) => e.stopPropagation());

  /* ---- la carte entière ouvre le détail (séries + commentaires) ---- */
  const zoneDetail = carte.querySelector('[data-zone-detail]');
  const zoneCom = carte.querySelector('[data-zone-com]');
  /* Taper dans le détail ou les commentaires (champ, Publier, Supprimer) ne
     doit pas refermer la carte — seul un appui sur la carte elle-même bascule
     l'ouverture. */
  zoneDetail.addEventListener('click', (e) => e.stopPropagation());
  zoneCom.addEventListener('click', (e) => e.stopPropagation());
  let ouvert = false;
  carte.addEventListener('click', async () => {
    ouvert = !ouvert;
    zoneDetail.hidden = !ouvert || !aDuDetail;
    zoneCom.hidden = !ouvert;
    if (!ouvert) return;

    if (aDuDetail && !zoneDetail.childElementCount) {
      for (const ex of detail) {
        const series = (ex.s || []).map(st => {
          const rir = st.rir >= 0 ? ` · ${libelleRir(st.rir)}` : '';
          return `${kg(st.w)} × ${st.r}${rir}`;
        });
        zoneDetail.appendChild(h(`
          <div class="exo">
            <p class="exo-nom">${esc(ex.n || '')}</p>
            <ul class="exo-series">${series.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
          </div>`));
      }
    }

    if (!zoneCom.dataset.charge) {
      zoneCom.dataset.charge = '1';
      try {
        const liste = await comments(s.id);
        const compteur = carte.querySelector('[data-com]');
        for (const c of liste) zoneCom.appendChild(ligneCommentaire(c, moi, compteur));
        zoneCom.appendChild(champCommentaire(s, moi, zoneCom, compteur));
      } catch (err) {
        zoneCom.replaceChildren(failure(err, "Les commentaires n'ont pas pu être chargés"));
      }
    }
  });

  return carte;
}

function ligneCommentaire(c, moi, compteur) {
  const li = h(`
    <div class="com">
      <p class="com-tete">${esc(c.username)} <span class="ligne-meta">${esc(dateLongue(c.created_at))}</span></p>
      <p class="com-corps">${esc(c.body)}</p>
      ${c.user_id === moi.id ? '<button class="lien-inline" data-suppr>Supprimer</button>' : ''}
    </div>`);
  li.querySelector('[data-suppr]')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      await deleteComment(c.id);
      li.remove();
      majCompteur(compteur, -1);
    } catch (err) { toast(err.message); e.target.disabled = false; }
  });
  return li;
}

function champCommentaire(s, moi, zone, compteur) {
  const bloc = h(`
    <div class="com-saisie">
      <label class="champ"><span>Répondre</span>
        <input type="text" data-texte maxlength="500" placeholder="Beau tonnage"></label>
      <button class="btn btn-sm" data-envoyer>Publier</button>
    </div>`);

  bloc.querySelector('[data-envoyer]').onclick = async (e) => {
    const champ = bloc.querySelector('[data-texte]');
    const texte = champ.value;
    e.target.disabled = true;
    try {
      const c = await addComment(s.id, moi.id, texte);
      champ.value = '';
      const monPseudo = moi.user_metadata?.username || moi.email?.split('@')[0] || 'moi';
      zone.insertBefore(ligneCommentaire({ ...c, username: monPseudo }, moi, compteur), bloc);
      majCompteur(compteur, +1);
    } catch (err) { toast(err.message); }
    finally { e.target.disabled = false; }
  };
  return bloc;
}

function majCompteur(bouton, delta) {
  const n = parseInt(bouton.textContent, 10) || 0;
  bouton.textContent = `${Math.max(0, n + delta)} commentaires`;
}
