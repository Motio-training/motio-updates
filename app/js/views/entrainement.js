import { h, render, loading, empty, failure, esc, toast, dateCourte, duree } from '../ui.js';
import { listWorkouts, getWorkout, saveWorkout, deleteWorkout,
         listPrograms, sessionsOf } from '../api.js';
import { currentUser } from '../supabase.js';
import { nouvelleSeance, nouvelExercice, dureeSeance, dureeExercice,
         MODES, MODE_LABELS, CATEGORIES_DEFAUT, fmtRecup, kg,
         prochainGroupId, etendueBloc, libelleBloc, GOALS, LEVELS } from '../model.js';
import { GROUPES, CATEGORIES_CATALOGUE, GEARS, devineMateriel, chercher } from '../catalog.js';

/* ======================================================== liste des séances */

export async function vueSeances() {
  render(loading('Chargement des séances'));
  const moi = await currentUser();

  let seances;
  try { seances = await listWorkouts(moi.id); }
  catch (e) { return render(failure(e, "Les séances n'ont pas pu être chargées")); }

  if (!seances.length) {
    return render(empty(
      'Aucune séance',
      'Une séance est un modèle : des exercices, des séries et des temps de repos, à relancer autant de fois que tu veux.',
      { href: '#/seances/nouvelle', label: 'Créer une séance' }
    ));
  }

  const el = h(`
    <section class="page">
      <p class="eyebrow">Entraînement</p>
      <h1>Séances</h1>
      <a class="btn" href="#/seances/nouvelle">Créer une séance</a>
      <ul class="liste" data-liste></ul>
    </section>`);

  const ul = el.querySelector('[data-liste]');
  for (const s of seances) {
    const d = s.data || {};
    const nbEx = (d.exercises || []).length;
    const li = h(`
      <li class="ligne ligne-action">
        <div>
          <a class="ligne-titre" href="#/seances/${esc(s.local_id)}">${esc(s.name)}</a>
          <span class="ligne-meta">${esc(s.category || '')} · ${nbEx} exercices ·
            environ ${esc(duree(dureeSeance(d.exercises || [])))}</span>
        </div>
        <button class="btn btn-sm btn-ghost">Supprimer</button>
      </li>`);
    li.querySelector('button').onclick = async (e) => {
      e.target.disabled = true;
      try { await deleteWorkout(moi.id, s.local_id); li.remove(); toast('Séance supprimée.'); }
      catch (err) { toast(err.message); e.target.disabled = false; }
    };
    ul.appendChild(li);
  }
  render(el);
}

/* ============================================================= éditeur */

export async function vueSeanceEdition(params) {
  const moi = await currentUser();
  const neuve = params.id === 'nouvelle';

  let seance;
  if (neuve) {
    seance = nouvelleSeance('', CATEGORIES_DEFAUT[0]);
  } else {
    render(loading('Chargement de la séance'));
    try {
      const row = await getWorkout(moi.id, params.id);
      if (!row) return render(empty('Séance introuvable', 'Elle a peut-être été supprimée.',
        { href: '#/seances', label: 'Retour aux séances' }));
      seance = row.data;
    } catch (e) { return render(failure(e, "La séance n'a pas pu être chargée")); }
  }

  const el = h(`
    <section class="page">
      <p class="eyebrow">Entraînement</p>
      <h1>${neuve ? 'Nouvelle séance' : 'Modifier la séance'}</h1>

      <div class="rangee">
        <label class="champ"><span>Nom</span>
          <input type="text" data-nom maxlength="60" placeholder="Push A"></label>
        <label class="champ"><span>Catégorie</span>
          <select data-cat>${CATEGORIES_DEFAUT.map(c =>
            `<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select></label>
      </div>

      <p class="estimation">Durée estimée <b data-estim>—</b></p>

      <div class="bloc">
        <h2>Exercices</h2>
        <div data-exos></div>
        <button class="btn" data-ajouter>Ajouter un exercice</button>
      </div>

      <div class="barre-action">
        <button class="btn btn-lg" data-enregistrer>Enregistrer la séance</button>
        <a class="btn btn-lg btn-ghost" href="#/seances">Annuler</a>
      </div>
    </section>`);

  el.querySelector('[data-nom]').value = seance.name || '';
  el.querySelector('[data-cat]').value = seance.category || CATEGORIES_DEFAUT[0];

  const zone = el.querySelector('[data-exos]');
  const estim = el.querySelector('[data-estim]');

  function redessiner() {
    zone.replaceChildren();
    if (!seance.exercises.length) {
      zone.appendChild(h(`<p class="etat-mono">Aucun exercice. Ajoute le premier.</p>`));
    } else {
      seance.exercises.forEach((ex, i) => zone.appendChild(carteExercice(ex, i)));
    }
    estim.textContent = duree(dureeSeance(seance.exercises));
  }

  function carteExercice(ex, i) {
    const [a, b] = etendueBloc(seance.exercises, i);
    const etiquette = libelleBloc(b - a + 1);
    const tabata = ex.mode === 'TABATA';
    const minuteur = ex.mode === 'MINUTEUR';

    const c = h(`
      <div class="exo-edit">
        <div class="exo-edit-tete">
          <span class="exo-edit-nom">${esc(ex.name || 'Sans nom')}
            ${etiquette ? `<span class="etiquette">${esc(etiquette)}</span>` : ''}</span>
          <span class="ligne-meta">${esc(GEARS[devineMateriel(ex.name)].short)} ·
            environ ${esc(duree(dureeExercice(ex)))}</span>
        </div>

        <div class="rangee rangee-serree">
          <label class="champ champ-mini"><span>Mode</span>
            <select data-mode>${MODES.map(m =>
              `<option value="${m}"${m === ex.mode ? ' selected' : ''}>${MODE_LABELS[m]}</option>`).join('')}</select></label>

          <label class="champ champ-mini"${tabata ? ' hidden' : ''}><span>Séries</span>
            <input type="number" min="1" max="20" data-series value="${ex.plannedSets}"></label>

          <label class="champ champ-mini"${tabata ? ' hidden' : ''}><span>Répétitions</span>
            <input type="number" min="0" max="100" data-reps value="${ex.targetReps}"></label>

          <label class="champ champ-mini"${minuteur ? '' : ' hidden'}><span>Récup (s)</span>
            <input type="number" min="0" max="600" step="15" data-recup value="${ex.recupSec}"></label>

          <label class="champ champ-mini"${tabata ? '' : ' hidden'}><span>Travail (s)</span>
            <input type="number" min="5" max="300" data-work value="${ex.workSec}"></label>
          <label class="champ champ-mini"${tabata ? '' : ' hidden'}><span>Repos (s)</span>
            <input type="number" min="0" max="300" data-rest value="${ex.restSec}"></label>
          <label class="champ champ-mini"${tabata ? '' : ' hidden'}><span>Blocs</span>
            <input type="number" min="1" max="30" data-blocs value="${ex.tabataSeries}"></label>
        </div>

        <div class="exo-edit-actions">
          <button class="lien-inline" data-haut ${i === 0 ? 'disabled' : ''}>Monter</button>
          <button class="lien-inline" data-bas ${i === seance.exercises.length - 1 ? 'disabled' : ''}>Descendre</button>
          <button class="lien-inline" data-groupe>${ex.groupId ? 'Détacher du bloc' : 'Grouper avec le suivant'}</button>
          <button class="lien-inline" data-suppr>Retirer</button>
        </div>
        ${minuteur ? `<p class="etat-mono">Repos ${esc(fmtRecup(ex.recupSec))} entre les séries.</p>` : ''}
      </div>`);

    const lie = (sel, champ, entier = true) => {
      c.querySelector(sel)?.addEventListener('change', (e) => {
        const v = entier ? parseInt(e.target.value, 10) : e.target.value;
        ex[champ] = Number.isNaN(v) ? 0 : v;
        redessiner();
      });
    };
    c.querySelector('[data-mode]').addEventListener('change', (e) => {
      ex.mode = e.target.value; redessiner();
    });
    lie('[data-series]', 'plannedSets');
    lie('[data-reps]', 'targetReps');
    lie('[data-recup]', 'recupSec');
    lie('[data-work]', 'workSec');
    lie('[data-rest]', 'restSec');
    lie('[data-blocs]', 'tabataSeries');

    c.querySelector('[data-haut]').onclick = () => {
      [seance.exercises[i - 1], seance.exercises[i]] = [seance.exercises[i], seance.exercises[i - 1]];
      redessiner();
    };
    c.querySelector('[data-bas]').onclick = () => {
      [seance.exercises[i + 1], seance.exercises[i]] = [seance.exercises[i], seance.exercises[i + 1]];
      redessiner();
    };
    c.querySelector('[data-suppr]').onclick = () => {
      seance.exercises.splice(i, 1); redessiner();
    };
    c.querySelector('[data-groupe]').onclick = () => {
      if (ex.groupId) { ex.groupId = 0; }
      else if (i < seance.exercises.length - 1) {
        const suivant = seance.exercises[i + 1];
        const g = suivant.groupId || prochainGroupId(seance.exercises);
        ex.groupId = g; suivant.groupId = g;
      } else {
        toast('Rien à grouper : cet exercice est le dernier.');
      }
      redessiner();
    };
    return c;
  }

  el.querySelector('[data-ajouter]').onclick = () => {
    ouvrirCatalogue((nom) => {
      seance.exercises.push(nouvelExercice(nom));
      redessiner();
    });
  };

  el.querySelector('[data-enregistrer]').onclick = async (e) => {
    seance.name = el.querySelector('[data-nom]').value.trim();
    seance.category = el.querySelector('[data-cat]').value;
    if (!seance.name) return toast('Donne un nom à la séance.');
    if (!seance.exercises.length) return toast('Ajoute au moins un exercice.');
    e.target.disabled = true;
    try {
      await saveWorkout(moi.id, seance);
      toast('Séance enregistrée.');
      location.hash = '#/seances';
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
    ul.appendChild(h(`
      <li class="ligne">
        <div class="ligne-tete">
          <span class="ligne-titre">${esc(s.workout_name || 'Séance')}<span class="etiquette">${esc(s.category || '')}</span></span>
          <span class="ligne-meta">${esc(dateCourte(s.started_at))}</span>
        </div>
        <p class="ligne-stats">
          <span>${esc(duree((s.duration_ms || 0) / 1000))}</span>
          <span>${esc(kg(s.volume_kg))}</span>
          <span>${s.set_count || 0} séries</span>
        </p>
      </li>`));
  }
  render(el);
}
