import { h, render, loading, empty, failure, esc, toast, dateCourte, duree } from '../ui.js';
import { listWorkouts, getWorkout, saveWorkout, deleteWorkout,
         listPrograms, saveProgram, sessionsOf, deleteSharedSession } from '../api.js';
import { currentUser } from '../supabase.js';
import { nouvelleSeance, nouvelExercice, dureeSeance, dureeExercice,
         MODES, MODE_LABELS, CATEGORIES_DEFAUT, fmtRecup, kg,
         prochainGroupId, etendueBloc, libelleBloc, GOALS, LEVELS } from '../model.js';
import { GROUPES, CATEGORIES_CATALOGUE, GEARS, devineMateriel, chercher } from '../catalog.js';
import { ouvrirPartage } from '../partage.js';
import { encode as encoderSeance } from '../workout-share.js';
import { ouvrirBilan } from '../bilan.js';
import { niveauActuel } from '../reglages.js';
import { etatBrut as seanceEnCours, effacerEtat as oublierSeanceEnCours } from '../run-state.js';
import { genererProgrammeIA, genererSeanceIA, defaultDaysFor, WEEK_DAYS, WEEK_DAY_LABELS } from '../programme-ia.js';

/* ======================================================== liste des séances
   Reprend exactement TrainingList/WorkoutCard (TrainingScreens.kt) : carte
   Moti, puces de catégorie, cartes colorées par catégorie, groupement par
   bloc. La gestion des catégories et la mise en avant d'un bloc restent
   plus simples ici (pas de dialogue dédié) — le reste est fidèle. */

const WARMUP_SEC = 600;

/** estimateSec (TrainingScreens.kt) : le modèle brut est systématiquement
 *  trop généreux, le facteur 0,9 rapproche l'estimation du terrain. */
function estimatedSec(w) {
  return Math.round((WARMUP_SEC + (w.exercises || []).reduce((t, e) => t + dureeExercice(e), 0)) * 0.9);
}
function displaySec(w) {
  const reelles = (w.history || [])
    .map(s => (s.endedAt || 0) - (s.startedAt || 0))
    .filter(ms => ms >= 60000 && ms <= 4 * 3600000);
  if (!reelles.length) return estimatedSec(w);
  return Math.round(reelles.reduce((a, b) => a + b, 0) / reelles.length / 1000);
}
function durationIsMeasured(w) {
  return (w.history || []).some(s => { const ms = (s.endedAt || 0) - (s.startedAt || 0); return ms >= 60000 && ms <= 4 * 3600000; });
}
function lastDoneAt(w) {
  const h2 = w.history || [];
  return h2.length ? Math.max(...h2.map(s => s.startedAt || 0)) : null;
}
/** fmtEstimate (TrainingScreens.kt) : « 1 h 13 » ou « 45 min ». */
function fmtEstimate(sec) {
  const totalMin = Math.round(sec / 60);
  const hh = Math.floor(totalMin / 60), mm = totalMin % 60;
  return hh > 0 ? `${hh} h ${String(mm).padStart(2, '0')}` : `${mm} min`;
}
function minuit(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
/** fmtDerniereFois (TrainingScreens.kt). */
function fmtDerniereFois(lastMs) {
  if (!lastMs) return 'jamais faite';
  const jours = Math.round((minuit(Date.now()) - minuit(lastMs)) / 86400000);
  if (jours <= 0) return "aujourd'hui";
  if (jours === 1) return 'hier';
  if (jours < 7) return `il y a ${jours} jours`;
  if (jours < 14) return 'il y a 1 semaine';
  if (jours < 60) return `il y a ${Math.floor(jours / 7)} semaines`;
  return `il y a ${Math.floor(jours / 30)} mois`;
}
/** catColor (TrainingScreens.kt) : Push=accent, Pull=second accent, Legs=doré. */
function catColor(cat) {
  return cat === 'Push' ? 'var(--accent)' : cat === 'Pull' ? 'var(--accent2)' : cat === 'Legs' ? 'var(--dore)' : 'var(--encre-2)';
}
const ICONE_HALTERE = '<path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10"/>';

export async function vueSeances() {
  render(loading('Chargement des séances'));
  const moi = await currentUser();

  let rows;
  try { rows = await listWorkouts(moi.id); }
  catch (e) { return render(failure(e, "Les séances n'ont pas pu être chargées")); }

  const el = h(`
    <section class="page">
      <h1 style="margin:0 0 1rem">ENTRAÎNEMENT</h1>

      <a class="moti-card" href="#/coach">
        <img src="../assets/img/moti_avatar.jpg" alt="">
        <span class="corps"><b>Moti</b><span>Ton coach IA — motivation, conseils, où tu en es</span></span>
        <span class="chevron">›</span>
      </a>

      <div data-reprise></div>

      <div class="rangee rangee-serree" style="margin-bottom:1rem">
        <a class="btn btn-ghost" href="#/programmes/nouveau" style="flex:1">Générer un programme</a>
        <button class="btn btn-ghost" data-generer-seance type="button" style="flex:1">Générer une séance</button>
      </div>

      <div data-corps></div>
    </section>`);

  /* Séance laissée en cours (run-state.js) : elle doit se voir et se
     reprendre d'un appui, sans repartir de zéro. L'onglet Entraînement de la
     barre du bas y mène aussi directement (main.js). */
  const enCours = seanceEnCours();
  if (enCours && enCours.userId === moi.id) {
    const series = (enCours.session?.exercises || []).reduce((t, e) => t + (e.sets?.length || 0), 0);
    const depuis = Math.max(0, Math.round((Date.now() - (enCours.session?.startedAt || Date.now())) / 60000));
    const bandeau = h(`
      <div class="reprise-carte">
        <button class="reprise-principal" type="button" data-reprendre>
          <span class="reprise-point"></span>
          <span class="corps">
            <b>Séance en cours — ${esc(enCours.nom || 'Séance')}</b>
            <span>${series} série${series > 1 ? 's' : ''} · commencée il y a ${depuis} min</span>
          </span>
          <span class="chevron">›</span>
        </button>
        <button class="lien-inline reprise-abandon" type="button" data-abandonner>Abandonner cette séance</button>
      </div>`);
    bandeau.querySelector('[data-reprendre]').onclick = () => {
      location.hash = `#/seances/${enCours.workoutId}/lancer`;
    };
    bandeau.querySelector('[data-abandonner]').onclick = () => {
      if (!confirm('Abandonner la séance en cours ? Les séries déjà faites seront perdues.')) return;
      oublierSeanceEnCours();
      bandeau.remove();
      toast('Séance abandonnée.');
    };
    el.querySelector('[data-reprise]').appendChild(bandeau);
  }

  /* Génération d'UNE séance par IA (genererSeanceIA, programme-ia.js) —
     manquait sur l'écran principal côté web alors que TrainingList (natif)
     a ce bouton juste à côté de « Programme », signalé par Nicolas. */
  el.querySelector('[data-generer-seance]').onclick = () => ouvrirGenerationSeanceIA();

  function ouvrirGenerationSeanceIA() {
    let goalText = '', niveau = niveauActuel(), gears = [];
    const modale = h(`
      <div class="modale" role="dialog" aria-label="Générer une séance">
        <div class="modale-boite">
          <div class="modale-tete"><h2>Générer une séance</h2></div>
          <label class="champ"><span>Quel type de séance ?</span>
            <textarea data-objectif rows="3" maxlength="300" placeholder="Ex. : pecs et triceps, 45 minutes, matériel limité."></textarea></label>
          <p class="champ-label" style="margin-top:.8rem">Niveau</p>
          <div class="rangee rangee-serree" data-niveau style="margin-bottom:.6rem"></div>
          <p class="champ-label">Matériel disponible (aucun coché = tout matériel)</p>
          <div class="rangee rangee-serree" data-materiel></div>
          <div class="modale-pied">
            <button class="lien-inline" data-annuler type="button">Annuler</button>
            <button class="btn" data-generer type="button">Générer</button>
          </div>
        </div>
      </div>`);

    modale.querySelector('[data-objectif]').addEventListener('input', (e) => { goalText = e.target.value; });

    const zoneNiveau = modale.querySelector('[data-niveau]');
    LEVELS.forEach(l => {
      const b = h(`<button class="chip-cat ${l.id === niveau ? 'on' : ''}" type="button">${esc(l.label)}</button>`);
      b.onclick = () => {
        niveau = l.id;
        zoneNiveau.querySelectorAll('.chip-cat').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
      };
      zoneNiveau.appendChild(b);
    });

    const zoneMateriel = modale.querySelector('[data-materiel]');
    Object.entries(GEARS).forEach(([id, g]) => {
      const b = h(`<button class="chip-cat" type="button">${esc(g.label)}</button>`);
      b.onclick = () => {
        b.classList.toggle('on');
        gears = b.classList.contains('on') ? [...gears, id] : gears.filter(x => x !== id);
      };
      zoneMateriel.appendChild(b);
    });

    modale.querySelector('[data-annuler]').onclick = () => modale.remove();
    modale.addEventListener('click', (e) => { if (e.target === modale) modale.remove(); });
    modale.querySelector('[data-generer]').onclick = async (e) => {
      const objectif = goalText.trim();
      if (!objectif) return toast('Décris le type de séance voulu.');
      e.target.disabled = true; e.target.textContent = 'Génération… (20-30 s)';
      try {
        const { workout, notes } = await genererSeanceIA({ goalText: objectif, level: niveau, gears });
        modale.remove();
        ouvrirApercuSeanceIA(workout, notes);
      } catch (err) {
        toast(err.message || 'La génération a échoué.');
        e.target.disabled = false; e.target.textContent = 'Générer';
      }
    };
    document.body.appendChild(modale);
  }

  /** Aperçu avant enregistrement — rien n'est écrit tant que « Ajouter à mes
   *  séances » n'a pas été pressé, même principe que l'aperçu de programme. */
  function ouvrirApercuSeanceIA(workout, notes) {
    const modale = h(`
      <div class="modale" role="dialog" aria-label="Séance proposée">
        <div class="modale-boite">
          <div class="modale-tete"><h2>Séance proposée</h2></div>
          <label class="champ"><span>Nom</span>
            <input type="text" data-nom value="${esc(workout.name)}" maxlength="60"></label>
          ${notes ? `<p class="etat-mono" style="margin-top:.4rem">${esc(notes)}</p>` : ''}
          <ul class="liste" style="margin-top:.8rem">
            ${workout.exercises.map(ex => `
              <li class="ligne">
                <span class="ligne-titre">${esc(ex.name)}</span>
                <span class="ligne-meta">${ex.plannedSets} × ${ex.targetReps}</span>
              </li>`).join('')}
          </ul>
          <div class="modale-pied">
            <button class="lien-inline" data-annuler type="button">Annuler</button>
            <button class="btn" data-ajouter type="button">Ajouter à mes séances</button>
          </div>
        </div>
      </div>`);
    modale.querySelector('[data-annuler]').onclick = () => modale.remove();
    modale.addEventListener('click', (e) => { if (e.target === modale) modale.remove(); });
    modale.querySelector('[data-ajouter]').onclick = async (e) => {
      const nom = modale.querySelector('[data-nom]').value.trim();
      if (nom) workout.name = nom;
      e.target.disabled = true;
      try {
        await saveWorkout(moi.id, workout);
        modale.remove();
        toast('Séance ajoutée ✓');
        vueSeances();
      } catch (err) { toast(err.message); e.target.disabled = false; }
    };
    document.body.appendChild(modale);
  }

  const corps = el.querySelector('[data-corps]');

  if (!rows.length) {
    corps.appendChild(empty(
      'Aucune séance',
      'Une séance est un modèle : des exercices, des séries et des temps de repos, à relancer autant de fois que tu veux.',
      { href: '#/seances/nouvelle', label: 'Créer une séance' }
    ));
    return render(el);
  }

  const zoneListe = h('<div></div>');
  corps.appendChild(zoneListe);

  function carteSeance(s, dansBloc, aFaire) {
    const w = s.data || {};
    const a = h(`
      <button class="wcard" type="button">
        <span class="wcard-ico" style="background:${catColor(s.category)}">
          <svg viewBox="0 0 24 24" aria-hidden="true">${ICONE_HALTERE}</svg>
        </span>
        <span class="corps">
          <span class="titre-row">
            ${w.pinned ? '<span class="pin">📌</span>' : ''}
            <b>${esc(dansBloc ? s.category : (s.name || `Séance ${s.category}`))}</b>
            ${aFaire ? '<span class="badge-faire">à faire</span>' : ''}
          </span>
          <span class="meta">${dansBloc ? '' : esc(s.category) + ' · '}${(w.exercises || []).length} exos · ${fmtDerniereFois(lastDoneAt(w))}</span>
          <span class="duree">⏱ ${durationIsMeasured(w) ? fmtEstimate(displaySec(w)) + ' en moyenne' : 'environ ' + fmtEstimate(displaySec(w))}</span>
        </span>
        <span class="chevron">›</span>
      </button>`);
    a.onclick = () => ouvrirMenuAction(s);
    return a;
  }

  /** Menu d'action sur une carte de séance — reprend l'AlertDialog natif
   *  (TrainingScreens.kt ~510-573) : aperçu, Détacher/Partager, Démarrer,
   *  Modifier/Voir l'historique/Supprimer/Annuler. Auparavant la carte
   *  menait directement à l'écran d'édition, sans jamais passer par ici. */
  function ouvrirMenuAction(s) {
    const w = s.data || {};
    const nom = w.name || `Séance ${s.category}`;
    /* timesDone (Workout.kt) est un getter calculé (history.size), jamais
       sérialisé dans le JSON synchronisé — il faut le recalculer ici,
       comme le font déjà durationIsMeasured/lastDoneAt plus haut. */
    const fois = (w.history || []).length;
    const dureeTxt = durationIsMeasured(w)
      ? `Durée moyenne constatée : ${fmtEstimate(displaySec(w))}`
      : `Durée estimée : environ ${fmtEstimate(displaySec(w))}`;

    const modale = h(`
      <div class="modale" role="dialog" aria-label="Actions séance">
        <div class="modale-boite modale-boite-etroite menu-action">
          <p class="menu-action-titre">${esc(nom)}</p>
          <p class="menu-action-sous">${esc(s.category)} · ${(w.exercises || []).length} exos · fait ${fois}×</p>
          <p class="menu-action-duree">${esc(dureeTxt)}</p>

          <div class="menu-action-icones">
            <button class="menu-action-icone ${w.pinned ? 'on' : ''}" data-pin type="button">
              <span>📌</span><span>${w.pinned ? 'Détacher' : 'Épingler'}</span>
            </button>
            <button class="menu-action-icone" data-partager type="button">
              <span>📤</span><span>Partager</span>
            </button>
          </div>

          <button class="btn btn-lg menu-action-demarrer" data-demarrer type="button">Démarrer la séance</button>

          <div class="menu-action-lignes">
            <button class="menu-action-ligne" data-modifier type="button">Modifier</button>
            ${fois > 0 ? '<button class="menu-action-ligne" data-historique type="button">Voir l\'historique</button>' : ''}
            <button class="menu-action-ligne menu-action-ligne-danger" data-supprimer type="button">Supprimer</button>
          </div>

          <button class="lien-inline menu-action-annuler" data-fermer type="button">Annuler</button>
        </div>
      </div>`);

    const fermer = () => modale.remove();
    modale.addEventListener('click', (e) => { if (e.target === modale) fermer(); });
    modale.querySelector('[data-fermer]').onclick = fermer;

    modale.querySelector('[data-pin]').onclick = async () => {
      fermer();
      w.pinned = !w.pinned;
      try { await saveWorkout(moi.id, w); dessinerListe(); }
      catch (err) { toast(err.message); w.pinned = !w.pinned; }
    };

    modale.querySelector('[data-partager]').onclick = () => { fermer(); ouvrirPartageSeance(w, nom); };

    modale.querySelector('[data-demarrer]').onclick = () => { fermer(); location.hash = `#/seances/${s.local_id}/lancer`; };
    modale.querySelector('[data-modifier]').onclick = () => { fermer(); location.hash = `#/seances/${s.local_id}`; };
    modale.querySelector('[data-historique]')?.addEventListener('click', () => { fermer(); location.hash = `#/seances/${s.local_id}/historique`; });
    modale.querySelector('[data-supprimer]').onclick = async () => {
      fermer();
      if (!confirm(`« ${nom} » et tout son historique seront supprimés. C'est définitif.`)) return;
      try {
        await deleteWorkout(moi.id, s.local_id);
        rows = rows.filter(r => r.local_id !== s.local_id);
        dessinerListe();
        toast('Séance supprimée.');
      } catch (err) { toast(err.message); }
    };

    document.body.appendChild(modale);
  }

  /** Sous-menu de partage (TrainingScreens.kt ~575-603) : deux façons de
   *  transmettre une séance, une seule idée — la personne en face n'a rien
   *  à installer ni à saisir. */
  function ouvrirPartageSeance(w, nom) {
    const modale = h(`
      <div class="modale" role="dialog" aria-label="Partager la séance">
        <div class="modale-boite modale-boite-etroite">
          <div class="modale-tete" style="justify-content:center"><h2>Partager la séance</h2></div>
          <p class="menu-action-sous">${esc(nom)}</p>
          <div class="menu-action-lignes">
            <button class="menu-action-ligne" data-lien type="button">Envoyer un lien</button>
            <p class="partage-aide">WhatsApp, SMS, e-mail… le lien importe la séance d'un appui.</p>
            <button class="menu-action-ligne" data-qr type="button">Afficher le QR code</button>
            <p class="partage-aide">À scanner sur place, avec l'appareil photo d'en face.</p>
          </div>
          <button class="lien-inline menu-action-annuler" data-fermer type="button">Fermer</button>
        </div>
      </div>`);
    const fermer = () => modale.remove();
    modale.addEventListener('click', (e) => { if (e.target === modale) fermer(); });
    modale.querySelector('[data-fermer]').onclick = fermer;
    modale.querySelector('[data-lien]').onclick = async () => { fermer(); await envoyerLienSeance(w, nom); };
    modale.querySelector('[data-qr]').onclick = async () => { fermer(); await ouvrirQrSeance(w, nom); };
    document.body.appendChild(modale);
  }

  async function envoyerLienSeance(w, nom) {
    try {
      const code = await encoderSeance(w);
      const url = `${location.origin}${location.pathname}#/seances/importer/${code}`;
      if (navigator.share) {
        await navigator.share({ title: nom, text: `Découvre ma séance « ${nom} » sur Motio`, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast('Lien de la séance copié.');
      }
    } catch (err) { if (err.name !== 'AbortError') toast(err.message || 'Le partage a échoué.'); }
  }

  /** QrDialog (TrainingScreens.kt ~646-675) : fond forcé en blanc (le QR
   *  doit rester lisible même en thème sombre), même lien que « Envoyer un
   *  lien », juste encodé en image plutôt qu'envoyé par un canal externe. */
  async function ouvrirQrSeance(w, nom) {
    const modale = h(`
      <div class="modale" role="dialog" aria-label="QR code de la séance">
        <div class="modale-boite modale-boite-etroite">
          <div class="modale-tete" style="justify-content:center"><h2>${esc(nom)}</h2></div>
          <div class="qr-surface" data-zone><canvas class="qr-canvas" data-canvas></canvas></div>
          <p class="etat-mono">À scanner avec l'appareil photo de l'autre téléphone.</p>
          <div class="modale-pied" style="justify-content:center"><button class="btn" data-fermer type="button">Fermer</button></div>
        </div>
      </div>`);
    const fermer = () => modale.remove();
    modale.addEventListener('click', (e) => { if (e.target === modale) fermer(); });
    modale.querySelector('[data-fermer]').onclick = fermer;
    document.body.appendChild(modale);

    try {
      const code = await encoderSeance(w);
      const url = `${location.origin}${location.pathname}#/seances/importer/${code}`;
      const { dessinerQR } = await import('../qr.js');
      const ok = await dessinerQR(modale.querySelector('[data-canvas]'), url, 900);
      if (!ok) throw new Error('trop long');
    } catch {
      modale.querySelector('[data-zone]').replaceChildren(
        h('<p class="etat-mono">Le QR code n\'a pas pu être créé pour cette séance.</p>'));
    }
  }

  function dessinerListe() {
    zoneListe.replaceChildren();
    if (!rows.length) {
      zoneListe.appendChild(h('<p class="etat-mono">Aucun entraînement pour l\'instant.</p>'));
    } else {
      const blocs = new Map();
      const isolees = [];
      rows.forEach(s => {
        const section = (s.data || {}).section;
        if (section) { if (!blocs.has(section)) blocs.set(section, []); blocs.get(section).push(s); }
        else isolees.push(s);
      });
      for (const [nom, seances] of blocs) {
        const triees = [...seances].sort((a, b) => (lastDoneAt(a.data || {}) || 0) - (lastDoneAt(b.data || {}) || 0));
        zoneListe.appendChild(h(`<p class="wcard-sec">${esc(nom)}</p>`));
        triees.forEach((s, i) => zoneListe.appendChild(carteSeance(s, true, i === 0 && triees.length > 1)));
      }
      if (isolees.length) {
        if (blocs.size) zoneListe.appendChild(h('<p class="wcard-sec">HORS BLOC</p>'));
        isolees.forEach(s => zoneListe.appendChild(carteSeance(s, false, false)));
      }
    }
    const pied = h(`
      <div style="margin-top:1.5rem">
        <a class="btn btn-lg" href="#/seances/nouvelle" style="display:block;text-align:center">＋ Nouvel entraînement</a>
      </div>`);
    zoneListe.appendChild(pied);
  }

  dessinerListe();
  render(el);
}

/* ================================================== import par lien/code */

/** Reçu depuis « Partager » (ouvrirMenuAction, ci-dessus) : décode le code
 *  et propose d'ajouter la séance à ses propres entraînements, sans jamais
 *  écraser une séance existante (nouvel id, historique vide). */
export async function vueImporterSeance(params) {
  render(loading('Lecture de la séance'));
  const moi = await currentUser();

  const { decode } = await import('../workout-share.js');
  const w = await decode(params.code);
  if (!w) {
    return render(empty(
      'Séance illisible',
      "Ce lien de séance est invalide ou corrompu.",
      { href: '#/seances', label: 'Retour à Entraînement' }
    ));
  }

  const el = h(`
    <section class="page page-etroite">
      <p class="eyebrow">Séance reçue</p>
      <h1>${esc(w.name || `Séance ${w.category}`)}</h1>
      <p class="meta">${esc(w.category)} · ${w.exercises.length} exos</p>
      <ul class="liste" style="margin-top:1.25rem">
        ${w.exercises.map(ex => `<li class="ligne"><span class="ligne-titre">${esc(ex.name)}</span></li>`).join('')}
      </ul>
      <button class="btn btn-lg" data-importer type="button" style="width:100%;margin-top:1.5rem">Importer cette séance</button>
    </section>`);

  el.querySelector('[data-importer]').onclick = async (e) => {
    e.target.disabled = true;
    try {
      await saveWorkout(moi.id, w);
      toast('Séance importée.');
      location.hash = '#/seances';
    } catch (err) { toast(err.message); e.target.disabled = false; }
  };

  render(el);
}

/* ============================================================= éditeur */

export async function vueSeanceEdition(params) {
  const moi = await currentUser();
  const neuve = params.id === 'nouvelle';

  let seance, autres = [];
  if (neuve) {
    seance = nouvelleSeance('', CATEGORIES_DEFAUT[0]);
    try { autres = await listWorkouts(moi.id); } catch { /* pas bloquant */ }
  } else {
    render(loading('Chargement de la séance'));
    try {
      const [row, mine] = await Promise.all([getWorkout(moi.id, params.id), listWorkouts(moi.id)]);
      if (!row) return render(empty('Séance introuvable', 'Elle a peut-être été supprimée.',
        { href: '#/seances', label: 'Retour aux séances' }));
      seance = row.data;
      autres = mine;
    } catch (e) { return render(failure(e, "La séance n'a pas pu être chargée")); }
  }
  if (!seance.section) seance.section = '';

  const cats = [...new Set([...CATEGORIES_DEFAUT, ...autres.map(w => w.category).filter(Boolean)])];
  const sections = [...new Set(autres.map(w => (w.data || {}).section).filter(Boolean))];

  const el = h(`
    <section class="page">
      <h1 style="text-transform:uppercase">${neuve ? 'Nouvelle séance' : 'Modifier la séance'}</h1>

      <label class="champ"><span>Nom</span>
        <input type="text" data-nom maxlength="60" placeholder="Push A" value="${esc(seance.name || '')}"></label>

      <p class="champ-label">Catégorie</p>
      <div class="rangee rangee-serree" data-cats style="margin-bottom:1rem"></div>

      <p class="champ-label">Bloc d'entraînement</p>
      <div class="rangee rangee-serree" data-sections style="margin-bottom:.5rem"></div>
      <label class="champ" data-champ-section hidden><span>Nom du bloc</span>
        <input type="text" data-section-nom maxlength="40" placeholder="Force + hypertrophie"></label>

      <div class="bloc">
        <p class="bloc-titre">Exercices</p>
        <div class="exos-liste" data-exos></div>
        <button class="btn btn-ghost" data-ajouter style="width:100%">＋ Ajouter un exercice</button>
      </div>

      <div class="estim-panel">
        <span>Durée estimée de la séance</span>
        <b data-estim>—</b>
      </div>

      <div class="barre-action" style="display:flex;gap:.6rem;margin-top:1.25rem">
        <a class="btn btn-ghost" href="#/seances" style="flex:1;text-align:center">Annuler</a>
        <button class="btn btn-ghost" data-enregistrer style="flex:1">Enregistrer</button>
        <button class="btn" data-demarrer style="flex:1">Démarrer</button>
      </div>
    </section>`);

  let newSection = false;
  const zoneCats = el.querySelector('[data-cats]');
  const zoneSections = el.querySelector('[data-sections]');
  const champSection = el.querySelector('[data-champ-section]');
  const inputSection = el.querySelector('[data-section-nom]');

  function dessinerCats() {
    zoneCats.replaceChildren();
    cats.forEach(c => {
      const b = h(`<button class="chip-cat ${seance.category === c ? 'on' : ''}" type="button">${esc(c)}</button>`);
      b.onclick = () => { seance.category = c; dessinerCats(); };
      zoneCats.appendChild(b);
    });
  }
  function dessinerSections() {
    zoneSections.replaceChildren();
    const bAucun = h(`<button class="chip-cat ${!seance.section ? 'on' : ''}" type="button">Aucun</button>`);
    bAucun.onclick = () => { seance.section = ''; newSection = false; dessinerSections(); };
    zoneSections.appendChild(bAucun);
    sections.forEach(s => {
      const b = h(`<button class="chip-cat ${seance.section === s && !newSection ? 'on' : ''}" type="button">${esc(s)}</button>`);
      b.onclick = () => { seance.section = s; newSection = false; dessinerSections(); };
      zoneSections.appendChild(b);
    });
    const bNouveau = h(`<button class="chip-cat ${newSection ? 'on' : ''}" type="button">＋ Nouveau</button>`);
    bNouveau.onclick = () => {
      newSection = true;
      if (sections.includes(seance.section)) seance.section = '';
      dessinerSections();
    };
    zoneSections.appendChild(bNouveau);
    champSection.hidden = !newSection;
    if (newSection) inputSection.value = seance.section;
  }
  inputSection.addEventListener('input', () => { seance.section = inputSection.value; });
  dessinerCats();
  dessinerSections();

  const zone = el.querySelector('[data-exos]');
  const estim = el.querySelector('[data-estim]');

  function redessiner() {
    // « Enchaîner » recrée tout le bloc (zone.replaceChildren()) : le bouton
    // tapé disparaît du DOM et perd le focus, ce qui faisait remonter la
    // page en haut sur certains navigateurs — signalé par Nicolas. On mémorise
    // la position de défilement et on la restaure juste après le redessin.
    const y = window.scrollY;
    zone.replaceChildren();
    seance.exercises.forEach((ex, i) => {
      zone.appendChild(carteExercice(ex, i));
      if (i < seance.exercises.length - 1) zone.appendChild(lienEnchainer(i));
    });
    estim.textContent = 'environ ' + fmtEstimate(estimatedSec(seance));
    window.scrollTo(0, y);
  }

  function lienEnchainer(i) {
    const ex = seance.exercises[i], suivant = seance.exercises[i + 1];
    const linked = ex.groupId !== 0 && ex.groupId === suivant.groupId;
    const b = h(`<button class="lien-enchainer ${linked ? 'on' : ''}" type="button">${linked ? '⌐ enchaîné sans repos' : '＋ enchaîner'}</button>`);
    b.onclick = () => {
      if (linked) {
        const g = suivant.groupId;
        const encoreLie = i + 2 <= seance.exercises.length - 1 && seance.exercises[i + 2].groupId === g;
        ex.groupId = (i > 0 && seance.exercises[i - 1].groupId === g) ? g : 0;
        if (!encoreLie) suivant.groupId = 0;
      } else {
        const g = (ex.groupId !== 0 ? ex.groupId : null) ?? (suivant.groupId !== 0 ? suivant.groupId : null) ?? prochainGroupId(seance.exercises);
        ex.groupId = g; suivant.groupId = g;
      }
      redessiner();
    };
    return b;
  }

  function carteExercice(ex, i) {
    const [a, b] = etendueBloc(seance.exercises, i);
    const etiquette = libelleBloc(b - a + 1);

    const c = h(`
      <div class="exo-edit">
        <div class="exo-edit-tete">
          <span class="exo-edit-poignee">⠿</span>
          <span class="exo-edit-nom">${i + 1}.  ${esc(ex.name || `Exercice ${i + 1}`)}</span>
          <span class="exo-edit-suppr">✕</span>
        </div>
        <p class="exo-edit-meta">${ex.plannedSets} séries${ex.targetReps ? ` × ${ex.targetReps} reps` : ''} · ${esc(labelMode(ex))}
          ${etiquette && b - a + 1 > 1 ? `<span class="etiquette">${esc(etiquette)}</span>` : ''}</p>

        <div class="rangee rangee-serree" data-champs></div>
        <button class="lien-inline" data-deplier type="button">Régler ce mode</button>
      </div>`);

    const champs = c.querySelector('[data-champs]');
    champs.hidden = true;
    const tabata = ex.mode === 'TABATA';
    const minuteur = ex.mode === 'MINUTEUR';
    champs.appendChild(h(`
      <label class="champ champ-mini"><span>Mode</span>
        <select data-mode>${MODES.map(m => `<option value="${m}"${m === ex.mode ? ' selected' : ''}>${MODE_LABELS[m]}</option>`).join('')}</select></label>`));
    if (!tabata) {
      champs.appendChild(h(`<label class="champ champ-mini"><span>Séries</span><input type="number" min="1" max="20" data-series value="${ex.plannedSets}"></label>`));
      champs.appendChild(h(`<label class="champ champ-mini"><span>Répétitions</span><input type="number" min="0" max="100" data-reps value="${ex.targetReps}"></label>`));
    }
    if (minuteur) champs.appendChild(h(`<label class="champ champ-mini"><span>Récup (s)</span><input type="number" min="0" max="600" step="15" data-recup value="${ex.recupSec}"></label>`));
    if (tabata) {
      champs.appendChild(h(`<label class="champ champ-mini"><span>Travail (s)</span><input type="number" min="5" max="300" data-work value="${ex.workSec}"></label>`));
      champs.appendChild(h(`<label class="champ champ-mini"><span>Repos (s)</span><input type="number" min="0" max="300" data-rest value="${ex.restSec}"></label>`));
      champs.appendChild(h(`<label class="champ champ-mini"><span>Blocs</span><input type="number" min="1" max="30" data-blocs value="${ex.tabataSeries}"></label>`));
    }

    c.querySelector('[data-deplier]').onclick = (e) => {
      champs.hidden = !champs.hidden;
      e.target.textContent = champs.hidden ? 'Régler ce mode' : 'Masquer';
    };

    const lie = (sel, champ) => {
      c.querySelector(sel)?.addEventListener('change', (e) => {
        const v = parseInt(e.target.value, 10);
        ex[champ] = Number.isNaN(v) ? 0 : v;
        redessiner();
      });
    };
    c.querySelector('[data-mode]').addEventListener('change', (e) => { ex.mode = e.target.value; redessiner(); });
    lie('[data-series]', 'plannedSets'); lie('[data-reps]', 'targetReps'); lie('[data-recup]', 'recupSec');
    lie('[data-work]', 'workSec'); lie('[data-rest]', 'restSec'); lie('[data-blocs]', 'tabataSeries');

    c.querySelector('.exo-edit-suppr').onclick = () => { seance.exercises.splice(i, 1); redessiner(); };
    c.querySelector('.exo-edit-poignee').onclick = () => {
      if (i > 0) { [seance.exercises[i - 1], seance.exercises[i]] = [seance.exercises[i], seance.exercises[i - 1]]; redessiner(); }
    };
    return c;
  }

  function labelMode(ex) {
    if (ex.mode === 'MINUTEUR') return 'Minuteur ' + fmtRecup(ex.recupSec);
    if (ex.mode === 'TABATA') return `Tabata ${ex.workSec}/${ex.restSec}×${ex.tabataSeries}`;
    return 'Chrono';
  }

  el.querySelector('[data-ajouter]').onclick = () => {
    ouvrirCatalogue((nom) => {
      seance.exercises.push(nouvelExercice(nom));
      redessiner();
    });
  };

  async function sauvegarder() {
    seance.name = el.querySelector('[data-nom]').value.trim();
    if (!seance.name) { toast('Donne un nom à la séance.'); return false; }
    if (!seance.exercises.length) { toast('Ajoute au moins un exercice.'); return false; }
    await saveWorkout(moi.id, seance);
    return true;
  }

  el.querySelector('[data-demarrer]').onclick = async (e) => {
    e.target.disabled = true;
    try {
      if (await sauvegarder()) location.hash = `#/seances/${seance.id}/lancer`;
      else e.target.disabled = false;
    } catch (err) { toast(err.message); e.target.disabled = false; }
  };

  el.querySelector('[data-enregistrer]').onclick = async (e) => {
    e.target.disabled = true;
    try {
      if (await sauvegarder()) { toast('Séance enregistrée.'); location.hash = '#/seances'; }
      else e.target.disabled = false;
    } catch (err) { toast(err.message); e.target.disabled = false; }
  };

  redessiner();
  render(el);
}

/* ================================================= sélecteur d'exercice */

export function ouvrirCatalogue(choisir) {
  const modale = h(`
    <div class="modale" role="dialog" aria-label="Choisir un exercice">
      <div class="modale-boite">
        <div class="modale-tete">
          <h2>Choisir un exercice</h2>
          <button class="lien-inline" data-fermer>Fermer</button>
        </div>
        <label class="champ"><span>Rechercher</span>
          <input type="search" data-q placeholder="squat, poulie, biceps…" autofocus></label>
        <div class="modale-corps" data-corps></div>
        <div class="modale-pied">
          <label class="champ"><span>Ou saisir un nom libre</span>
            <input type="text" data-libre maxlength="60"></label>
          <button class="btn btn-sm" data-valider-libre>Ajouter</button>
        </div>
      </div>
    </div>`);

  const corps = modale.querySelector('[data-corps]');

  /**
   * Les groupes musculaires dans l'ordre du catalogue, chacun sous la
   * catégorie qui l'utilise. « Full body » n'apparaît pas : elle contient tous
   * les groupes, la répéter n'apporterait rien ici.
   */
  function listerTout() {
    corps.replaceChildren();
    const vus = new Set();
    for (const cat of CATEGORIES_CATALOGUE) {
      if (cat.tous) continue;
      corps.appendChild(h(`<p class="cat-nom">${esc(cat.nom)}</p>`));
      for (const gid of cat.groupes) {
        const g = GROUPES.find(x => x.id === gid);
        if (!g) continue;
        vus.add(g.id);
        corps.appendChild(groupe(g));
      }
    }
    const restants = GROUPES.filter(g => !vus.has(g.id));
    if (restants.length) {
      corps.appendChild(h(`<p class="cat-nom">Autres</p>`));
      restants.forEach(g => corps.appendChild(groupe(g)));
    }
  }

  function groupe(g) {
    const grp = h(`<div class="grp"><p class="grp-nom">${esc(g.nom)}</p>
      <div class="puces" data-puces></div></div>`);
    const p = grp.querySelector('[data-puces]');
    for (const nom of g.exercices) p.appendChild(bouton(nom));
    return grp;
  }

  function bouton(nom) {
    const b = h(`<button class="puce">${esc(nom)}</button>`);
    b.onclick = () => { choisir(nom); modale.remove(); };
    return b;
  }

  modale.querySelector('[data-q]').addEventListener('input', (e) => {
    const q = e.target.value;
    if (q.trim().length < 2) return listerTout();
    corps.replaceChildren();
    const trouves = chercher(q);
    if (!trouves.length) {
      corps.appendChild(h(`<p class="etat-mono">Aucun exercice. Saisis un nom libre en bas.</p>`));
      return;
    }
    const p = h('<div class="puces"></div>');
    for (const ex of trouves) p.appendChild(bouton(ex.nom));
    corps.appendChild(p);
  });

  modale.querySelector('[data-valider-libre]').onclick = () => {
    const nom = modale.querySelector('[data-libre]').value.trim();
    if (!nom) return toast('Saisis un nom.');
    choisir(nom); modale.remove();
  };

  modale.querySelector('[data-fermer]').onclick = () => modale.remove();
  modale.addEventListener('click', (e) => { if (e.target === modale) modale.remove(); });
  document.addEventListener('keydown', function esc_(e) {
    if (e.key === 'Escape') { modale.remove(); document.removeEventListener('keydown', esc_); }
  });

  listerTout();
  document.body.appendChild(modale);
}

/* ========================================================== programmes */

export async function vueProgrammes() {
  render(loading('Chargement des programmes'));
  const moi = await currentUser();

  let programmes;
  try { programmes = await listPrograms(moi.id); }
  catch (e) { return render(failure(e, "Les programmes n'ont pas pu être chargés")); }

  if (!programmes.length) {
    return render(empty(
      'Aucun programme',
      'Un programme répartit tes séances sur les semaines et fait monter les charges tout seul.',
      { href: '#/programmes/nouveau', label: 'Générer un programme' }
    ));
  }

  const el = h(`
    <section class="page">
      <p class="eyebrow">Entraînement</p>
      <h1>Programmes</h1>
      <a class="btn" href="#/programmes/nouveau">Générer un programme</a>
      <ul class="liste" data-liste></ul>
    </section>`);

  const ul = el.querySelector('[data-liste]');
  for (const p of programmes) {
    const d = p.data || {};
    const faites = (d.sessions || []).filter(s => s.doneAt > 0).length;
    const total = (d.sessions || []).length;
    ul.appendChild(h(`
      <li class="ligne">
        <div class="ligne-tete">
          <span class="ligne-titre">${esc(p.name)}</span>
          <span class="ligne-meta">${esc(dateCourte(p.updated_at))}</span>
        </div>
        <p class="ligne-stats">
          <span>${d.weeks || '?'} semaines</span>
          <span>${d.daysPerWeek || '?'} séances / semaine</span>
          <span>${faites} / ${total} faites</span>
        </p>
      </li>`));
  }
  render(el);
}

/** AiProgramWizard (ProgramScreens.kt ~378-530) : objectif en texte libre,
 *  pas les 4 gabarits fixes de GOALS — la fonction Edge generate-program
 *  attend goal_text, pas un Goal enum (Goal.PERSONNALISE n'existe QUE comme
 *  résultat de cette génération, jamais comme choix manuel). L'algorithme
 *  maison à règles fixes (ProgramGenerator.kt, sans IA) n'est pas porté ici
 *  — c'est bien AiProgramGenerator/generate-program que ce point du chantier
 *  visait. */
export async function vueProgrammeNouveau() {
  render(loading('Chargement'));
  const moi = await currentUser();

  const el = h(`<section class="page page-etroite"></section>`);
  render(el);

  let etat = {
    goalText: '', level: niveauActuel(), daysPerWeek: 3, weeks: 8,
    gears: [], weekdays: defaultDaysFor(3), heure: '18:00',
    date: new Date().toISOString().slice(0, 10)
  };

  dessinerFormulaire();

  function dessinerFormulaire() {
    el.replaceChildren(h(`
      <div>
        <p class="eyebrow">Entraînement</p>
        <h1>Générer un programme</h1>
        <p class="lede">Décris ton objectif avec tes mots — Moti construit une
          périodisation par blocs adaptée, avec les exercices de ton catalogue.</p>

        <label class="champ"><span>Objectif précis</span>
          <textarea data-objectif rows="4" maxlength="600"
            placeholder="Ex. : progresser au développé couché pour atteindre 100 kg d'ici 8 semaines, 3 séances par semaine, je suis intermédiaire.">${esc(etat.goalText)}</textarea></label>

        <div class="rangee">
          <label class="champ"><span>Niveau</span>
            <select data-niveau>${LEVELS.map(l => `<option value="${l.id}" ${l.id === etat.level ? 'selected' : ''}>${esc(l.label)}</option>`).join('')}</select></label>
          <label class="champ champ-mini"><span>Semaines</span>
            <select data-semaines>${[4, 6, 8, 12].map(n => `<option value="${n}" ${n === etat.weeks ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        </div>
        <div class="rangee">
          <label class="champ champ-mini"><span>Séances / semaine</span>
            <select data-jours-semaine>${[2, 3, 4, 5, 6].map(n => `<option value="${n}" ${n === etat.daysPerWeek ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label class="champ champ-mini"><span>Heure des séances</span>
            <input type="time" data-heure value="${esc(etat.heure)}"></label>
          <label class="champ champ-mini"><span>1ʳᵉ séance à partir du</span>
            <input type="date" data-date value="${esc(etat.date)}"></label>
        </div>

        <p class="champ-label">Jours d'entraînement</p>
        <div class="rangee rangee-serree" data-jours style="margin-bottom:1rem"></div>

        <p class="champ-label">Matériel disponible (aucun coché = tout matériel)</p>
        <div class="rangee rangee-serree" data-materiel style="margin-bottom:1.25rem"></div>

        <button class="btn btn-lg" data-generer type="button" style="width:100%">Générer le programme</button>
      </div>`));

    el.querySelector('[data-objectif]').addEventListener('input', (e) => { etat.goalText = e.target.value; });
    el.querySelector('[data-niveau]').addEventListener('change', (e) => { etat.level = e.target.value; });
    el.querySelector('[data-semaines]').addEventListener('change', (e) => { etat.weeks = Number(e.target.value); });
    el.querySelector('[data-heure]').addEventListener('input', (e) => { etat.heure = e.target.value; });
    el.querySelector('[data-date]').addEventListener('input', (e) => { etat.date = e.target.value; });
    el.querySelector('[data-jours-semaine]').addEventListener('change', (e) => {
      etat.daysPerWeek = Number(e.target.value);
      etat.weekdays = defaultDaysFor(etat.daysPerWeek);
      dessinerJours();
    });

    const zoneJours = el.querySelector('[data-jours]');
    function dessinerJours() {
      zoneJours.replaceChildren();
      WEEK_DAYS.forEach((dow, i) => {
        const actif = etat.weekdays.includes(dow);
        const b = h(`<button type="button" class="chip-cat ${actif ? 'on' : ''}">${WEEK_DAY_LABELS[i]}</button>`);
        b.onclick = () => {
          etat.weekdays = actif ? etat.weekdays.filter(d => d !== dow) : [...etat.weekdays, dow];
          dessinerJours();
        };
        zoneJours.appendChild(b);
      });
    }
    dessinerJours();

    const zoneMateriel = el.querySelector('[data-materiel]');
    Object.entries(GEARS).forEach(([id, g]) => {
      const actif = etat.gears.includes(id);
      const b = h(`<button type="button" class="chip-cat ${actif ? 'on' : ''}">${esc(g.label)}</button>`);
      b.onclick = () => {
        etat.gears = actif ? etat.gears.filter(x => x !== id) : [...etat.gears, id];
        dessinerFormulaire();
      };
      zoneMateriel.appendChild(b);
    });

    el.querySelector('[data-generer]').onclick = async (e) => {
      const objectif = etat.goalText.trim();
      if (!objectif) return toast('Décris ton objectif en quelques mots.');
      if (!etat.weekdays.length) return toast('Choisis au moins un jour d\'entraînement.');
      e.target.disabled = true; e.target.textContent = 'Génération en cours… (20-30 s)';
      try {
        const [h, m] = etat.heure.split(':').map(Number);
        const startMs = new Date(`${etat.date}T00:00:00`).getTime();
        const { draft, notes } = await genererProgrammeIA({
          goalText: objectif, level: etat.level, daysPerWeek: etat.daysPerWeek, weeks: etat.weeks,
          gears: etat.gears, weekdays: etat.weekdays, minuteOfDay: h * 60 + m, startMs
        });
        dessinerApercu(draft, notes);
      } catch (err) {
        toast(err.message || 'La génération a échoué.');
        e.target.disabled = false; e.target.textContent = 'Générer le programme';
      }
    };
  }

  /** Écran d'aperçu/validation (ProgramScreens.kt) : rien n'est enregistré
   *  tant que « Valider » n'a pas été pressé — même principe que le natif. */
  function dessinerApercu(draft, notes) {
    const { program, workouts } = draft;
    el.replaceChildren(h(`
      <div>
        <p class="eyebrow">Entraînement</p>
        <h1>${esc(program.name)}</h1>
        ${notes ? `<p class="lede">${esc(notes)}</p>` : ''}
        <p class="ligne-stats" style="margin:0 0 1rem">
          <span>${program.weeks} semaines</span>
          <span>${program.daysPerWeek} séances / semaine</span>
          <span>${program.sessions.length} séances planifiées</span>
        </p>
        <div class="bloc">
          <p class="bloc-titre">Modèles de séance</p>
          <div data-modeles></div>
        </div>
        <div class="bloc">
          <p class="bloc-titre">Planning (5 premières séances)</p>
          <ul class="liste" data-planning></ul>
        </div>
        <div class="barre-action" style="display:flex;gap:.6rem;margin-top:1.25rem">
          <button class="btn btn-ghost" data-recommencer style="flex:1">Recommencer</button>
          <button class="btn btn-lg" data-valider style="flex:1">Valider le programme</button>
        </div>
      </div>`));

    const zoneModeles = el.querySelector('[data-modeles]');
    workouts.forEach(w => {
      zoneModeles.appendChild(h(`
        <div style="margin-bottom:.8rem">
          <p style="font-weight:700;margin:0 0 .3rem">${esc(w.name)} <span class="ligne-meta">· ${esc(w.category)}</span></p>
          <p class="ligne-meta" style="margin:0">${w.exercises.map(x => esc(x.name)).join(' · ')}</p>
        </div>`));
    });

    const ulPlanning = el.querySelector('[data-planning]');
    program.sessions.slice(0, 5).forEach(s => {
      ulPlanning.appendChild(h(`
        <li class="ligne">
          <div class="ligne-tete">
            <span class="ligne-titre">S${s.week} — ${esc(s.title)}${s.deload ? ' · décharge' : ''}</span>
            <span class="ligne-meta">${esc(new Date(s.dateMs).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' }))}</span>
          </div>
          <p class="ligne-corps">${s.items.map(it => `${esc(it.name)} ${it.sets}×${it.reps}`).join(', ')}</p>
        </li>`));
    });

    el.querySelector('[data-recommencer]').onclick = () => dessinerFormulaire();
    el.querySelector('[data-valider]').onclick = async (ev) => {
      ev.target.disabled = true;
      try {
        for (const w of workouts) await saveWorkout(moi.id, w);
        await saveProgram(moi.id, program);
        toast('Programme enregistré ✓');
        location.hash = '#/programmes';
      } catch (err) { toast(err.message); ev.target.disabled = false; }
    };
  }
}

/* ========================================================== historique */

export async function vueHistorique() {
  render(loading("Chargement de l'historique"));
  const moi = await currentUser();

  let seances;
  try { seances = await sessionsOf(moi.id, { limit: 200 }); }
  catch (e) { return render(failure(e, "L'historique n'a pas pu être chargé")); }

  if (!seances.length) {
    return render(empty(
      'Historique vide',
      "Les séances terminées dans l'application remontent ici dès que la synchronisation a tourné.",
      { href: '#/fil', label: 'Voir le fil' }
    ));
  }

  const tonnage = seances.reduce((t, s) => t + (s.volume_kg || 0), 0);
  const temps = seances.reduce((t, s) => t + (s.duration_ms || 0), 0) / 1000;

  const el = h(`
    <section class="page">
      <p class="eyebrow">Entraînement</p>
      <h1>Historique</h1>
      <div class="chiffres">
        <div><b>${seances.length}</b><span>séances</span></div>
        <div><b>${Math.round(tonnage / 1000)}</b><span>tonnes</span></div>
        <div><b>${Math.round(temps / 3600)}</b><span>heures</span></div>
      </div>
      <ul class="liste" data-liste></ul>
    </section>`);

  const ul = el.querySelector('[data-liste]');
  for (const s of seances) {
    const li = h(`
      <li class="ligne ligne-action">
        <div>
          <div class="ligne-tete">
            <span class="ligne-titre">${esc(s.workout_name || 'Séance')}<span class="etiquette">${esc(s.category || '')}</span></span>
            <span class="ligne-meta">${esc(dateCourte(s.started_at))}</span>
          </div>
          <p class="ligne-stats">
            <span>${esc(duree((s.duration_ms || 0) / 1000))}</span>
            <span>${esc(kg(s.volume_kg))}</span>
            <span>${s.set_count || 0} séries</span>
          </p>
        </div>
        <button class="btn btn-sm btn-ghost" data-partager type="button">Partager l'image</button>
      </li>`);
    li.querySelector('[data-partager]').onclick = () => ouvrirPartage(s);
    ul.appendChild(li);
  }
  render(el);
}

/* ================================================ historique d'une séance */

const MOOD_EMOJI = { 1: '😩', 2: '😕', 3: '😐', 4: '🙂', 5: '💪' };

/** dateLabel (TrainingScreens.kt) : « dd/mm/yyyy hh:mm ». */
function dateHeure(ms) {
  const d = new Date(ms);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
/** fmtDurMin (TrainingScreens.kt). */
function fmtDurMin(ms) {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m} minutes`;
}

/**
 * Historique d'UNE séance (HistoryScreen, TrainingScreens.kt ~3023) —
 * distinct de l'historique général : ne liste que les réalisations de ce
 * modèle précis, lues depuis w.history (pas shared_sessions). Chaque carte
 * ouvre le même bilan modifiable que la fin de séance en direct (bilan.js).
 */
export async function vueHistoriqueSeance(params) {
  render(loading("Chargement de l'historique"));
  const moi = await currentUser();

  let row;
  try { row = await getWorkout(moi.id, params.id); }
  catch (e) { return render(failure(e, "L'historique n'a pas pu être chargé")); }
  if (!row) return render(empty('Séance introuvable', 'Elle a peut-être été supprimée.',
    { href: '#/seances', label: 'Retour aux séances' }));

  const modele = row.data;

  function dessiner() {
    const historique = [...(modele.history || [])].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));

    const el = h(`
      <section class="page">
        <p class="eyebrow">Historique</p>
        <h1>${esc(modele.name || `Séance ${modele.category}`)}</h1>
        <div data-liste style="margin-top:1.25rem"></div>
        <a class="btn btn-lg" href="#/seances" style="display:block;text-align:center;margin-top:1.5rem">Retour</a>
      </section>`);

    const liste = el.querySelector('[data-liste]');
    if (!historique.length) {
      liste.appendChild(h('<p class="etat-mono">Aucune séance enregistrée pour l\'instant.</p>'));
    } else {
      historique.forEach(s => {
        const tonnage = (s.exercises || []).reduce((t, e) => t + (e.sets || []).reduce((u, st) => u + st.weight * st.reps, 0), 0);
        const dureeMs = Math.max(0, (s.endedAt || 0) - (s.startedAt || 0));
        const li = h(`
          <div class="ligne ligne-action" style="cursor:pointer">
            <div data-corps style="flex:1;min-width:0">
              <p class="ligne-titre">${esc(dateHeure(s.startedAt))}</p>
              <p class="ligne-meta">${esc(fmtDurMin(dureeMs))}${s.mood > 0 ? '   ' + (MOOD_EMOJI[s.mood] || '') : ''}</p>
              ${s.note ? `<p class="ligne-meta" style="color:var(--dore)">${esc(s.note)}</p>` : ''}
            </div>
            <span style="color:var(--accent);font-weight:700;white-space:nowrap">${esc(kg(tonnage))}</span>
            <button class="bilan-exo-drop" data-suppr type="button" aria-label="Supprimer cette séance">✕</button>
          </div>`);
        li.querySelector('[data-corps]').onclick = () => {
          ouvrirBilan({ moi, modele, session: s, onFermer: dessiner });
        };
        li.querySelector('[data-suppr]').onclick = async (e) => {
          e.stopPropagation();
          if (!confirm(`Séance du ${dateHeure(s.startedAt)} · ${kg(tonnage)}. Elle sera retirée de l'historique et des statistiques, sans retour possible.`)) return;
          modele.history = (modele.history || []).filter(x => x !== s);
          try {
            await saveWorkout(moi.id, modele);
            // Retire aussi la copie serveur (fil, kudos, commentaires en
            // cascade) : sinon la séance restait visible de ses abonnés.
            deleteSharedSession(moi.id, s.uid).catch(() => {});
            dessiner();
          }
          catch (err) { toast(err.message); }
        };
        liste.appendChild(li);
      });
    }
    render(el);
  }

  dessiner();
}
