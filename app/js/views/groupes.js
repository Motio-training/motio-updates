/* ==========================================================================
   Groupes d'entraînement — portage de GroupScreens.kt. Pas de bannière côté
   web (v1). QR d'invitation (affichage + scan caméra) : voir plus bas —
   contrairement au natif (qui ne fait QUE dessiner un QR, le scan étant
   délégué à l'appareil photo du système), le web scanne lui-même via
   BarcodeDetector quand le navigateur le permet, puisqu'une PWA n'a pas
   d'intent-filter déclaratif pour intercepter un lien scanné par une appli
   tierce. Le reste (fil, classement, discussion, membres) reprend les mêmes
   RPC/tables que l'app.
   ========================================================================== */

import { h, render, loading, empty, failure, esc, toast, socialHeader } from '../ui.js';
import { currentUser } from '../supabase.js';
import {
  groupsMine, groupsSearch, groupCreate, groupJoin, groupLeave, groupDelete,
  groupPreviewByCode, groupMembersList, groupRemoveMember, groupUpdateInfo, groupRegenerateCode,
  groupFeed, groupStandings, groupMessageThread, groupSendText, groupSendWorkout,
  listWorkouts, unreadMessagesCount, kudosFor, commentCounts
} from '../api.js';
import { kg } from '../model.js';
import { encode as encoderSeance, decode as decoderSeance } from '../workout-share.js';
import { saveWorkout } from '../api.js';
import { carteSeance } from './fil.js';

/** Un code brut, un fragment « code=XXXX », ou un lien complet — mêmes trois
 *  formats acceptés que GroupScreens.kt (LINK_PREFIX/« code=»/brut). */
function extraireCode(texte) {
  const brut = texte.trim();
  const m = brut.match(/code=([A-Za-z0-9]+)/);
  return (m ? m[1] : brut).split('&')[0].trim();
}

export async function vueGroupes() {
  render(loading('Chargement des groupes'));
  const moi = await currentUser();

  let groupes, unread = 0;
  try {
    [groupes, unread] = await Promise.all([
      groupsMine(moi.id),
      unreadMessagesCount(moi.id).catch(() => 0)
    ]);
  }
  catch (e) { return render(failure(e, "Les groupes n'ont pas pu être chargés")); }

  const el = h(`
    <section class="page">
      <button class="btn" data-creer type="button">Créer un groupe</button>

      <div class="rangee" style="margin-top:1rem">
        <label class="champ"><span>Rejoindre avec un code</span>
          <input type="text" data-code placeholder="ABCD1234"></label>
        <button class="btn btn-ghost" data-rejoindre type="button">OK</button>
        <button class="btn btn-ghost" data-scanner type="button" hidden>📷 Scanner un QR code</button>
      </div>

      <label class="champ"><span>Ou rechercher un groupe par nom</span>
        <input type="search" data-q placeholder="deux lettres minimum"></label>
      <ul class="liste" data-resultats></ul>

      <div class="bloc" data-liste-groupes></div>
    </section>`);
  el.insertBefore(socialHeader('Groupes', 'groupes', unread, () => vueGroupes()), el.firstChild);

  const zone = el.querySelector('[data-liste-groupes]');
  function dessinerListe() {
    zone.replaceChildren();
    if (!groupes.length) {
      zone.appendChild(h(`<p class="etat-mono">Aucun groupe pour l'instant.</p>`));
      return;
    }
    const ul = h('<ul class="liste"></ul>');
    for (const g of groupes) {
      /* Toute la carte navigue — avant, seul le nom (dans un <a>) réagissait
         au clic, le reste de la ligne (méta) ne faisait rien. */
      const li = h(`
        <li class="ligne ligne-action" style="cursor:pointer">
          <span class="ligne-titre">${esc(g.name)}</span>
          <span class="ligne-meta">${g.memberCount} membre${g.memberCount > 1 ? 's' : ''}${g.mine ? ' · toi' : ''}</span>
        </li>`);
      li.onclick = () => { location.hash = `#/groupes/${g.id}`; };
      ul.appendChild(li);
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

  async function rejoindreParCode(code) {
    try {
      const g = await groupJoin(extraireCode(code));
      toast(`Tu as rejoint ${g.name}.`);
      location.hash = `#/groupes/${g.id}`;
    } catch (err) { toast(err.message); }
  }

  el.querySelector('[data-rejoindre]').onclick = () => {
    const code = el.querySelector('[data-code]').value.trim();
    if (code) rejoindreParCode(code);
  };

  /* Scan caméra (BarcodeDetector) : le natif n'a PAS ça — il délègue au
     scanner du système, qui ouvre chrono://group?code=... via intent-filter.
     Une PWA n'a pas cette passerelle déclarative, donc si on veut un scan
     "dans l'appli" ici, il faut vraiment décoder l'image nous-mêmes. Bouton
     caché par défaut, révélé seulement si le navigateur sait faire — pas de
     dégradation bruyante sur les navigateurs qui ne le supportent pas
     (Safari notamment), le champ + coller le code reste la voie normale. */
  const btnScanner = el.querySelector('[data-scanner]');
  if ('BarcodeDetector' in window) {
    btnScanner.hidden = false;
    btnScanner.onclick = () => ouvrirScanQR(rejoindreParCode);
  }

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

/** Reçu depuis un lien/QR d'invitation (#/groupes/rejoindre/:code) :
 *  aperçu sans adhésion (get_group_preview) puis confirmation explicite —
 *  GroupJoinPrompt (GroupScreens.kt ~378-438), même principe que l'aperçu
 *  d'une séance reçue avant import. */
export async function vueGroupeRejoindre(params) {
  render(loading('Chargement du groupe'));

  let apercu;
  try { apercu = await groupPreviewByCode(params.code); }
  catch (e) { return render(failure(e, "Le groupe n'a pas pu être trouvé")); }
  if (!apercu) {
    return render(empty('Groupe introuvable',
      "Ce code d'invitation est invalide, ou le code a été régénéré depuis.",
      { href: '#/groupes', label: 'Retour aux groupes' }));
  }

  const el = h(`
    <section class="page page-etroite">
      <p class="eyebrow">Invitation</p>
      <h1>${esc(apercu.name)}</h1>
      ${apercu.description ? `<p class="lede">${esc(apercu.description)}</p>` : ''}
      <p class="ligne-meta">${apercu.member_count} membre${apercu.member_count > 1 ? 's' : ''}</p>
      <button class="btn btn-lg" data-rejoindre type="button" style="width:100%;margin-top:1.25rem">Rejoindre ce groupe</button>
    </section>`);

  el.querySelector('[data-rejoindre]').onclick = async (e) => {
    e.target.disabled = true;
    try {
      const g = await groupJoin(params.code);
      toast(`Tu as rejoint ${g.name}.`);
      location.hash = `#/groupes/${g.id}`;
    } catch (err) { toast(err.message); e.target.disabled = false; }
  };

  render(el);
}

/** Scan caméra d'un QR d'invitation (BarcodeDetector — Chrome/Edge/Android ;
 *  absent de Safari, d'où la révélation conditionnelle du bouton). Flux
 *  vidéo affiché en direct, détection en boucle via requestAnimationFrame,
 *  premier code lu = on coupe la caméra et on rejoint. */
function ouvrirScanQR(surCode) {
  const modale = h(`
    <div class="modale" role="dialog" aria-label="Scanner un QR code">
      <div class="modale-boite modale-boite-etroite">
        <div class="modale-tete" style="justify-content:center"><h2>Scanner le QR code</h2></div>
        <div class="scan-video-zone"><video data-video autoplay playsinline muted></video></div>
        <p class="etat-mono" data-msg>Vise le QR code affiché sur l'autre téléphone.</p>
        <div class="modale-pied" style="justify-content:center">
          <button class="btn btn-ghost" data-fermer type="button">Annuler</button>
        </div>
      </div>
    </div>`);
  document.body.appendChild(modale);

  const video = modale.querySelector('[data-video]');
  const msg = modale.querySelector('[data-msg]');
  let flux = null, actif = true, raf = null;

  const fermer = () => {
    actif = false;
    if (raf) cancelAnimationFrame(raf);
    flux?.getTracks().forEach(t => t.stop());
    modale.remove();
  };
  modale.querySelector('[data-fermer]').onclick = fermer;
  modale.addEventListener('click', (e) => { if (e.target === modale) fermer(); });

  (async () => {
    try {
      flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    } catch {
      msg.textContent = "Caméra inaccessible — vérifie l'autorisation, ou colle le code à la main.";
      return;
    }
    if (!actif) { flux.getTracks().forEach(t => t.stop()); return; }
    video.srcObject = flux;

    const detecteur = new BarcodeDetector({ formats: ['qr_code'] });
    const boucle = async () => {
      if (!actif) return;
      try {
        const codes = await detecteur.detect(video);
        if (codes.length) {
          const texte = codes[0].rawValue || '';
          if (texte) { fermer(); surCode(texte); return; }
        }
      } catch { /* image pas encore prête, on retente */ }
      raf = requestAnimationFrame(boucle);
    };
    raf = requestAnimationFrame(boucle);
  })();
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

  /* En-tête (GroupScreens.kt ~527-542) : pas de code affiché en clair sur
     cet écran — seul « Inviter » (ShareGroupSheet) l'expose, encodé dans le
     lien/QR. Avatar rond vide (pas de bannière côté web). */
  const el = h(`
    <section class="page groupe-detail">
      <div class="groupe-tete">
        <a class="msg-retour" href="#/groupes" aria-label="Retour">‹</a>
        <span class="groupe-avatar"></span>
        <b class="groupe-nom">${esc(g.name)}</b>
        <button class="lien-inline" data-inviter type="button">Inviter</button>
      </div>
      ${g.description ? `<p class="lede">${esc(g.description)}</p>` : ''}

      <div class="rangee" style="gap:.5rem" data-onglets></div>
      <div data-corps></div>
    </section>`);

  const onglets = el.querySelector('[data-onglets]');
  const corps = el.querySelector('[data-corps]');

  function dessinerOnglets() {
    onglets.replaceChildren();
    const modes = [
      ['fil', 'Fil'], ['classement', 'Classement'], ['discussion', 'Discussion'],
      ['membres', `Membres (${g.memberCount})`]
    ];
    for (const [id, label] of modes) {
      const b = h(`<button class="chip-cat ${mode === id ? 'on' : ''}" type="button">${esc(label)}</button>`);
      b.onclick = () => { mode = id; dessinerOnglets(); dessinerCorps(); };
      onglets.appendChild(b);
    }
  }

  /* ShareGroupSheet (GroupScreens.kt ~444-482) : QR + lien à copier,
     texte et libellés natifs repris mot pour mot. Lien web (#/groupes/
     rejoindre/:code) à la place de chrono://group?code=, seule façon
     d'ouvrir quelque chose pour qui n'a pas l'appli installée. */
  el.querySelector('[data-inviter]').onclick = async () => {
    const lien = `${location.origin}${location.pathname}#/groupes/rejoindre/${g.invite_code}`;
    const modale = h(`
      <div class="modale" role="dialog" aria-label="Inviter">
        <div class="modale-boite modale-boite-etroite">
          <div class="modale-tete" style="justify-content:center"><h2>Inviter dans ${esc(g.name)}</h2></div>
          <div class="qr-surface" data-zone><canvas class="qr-canvas" data-canvas></canvas></div>
          <p class="etat-mono">Quiconque scanne ce code ou ouvre ce lien rejoint le groupe immédiatement.</p>
          <div class="modale-pied" style="justify-content:center">
            <button class="lien-inline" data-fermer type="button">Fermer</button>
            <button class="btn" data-copier type="button">Copier le lien</button>
          </div>
        </div>
      </div>`);
    const fermer = () => modale.remove();
    modale.addEventListener('click', (e) => { if (e.target === modale) fermer(); });
    modale.querySelector('[data-fermer]').onclick = fermer;
    modale.querySelector('[data-copier]').onclick = async () => {
      await navigator.clipboard.writeText(lien).catch(() => {});
      toast('Lien copié.');
    };
    document.body.appendChild(modale);

    try {
      const { dessinerQR } = await import('../qr.js');
      const ok = await dessinerQR(modale.querySelector('[data-canvas]'), lien, 700);
      if (!ok) throw new Error('trop long');
    } catch {
      modale.querySelector('[data-zone]').replaceChildren(
        h('<p class="etat-mono">Le QR code n\'a pas pu être créé.</p>'));
    }
  };

  async function dessinerCorps() {
    corps.replaceChildren(loading());
    if (mode === 'fil') return dessinerFil();
    if (mode === 'classement') return dessinerClassement();
    if (mode === 'discussion') return dessinerDiscussion();
    if (mode === 'membres') return dessinerMembres();
  }

  /* FeedCard (SocialScreens.kt) : le fil de groupe réutilise la MÊME carte
     que le fil général côté natif, pas une liste simplifiée — carteSeance
     (fil.js) est donc réutilisée telle quelle ici plutôt que réécrite. */
  async function dessinerFil() {
    let items;
    try { items = await groupFeed(groupId); }
    catch (e) { return corps.replaceChildren(failure(e, "Le fil n'a pas pu être chargé")); }
    if (!items.length) return corps.replaceChildren(h(`<p class="etat-mono">Rien à afficher pour l'instant.</p>`));
    const ids = items.map(s => s.id).filter(Boolean);
    const [kud, nbCom] = await Promise.all([
      kudosFor(ids, moi.id).catch(() => ({})),
      commentCounts(ids).catch(() => ({}))
    ]);
    const conteneur = h('<div class="rangee-feed"></div>');
    items.forEach(s => conteneur.appendChild(carteSeance(s, moi, kud[s.id], nbCom[s.id] || 0)));
    corps.replaceChildren(conteneur);
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
