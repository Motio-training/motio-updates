import { h, render, loading, empty, failure, esc, toast, dateLongue, duree } from '../ui.js';
import { feed, kudosFor, commentCounts, comments, addKudo, removeKudo,
         addComment, deleteComment } from '../api.js';
import { currentUser } from '../supabase.js';
import { kg, libelleRir } from '../model.js';

export async function vueFil() {
  render(loading('Chargement du fil'));
  const moi = await currentUser();

  let seances;
  try { seances = await feed({ limit: 60 }); }
  catch (e) { return render(failure(e, "Le fil n'a pas pu être chargé")); }

  if (!seances.length) {
    return render(empty(
      'Le fil est vide',
      'Suis quelqu\'un, ou termine une séance dans l\'application : elle remontera ici.',
      { href: '#/amis', label: 'Trouver des amis' }
    ));
  }

  const ids = seances.map(s => s.id).filter(Boolean);
  const [kud, nbCom] = await Promise.all([
    kudosFor(ids, moi.id).catch(() => ({})),
    commentCounts(ids).catch(() => ({}))
  ]);

  const el = h(`
    <section class="page">
      <p class="eyebrow">Social</p>
      <h1>Fil</h1>
      <div data-liste></div>
    </section>`);

  const liste = el.querySelector('[data-liste]');
  seances.forEach(s => liste.appendChild(carteSeance(s, moi, kud[s.id], nbCom[s.id] || 0)));

  render(el);
}

export function carteSeance(s, moi, kudo, nbCommentaires) {
  const k = kudo || { count: 0, mine: false };
  const detail = Array.isArray(s.details) ? s.details : [];
  const aDuDetail = detail.some(e => (e.s || []).length);

  const carte = h(`
    <article class="carte">
      <div class="carte-tete">
        <a class="carte-auteur" href="#/profil/${esc(s.user_id)}">${esc(s.username)}</a>
        <span class="ligne-meta">${esc(dateLongue(s.started_at))}</span>
      </div>

      <p class="carte-titre">${esc(s.workout_name || 'Séance')}<span class="etiquette">${esc(s.category || '')}</span></p>

      <p class="ligne-stats">
        <span>${esc(duree((s.duration_ms || 0) / 1000))}</span>
        <span>${esc(kg(s.volume_kg))}</span>
        <span>${s.exercise_count || 0} exercices</span>
        <span>${s.set_count || 0} séries</span>
      </p>

      <div class="carte-actions">
        <button class="puce ${k.mine ? 'puce-active' : ''}" data-kudo>
          <span data-kudo-nb>${k.count}</span> kudos
        </button>
        <button class="puce" data-com>${nbCommentaires} commentaires</button>
        ${aDuDetail ? '<button class="puce" data-detail>Voir le détail</button>' : ''}
      </div>

      <div class="carte-detail" data-zone-detail hidden></div>
      <div class="carte-detail" data-zone-com hidden></div>
    </article>`);

  /* ---- kudos ---- */
  const btnKudo = carte.querySelector('[data-kudo]');
  const nb = carte.querySelector('[data-kudo-nb]');
  let mien = k.mine, compte = k.count;
  btnKudo.onclick = async () => {
    btnKudo.disabled = true;
    try {
      if (mien) { await removeKudo(s.id, moi.id); compte--; mien = false; }
      else { await addKudo(s.id, moi.id); compte++; mien = true; }
      nb.textContent = compte;
      btnKudo.classList.toggle('puce-active', mien);
    } catch (err) { toast(err.message); }
    finally { btnKudo.disabled = false; }
  };

  /* ---- détail des séries ---- */
  const zoneDetail = carte.querySelector('[data-zone-detail]');
  carte.querySelector('[data-detail]')?.addEventListener('click', (e) => {
    if (!zoneDetail.hidden) {
      zoneDetail.hidden = true;
      e.target.textContent = 'Voir le détail';
      return;
    }
    zoneDetail.replaceChildren();
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
    zoneDetail.hidden = false;
    e.target.textContent = 'Masquer le détail';
  });

  /* ---- commentaires ---- */
  const zoneCom = carte.querySelector('[data-zone-com]');
  carte.querySelector('[data-com]').onclick = async (e) => {
    if (!zoneCom.hidden) { zoneCom.hidden = true; return; }
    zoneCom.replaceChildren(h('<p class="etat-mono">Chargement…</p>'));
    zoneCom.hidden = false;
    try {
      const liste = await comments(s.id);
      zoneCom.replaceChildren();
      for (const c of liste) zoneCom.appendChild(ligneCommentaire(c, moi, e.target));
      zoneCom.appendChild(champCommentaire(s, moi, zoneCom, e.target));
    } catch (err) {
      zoneCom.replaceChildren(failure(err, "Les commentaires n'ont pas pu être chargés"));
    }
  };

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
