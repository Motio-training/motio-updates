import { h, render, loading, empty, failure, esc, toast, dateCourte, duree } from '../ui.js';
import { getProfile, setUsername, sessionsOf, following, followers,
         searchProfiles, follow, unfollow } from '../api.js';
import { currentUser, signOut } from '../supabase.js';
import { kg, estime1RM } from '../model.js';
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

  const el = h(`
    <section class="page">
      <p class="eyebrow">${estMoi ? 'Mon compte' : 'Profil'}</p>
      <h1 data-nom>${esc(profil.username || 'sans pseudo')}</h1>

      <div class="chiffres">
        <div><b>${stats.nb}</b><span>séances</span></div>
        <div><b>${Math.round(stats.tonnage / 1000)}</b><span>tonnes soulevées</span></div>
        <div><b>${stats.ceMois}</b><span>ce mois-ci</span></div>
        <div><b>${abos.length}</b><span>abonnements</span></div>
        <div><b>${suiveurs.length}</b><span>abonnés</span></div>
      </div>

      ${estMoi ? `
        <div class="bloc">
          <h2>Pseudo</h2>
          <p class="etat-mono">C'est sous ce nom que les autres te trouvent.</p>
          <label class="champ"><span>Pseudo</span>
            <input type="text" data-pseudo value="${esc(profil.username || '')}" maxlength="24"></label>
          <button class="btn" data-enregistrer>Enregistrer</button>
        </div>` : `
        <button class="btn" data-suivre>${jeSuis ? 'Ne plus suivre' : 'Suivre'}</button>`}

      <div class="bloc">
        <h2>Records estimés</h2>
        <div data-records></div>
      </div>

      <div class="bloc">
        <h2>Séances récentes</h2>
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

/**
 * Statistiques calculées à l'affichage, jamais stockées : elles dépendent du
 * détail des séries, que l'auteur peut avoir choisi de ne pas partager.
 * Même parti pris que Social.friendStats.
 */
function calculerStats(seances) {
  const debutMois = Date.now() - 30 * 24 * 3600 * 1000;
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
    tonnage: seances.reduce((t, s) => t + (s.volume_kg || 0), 0),
    ceMois: seances.filter(s => new Date(s.started_at).getTime() >= debutMois).length,
    records: [...best.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  };
}

/* ------------------------------------------------------------------ amis */

export async function vueAmis() {
  const moi = await currentUser();

  const el = h(`
    <section class="page">
      <p class="eyebrow">Social</p>
      <h1>Amis</h1>
      <label class="champ"><span>Chercher un pseudo</span>
        <input type="search" data-q placeholder="deux lettres minimum"></label>
      <ul class="liste" data-resultats></ul>

      <div class="bloc">
        <h2>Abonnements</h2>
        <div data-abos></div>
      </div>
    </section>`);

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
