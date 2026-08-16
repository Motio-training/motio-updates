import { h, render, loading, empty, failure, esc, toast, dateCourte, duree } from '../ui.js';
import { listWorkouts, getWorkout, saveWorkout, deleteWorkout,
         listPrograms, sessionsOf } from '../api.js';
import { currentUser } from '../supabase.js';
import { nouvelleSeance, nouvelExercice, dureeSeance, dureeExercice,
         MODES, MODE_LABELS, CATEGORIES_DEFAUT, fmtRecup, kg,
         prochainGroupId, etendueBloc, libelleBloc, GOALS, LEVELS } from '../model.js';
import { GROUPES, CATEGORIES_CATALOGUE, GEARS, devineMateriel, chercher } from '../catalog.js';
import { ouvrirPartage } from '../partage.js';

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

      <div data-corps></div>
    </section>`);

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
      <a class="wcard" href="#/seances/${esc(s.local_id)}">
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
      </a>`);
    return a;
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
        <h2>Exercices</h2>
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
    zone.replaceChildren();
    seance.exercises.forEach((ex, i) => {
      zone.appendChild(carteExercice(ex, i));
      if (i < seance.exercises.length - 1) zone.appendChild(lienEnchainer(i));
    });
    estim.textContent = 'environ ' + fmtEstimate(estimatedSec(seance));
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

function ouvrirCatalogue(choisir) {
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

export async function vueProgrammeNouveau() {
  render(h(`
    <section class="page page-etroite">
      <p class="eyebrow">Entraînement</p>
      <h1>Générer un programme</h1>

      <div class="rangee">
        <label class="champ"><span>Objectif</span>
          <select>${GOALS.map(g => `<option value="${g.id}">${esc(g.label)}</option>`).join('')}</select></label>
        <label class="champ"><span>Niveau</span>
          <select>${LEVELS.map(l => `<option value="${l.id}">${esc(l.label)}</option>`).join('')}</select></label>
      </div>
      <div class="rangee">
        <label class="champ champ-mini"><span>Semaines</span>
          <input type="number" min="4" max="24" value="8"></label>
        <label class="champ champ-mini"><span>Séances / semaine</span>
          <input type="number" min="2" max="6" value="3"></label>
      </div>

      <div class="chantier">
        <h2>Générateur à brancher</h2>
        <p>Les réglages ci-dessus sont ceux de <code>ProgramGenerator.kt</code>,
           mais l'algorithme lui-même n'est pas encore ici. Deux voies : le
           réimplémenter en JavaScript, ou le déporter dans une fonction Edge
           Supabase appelée par Android et par le web. La seconde évite qu'ils
           divergent au premier ajustement — c'est celle que je recommande.</p>
      </div>
    </section>`));
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
