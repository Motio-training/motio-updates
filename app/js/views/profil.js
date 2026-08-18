import { h, render, loading, empty, failure, esc, toast, dateCourte, duree, socialHeader } from '../ui.js';
import { getProfile, setUsername, sessionsOf, following, followers,
         searchProfiles, follow, unfollow, unreadMessagesCount, deleteMyAccount, directDe,
         listWorkouts, saveWorkout, listPrograms, saveProgram, uploadAvatar, setPublicProfile,
         kudosFor, commentCounts, setNotifPref } from '../api.js';
import { currentUser, signOut } from '../supabase.js';
import { kg, estime1RM } from '../model.js';
import { computeStatsFrom, fmtQty } from '../trophies.js';
import { reset as reinitialiserOnboarding } from './onboarding.js';
import { muscleLoadOf, titreSeance } from '../muscle-lexicon.js';
import { carteSeance } from './fil.js';
import { drawMuscleMap, drawLegend, MuscleScale } from '../muscle-map.js';
import { CHANGELOG } from '../changelog.js';
import { NIVEAUX, OBJECTIFS, niveauActuel, definirNiveau, objectifActuel, definirObjectif,
         recordsEpingles, estRecordEpingle, toggleRecordEpingle,
         oneRmManuel, definirOneRmManuel } from '../reglages.js';
import { buildBackupJson, parseBackupJson } from '../backup.js';

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
  /* Badge « en direct » (LiveSessionScreen.kt) : uniquement sur le profil
     d'un ami, jamais sur le mien — se voir soi-même « en direct » n'a pas
     de sens. */
  const enDirect = !estMoi ? await directDe(cible).catch(() => null) : null;

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
  const avatarInner = profil.avatar_url
    ? `<img class="profil-avatar" src="${esc(profil.avatar_url)}" alt="">`
    : `<span class="profil-avatar">${esc(initiale)}</span>`;
  /* IdentityHeader (Profile.kt ~487-499) : l'avatar n'est cliquable que sur
     son propre profil, jamais sur celui d'un ami. */
  const avatarHtml = estMoi
    ? `<button type="button" class="profil-avatar-bouton" data-avatar-bouton aria-label="Changer la photo de profil">
        ${avatarInner}<span class="profil-avatar-crayon">✎</span>
        <input type="file" accept="image/*" data-avatar-fichier hidden>
      </button>`
    : avatarInner;

  const el = h(`
    <section class="page">
      <div class="profil-panneau">
        <div class="profil-tete">
          ${avatarHtml}
          <div class="profil-identite">
            <b data-nom>${esc(profil.username || 'sans pseudo')}</b>
            <span>${estMoi ? esc(moi.email || '') : 'Profil'}</span>
            ${enDirect ? `<a class="profil-direct" href="#/direct/${esc(cible)}"><span class="fil-direct-point"></span>En direct ›</a>` : ''}
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
            <a class="menu-ligne" href="#/profil/analyse">
              <span class="corps"><b>Analyse et records</b><span>Volume par groupe, courbes, records</span></span>
              <span class="chevron">›</span>
            </a>
            <a class="menu-ligne" href="#/coach">
              <img class="menu-avatar" src="../assets/img/moti_avatar.jpg" alt="">
              <span class="corps"><b>Moti</b><span>Ton coach IA — connaît tes séances, tes records</span></span>
              <span class="chevron">›</span>
            </a>
          </div>
        </div>

        <div class="bloc">
          <p class="bloc-titre">Compte</p>
          <div class="menu-groupe">
            <a class="menu-ligne" href="#/profil/compte">
              <span class="corps"><b>Compte et données</b><span>Connecté · ${esc(profil.username || moi.email || '')}</span></span>
              <span class="chevron">›</span>
            </a>
          </div>
        </div>

        <div class="bloc">
          <p class="bloc-titre">Application</p>
          <div class="menu-groupe">
            <a class="menu-ligne" href="#/profil/maj">
              <span class="corps"><b>Mise à jour</b><span>Espace web — toujours à jour</span></span>
              <span class="chevron">›</span>
            </a>
            <a class="menu-ligne" href="#/profil/nouveautes">
              <span class="corps"><b>Nouveautés</b><span>Ce qui a changé, version par version</span></span>
              <span class="chevron">›</span>
            </a>
            <button class="menu-ligne" data-tuto type="button">
              <span class="corps"><b>Revoir le tutoriel</b></span>
              <span class="chevron">›</span>
            </button>
            <a class="menu-ligne" href="../confidentialite/index.html" target="_blank" rel="noopener">
              <span class="corps"><b>Confidentialité</b></span>
              <span class="chevron">›</span>
            </a>
          </div>
        </div>` : `
        <button class="btn" data-suivre>${jeSuis ? 'Ne plus suivre' : 'Suivre'}</button>

        <div class="bloc">
          <p class="bloc-titre">Séances récentes</p>
          <div data-seances></div>
        </div>

        <div class="bloc">
          <p class="bloc-titre">Records estimés</p>
          <div data-records></div>
        </div>`}
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

  /* Avatar (IdentityHeader, Profile.kt ~430-596) : sélection puis recadrage
     carré CENTRÉ automatique en 512×512 JPEG q85 — le natif propose un
     recadrage interactif (com.canhub.cropper, ratio 1:1 ovale ajustable),
     écart assumé côté web faute d'équivalent portable simple ; le résultat
     final (carré centré, même taille, même compression) est identique. */
  const boutonAvatar = el.querySelector('[data-avatar-bouton]');
  if (boutonAvatar) {
    const champFichier = boutonAvatar.querySelector('[data-avatar-fichier]');
    boutonAvatar.addEventListener('click', (e) => { e.preventDefault(); champFichier.click(); });
    champFichier.addEventListener('change', async () => {
      const fichier = champFichier.files?.[0];
      champFichier.value = '';
      if (!fichier) return;
      boutonAvatar.classList.add('charge');
      try {
        const blob = await recadrerAvatar(fichier);
        const nouveauProfil = await uploadAvatar(moi.id, blob);
        boutonAvatar.querySelector('.profil-avatar')?.remove();
        boutonAvatar.insertAdjacentHTML('afterbegin',
          `<img class="profil-avatar" src="${esc(nouveauProfil.avatar_url)}" alt="">`);
        toast('Photo de profil mise à jour ✓');
      } catch (err) { toast(err.message || "L'envoi de la photo a échoué."); }
      finally { boutonAvatar.classList.remove('charge'); }
    });
  }

  /* records / séances : uniquement sur le profil d'un ami — le mien vit
     maintenant dans « Analyse et records » (#/profil/analyse). */
  const zoneRec = el.querySelector('[data-records]');
  if (zoneRec) {
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
  }

  /* Séances récentes : cartes cliquables (carteSeance, fil.js) au lieu de
     lignes mortes — Nicolas : « je veux qu'on puisse y voir le détail ».
     5 visibles d'emblée, jusqu'à 15 (déjà chargées) derrière « Autres
     séances », même idée que FriendProfileScreen.kt côté natif. */
  const zoneS = el.querySelector('[data-seances]');
  if (zoneS) {
    if (!seances.length) {
      zoneS.appendChild(h(`<p class="etat-mono">Aucune séance partagée.</p>`));
    } else {
      const quinze = seances.slice(0, 15).map(s => ({ ...s, username: profil.username }));
      const ids = quinze.map(s => s.id).filter(Boolean);
      const [kud, nbCom, titres] = await Promise.all([
        kudosFor(ids, moi.id).catch(() => ({})),
        commentCounts(ids).catch(() => ({})),
        Promise.all(quinze.map(s => titreSeance(s)))
      ]);
      let toutesVisibles = false;
      const conteneur = h('<div></div>');
      function dessinerSeances() {
        conteneur.replaceChildren();
        const liste = h('<div class="rangee-feed"></div>');
        const visibles = toutesVisibles ? quinze : quinze.slice(0, 5);
        visibles.forEach((s, i) => liste.appendChild(carteSeance(s, moi, kud[s.id], nbCom[s.id] || 0, titres[i])));
        conteneur.appendChild(liste);
        if (!toutesVisibles && quinze.length > 5) {
          const lien = h(`<button class="lien-inline" type="button" style="margin-top:.6rem">Autres séances (${quinze.length - 5})</button>`);
          lien.onclick = () => { toutesVisibles = true; dessinerSeances(); };
          conteneur.appendChild(lien);
        }
      }
      dessinerSeances();
      zoneS.appendChild(conteneur);
    }
  }

  const btnSuivre = el.querySelector('[data-suivre]');
  if (btnSuivre) {
    let suivi = jeSuis;
    btnSuivre.onclick = () => {
      if (!suivi) { toggleSuivi(); return; }
      confirmerNePlusSuivre(profil.username || 'cet utilisateur', toggleSuivi);
    };
    async function toggleSuivi() {
      btnSuivre.disabled = true;
      try {
        if (suivi) { await unfollow(moi.id, cible); suivi = false; }
        else { await follow(moi.id, cible); suivi = true; }
        btnSuivre.textContent = suivi ? 'Ne plus suivre' : 'Suivre';
      } catch (err) { toast(err.message); }
      finally { btnSuivre.disabled = false; }
    }
  }

  el.querySelector('[data-tuto]')?.addEventListener('click', () => {
    reinitialiserOnboarding();
    location.hash = '#/onboarding';
  });

  render(el);
}

/* ============================================================ sous-écrans
   Même arborescence que le Profil natif (Profile.kt) : Entraînement/Compte/
   Application, chacun avec ses propres pages plutôt que tout empilé sur
   l'écran principal. */

function enTete(titre) {
  return `
    <p class="eyebrow"><a class="lien-inline" href="#/profil">‹ Profil</a></p>
    <h1>${esc(titre)}</h1>`;
}

/** prepareAvatarBytes (Profile.kt ~549-596) : recadrage carré CENTRÉ puis
 *  redimensionnement à 512×512, JPEG q85. `createImageBitmap` avec
 *  `imageOrientation:'from-image'` gère la rotation EXIF à notre place —
 *  le natif la corrige à la main (rotateIfNeeded), ce n'est pas nécessaire
 *  ici. */
async function recadrerAvatar(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const cote = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - cote) / 2, sy = (bitmap.height - cote) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 512;
  canvas.getContext('2d').drawImage(bitmap, sx, sy, cote, cote, 0, 0, 512, 512);
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('Image illisible.')), 'image/jpeg', 0.85));
}

/** Analyse et records (StatsScreens.kt) : répartition musculaire de la
 *  semaine + records estimés — vivaient avant en vrac sur l'écran principal. */
export async function vueProfilAnalyse() {
  render(loading('Chargement'));
  const moi = await currentUser();

  let seances;
  try { seances = await sessionsOf(moi.id, { limit: 200 }); }
  catch (e) { return render(failure(e, "L'analyse n'a pas pu être chargée")); }

  const septJours = Date.now() - 7 * 86400000;
  const recentes = seances.filter(s => new Date(s.started_at).getTime() >= septJours);
  const sessionLike = {
    exercises: recentes.flatMap(s => Array.isArray(s.details) ? s.details : [])
      .map(ex => ({ name: ex.n, sets: (ex.s || []).map(st => ({ reps: st.r })) }))
  };
  const { zones, unknown, isEmpty } = await muscleLoadOf(sessionLike);
  const records = tousLesRecords(seances);

  const el = h(`
    <section class="page">
      ${enTete('Analyse et records')}

      <p class="bloc-titre" style="margin-top:1.5rem">Répartition musculaire — 7 derniers jours</p>
      <div data-muscles></div>

      <div class="bloc">
        <p class="bloc-titre">Records estimés</p>
        ${records.length ? '<p class="etat-mono">Touche l\'étoile pour épingler un record en tête de liste.</p>' : ''}
        <div data-records></div>
      </div>
    </section>`);

  const zoneMuscles = el.querySelector('[data-muscles]');
  if (isEmpty && !unknown.length) {
    zoneMuscles.appendChild(h('<p class="etat-mono">Aucune séance sur les 7 derniers jours.</p>'));
  } else {
    const bloc = h(`
      <div>
        ${!isEmpty ? `
          <canvas class="bilan-canvas" data-canvas></canvas>
          <div class="bilan-faces"><span>Face</span><span>Dos</span></div>
          <div class="bilan-degrade-row"><span>0</span><canvas class="bilan-degrade" data-legende></canvas><span>${MuscleScale.WEEK}+ séries</span></div>` : ''}
        ${unknown.length ? `<p class="bilan-inconnus">${unknown.length === 1 ? '1 exercice non reconnu' : unknown.length + ' exercices non reconnus'} : ${esc([...new Set(unknown)].join(', '))}</p>` : ''}
      </div>`);
    zoneMuscles.appendChild(bloc);
    if (!isEmpty) {
      await drawMuscleMap(bloc.querySelector('[data-canvas]'), zones, MuscleScale.WEEK);
      drawLegend(bloc.querySelector('[data-legende]'), MuscleScale.WEEK);
    }
  }

  /* Records épinglés (PinnedRecords, Stats.kt) : remontent en tête, dans
     l'ordre où ils ont été épinglés ; le reste suit trié par date
     d'amélioration décroissante. Pas de réordonnancement manuel (natif :
     appui long + glissé) — écart assumé. */
  const zoneRec = el.querySelector('[data-records]');
  function dessinerRecords() {
    zoneRec.replaceChildren();
    if (!records.length) {
      zoneRec.appendChild(h('<p class="etat-mono">Aucun détail de séries partagé.</p>'));
      return;
    }
    const epingles = recordsEpingles();
    const tries = [...records].sort((a, b) => {
      const pa = epingles.includes(a.nom), pb = epingles.includes(b.nom);
      if (pa !== pb) return pa ? -1 : 1;
      if (pa && pb) return epingles.indexOf(a.nom) - epingles.indexOf(b.nom);
      return b.whenMs - a.whenMs;
    });
    const ul = h('<ul class="liste"></ul>');
    for (const r of tries) {
      const epingle = epingles.includes(r.nom);
      const manuel = oneRmManuel(r.nom);
      const li = h(`
        <li class="ligne record-ligne ${epingle ? 'epingle' : ''}">
          <button type="button" class="record-etoile" aria-label="${epingle ? 'Désépingler' : 'Épingler'} ${esc(r.nom)}">${epingle ? '★' : '☆'}</button>
          <span class="record-corps">
            <span class="ligne-titre">${esc(r.nom)}</span>
            <span class="ligne-meta">${esc(kg(manuel ?? r.rm))} · ${manuel != null ? '1RM testé' : '1RM estimé'}</span>
          </span>
          <button type="button" class="lien-inline" data-modifier>Modifier</button>
        </li>`);
      li.querySelector('.record-etoile').onclick = () => { toggleRecordEpingle(r.nom); dessinerRecords(); };
      li.querySelector('[data-modifier]').onclick = () =>
        ouvrirSaisie1RM(r.nom, manuel, (v) => { definirOneRmManuel(r.nom, v); dessinerRecords(); });
      ul.appendChild(li);
    }
    zoneRec.appendChild(ul);
  }
  dessinerRecords();

  render(el);
}

/** Saisie du 1RM réellement testé (OneRmDialog, StatsScreens.kt) : champ
 *  simple plutôt que le pavé numérique de la séance en direct — on renseigne
 *  un maxi de temps en temps, assis, pas entre deux séries. Vider le champ
 *  efface la saisie et redonne la main à l'estimation. */
function ouvrirSaisie1RM(exercice, actuel, onValider) {
  const modale = h(`
    <div class="modale" role="dialog" aria-label="1RM testé">
      <div class="modale-boite">
        <div class="modale-tete"><h2>1RM testé</h2></div>
        <p style="font-weight:700;margin:0 0 .3rem">${esc(exercice)}</p>
        <p class="etat-mono">Le maxi que tu as réellement soulevé une fois, en kg. Moti s'en
          sert pour les charges conseillées et pour construire tes programmes. Laisse vide
          pour revenir à l'estimation.</p>
        <label class="champ" style="margin-top:.8rem"><span>Poids (kg)</span>
          <input type="number" inputmode="decimal" step="0.5" min="0" data-valeur
                 value="${actuel != null ? actuel : ''}"></label>
        <div class="modale-pied">
          <button class="lien-inline" data-annuler type="button">Annuler</button>
          <button class="btn" data-ok type="button">Valider</button>
        </div>
      </div>
    </div>`);
  modale.querySelector('[data-annuler]').onclick = () => modale.remove();
  modale.addEventListener('click', (e) => { if (e.target === modale) modale.remove(); });
  modale.querySelector('[data-ok]').onclick = () => {
    const brut = modale.querySelector('[data-valeur]').value.trim();
    modale.remove();
    onValider(brut === '' ? null : parseFloat(brut.replace(',', '.')));
  };
  document.body.appendChild(modale);
}

/** Compte et données (AccountScreens.kt) : identité, pseudo, niveau/objectif
 *  d'entraînement, visibilité, notifications, copie sur fichier, déconnexion,
 *  suppression du compte. Les notifications elles-mêmes n'arrivent que sur
 *  l'appli Android (pas de push web), mais les réglages sont côté compte :
 *  les changer ici agit sur le téléphone. */
export async function vueProfilCompte() {
  render(loading('Chargement'));
  const moi = await currentUser();

  let profil;
  try { profil = await getProfile(moi.id); }
  catch (e) { return render(failure(e, "Le compte n'a pas pu être chargé")); }

  const el = h(`
    <section class="page page-etroite">
      ${enTete('Compte et données')}

      <div class="menu-groupe" style="margin-top:1.5rem">
        <div class="menu-ligne" style="cursor:default">
          <span class="corps"><b data-nom>${esc(profil.username || 'sans pseudo')}</b><span>${esc(moi.email || '')}</span></span>
          <button class="lien-inline" data-pseudo type="button">Pseudo</button>
        </div>
      </div>

      <div class="bloc">
        <p class="bloc-titre">Mon profil d'entraînement</p>
        <p class="etat-mono">Sert à proposer un plan et des charges de départ adaptés.</p>
        <p class="champ-label" style="margin-top:.8rem">Niveau</p>
        <div class="rangee rangee-serree" data-niveaux style="margin-bottom:.7rem"></div>
        <p class="champ-label">Objectif</p>
        <div class="rangee rangee-serree" data-objectifs></div>
      </div>

      <div class="bloc">
        <p class="bloc-titre">Visibilité</p>
        <p class="etat-mono">En profil public, tes séances apparaissent dans le fil et le
          classement de tout le monde (onglet « Tous »), pas seulement de tes abonnés.</p>
        <div class="rangee rangee-serree" data-visibilite style="margin-top:.7rem"></div>
      </div>

      <div class="bloc">
        <p class="bloc-titre">Notifications</p>
        <p class="etat-mono">Choisis ce pour quoi tu veux être prévenu. Les notifications
          arrivent sur l'application Android — ce réglage vaut pour ton compte, donc
          le modifier ici agit aussi sur ton téléphone.</p>
        <div data-notifs style="margin-top:.7rem"></div>
      </div>

      <div class="bloc">
        <p class="bloc-titre">Copie sur fichier</p>
        <p class="etat-mono">Exporte tes séances et programmes dans un fichier — garde-le où tu
          veux — et réimporte-le pour les retrouver. Utile aussi pour transférer des séances
          vers ou depuis l'application Android.</p>
        <div style="display:flex;gap:.6rem;margin-top:.8rem">
          <button class="btn btn-ghost" data-exporter type="button" style="flex:1">Exporter</button>
          <button class="btn btn-ghost" data-importer type="button" style="flex:1">Importer</button>
        </div>
        <input type="file" accept="application/json" data-fichier hidden>
        <p class="etat-mono" data-msg-fichier style="margin-top:.6rem;color:var(--accent)"></p>
      </div>

      <div class="bloc" style="display:flex;gap:.6rem">
        <button class="btn btn-ghost" data-deconnexion type="button" style="flex:1">Se déconnecter</button>
        <button class="btn btn-ghost" data-supprimer type="button" style="flex:1;color:var(--accent2);border-color:var(--accent2)">Supprimer</button>
      </div>
    </section>`);

  /* Niveau/objectif : chips à sélection immédiate, comme PresetChip natif —
     pas de bouton « valider », chaque appui persiste tout de suite. */
  function dessinerChips(zone, options, actuel, definir) {
    zone.replaceChildren();
    options.forEach(([id, label]) => {
      const b = h(`<button class="chip-cat ${id === actuel ? 'on' : ''}" type="button">${esc(label)}</button>`);
      b.onclick = () => { definir(id); dessinerChips(zone, options, id, definir); };
      zone.appendChild(b);
    });
  }
  dessinerChips(el.querySelector('[data-niveaux]'), NIVEAUX, niveauActuel(), definirNiveau);
  dessinerChips(el.querySelector('[data-objectifs]'), OBJECTIFS, objectifActuel(), definirObjectif);

  /* Visibilité : profils_read est déjà lisible de tous (recherche par
     pseudo), seule la visibilité des SÉANCES change — sessions_read_public. */
  let estPublic = !!profil.is_public;
  const zoneVisibilite = el.querySelector('[data-visibilite]');
  function dessinerVisibilite() {
    zoneVisibilite.replaceChildren();
    [[false, 'Privé'], [true, 'Public']].forEach(([val, label]) => {
      const b = h(`<button class="chip-cat ${estPublic === val ? 'on' : ''}" type="button">${label}</button>`);
      b.onclick = async () => {
        if (estPublic === val) return;
        const avant = estPublic;
        estPublic = val;
        dessinerVisibilite();
        try { await setPublicProfile(moi.id, val); }
        catch (err) { estPublic = avant; dessinerVisibilite(); toast(err.message); }
      };
      zoneVisibilite.appendChild(b);
    });
  }
  dessinerVisibilite();

  /* Notifications : un réglage par type (AccountScreens.kt, bloc Notifications).
     Chaque colonne est lue par `notify-live-session`/`notify-engagement` avant
     d'envoyer un push — le web n'affiche pas de notification lui-même, mais
     c'est le même compte, donc le même réglage. */
  const NOTIFS = [
    ['notify_messages', 'Messages', "Quand quelqu'un t'écrit."],
    ['notify_kudos', "J'aime sur mes séances", "Quand quelqu'un aime une de tes séances."],
    ['notify_comments', 'Commentaires', "Quand quelqu'un commente une de tes séances."],
    ['notify_friend_sessions', "Séance d'un ami",
     "Quand un abonnement commence une séance — tu peux la suivre en direct."]
  ];
  const zoneNotifs = el.querySelector('[data-notifs]');
  NOTIFS.forEach(([colonne, titre, aide]) => {
    let actif = profil[colonne] !== false;
    const ligne = h(`
      <div class="notif-ligne">
        <span class="notif-corps"><b>${esc(titre)}</b><span>${esc(aide)}</span></span>
        <button class="chip-cat ${actif ? 'on' : ''}" type="button">${actif ? 'Activé' : 'Coupé'}</button>
      </div>`);
    const bouton = ligne.querySelector('button');
    bouton.onclick = async () => {
      const avant = actif;
      actif = !actif;
      bouton.classList.toggle('on', actif);
      bouton.textContent = actif ? 'Activé' : 'Coupé';
      try { await setNotifPref(moi.id, colonne, actif); }
      catch (err) {
        actif = avant;
        bouton.classList.toggle('on', actif);
        bouton.textContent = actif ? 'Activé' : 'Coupé';
        toast(err.message);
      }
    };
    zoneNotifs.appendChild(ligne);
  });

  /* Copie sur fichier : Profile.kt::buildBackupJson/restoreBackupJson, mais
     import/export du compte cloud (pas de stockage local séparé côté web) —
     voir backup.js. */
  const msgFichier = el.querySelector('[data-msg-fichier]');
  el.querySelector('[data-exporter]').onclick = async (e) => {
    e.target.disabled = true;
    try {
      const [workouts, programs] = await Promise.all([listWorkouts(moi.id), listPrograms(moi.id)]);
      const json = buildBackupJson({
        workouts: workouts.map(w => w.data), programs: programs.map(p => p.data),
        trainingLevel: niveauActuel(), trainingGoal: objectifActuel()
      });
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'motio-sauvegarde.json';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      msgFichier.textContent = 'Sauvegarde exportée ✓';
    } catch (err) { toast(err.message || "L'export a échoué."); }
    finally { e.target.disabled = false; }
  };

  const champFichier = el.querySelector('[data-fichier]');
  el.querySelector('[data-importer]').onclick = () => champFichier.click();
  champFichier.addEventListener('change', async () => {
    const fichier = champFichier.files?.[0];
    champFichier.value = '';
    if (!fichier) return;
    try {
      const texte = await fichier.text();
      const sauvegarde = parseBackupJson(texte);
      if (!sauvegarde) { msgFichier.style.color = 'var(--accent2)'; msgFichier.textContent = 'Fichier illisible'; return; }
      for (const w of sauvegarde.workouts) await saveWorkout(moi.id, w);
      for (const p of sauvegarde.programs) await saveProgram(moi.id, p);
      if (sauvegarde.trainingLevel) { definirNiveau(sauvegarde.trainingLevel); dessinerChips(el.querySelector('[data-niveaux]'), NIVEAUX, sauvegarde.trainingLevel, definirNiveau); }
      if (sauvegarde.trainingGoal) { definirObjectif(sauvegarde.trainingGoal); dessinerChips(el.querySelector('[data-objectifs]'), OBJECTIFS, sauvegarde.trainingGoal, definirObjectif); }
      msgFichier.style.color = 'var(--accent)';
      msgFichier.textContent = `${sauvegarde.workouts.length} séance${sauvegarde.workouts.length > 1 ? 's' : ''} et ${sauvegarde.programs.length} programme${sauvegarde.programs.length > 1 ? 's' : ''} importés ✓`;
    } catch (err) { toast(err.message || "L'import a échoué."); }
  });

  el.querySelector('[data-pseudo]').onclick = () => {
    const modale = h(`
      <div class="modale" role="dialog" aria-label="Changer de pseudo">
        <div class="modale-boite">
          <div class="modale-tete"><h2>Changer de pseudo</h2></div>
          <label class="champ"><span>Pseudo</span>
            <input type="text" data-nouveau value="${esc(profil.username || '')}" maxlength="24"></label>
          <p class="etat-mono">C'est le nom que tes amis verront, et celui par lequel ils te trouveront.</p>
          <div class="modale-pied">
            <button class="lien-inline" data-annuler type="button">Annuler</button>
            <button class="btn" data-valider type="button">Valider</button>
          </div>
        </div>
      </div>`);
    modale.querySelector('[data-valider]').onclick = async () => {
      const pseudo = modale.querySelector('[data-nouveau]').value.trim();
      if (pseudo.length < 3) return toast('Le pseudo fait 3 caractères minimum.');
      try {
        await setUsername(moi.id, pseudo);
        el.querySelector('[data-nom]').textContent = pseudo.toLowerCase();
        modale.remove();
        toast('Pseudo mis à jour ✓');
      } catch (err) { toast(err.message); }
    };
    modale.querySelector('[data-annuler]').onclick = () => modale.remove();
    modale.addEventListener('click', (e) => { if (e.target === modale) modale.remove(); });
    document.body.appendChild(modale);
  };

  el.querySelector('[data-deconnexion]').onclick = signOut;

  el.querySelector('[data-supprimer]').onclick = () => {
    if (!confirm("Ton profil, tes abonnements et les séances envoyées au serveur seront effacés définitivement. Continuer ?")) return;
    (async () => {
      try {
        await deleteMyAccount();
        await signOut();
      } catch (err) { toast(err.message); }
    })();
  };

  render(el);
}

/** Mise à jour (UpdatePage, TrainingScreens.kt) : le natif vérifie un
 *  version.json et propose d'installer un APK — sans objet ici, une PWA se
 *  met à jour toute seule (service worker, réseau d'abord). Le bouton force
 *  quand même une vérification, pour la même idée de contrôle immédiat. */
export async function vueProfilMaj() {
  const el = h(`
    <section class="page page-etroite">
      ${enTete('Mise à jour')}

      <div class="tonnage-carte" style="margin-top:1.5rem">
        <span>Espace web</span>
        <b style="color:var(--accent)">Toujours à jour</b>
      </div>
      <p class="etat-mono" style="margin-top:.8rem">
        Contrairement à l'application Android, cet espace web n'a pas de version à installer :
        chaque page rechargée avec une connexion récupère automatiquement la dernière mise à jour.
      </p>

      <button class="btn" data-verifier type="button" style="width:100%;margin-top:1rem">Vérifier maintenant</button>
      <p class="etat-mono" data-msg style="margin-top:.6rem"></p>

      <a class="btn btn-ghost" href="#/profil/nouveautes" style="display:block;text-align:center;margin-top:1.5rem">Nouveautés</a>
    </section>`);

  el.querySelector('[data-verifier]').onclick = async () => {
    const msg = el.querySelector('[data-msg]');
    msg.textContent = 'Vérification…';
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
      msg.textContent = 'À jour — la page se recharge…';
      setTimeout(() => location.reload(), 700);
    } catch {
      msg.textContent = 'Déjà à jour.';
    }
  };

  render(el);
}

/** Nouveautés (ChangelogDialog, Changelog.kt) : le plus récent en premier. */
export async function vueProfilNouveautes() {
  const el = h(`
    <section class="page">
      ${enTete('Nouveautés')}
      <div class="menu-groupe" data-liste style="margin-top:1.5rem;background:none"></div>
    </section>`);

  const zone = el.querySelector('[data-liste]');
  [...CHANGELOG].reverse().forEach(entree => {
    zone.appendChild(h(`
      <div class="bloc" style="margin-top:1.4rem;padding-top:0;border-top:none">
        <p class="bloc-titre" style="margin-bottom:.3rem">${esc(entree.versions)} · ${esc(entree.date)}</p>
        <ul class="liste" style="gap:.4rem">
          ${entree.items.map(it => `<li class="ligne" style="padding:.6rem .8rem">${esc(it)}</li>`).join('')}
        </ul>
      </div>`));
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
/** allRecords (Stats.kt), sans le tri pinned-first (fait à l'affichage) :
 *  tous les records estimés, avec la date de leur dernière amélioration
 *  (whenMs) pour le tri par récence des non-épinglés. */
function tousLesRecords(seances) {
  const best = new Map();
  for (const s of seances) {
    for (const ex of (Array.isArray(s.details) ? s.details : [])) {
      for (const st of (ex.s || [])) {
        const rm = estime1RM(st.w || 0, st.r || 0);
        const cur = best.get(ex.n);
        if (!cur || rm > cur.rm) best.set(ex.n, { rm, whenMs: new Date(s.started_at).getTime() });
      }
    }
  }
  return [...best.entries()].map(([nom, v]) => ({ nom, rm: v.rm, whenMs: v.whenMs }));
}

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
  el.insertBefore(socialHeader('Amis', 'amis', unread, () => vueAmis()), el.firstChild);

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
  async function toggleSuivi() {
    b.disabled = true;
    try {
      if (suivi) { await unfollow(moi.id, p.id); suivi = false; }
      else { await follow(moi.id, p.id); suivi = true; }
      b.textContent = suivi ? 'Ne plus suivre' : 'Suivre';
      b.classList.toggle('btn-ghost', suivi);
    } catch (err) { toast(err.message); }
    finally { b.disabled = false; }
  }
  b.onclick = () => {
    if (!suivi) { toggleSuivi(); return; }
    confirmerNePlusSuivre(p.username || 'sans pseudo', toggleSuivi);
  };
  return li;
}

/** PersonRow (SocialScreens.kt ~636-658) : demande confirmation avant de se
 *  désabonner (jamais avant de suivre) — texte natif repris mot pour mot. */
function confirmerNePlusSuivre(username, onConfirme) {
  const modale = h(`
    <div class="modale" role="dialog" aria-label="Ne plus suivre">
      <div class="modale-boite modale-boite-etroite">
        <div class="modale-tete" style="justify-content:center"><h2>Ne plus suivre ${esc(username)} ?</h2></div>
        <p class="etat-mono">Tu ne verras plus ses séances dans ton fil ni ses séances en direct.</p>
        <div class="modale-pied" style="justify-content:center;gap:1.2rem">
          <button class="lien-inline" data-annuler type="button">Annuler</button>
          <button class="lien-inline" data-confirmer type="button" style="color:var(--accent2);font-weight:700">Ne plus suivre</button>
        </div>
      </div>
    </div>`);
  const fermer = () => modale.remove();
  modale.addEventListener('click', (e) => { if (e.target === modale) fermer(); });
  modale.querySelector('[data-annuler]').onclick = fermer;
  modale.querySelector('[data-confirmer]').onclick = () => { fermer(); onConfirme(); };
  document.body.appendChild(modale);
}
