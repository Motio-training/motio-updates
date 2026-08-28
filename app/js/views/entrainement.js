import { h, render, loading, empty, failure, esc, toast, dateCourte, duree } from '../ui.js';
import { listWorkouts, getWorkout, saveWorkout, deleteWorkout,
         listPrograms, saveProgram, sessionsOf, deleteSharedSession,
         getCategories, saveCategories, aAccesIA } from '../api.js';
import { currentUser } from '../supabase.js';
import { nouvelleSeance, nouvelExercice, dureeSeance, dureeExercice,
         MODES, MODE_LABELS, CATEGORIES_DEFAUT, fmtRecup, kg,
         prochainGroupId, etendueBloc, libelleBloc, GOALS, LEVELS } from '../model.js';
import { GROUPES, CATEGORIES_CATALOGUE, GEARS, devineMateriel, chercher } from '../catalog.js';
import { ouvrirPartage } from '../partage.js';
import { encode as encoderSeance } from '../workout-share.js';
import { ouvrirBilan } from '../bilan.js';
import { niveauActuel, objectifActuel, definirNiveau, definirObjectif } from '../reglages.js';
import { etatBrut as seanceEnCours, effacerEtat as oublierSeanceEnCours } from '../run-state.js';
import { genererProgrammeIA, genererSeanceIA, defaultDaysFor, WEEK_DAYS, WEEK_DAY_LABELS } from '../programme-ia.js';
import { genererSeanceLocale } from '../generateur-local.js';
import { ouvrirPaveDuree } from '../numpad.js';
import { muscleLoadOf } from '../muscle-lexicon.js';
import { drawMuscleMap, MuscleScale } from '../muscle-map.js';

/* ======================================================== liste des séances
   Reprend exactement TrainingList/WorkoutCard (TrainingScreens.kt) : carte
   Moti, puces de catégorie, cartes colorées par catégorie, groupement par
   bloc. La gestion des catégories et la mise en avant d'un bloc restent
   plus simples ici (pas de dialogue dédié) — le reste est fidèle. */

const WARMUP_SEC = 600;

/* Séance tout juste générée par l'IA, en attente d'être reprise par l'éditeur
   (#/seances/nouvelle). Elle vit en mémoire, jamais sur le serveur : si
   l'utilisateur quitte l'écran sans enregistrer, elle disparaît — même
   comportement que le natif, qui passe l'objet Workout directement à
   CreateWorkout sans l'écrire dans le carnet. */
let brouillonIA = null;

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
/** Punaise d'épinglage — même tracé que ic_pin.xml (drawable natif). */
const ICONE_PIN = '<svg class="pin" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M16,3L16,5L15,5L15,10.5L17.5,13L17.5,15L12.9,15L12.9,21L11.1,21L11.1,15L6.5,15L6.5,13L9,10.5L9,5L8,5L8,3z"/></svg>';
/** Trois points reliés — même tracé que ic_share.xml (drawable natif). */
const ICONE_SHARE = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M18,16.08C17.24,16.08 16.56,16.38 16.04,16.85L8.91,12.7C8.96,12.47 9,12.24 9,12C9,11.76 8.96,11.53 8.91,11.3L15.96,7.19C16.5,7.69 17.21,8 18,8C19.66,8 21,6.66 21,5C21,3.34 19.66,2 18,2C16.34,2 15,3.34 15,5C15,5.24 15.04,5.47 15.09,5.7L8.04,9.81C7.5,9.31 6.79,9 6,9C4.34,9 3,10.34 3,12C3,13.66 4.34,15 6,15C6.79,15 7.5,14.69 8.04,14.19L15.16,18.35C15.11,18.56 15.08,18.78 15.08,19C15.08,20.61 16.39,21.92 18,21.92C19.61,21.92 20.92,20.61 20.92,19C20.92,17.39 19.61,16.08 18,16.08z"/></svg>';

/** Liste des séances. `toutes` = écran secondaire « Toutes mes séances » ;
 *  l'écran principal, lui, ne montre que les séances épinglées et celles qui
 *  viennent d'un programme (demande de Nicolas : le carnet complet encombrait
 *  l'accueil, tout l'historique des séances FAITES vivant de son côté dans
 *  Profil → Entraînements). */
export async function vueSeances(_params, toutes = false) {
  render(loading('Chargement des séances'));
  const moi = await currentUser();

  let rows, programmes = [];
  try {
    rows = await listWorkouts(moi.id);
    programmes = await listPrograms(moi.id);
  }
  catch (e) { return render(failure(e, "Les séances n'ont pas pu être chargées")); }

  /* Droit d'accès à l'IA : ne sert QU'À L'INTERFACE (pastille dorée ou grise,
     champ de description actif ou non). Le refus réel vient de la fonction
     Edge generate-program, qui lit ai_access avant d'appeler le modèle — le
     contourner ici ne débloque rien. Hors ligne ou en cas d'erreur, on
     retombe sur « pas d'abonnement » : mieux vaut une génération locale qui
     aboutit qu'un champ actif qui se prendra un 403. */
  let accesIA = false;
  try { accesIA = await aAccesIA(moi.id); } catch { /* déjà géré : false */ }

  /* Une séance « issue d'un programme » est une séance dont l'id figure dans
     les workoutIds d'un programme (ProgramModel.kt / programme-ia.js). */
  const idsProgramme = new Set();
  programmes.forEach(p => (p.data?.workoutIds || []).forEach(id => idsProgramme.add(String(id))));
  const misesEnAvant = rows.filter(s => (s.data || {}).pinned || idsProgramme.has(String((s.data || {}).id)));
  const affichees = toutes ? rows : misesEnAvant;

  const el = h(`
    <section class="page">
      <!-- Plus de bouton « Catégories » ici : depuis la disparition des
           onglets de catégorie sur cet écran il ne servait plus à rien. Il vit
           maintenant là où l'on choisit une catégorie, dans l'écran de
           création/édition de séance (vueSeanceEdition). -->
      <div class="rangee-titre" style="margin-bottom:1rem">
        <h1 style="margin:0">${toutes ? 'TOUTES MES SÉANCES' : 'ENTRAÎNEMENT'}</h1>
      </div>

      ${toutes ? '<a class="lien-inline" href="#/seances" style="display:inline-block;margin-bottom:1rem">‹ Retour à Entraînement</a>' : `
      <a class="moti-card" href="#/coach">
        <img src="../assets/img/moti_avatar.jpg" alt="">
        <span class="corps"><b>Moti</b><span>Ton coach IA — motivation, conseils, où tu en es</span></span>
        <span class="chevron">›</span>
      </a>`}

      <div data-reprise></div>

      ${toutes ? '' : `
      <a class="btn btn-lg libre-bouton" href="#/seances/libre/lancer">Entraînement libre</a>
      <p class="libre-aide">Démarre sans plan : tu ajoutes les exercices au fur et à mesure.</p>`}

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

  /* ================================================== Générer une séance

     UN SEUL BOUTON, DEUX MOTEURS — exactement comme le natif depuis la v2.49
     (AutoSessionDialog, ProgramScreens.kt) :
       · avec l'abonnement, la description libre est active et c'est le coach
         qui écrit la séance (genererSeanceIA, programme-ia.js) ;
       · sans lui, le champ reste affiché mais inerte — on voit ce qu'on gagne
         à s'abonner — et la séance sort du générateur local à règles fixes
         (genererSeanceLocale, generateur-local.js), qui marche hors ligne et
         sans coût.
     La pastille « IA » du bouton et du titre dit lequel des deux répondra :
     dorée = le coach, grise = le générateur local.

     Le bouton lui-même vit dans le pied de liste, reconstruit à chaque
     dessin : son écouteur est branché là-bas. */

  function ouvrirGenerationSeance() {
    let goalText = '', niveau = niveauActuel(), gears = [];
    let objectif = objectifActuel();
    const typesSeance = CATEGORIES_CATALOGUE.map(c => c.nom);
    let type = typesSeance.find(t => t.toLowerCase() === 'full body') || typesSeance[0];

    const modale = h(`
      <div class="modale" role="dialog" aria-label="Générer une séance">
        <div class="modale-boite">
          <div class="modale-tete">
            <h2>Générer une séance <span class="badge-ia ${accesIA ? 'on' : ''}">✦ IA</span></h2>
          </div>
          <!-- Le corps défile : la fenêtre est plus haute qu'un petit écran
               ne peut afficher, et sans le conteneur qui défile, le bouton Générer
               finissait hors champ, exactement comme l'ancien aperçu de
               séance. -->
          <div class="modale-corps">
            <label class="champ"><span>Décris la séance que tu veux</span>
              <textarea data-objectif rows="3" maxlength="300" ${accesIA ? '' : 'disabled'}
                placeholder="${accesIA ? 'Ex. : pecs et triceps, 45 minutes, matériel limité.'
                                       : "Décris ta séance et le coach l'écrit — avec l'abonnement."}"></textarea></label>
            <p class="etat-mono" style="margin-top:.4rem">${accesIA
              ? 'Laisse ce champ vide pour une séance construite par l’algorithme de Motio, sans IA.'
              : 'Sans abonnement, la séance est construite par l’algorithme de Motio à partir des réglages ci-dessous. Avec, tu la décris avec tes mots et le coach l’écrit.'}</p>

            <p class="champ-label" style="margin-top:.8rem">Objectif</p>
            <div class="rangee rangee-serree" data-objectif-chips style="margin-bottom:.6rem"></div>
            <p class="champ-label">Niveau</p>
            <div class="rangee rangee-serree" data-niveau style="margin-bottom:.6rem"></div>
            <p class="champ-label">Type de séance</p>
            <div class="rangee rangee-serree" data-type style="margin-bottom:.6rem"></div>
            <p class="champ-label">Matériel disponible (aucun coché = tout matériel)</p>
            <div class="rangee rangee-serree" data-materiel></div>
          </div>
          <div class="modale-pied">
            <button class="lien-inline" data-annuler type="button">Annuler</button>
            <button class="btn" data-generer type="button">Générer</button>
          </div>
        </div>
      </div>`);

    modale.querySelector('[data-objectif]').addEventListener('input', (e) => { goalText = e.target.value; });

    /* Une rangée de puces à choix unique : les trois listes ci-dessous ne
       diffèrent que par leurs valeurs et par ce qu'elles retiennent. */
    function rangeeUnique(selecteur, valeurs, courant, choisir) {
      const zone = modale.querySelector(selecteur);
      valeurs.forEach(v => {
        const b = h(`<button class="chip-cat ${v.id === courant ? 'on' : ''}" type="button">${esc(v.label)}</button>`);
        b.onclick = () => {
          choisir(v.id);
          zone.querySelectorAll('.chip-cat').forEach(x => x.classList.remove('on'));
          b.classList.add('on');
        };
        zone.appendChild(b);
      });
    }

    rangeeUnique('[data-objectif-chips]', GOALS.map(g => ({ id: g.id, label: g.label })),
      objectif, (v) => { objectif = v; });
    rangeeUnique('[data-niveau]', LEVELS.map(l => ({ id: l.id, label: l.label })),
      niveau, (v) => { niveau = v; });
    rangeeUnique('[data-type]', typesSeance.map(t => ({ id: t, label: t })),
      type, (v) => { type = v; });

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

    /* La séance générée s'ouvre dans l'ÉDITEUR, comme côté natif
       (TrainingList : `onGenerate = { w -> onEdit(w) }`). L'aperçu en fenêtre
       qui existait ici ne laissait rien faire d'autre que renommer, et
       surtout, quand les notes du coach étaient longues, la liste des
       exercices et le bouton d'enregistrement débordaient d'une fenêtre qui ne
       défilait pas : la séance devenait impossible à enregistrer (signalé par
       Nicolas). Dans l'éditeur, tout est modifiable et rien n'est écrit tant
       qu'« Enregistrer » n'a pas été touché. */
    function versEditeur(workout, notes) {
      brouillonIA = { workout, notes: notes || '' };
      location.hash = '#/seances/nouvelle';
    }

    modale.querySelector('[data-generer]').onclick = async (e) => {
      const texte = goalText.trim();
      /* Objectif et niveau retenus pour la prochaine fois, comme le natif
         (Profile.setTrainingGoal/setTrainingLevel dans AutoSessionDialog). */
      definirObjectif(objectif); definirNiveau(niveau);

      // Générateur local : instantané, hors ligne, sans compte. C'est aussi
      // le repli d'un abonné qui laisse la description vide.
      if (!accesIA || !texte) {
        try {
          const workout = genererSeanceLocale({ goal: objectif, level: niveau, category: type, gears });
          modale.remove();
          versEditeur(workout, '');
        } catch (err) { toast(err.message || 'La génération a échoué.'); }
        return;
      }

      e.target.disabled = true; e.target.textContent = 'Génération… (20-30 s)';
      try {
        const { workout, notes } = await genererSeanceIA({
          goalText: texte, level: niveau, gears, category: type
        });
        modale.remove();
        versEditeur(workout, notes);
      } catch (err) {
        toast(err.message || 'La génération a échoué.');
        e.target.disabled = false; e.target.textContent = 'Générer';
      }
    };
    document.body.appendChild(modale);
  }

  const corps = el.querySelector('[data-corps]');

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
            ${w.pinned ? ICONE_PIN : ''}
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
              ${ICONE_PIN}<span>${w.pinned ? 'Détacher' : 'Épingler'}</span>
            </button>
            <button class="menu-action-icone" data-partager type="button">
              ${ICONE_SHARE}<span>Partager</span>
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
    /* Recalculé à chaque redessin : épingler ou détacher une séance depuis le
       menu d'action la fait entrer ou sortir de l'écran principal aussitôt. */
    const liste = toutes ? rows : rows.filter(s => (s.data || {}).pinned || idsProgramme.has(String((s.data || {}).id)));
    if (!liste.length) {
      /* Compte tout neuf (aucune séance du tout) : c'est le cas qui compte le
         plus, celui des amis iPhone qui viennent de s'inscrire. Il montrait
         un cul-de-sac — l'écran sortait ici en `return` avant le pied de
         liste, donc ni « Générer un programme », ni « Générer une séance »,
         ni « Nouvel entraînement » (signalé par Nicolas sur le compte d'un
         ami créé la veille). Le natif fait l'inverse : quand la liste est
         vide, les actions REMONTENT, ce sont les seules choses à faire. On
         explique donc ce qu'est une séance, et le pied de liste s'affiche
         dans tous les cas. */
      zoneListe.appendChild(h(`<p class="etat-mono">${
        toutes
          ? "Aucun entraînement pour l'instant."
          : !rows.length
            ? 'Une séance est un modèle : des exercices, des séries et des temps de repos, à relancer autant de fois que tu veux. Sinon, lance un entraînement libre et construis-la en t’entraînant.'
            : "Rien d'épinglé pour l'instant. Épingle une séance depuis « Toutes mes séances » pour la garder ici, ou lance un entraînement libre."}</p>`));
    } else {
      const blocs = new Map();
      const isolees = [];
      liste.forEach(s => {
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
    /* Générer un programme / une séance vivent en PIED de liste, comme dans
       l'application : ce sont des gestes occasionnels, ils passent après les
       séances qu'on vient lancer. Ils occupaient le haut de l'écran côté web. */
    const pied = h(`
      <div style="margin-top:1.5rem">
        ${toutes ? '' : `<div class="rangee rangee-serree" style="margin-bottom:.8rem">
          <a class="btn btn-ghost" href="#/programmes/nouveau" style="flex:1">Générer un programme</a>
          <button class="btn btn-ghost" data-generer-seance type="button" style="flex:1">Générer une séance <span class="badge-ia ${accesIA ? 'on' : ''}">✦ IA</span></button>
        </div>`}
        <a class="btn btn-lg" href="#/seances/nouvelle" style="display:block;text-align:center">＋ Nouvel entraînement</a>
        ${toutes || !rows.length ? '' : `<a class="menu-ligne" href="#/seances/toutes" style="margin-top:.8rem">
          <span class="corps"><b>Toutes mes séances</b><span>${rows.length} au total — celles qui ne sont ni épinglées ni dans un programme</span></span>
          <span class="chevron">›</span>
        </a>`}
      </div>`);
    pied.querySelector('[data-generer-seance]')?.addEventListener('click', () => ouvrirGenerationSeance());
    zoneListe.appendChild(pied);
  }

  dessinerListe();
  render(el);
}

/** Écran secondaire : le carnet complet, sans filtre. */
export function vueToutesSeances(params) { return vueSeances(params, true); }

/* ==================================================== gestion des catégories

   Portage de CategoryManagerDialog (TrainingScreens.kt) : la liste, un bouton
   Renommer et une croix par ligne, un champ pour en ajouter une. Mêmes règles
   que le natif — on ne supprime jamais la dernière, et les séances de la
   catégorie supprimée basculent sur la première restante.

   Différence de fond : les catégories sont désormais rattachées au COMPTE
   (profiles.categories) et non à l'appareil, donc ce que l'on fait ici se
   retrouve dans l'application, et inversement. */
export function ouvrirCategories(moi, onChange) {
  const modale = h(`
    <div class="modale" role="dialog" aria-label="Catégories">
      <div class="modale-boite">
        <div class="modale-tete"><h2>Catégories</h2></div>
        <ul class="liste" data-liste><li class="ligne">Chargement…</li></ul>
        <div class="rangee rangee-serree" style="margin-top:.8rem">
          <input type="text" data-nouvelle placeholder="Nouvelle catégorie" maxlength="30" style="flex:1">
          <button class="btn btn-sm" data-ajouter type="button">Ajouter</button>
        </div>
        <p class="etat-mono" style="margin-top:.7rem">Elles sont liées à ton compte : les mêmes dans l'application et ici.</p>
        <div class="modale-pied">
          <button class="lien-inline" data-fermer type="button">Fermer</button>
        </div>
      </div>
    </div>`);

  const liste = modale.querySelector('[data-liste]');
  const champ = modale.querySelector('[data-nouvelle]');
  let cats = [];
  let modifie = false;

  const fermer = () => { modale.remove(); if (modifie) onChange?.(); };
  modale.querySelector('[data-fermer]').onclick = fermer;
  modale.addEventListener('click', (e) => { if (e.target === modale) fermer(); });

  async function enregistrer(nouvelles) {
    const avant = cats;
    cats = nouvelles;
    dessiner();
    try { await saveCategories(moi.id, nouvelles); modifie = true; }
    catch (err) { cats = avant; dessiner(); toast(err.message); }
  }

  /** Bascule les séances d'une catégorie supprimée vers celle de repli —
   *  deleteCategory (WorkoutStore.kt) fait exactement ça côté natif. */
  async function rebasculerSeances(ancienne, remplacement) {
    let rows = [];
    try { rows = await listWorkouts(moi.id); } catch { return; }
    const concernees = rows.filter(r => (r.data || {}).category === ancienne);
    for (const r of concernees) {
      const w = r.data; w.category = remplacement;
      try { await saveWorkout(moi.id, w); } catch { /* on continue */ }
    }
  }

  function dessiner() {
    liste.replaceChildren();
    cats.forEach(c => {
      const li = h(`
        <li class="ligne ligne-action">
          <span class="ligne-titre">${esc(c)}</span>
          <span class="rangee rangee-serree">
            <button class="lien-inline" data-renommer type="button">Renommer</button>
            ${cats.length > 1 ? '<button class="lien-inline lien-danger" data-supprimer type="button">✕</button>' : ''}
          </span>
        </li>`);
      li.querySelector('[data-renommer]').onclick = async () => {
        const nom = prompt('Nouveau nom de la catégorie', c);
        if (nom === null) return;
        const propre = nom.trim();
        if (!propre || propre === c) return;
        if (cats.some(x => x.toLowerCase() === propre.toLowerCase())) return toast('Cette catégorie existe déjà.');
        await rebasculerSeances(c, propre);
        await enregistrer(cats.map(x => (x === c ? propre : x)));
      };
      li.querySelector('[data-supprimer]')?.addEventListener('click', async () => {
        if (!confirm(`Supprimer la catégorie « ${c} » ? Les séances qui l'utilisent passeront dans « ${cats.find(x => x !== c)} ».`)) return;
        const repli = cats.find(x => x !== c);
        await rebasculerSeances(c, repli);
        await enregistrer(cats.filter(x => x !== c));
      });
      liste.appendChild(li);
    });
  }

  modale.querySelector('[data-ajouter]').onclick = async () => {
    const nom = champ.value.trim();
    if (!nom) return;
    if (cats.some(x => x.toLowerCase() === nom.toLowerCase())) return toast('Cette catégorie existe déjà.');
    champ.value = '';
    await enregistrer([...cats, nom]);
  };

  document.body.appendChild(modale);
  getCategories(moi.id)
    .then(l => { cats = l; dessiner(); })
    .catch(err => liste.replaceChildren(h(`<li class="ligne">${esc(err.message)}</li>`)));
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

  /* Catégories DU COMPTE (profiles.categories), partagées avec l'application —
     plus la liste figée Push/Pull/Legs d'avant. */
  let catsCompte = [];
  try { catsCompte = await getCategories(moi.id); }
  catch { catsCompte = [...CATEGORIES_DEFAUT]; }

  let seance, autres = [];
  /* Séance générée par l'IA : elle arrive ici toute faite, on la reprend telle
     quelle (et on vide le brouillon pour qu'un simple retour sur cet écran ne
     la ressorte pas une deuxième fois). Les notes du coach s'affichent en tête
     de l'éditeur : c'est le raisonnement derrière la séance, il disparaîtrait
     sinon avec la fenêtre de génération. */
  let notesIA = '';
  if (neuve) {
    if (brouillonIA) {
      seance = brouillonIA.workout;
      notesIA = brouillonIA.notes || '';
      brouillonIA = null;
    } else {
      seance = nouvelleSeance('', catsCompte[0] || CATEGORIES_DEFAUT[0]);
    }
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

  /* Les catégories du compte, plus celles déjà portées par des séances
     existantes (une séance importée peut en avoir une qui n'est pas déclarée —
     on ne la fait pas disparaître du sélecteur). */
  let cats = [...new Set([...catsCompte, ...autres.map(w => w.category).filter(Boolean),
    seance.category].filter(Boolean))];
  const sections = [...new Set(autres.map(w => (w.data || {}).section).filter(Boolean))];

  const el = h(`
    <section class="page">
      <h1 style="text-transform:uppercase">${neuve ? 'Nouvelle séance' : 'Modifier la séance'}</h1>

      ${notesIA ? `<div class="notes-ia">
        <p class="notes-ia-tag">Ce que Moti a construit</p>
        <p>${esc(notesIA)}</p>
      </div>` : ''}

      <label class="champ"><span>Nom</span>
        <input type="text" data-nom maxlength="60" placeholder="Push A" value="${esc(seance.name || '')}"></label>

      <div class="rangee-titre" style="margin-bottom:.3rem">
        <p class="champ-label" style="margin:0">Catégorie</p>
        <button class="lien-inline" data-categories type="button">✎ Catégories</button>
      </div>
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

      <div data-muscles-zone style="margin-top:1.5rem"></div>

      <div class="barre-action" style="display:flex;gap:.6rem;margin-top:1.25rem">
        <a class="btn btn-ghost" href="#/seances" style="flex:1;text-align:center">Annuler</a>
        <button class="btn btn-ghost" data-enregistrer style="flex:1">Enregistrer</button>
        <button class="btn" data-demarrer style="flex:1">Démarrer</button>
      </div>
    </section>`);

  let newSection = false;
  let deplie = -1;                 // index de l'exercice dont les réglages sont ouverts
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

  /* Gestion des catégories : elle a migré de l'accueil vers ici, à côté des
     puces — c'est le seul endroit où l'on en choisit une. À la fermeture on
     relit la liste du compte, et si la catégorie retenue vient d'être
     supprimée ou renommée on retombe sur la première. */
  el.querySelector('[data-categories]').addEventListener('click', () => {
    ouvrirCategories(moi, async () => {
      let fraiches = [];
      try { fraiches = await getCategories(moi.id); } catch { return; }
      cats = [...new Set([...fraiches, ...autres.map(w => w.category).filter(Boolean)])];
      if (cats.length && !cats.includes(seance.category)) seance.category = cats[0];
      dessinerCats();
    });
  });

  dessinerCats();
  dessinerSections();

  const zone = el.querySelector('[data-exos]');
  const estim = el.querySelector('[data-estim]');

  async function redessiner() {
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
    await dessinerMuscles();
  }

  /** Zones sollicitées (prévisionnel) — plannedMuscleLoad (TrainingScreens.kt) :
   *  même silhouette que le bilan de fin de séance, mais construite sur les
   *  séries PRÉVUES (plannedSets) plutôt que faites, recolorée à chaque
   *  exercice ajouté, retiré ou modifié — avant même d'avoir démarré la
   *  séance. Écart assumé face au natif : pas de bulle de nom au toucher, pas
   *  de zoom plein écran (déjà le cas partout où MuscleMap est utilisé côté
   *  web, voir muscle-map.js). */
  async function dessinerMuscles() {
    const zoneMuscles = el.querySelector('[data-muscles-zone]');
    const sessionLike = {
      exercises: seance.exercises.map(ex => ({
        name: ex.name,
        sets: Array.from({ length: Math.max(0, ex.plannedSets || 0) }, () => ({ reps: 1 }))
      }))
    };
    const { zones, isEmpty } = await muscleLoadOf(sessionLike);
    zoneMuscles.replaceChildren();
    if (isEmpty) return;
    zoneMuscles.appendChild(h('<p class="champ-label">Zones sollicitées (prévisionnel)</p>'));
    const canvas = h('<canvas class="bilan-canvas"></canvas>');
    zoneMuscles.appendChild(canvas);
    await drawMuscleMap(canvas, zones, MuscleScale.SESSION);
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

  /** Champ de durée : affiche « 1:30 » et ouvre le pavé minutes/secondes.
   *  Remplace les <input type="number"> en secondes brutes — on ne saisit
   *  plus « 90 » pour une minute et demie. */
  function champDuree(label, valeurSec, min, max, onChange) {
    const champ = h(`
      <div class="champ champ-mini">
        <span>${esc(label)}</span>
        <button type="button" class="champ-duree" data-duree>${fmtRecup(valeurSec)}</button>
      </div>`);
    champ.querySelector('[data-duree]').onclick = () => ouvrirPaveDuree({
      titre: label.toUpperCase(), valeurSec, min, max, onValider: onChange
    });
    return champ;
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
    // Le panneau replié se rouvrait à chaque redessin, donc à chaque réglage
    // touché : on garde en mémoire l'exercice déplié.
    champs.hidden = deplie !== i;
    const tabata = ex.mode === 'TABATA';
    const emom = ex.mode === 'EMOM';
    const minuteur = ex.mode === 'MINUTEUR';
    champs.appendChild(h(`
      <label class="champ champ-mini"><span>Mode</span>
        <select data-mode>${MODES.map(m => `<option value="${m}"${m === ex.mode ? ' selected' : ''}>${MODE_LABELS[m]}</option>`).join('')}</select></label>`));
    if (!tabata) {
      champs.appendChild(h(`<label class="champ champ-mini"><span>Séries</span><input type="number" min="1" max="20" data-series value="${ex.plannedSets}"></label>`));
      champs.appendChild(h(`<label class="champ champ-mini"><span>Répétitions</span><input type="number" min="0" max="100" data-reps value="${ex.targetReps}"></label>`));
    }
    /* Les DURÉES ne se tapent plus au clavier système en secondes brutes :
       elles s'affichent en min:sec et s'ouvrent au pavé minutes/secondes,
       comme dans l'application (TimeField, TimePad.kt). */
    if (minuteur) champs.appendChild(champDuree('Récupération', ex.recupSec, 5, 600, (v) => { ex.recupSec = v; redessiner(); }));
    if (tabata) {
      champs.appendChild(champDuree('Travail', ex.workSec, 5, 600, (v) => { ex.workSec = v; redessiner(); }));
      champs.appendChild(champDuree('Repos', ex.restSec, 0, 600, (v) => { ex.restSec = v; redessiner(); }));
      champs.appendChild(h(`<label class="champ champ-mini"><span>Blocs</span><input type="number" min="1" max="30" data-blocs value="${ex.tabataSeries}"></label>`));
    }
    /* EMOM : un seul réglage propre, l'intervalle. Le nombre de tours, c'est
       le champ « Séries » ci-dessus — inutile d'en demander un second qui
       dirait la même chose. */
    if (emom) {
      champs.appendChild(champDuree('Intervalle', ex.workSec, 5, 600, (v) => { ex.workSec = v; redessiner(); }));
    }

    c.querySelector('[data-deplier]').textContent = champs.hidden ? 'Régler ce mode' : 'Masquer';
    c.querySelector('[data-deplier]').onclick = (e) => {
      champs.hidden = !champs.hidden;
      deplie = champs.hidden ? -1 : i;
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
    lie('[data-series]', 'plannedSets'); lie('[data-reps]', 'targetReps');
    lie('[data-blocs]', 'tabataSeries');

    c.querySelector('.exo-edit-suppr').onclick = () => { seance.exercises.splice(i, 1); redessiner(); };
    const poignee = c.querySelector('.exo-edit-poignee');
    // Appui bref : monte l'exercice d'un cran (rapide, précis). Appui long
    // puis glissé : repositionne n'importe où (detectDragGesturesAfterLongPress,
    // TrainingScreens.kt) — les deux coexistent, l'appui bref reste le clic
    // natif du navigateur, le glissé s'active seulement après le seuil.
    poignee.onclick = () => {
      if (i > 0) { [seance.exercises[i - 1], seance.exercises[i]] = [seance.exercises[i], seance.exercises[i - 1]]; redessiner(); }
    };
    activerGlisser(poignee, c, i);
    return c;
  }

  /** Glisser-déposer par appui long (TrainingScreens.kt, CreateWorkout) :
   *  la poignée ⠿ reste cliquable (nudge d'un cran), mais un appui de plus de
   *  350 ms suivi d'un déplacement du doigt/de la souris entre en mode
   *  glissé — la carte suit le pointeur (translateY) et échange sa place
   *  avec sa voisine dès que son centre en dépasse la moitié, comme
   *  detectDragGesturesAfterLongPress. Les liens « enchaîner » sont retirés
   *  le temps du geste (ils ne suivent pas le glissé) et reconstruits par
   *  redessiner() une fois la carte relâchée. */
  function activerGlisser(poignee, carte, indexDepart) {
    const SEUIL_APPUI_MS = 350;
    const SEUIL_ANNULATION_PX = 8;
    let minuteur = null;
    let enCours = false;
    let dragIndex = indexDepart;
    let dernierY = 0, offsetY = 0, gapPx = 0;

    function surDeplacement(e) {
      e.preventDefault();
      const pas = e.clientY - dernierY;
      dernierY = e.clientY;
      offsetY += pas;
      carte.style.transform = `translateY(${offsetY}px)`;

      const cartes = [...zone.querySelectorAll('.exo-edit')];
      if (dragIndex < cartes.length - 1) {
        const h = cartes[dragIndex + 1].getBoundingClientRect().height + gapPx;
        if (offsetY > h / 2) {
          zone.insertBefore(cartes[dragIndex + 1], carte);
          [seance.exercises[dragIndex], seance.exercises[dragIndex + 1]] =
            [seance.exercises[dragIndex + 1], seance.exercises[dragIndex]];
          dragIndex++;
          offsetY -= h;
          carte.style.transform = `translateY(${offsetY}px)`;
        }
      }
      if (dragIndex > 0) {
        const cartesMaj = [...zone.querySelectorAll('.exo-edit')];
        const h = cartesMaj[dragIndex - 1].getBoundingClientRect().height + gapPx;
        if (offsetY < -h / 2) {
          zone.insertBefore(carte, cartesMaj[dragIndex - 1]);
          [seance.exercises[dragIndex - 1], seance.exercises[dragIndex]] =
            [seance.exercises[dragIndex], seance.exercises[dragIndex - 1]];
          dragIndex--;
          offsetY += h;
          carte.style.transform = `translateY(${offsetY}px)`;
        }
      }
    }

    function surRelachement() {
      window.removeEventListener('pointermove', surDeplacement);
      window.removeEventListener('pointerup', surRelachement);
      window.removeEventListener('pointercancel', surRelachement);
      if (!enCours) return;
      enCours = false;
      carte.classList.remove('dragging');
      carte.style.transform = '';
      redessiner();
    }

    poignee.addEventListener('pointerdown', (e) => {
      if (e.button != null && e.button !== 0) return;
      const debutX = e.clientX, debutY = e.clientY;
      dernierY = e.clientY; offsetY = 0; dragIndex = indexDepart;

      const annulerSiBouge = (ev) => {
        if (Math.abs(ev.clientX - debutX) > SEUIL_ANNULATION_PX || Math.abs(ev.clientY - debutY) > SEUIL_ANNULATION_PX) {
          clearTimeout(minuteur);
          window.removeEventListener('pointermove', annulerSiBouge);
        }
      };
      const annulerSiRelache = () => {
        clearTimeout(minuteur);
        window.removeEventListener('pointermove', annulerSiBouge);
      };
      window.addEventListener('pointermove', annulerSiBouge);
      window.addEventListener('pointerup', annulerSiRelache, { once: true });

      minuteur = setTimeout(() => {
        window.removeEventListener('pointermove', annulerSiBouge);
        window.removeEventListener('pointerup', annulerSiRelache);
        enCours = true;
        gapPx = parseFloat(getComputedStyle(zone).rowGap || getComputedStyle(zone).gap || '0') || 0;
        zone.querySelectorAll('.lien-enchainer').forEach(b => b.remove());
        carte.classList.add('dragging');
        window.addEventListener('pointermove', surDeplacement);
        window.addEventListener('pointerup', surRelachement);
        window.addEventListener('pointercancel', surRelachement);
      }, SEUIL_APPUI_MS);
    });
  }

  function labelMode(ex) {
    if (ex.mode === 'MINUTEUR') return 'Minuteur ' + fmtRecup(ex.recupSec);
    if (ex.mode === 'TABATA') return `Tabata ${ex.workSec}/${ex.restSec}×${ex.tabataSeries}`;
    if (ex.mode === 'EMOM') return `EMOM ${fmtRecup(ex.workSec)} ×${ex.plannedSets}`;
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
