import { h, render, loading, empty, failure, esc, toast, dateCourte, duree, socialHeader } from '../ui.js';
import { getProfile, setUsername, sessionsOf, following, followers,
         searchProfiles, follow, unfollow, unreadMessagesCount } from '../api.js';
import { currentUser, signOut } from '../supabase.js';
import { kg, estime1RM } from '../model.js';
import { computeStatsFrom, fmtQty } from '../trophies.js';
import { reset as reinitialiserOnboarding } from './onboarding.js';

export async function vueProfil(params) {
  render(loading('Chargement du profil'));
  const moi = await currentUser();
  const cible = params?.id || moi.id;
  const estMoi = cible === moi.id;

  let profil, seances, abos, suiveurs;
  try {
    [profil, seances, abos, suiveurs] = await Promise.all([
      getProfile(cible),
      sessionsOf(cible, { limit: 200 }),
      following(cible),
      followers(cible)
    ]);
  } catch (e) { return render(failure(e, "Le profil n'a pas pu être chargé")); }

  if (!profil) {
    return render(empty('Profil introuvable',
      "Ce compte n'existe pas, ou tu ne le suis pas."));
  }

  const stats = calculerStats(seances);
  const jeSuis = !estMoi && (await following(moi.id)).some(p => p.id === cible);

  /* Trophées : même calcul que computeProfileStats (Profile.kt), uniquement
     pour son propre profil — l'ami n'a que ce qu'il a bien voulu partager. */
  const trophyStats = estMoi ? computeStatsFrom(seances.map(s => ({
    startedAtMs: new Date(s.started_at).getTime(),
    volumeKg: s.volume_kg || 0,
    durationMs: s.duration_ms || 0
  }))) : null;
  const stars = trophyStats ? trophyStats.trophies.reduce((t, x) => t + x.stars, 0) : 0;
  const starsTot = trophyStats ? trophyStats.trophies.reduce((t, x) => t + x.levels.length, 0) : 0;

  const initiale = (profil.username || '?')[0].toUpperCase();
  const avatarHtml = profil.avatar_url
    ? `<img class="profil-avatar" src="${esc(profil.avatar_url)}" alt="">`
    : `<span class="profil-avatar">${esc(initiale)}</span>`;

  const el = h(`
    <section class="page">
      <div class="profil-panneau">
        <div class="profil-tete">
          ${avatarHtml}
          <div class="profil-identite">
            <b data-nom>${esc(profil.username || 'sans pseudo')}</b>
            <span>${estMoi ? esc(moi.email || '') : 'Profil'}</span>
          </div>
        </div>
        <div class="profil-stats-ligne">
          <div><b>${stats.nb}</b><span>séances</span></div>
          ${estMoi ? `
            <div><b>${trophyStats.totalHours} h</b><span>sous la barre</span></div>
            <div><b>${stars}/${starsTot}</b><span>étoiles</span></div>` : `
            <div><b>${abos.length}</b><span>abonnements</span></div>
            <div><b>${suiveurs.length}</b><span>abonnés</span></div>`}
        </div>
      </div>

      ${estMoi ? `
        <div class="tonnage-rangee">
          <div class="tonnage-carte"><span>Cette semaine</span><b>${fmtQty(trophyStats.weekTonnage)} kg</b></div>
          <div class="tonnage-carte"><span>Ce mois-ci</span><b>${fmtQty(trophyStats.monthTonnage)} kg</b></div>
        </div>

        <div class="rangee-titre" style="margin-bottom:.6rem">
          <p class="bloc-titre" style="margin:0">Trophées</p>
          <span style="color:var(--dore);font-weight:700;font-size:.85rem">${stars} / ${starsTot} ★</span>
        </div>
        <div class="trophees-grille" data-trophees></div>

        <div class="bloc">
          <p class="bloc-titre">Entraînement</p>
          <div class="menu-groupe">
            <a class="menu-ligne" href="#/coach">
              <img class="menu-avatar" src="../assets/img/moti_avatar.jpg" alt="">
              <span class="corps"><b>Moti</b><span>Ton coach IA — connaît tes séances, tes records</span></span>
              <span class="chevron">›</span>
            </a>
          </div>
        </div>

        <div class="bloc">
          <p class="bloc-titre">Compte</p>
          <p class="etat-mono">C'est sous ce nom que les autres te trouvent.</p>
          <label class="champ"><span>Pseudo</span>
            <input type="text" data-pseudo value="${esc(profil.username || '')}" maxlength="24"></label>
          <button class="btn" data-enregistrer>Enregistrer</button>
        </div>` : `
        <button class="btn" data-suivre>${jeSuis ? 'Ne plus suivre' : 'Suivre'}</button>`}

      <div class="bloc">
        <p class="bloc-titre">Records estimés</p>
        <div data-records></div>
      </div>

      <div class="bloc">
        <p class="bloc-titre">Séances récentes</p>
        <div data-seances></div>
      </div>

      ${estMoi ? `
        <div class="bloc">
          <button class="lien-inline" data-tuto type="button">Revoir le tutoriel</button>
          <div style="margin-top:1rem">
            <button class="btn btn-ghost" data-deconnexion type="button">Se déconnecter</button>
          </div>
        </div>` : ''}
    </section>`);

  /* trophées */
  if (estMoi) {
    const zoneTr = el.querySelector('[data-trophees]');
    trophyStats.trophies.forEach(tr => {
      const etat = tr.complete ? 'complet' : tr.unlocked ? 'encours' : 'verrouille';
      const carte = h(`
        <div class="trophee-carte ${etat}">
          <span class="trophee-badge">${tr.icon}</span>
          <span class="nom">${esc(tr.title)}</span>
          <span class="trophee-etoiles">${'★'.repeat(tr.stars)}<span class="off">${'★'.repeat(tr.levels.length - tr.stars)}</span></span>
        </div>`);
      carte.onclick = () => ouvrirTrophee(tr);
      zoneTr.appendChild(carte);
    });
  }

  /* records */
  const zoneRec = el.querySelector('[data-records]');
  if (!stats.records.length) {
    zoneRec.appendChild(h(`<p class="etat-mono">Aucun détail de séries partagé.</p>`));
  } else {
    const ul = h('<ul class="liste"></ul>');
    for (const [nom, rm] of stats.records) {
      ul.appendChild(h(`<li class="ligne ligne-action">
        <span class="ligne-titre">${esc(nom)}</span>
        <span class="ligne-meta">${esc(kg(rm))} · 1RM estimé</span></li>`));
    }
    zoneRec.appendChild(ul);
  }

  /* séances */
  const zoneS = el.querySelector('[data-seances]');
  if (!seances.length) {
    zoneS.appendChild(h(`<p class="etat-mono">Aucune séance partagée.</p>`));
  } else {
    const ul = h('<ul class="liste"></ul>');
    for (const s of seances.slice(0, 15)) {
      ul.appendChild(h(`
        <li class="ligne">
          <div class="ligne-tete">
            <span class="ligne-titre">${esc(s.workout_name || 'Séance')}</span>
            <span class="ligne-meta">${esc(dateCourte(s.started_at))}</span>
          </div>
          <p class="ligne-stats">
            <span>${esc(duree((s.duration_ms || 0) / 1000))}</span>
            <span>${esc(kg(s.volume_kg))}</span>
          </p>
        </li>`));
    }
    zoneS.appendChild(ul);
  }

  el.querySelector('[data-enregistrer]')?.addEventListener('click', async (e) => {
    const pseudo = el.querySelector('[data-pseudo]').value.trim();
    if (pseudo.length < 3) return toast('Le pseudo fait 3 caractères minimum.');
    e.target.disabled = true;
    try {
      await setUsername(moi.id, pseudo);
      el.querySelector('[data-nom]').textContent = pseudo.toLowerCase();
      toast('Pseudo enregistré.');
    } catch (err) { toast(err.message); }
    finally { e.target.disabled = false; }
  });

  const btnSuivre = el.querySelector('[data-suivre]');
  if (btnSuivre) {
    let suivi = jeSuis;
    btnSuivre.onclick = async () => {
      btnSuivre.disabled = true;
      try {
        if (suivi) { await unfollow(moi.id, cible); suivi = false; }
        else { await follow(moi.id, cible); suivi = true; }
        btnSuivre.textContent = suivi ? 'Ne plus suivre' : 'Suivre';
      } catch (err) { toast(err.message); }
      finally { btnSuivre.disabled = false; }
    };
  }

  el.querySelector('[data-deconnexion]')?.addEventListener('click', signOut);
  el.querySelector('[data-tuto]')?.addEventListener('click', () => {
    reinitialiserOnboarding();
    location.hash = '#/onboarding';
  });

  render(el);
}

/** Détail d'un trophée — TrophyDialog (Profile.kt) : objectif en cours, avancement. */
function ouvrirTrophee(tr) {
  const modale = h(`
    <div class="modale" role="dialog" aria-label="${esc(tr.title)}">
      <div class="modale-boite">
        <div class="modale-tete">
          <h2><span style="margin-right:.5rem">${tr.icon}</span>${esc(tr.title)}</h2>
        </div>
        <p class="trophee-etoiles" style="font-size:1rem">${'★'.repeat(tr.stars)}<span class="off">${'★'.repeat(tr.levels.length - tr.stars)}</span></p>
        <p>${esc(tr.desc)}</p>
        ${tr.complete
          ? `<p style="color:var(--accent);font-weight:700">Les trois paliers sont gagnés ✓</p>`
          : `<p class="etat-mono">${esc(tr.progress)}</p>`}
        <div class="modale-pied">
          <button class="btn" data-fermer type="button">Fermer</button>
        </div>
      </div>
    </div>`);
  modale.querySelector('[data-fermer]').onclick = () => modale.remove();
  modale.addEventListener('click', (e) => { if (e.target === modale) modale.remove(); });
  document.body.appendChild(modale);
}

/**
 * Statistiques calculées à l'affichage, jamais stockées : elles dépendent du
 * détail des séries, que l'auteur peut avoir choisi de ne pas partager.
 * Même parti pris que Social.friendStats.
 */
function calculerStats(seances) {
  const best = new Map();
  for (const s of seances) {
    for (const ex of (Array.isArray(s.details) ? s.details : [])) {
      for (const st of (ex.s || [])) {
        const rm = estime1RM(st.w || 0, st.r || 0);
        if (rm > (best.get(ex.n) || 0)) best.set(ex.n, rm);
      }
    }
  }
  return {
    nb: seances.length,
    records: [...best.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  };
}

/* ------------------------------------------------------------------ amis */

export async function vueAmis() {
  const moi = await currentUser();
  const unread = await unreadMessagesCount(moi.id).catch(() => 0);

  const el = h(`
    <section class="page">
      <label class="champ"><span>Chercher un pseudo</span>
        <input type="search" data-q placeholder="deux lettres minimum"></label>
      <ul class="liste" data-resultats></ul>

      <div class="bloc">
        <p class="bloc-titre">Abonnements</p>
        <div data-abos></div>
      </div>
    </section>`);
  el.insertBefore(socialHeader('Amis', 'amis', unread), el.firstChild);

  const res = el.querySelector('[data-resultats]');
  let t;
  el.querySelector('[data-q]').addEventListener('input', (e) => {
    clearTimeout(t);
    const terme = e.target.value;
    t = setTimeout(async () => {
      res.replaceChildren();
      if (terme.trim().length < 2) return;
      try {
        const trouves = (await searchProfiles(terme)).filter(p => p.id !== moi.id);
        if (!trouves.length) {
          res.appendChild(h('<li class="ligne"><p class="etat-mono">Aucun résultat.</p></li>'));
          return;
        }
        for (const p of trouves) res.appendChild(lignePersonne(p, moi, false));
      } catch (err) { toast(err.message); }
    }, 280);
  });

  const zone = el.querySelector('[data-abos]');
  try {
    const liste = await following(moi.id);
    if (!liste.length) {
      zone.appendChild(h(`<p class="etat-mono">Tu ne suis personne. Cherche un pseudo ci-dessus.</p>`));
    } else {
      const ul = h('<ul class="liste"></ul>');
      for (const p of liste) ul.appendChild(lignePersonne(p, moi, true));
      zone.appendChild(ul);
    }
  } catch (e) { zone.appendChild(failure(e, "Les abonnements n'ont pas pu être chargés")); }

  render(el);
}

function lignePersonne(p, moi, suivi0) {
  let suivi = suivi0;
  const li = h(`
    <li class="ligne ligne-action">
      <a class="ligne-titre" href="#/profil/${esc(p.id)}">${esc(p.username || 'sans pseudo')}</a>
      <a class="btn btn-sm btn-ghost" href="#/messages/${esc(p.id)}">Message</a>
      <button class="btn btn-sm ${suivi ? 'btn-ghost' : ''}">${suivi ? 'Ne plus suivre' : 'Suivre'}</button>
    </li>`);
  const b = li.querySelector('button');
  b.onclick = async () => {
    b.disabled = true;
    try {
      if (suivi) { await unfollow(moi.id, p.id); suivi = false; }
      else { await follow(moi.id, p.id); suivi = true; }
      b.textContent = suivi ? 'Ne plus suivre' : 'Suivre';
      b.classList.toggle('btn-ghost', suivi);
    } catch (err) { toast(err.message); }
    finally { b.disabled = false; }
  };
  return li;
}
