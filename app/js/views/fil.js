import { h, render, loading, empty, failure, esc, toast, socialHeader, duree,
         dureeMin, kgBrut, quandLabel } from '../ui.js';
import { feed, kudosFor, commentCounts, comments, addKudo, removeKudo,
         addComment, deleteComment, unreadMessagesCount, amisEnDirect, following } from '../api.js';
import { currentUser } from '../supabase.js';
import { kg, libelleRir } from '../model.js';
import { titreSeance } from '../muscle-lexicon.js';
import { filPortee, definirFilPortee } from '../reglages.js';

const COULEUR_CAT = { Push: 'var(--accent)', Pull: 'var(--accent2)', Legs: 'var(--dore)' };
function catColor(cat) { return COULEUR_CAT[cat] || 'var(--encre-2)'; }

/** whenLabel (SocialScreens.kt) : « aujourd'hui 10:29 » / « hier 09:22 » /
 *  « dim. 16 août ». L'ancienne version maison (« il y a 5 h ») ne disait pas
 *  la même chose que l'application, écart visible sur chaque carte. */
function whenLabel(iso) {
  return quandLabel(new Date(iso).getTime());
}

export async function vueFil() {
  render(loading('Chargement du fil'));
  const moi = await currentUser();
  let portee = filPortee();

  let unread = 0, direct = [], amisCount = null;
  try {
    let mesAmis;
    [unread, direct, mesAmis] = await Promise.all([
      unreadMessagesCount(moi.id).catch(() => 0),
      amisEnDirect(moi.id).catch(() => []),
      following(moi.id).catch(() => null)
    ]);
    if (mesAmis) amisCount = mesAmis.length;
  } catch { /* pas bloquant */ }

  const el = h(`<section class="page"></section>`);
  el.appendChild(socialHeader('Fil', 'fil', unread, () => vueFil(), amisCount));

  const zoneDirect = h('<div></div>');
  el.appendChild(zoneDirect);
  dessinerDirect(zoneDirect, direct);

  /* Amis/Tous (AccountScreens.kt : profil public) : une préférence par
     appareil, partagée avec le classement (défis.js). */
  const zoneChips = h('<div class="rangee rangee-serree" style="margin-bottom:.8rem"></div>');
  el.appendChild(zoneChips);
  function dessinerChips() {
    zoneChips.replaceChildren();
    [['amis', 'Amis'], ['tous', 'Tous']].forEach(([id, label]) => {
      const b = h(`<button class="chip-cat ${portee === id ? 'on' : ''}" type="button">${label}</button>`);
      b.onclick = () => { if (portee === id) return; portee = id; definirFilPortee(id); dessinerChips(); charger(); };
      zoneChips.appendChild(b);
    });
  }
  dessinerChips();

  const zoneListe = h('<div><p class="etat-mono">Chargement…</p></div>');
  el.appendChild(zoneListe);

  async function charger() {
    zoneListe.replaceChildren(h('<p class="etat-mono">Chargement…</p>'));
    let seances;
    try { seances = await feed({ limit: 60, scope: portee, moiId: moi.id }); }
    catch (e) { return zoneListe.replaceChildren(failure(e, "Le fil n'a pas pu être chargé")); }

    if (!seances.length) {
      zoneListe.replaceChildren(empty(
        'Le fil est vide',
        portee === 'tous'
          ? 'Personne en profil public n\'a encore de séance à montrer.'
          : 'Suis quelqu\'un, ou termine une séance dans l\'application : elle remontera ici.',
        { href: '#/amis', label: 'Trouver des amis' }
      ));
      return;
    }

    const ids = seances.map(s => s.id).filter(Boolean);
    const [kud, nbCom, titres] = await Promise.all([
      kudosFor(ids, moi.id).catch(() => ({})),
      commentCounts(ids).catch(() => ({})),
      Promise.all(seances.map(s => titreSeance(s)))
    ]);

    const liste = h('<div class="rangee-feed"></div>');
    seances.forEach((s, i) => liste.appendChild(carteSeance(s, moi, kud[s.id], nbCom[s.id] || 0, titres[i])));
    zoneListe.replaceChildren(liste);
  }

  /* Sondage léger du bandeau « en direct » tant que le fil reste ouvert —
     seule chose sur cet écran qui a vraiment besoin de bouger toute seule
     (LiveSessions.friendsLive, sondé toutes les 20 s côté natif). */
  async function sonder() {
    if (!document.body.contains(el)) return;
    const frais = await amisEnDirect(moi.id).catch(() => []);
    if (!document.body.contains(el)) return;
    dessinerDirect(zoneDirect, frais);
    setTimeout(sonder, 20000);
  }
  setTimeout(sonder, 20000);

  render(el);
  charger();
}

/** LiveBanner (SocialScreens.kt) : un point orange, le pseudo, la séance/
 *  l'exercice en cours, « Regarder › ». Tout en haut du fil, avant les
 *  cartes — visible même si le fil lui-même est vide. */
function dessinerDirect(zone, direct) {
  zone.replaceChildren();
  if (!direct.length) return;
  zone.appendChild(h('<p class="fil-direct-titre">En direct</p>'));
  direct.forEach(l => {
    const meta = [l.workout_name || 'Séance', l.current_exercise].filter(Boolean).join(' · ');
    zone.appendChild(h(`
      <a class="fil-direct-ligne" href="#/direct/${esc(l.user_id)}">
        <span class="fil-direct-point"></span>
        <span class="fil-direct-corps"><b>${esc(l.username)}</b><span>${esc(meta)}</span></span>
        <span class="fil-direct-regarder">Regarder ›</span>
      </a>`));
  });
}

/** FeedCard (SocialScreens.kt) : avatar + pastille catégorie + auteur, titre
 *  (dérivé des zones musculaires les plus travaillées — titreSeance,
 *  muscle-lexicon.js), puis une ligne de chiffres condensée et kudos/
 *  commenter — toute la carte ouvre le détail. Carte volontairement compacte
 *  (Nicolas : « je trouve la bulle trop grande, que 3 entraînements sur
 *  l'écran ») : les 4 chiffres tenaient sur deux lignes chacun, ils tiennent
 *  maintenant sur une seule ligne mono, toute l'info reste affichée. */
export function carteSeance(s, moi, kudo, nbCommentaires, titre) {
  const k = kudo || { count: 0, mine: false };
  const detail = Array.isArray(s.details) ? s.details : [];
  const aDuDetail = detail.some(e => (e.s || []).length);
  const mien = s.user_id === moi.id;
  const initiale = mien ? 'T' : (s.username || '?')[0].toUpperCase();
  /* Vraie photo de profil quand il y en a une (FeedCard, SocialScreens.kt) —
     l'initiale n'est qu'un repli, comme côté natif. */
  const avatar = s.avatar_url
    ? `<img class="feed-avatar" src="${esc(s.avatar_url)}" alt="">`
    : `<span class="feed-avatar">${esc(initiale)}</span>`;

  const carte = h(`
    <article class="feed-carte" data-ouvrir>
      <div class="feed-tete">
        ${avatar}
        <span class="feed-pastille" style="background:${catColor(s.category)}"></span>
        <a class="feed-auteur ${mien ? 'feed-auteur-moi' : ''}" href="#/profil/${esc(s.user_id)}">${mien ? 'Toi' : esc(s.username)}</a>
        <span class="feed-quand">${esc(whenLabel(s.started_at))}</span>
      </div>

      <p class="feed-titre">${esc(titre || s.workout_name || 'Séance')}</p>
      <p class="feed-stats-ligne">${esc(dureeMin(s.duration_ms))} · ${esc(kgBrut(s.volume_kg))} · ${s.set_count || 0} séries · ${s.exercise_count || 0} exos</p>

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
