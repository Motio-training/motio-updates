/* ==========================================================================
   Groupes d'entraînement — portage de GroupScreens.kt. Pas de bannière ni de
   QR côté web (v1) : le code d'invitation se copie-colle, ce qui suffit pour
   un lien envoyé par message. Le reste (fil, classement, discussion, membres)
   reprend les mêmes RPC/tables que l'app.
   ========================================================================== */

import { h, render, loading, empty, failure, esc, toast, dateCourte, duree } from '../ui.js';
import { currentUser } from '../supabase.js';
import {
  groupsMine, groupsSearch, groupCreate, groupJoin, groupLeave, groupDelete,
  groupMembersList, groupRemoveMember, groupUpdateInfo, groupRegenerateCode,
  groupFeed, groupStandings, groupMessageThread, groupSendText, groupSendWorkout,
  listWorkouts
} from '../api.js';
import { kg } from '../model.js';
import { encode as encoderSeance, decode as decoderSeance } from '../workout-share.js';
import { saveWorkout } from '../api.js';

export async function vueGroupes() {
  render(loading('Chargement des groupes'));
  const moi = await currentUser();

  let groupes;
  try { groupes = await groupsMine(moi.id); }
  catch (e) { return render(failure(e, "Les groupes n'ont pas pu être chargés")); }

  const el = h(`
    <section class="page">
      <p class="eyebrow">Social</p>
      <h1>Groupes</h1>

      <button class="btn" data-creer type="button">Créer un groupe</button>

      <div class="rangee" style="margin-top:1rem">
        <label class="champ"><span>Rejoindre avec un code</span>
          <input type="text" data-code placeholder="ABCD1234"></label>
        <button class="btn btn-ghost" data-rejoindre type="button">Rejoindre</button>
      </div>

      <label class="champ"><span>Ou rechercher un groupe par nom</span>
        <input type="search" data-q placeholder="deux lettres minimum"></label>
      <ul class="liste" data-resultats></ul>

      <div class="bloc" data-liste-groupes></div>
    </section>`);

  const zone = el.querySelector('[data-liste-groupes]');
  function dessinerListe() {
    zone.replaceChildren();
    if (!groupes.length) {
      zone.appendChild(h(`<p class="etat-mono">Aucun groupe pour l'instant.</p>`));
      return;
    }
    const ul = h('<ul class="liste"></ul>');
    for (const g of groupes) {
      ul.appendChild(h(`
        <li class="ligne ligne-action">
          <a class="ligne-titre" href="#/groupes/${esc(g.id)}">${esc(g.name)}</a>
          <span class="ligne-meta">${g.memberCount} membre${g.memberCount > 1 ? 's' : ''}${g.mine ? ' · toi' : ''}</span>
        </li>`));
    }
    zone.appendChild(ul);
  }
  dessinerListe();

  el.querySelector('[data-creer]').onclick = () => {
    ouvrirFormulaireGroupe(null, async (nom, description) => {
      try {
        const g = await groupCreate(nom, description);
        toast('Groupe créé.');
        location.hash = `#/groupes/${g.id}`;
      } catch (err) { toast(err.message); }
    });
  };

  el.querySelector('[data-rejoindre]').onclick = async () => {
    const champ = el.querySelector('[data-code]');
    let code = champ.value.trim();
    if (!code) return;
    const m = code.match(/code=([A-Za-z0-9]+)/);
    if (m) code = m[1];
    try {
      const g = await groupJoin(code);
      toast(`Tu as rejoint ${g.name}.`);
      location.hash = `#/groupes/${g.id}`;
    } catch (err) { toast(err.message); }
  };

  const res = el.querySelector('[data-resultats]');
  let t;
  el.querySelector('[data-q]').addEventListener('input', (e) => {
    clearTimeout(t);
    const terme = e.target.value;
    t = setTimeout(async () => {
      res.replaceChildren();
      if (terme.trim().length < 2) return;
      try {
        const trouves = await groupsSearch(terme);
        if (!trouves.length) {
          res.appendChild(h('<li class="ligne"><p class="etat-mono">Aucun résultat.</p></li>'));
          return;
        }
        for (const g of trouves) {
          const li = h(`<li class="ligne ligne-action">
            <span class="ligne-titre">${esc(g.name)}</span>
            <span class="ligne-meta">${g.memberCount} membre${g.memberCount > 1 ? 's' : ''}</span>
            <button class="btn btn-sm" type="button">Rejoindre</button></li>`);
          li.querySelector('button').onclick = async (ev) => {
            ev.target.disabled = true;
            try {
              const joined = await groupJoin(g.invite_code);
              toast(`Tu as rejoint ${joined.name}.`);
              location.hash = `#/groupes/${joined.id}`;
            } catch (err) { toast(err.message); ev.target.disabled = false; }
          };
          res.appendChild(li);
        }
      } catch (err) { toast(err.message); }
    }, 300);
  });

  render(el);
}

function ouvrirFormulaireGroupe(existant, valider) {
  const modale = h(`
    <div class="modale" role="dialog" aria-label="Groupe">
      <div class="modale-boite">
        <div class="modale-tete">
          <h2>${existant ? 'Modifier le groupe' : 'Créer un groupe'}</h2>
          <button class="lien-inline" data-fermer>Fermer</button>
        </div>
        <label class="champ"><span>Nom</span>
          <input type="text" data-nom maxlength="60" value="${esc(existant?.name || '')}"></label>
        <label class="champ"><span>Description (facultatif)</span>
          <input type="text" data-desc maxlength="300" value="${esc(existant?.description || '')}"></label>
        <div class="modale-pied">
          <button class="btn" data-valider type="button">${existant ? 'Enregistrer' : 'Créer'}</button>
        </div>
      </div>
    </div>`);
  modale.querySelector('[data-valider]').onclick = () => {
    const nom = modale.querySelector('[data-nom]').value.trim();
    if (!nom) return toast('Donne un nom au groupe.');
    valider(nom, modale.querySelector('[data-desc]').value.trim());
    modale.remove();
  };
  modale.querySelector('[data-fermer]').onclick = () => modale.remove();
  modale.addEventListener('click', (e) => { if (e.target === modale) modale.remove(); });
  document.body.appendChild(modale);
}

/* ============================================================== détail */

export async function vueGroupeDetail(params) {
  render(loading('Chargement du groupe'));
  const moi = await currentUser();
  const groupId = params.id;

  let groupes;
  try { groupes = await groupsMine(moi.id); }
  catch (e) { return render(failure(e, "Le groupe n'a pas pu être chargé")); }
  const g = groupes.find(x => x.id === groupId);
  if (!g) return render(empty('Groupe introuvable',
    "Tu n'en es peut-être plus membre.", { href: '#/groupes', label: 'Retour aux groupes' }));

  let mode = 'fil';
  let periode = 30;

  const el = h(`
    <section class="page groupe-detail">
      <p class="eyebrow"><a class="lien-inline" href="#/groupes">‹ Groupes</a></p>
      <h1>${esc(g.name)}</h1>
      ${g.description ? `<p class="lede">${esc(g.description)}</p>` : ''}
      <p class="ligne-meta">Code d'invitation : <b data-code>${esc(g.invite_code)}</b>
        <button class="lien-inline" data-copier type="button">copier</button></p>

      <div class="rangee" style="gap:.5rem" data-onglets></div>
      <div data-corps></div>
    </section>`);

  const onglets = el.querySelector('[data-onglets]');
  const corps = el.querySelector('[data-corps]');
  const modes = [['fil', 'Fil'], ['classement', 'Classement'], ['discussion', 'Discussion'], ['membres', 'Membres']];

  function dessinerOnglets() {
    onglets.replaceChildren();
    for (const [id, label] of modes) {
      const b = h(`<button class="puce ${mode === id ? 'puce-active' : ''}" type="button">${label}</button>`);
      b.onclick = () => { mode = id; dessinerOnglets(); dessinerCorps(); };
      onglets.appendChild(b);
    }
  }

  el.querySelector('[data-copier]').onclick = async () => {
    await navigator.clipboard.writeText(g.invite_code).catch(() => {});
    toast('Code copié.');
  };

  async function dessinerCorps() {
    corps.replaceChildren(loading());
    if (mode === 'fil') return dessinerFil();
    if (mode === 'classement') return dessinerClassement();
    if (mode === 'discussion') return dessinerDiscussion();
    if (mode === 'membres') return dessinerMembres();
  }

  async function dessinerFil() {
    let items;
    try { items = await groupFeed(groupId); }
    catch (e) { return corps.replaceChildren(failure(e, "Le fil n'a pas pu être chargé")); }
    if (!items.length) return corps.replaceChildren(h(`<p class="etat-mono">Rien à afficher pour l'instant.</p>`));
    const ul = h('<ul class="liste"></ul>');
    for (const s of items) {
      ul.appendChild(h(`
        <li class="ligne">
          <div class="ligne-tete">
            <span class="ligne-titre">${esc(s.username)} — ${esc(s.workout_name || 'Séance')}</span>
            <span class="ligne-meta">${esc(dateCourte(s.started_at))}</span>
          </div>
          <p class="ligne-stats">
            <span>${esc(duree((s.duration_ms || 0) / 1000))}</span>
            <span>${esc(kg(s.volume_kg))}</span>
          </p>
        </li>`));
    }
    corps.replaceChildren(ul);
  }

  async function dessinerClassement() {
    const barre = h(`<div class="rangee" style="gap:.4rem;margin-bottom:1rem">
      ${[7, 30, 90].map(j => `<button class="puce ${periode === j ? 'puce-active' : ''}" data-periode="${j}" type="button">${j} jours</button>`).join('')}
    </div>`);
    barre.querySelectorAll('[data-periode]').forEach(b => {
      b.onclick = () => { periode = Number(b.dataset.periode); dessinerCorps(); };
    });
    let classement;
    try { classement = await groupStandings(groupId, periode); }
    catch (e) { corps.replaceChildren(barre, failure(e, "Le classement n'a pas pu être chargé")); return; }
    classement.sort((a, b) => b.volume - a.volume);
    if (!classement.length) {
      corps.replaceChildren(barre, h(`<p class="etat-mono">Personne n'a encore de séance sur cette période.</p>`));
      return;
    }
    const ul = h('<ul class="liste"></ul>');
    classement.forEach((s, i) => ul.appendChild(h(`
      <li class="ligne">
        <div class="ligne-tete">
          <span class="ligne-titre">${i + 1}. ${esc(s.username)}</span>
          <span class="ligne-meta">${esc(kg(s.volume))}</span>
        </div>
        <p class="ligne-stats"><span>${s.sessions} séance${s.sessions > 1 ? 's' : ''}</span><span>${s.activeDays} jour${s.activeDays > 1 ? 's' : ''} actif${s.activeDays > 1 ? 's' : ''}</span></p>
      </li>`)));
    corps.replaceChildren(barre, ul);
  }

  async function dessinerDiscussion() {
    let messages;
    try { messages = await groupMessageThread(groupId); }
    catch (e) { return corps.replaceChildren(failure(e, "La discussion n'a pas pu être chargée")); }

    const wrap = h(`
      <div>
        <ul class="msg-fil" data-fil></ul>
        <div class="msg-actions"><button class="btn btn-sm btn-ghost" type="button" data-partager>Partager une séance</button></div>
        <form class="coach-saisie" data-form>
          <input type="text" data-texte placeholder="Message au groupe…" autocomplete="off" maxlength="1000">
          <button class="btn" type="submit">Envoyer</button>
        </form>
      </div>`);
    const fil = wrap.querySelector('[data-fil]');
    function redessiner() {
      fil.replaceChildren();
      messages.forEach(m => {
        const mine = m.sender_id === moi.id;
        const li = h(`<li class="coach-ligne ${mine ? 'mine' : ''}"><div class="coach-bulle"></div></li>`);
        const b = li.querySelector('.coach-bulle');
        if (!mine) b.appendChild(h(`<p class="ligne-meta" style="margin:0 0 .2rem">${esc(m.username)}</p>`));
        if (m.workout_data) {
          const btn = h(`<button class="lien-inline" type="button">🏋 ${esc(m.workout_name || 'Séance')} — importer</button>`);
          btn.onclick = async () => {
            btn.disabled = true;
            const w = await decoderSeance(m.workout_data);
            if (!w) { toast('Séance illisible.'); btn.disabled = false; return; }
            try { await saveWorkout(moi.id, w); toast('Séance importée.'); btn.textContent = 'Importée ✓'; }
            catch (err) { toast(err.message); btn.disabled = false; }
          };
          b.appendChild(btn);
        } else {
          b.appendChild(h(`<p>${esc(m.body)}</p>`));
        }
        fil.appendChild(li);
      });
      fil.scrollTop = fil.scrollHeight;
    }
    wrap.querySelector('[data-partager]').onclick = async () => {
      let mine;
      try { mine = await listWorkouts(moi.id); } catch (err) { return toast(err.message); }
      if (!mine.length) return toast('Aucune séance à partager.');
      const modale = h(`<div class="modale" role="dialog"><div class="modale-boite">
        <div class="modale-tete"><h2>Partager une séance</h2><button class="lien-inline" data-fermer>Fermer</button></div>
        <div class="modale-corps" data-corps></div></div></div>`);
      const c = modale.querySelector('[data-corps]');
      for (const w of mine) {
        const b = h(`<button class="ligne ligne-action" style="width:100%;text-align:left;background:none;border:1px solid var(--trait);cursor:pointer" type="button"><span class="ligne-titre">${esc(w.name)}</span></button>`);
        b.onclick = async () => {
          modale.remove();
          try {
            const code = await encoderSeance(w.data);
            await groupSendWorkout(groupId, moi.id, w.name, code);
            messages = await groupMessageThread(groupId);
            redessiner();
          } catch (err) { toast(err.message); }
        };
        c.appendChild(b);
      }
      modale.querySelector('[data-fermer]').onclick = () => modale.remove();
      modale.addEventListener('click', (e) => { if (e.target === modale) modale.remove(); });
      document.body.appendChild(modale);
    };
    wrap.querySelector('[data-form]').onsubmit = async (e) => {
      e.preventDefault();
      const champ = wrap.querySelector('[data-texte]');
      const texte = champ.value.trim();
      if (!texte) return;
      champ.value = '';
      try {
        await groupSendText(groupId, moi.id, texte);
        messages = await groupMessageThread(groupId);
        redessiner();
      } catch (err) { toast(err.message); }
    };
    redessiner();
    corps.replaceChildren(wrap);
  }

  async function dessinerMembres() {
    let membres;
    try { membres = await groupMembersList(groupId); }
    catch (e) { return corps.replaceChildren(failure(e, "Les membres n'ont pas pu être chargés")); }
    const ul = h('<ul class="liste"></ul>');
    for (const m of membres) {
      const li = h(`
        <li class="ligne ligne-action">
          <span class="ligne-titre">${esc(m.username)} ${m.isOwner ? '<span class="etiquette">Propriétaire</span>' : ''}</span>
          ${g.mine && m.user_id !== moi.id ? '<button class="btn btn-sm btn-ghost" type="button">Retirer</button>' : ''}
        </li>`);
      const btn = li.querySelector('button');
      if (btn) btn.onclick = async () => {
        if (!confirm(`Retirer ${m.username} ?`)) return;
        try { await groupRemoveMember(groupId, m.user_id); dessinerCorps(); }
        catch (err) { toast(err.message); }
      };
      ul.appendChild(li);
    }
    const actions = h('<div class="bloc"></div>');
    if (g.mine) {
      const modif = h(`<button class="btn btn-ghost" type="button" style="margin-right:.5rem">Modifier le groupe</button>`);
      modif.onclick = () => ouvrirFormulaireGroupe(g, async (nom, desc) => {
        try { await groupUpdateInfo(groupId, nom, desc); g.name = nom; g.description = desc; toast('Groupe modifié.'); el.querySelector('h1').textContent = nom; }
        catch (err) { toast(err.message); }
      });
      const regen = h(`<button class="btn btn-ghost" type="button" style="margin-right:.5rem">Régénérer le code</button>`);
      regen.onclick = async () => {
        try { const code = await groupRegenerateCode(groupId); g.invite_code = code; el.querySelector('[data-code]').textContent = code; toast('Code régénéré.'); }
        catch (err) { toast(err.message); }
      };
      const suppr = h(`<button class="btn btn-ghost" type="button">Supprimer le groupe</button>`);
      suppr.onclick = async () => {
        if (!confirm('Supprimer ce groupe ? Impossible à annuler.')) return;
        try { await groupDelete(groupId); toast('Groupe supprimé.'); location.hash = '#/groupes'; }
        catch (err) { toast(err.message); }
      };
      actions.append(modif, regen, suppr);
    } else {
      const quitter = h(`<button class="btn btn-ghost" type="button">Quitter le groupe</button>`);
      quitter.onclick = async () => {
        if (!confirm('Quitter ce groupe ?')) return;
        try { await groupLeave(groupId, moi.id); toast('Tu as quitté le groupe.'); location.hash = '#/groupes'; }
        catch (err) { toast(err.message); }
      };
      actions.appendChild(quitter);
    }
    corps.replaceChildren(ul, actions);
  }

  dessinerOnglets();
  render(el);
  dessinerCorps();
}
