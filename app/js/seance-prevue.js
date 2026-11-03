/* ==========================================================================
   LES SÉANCES D'UN PROGRAMME, VUES DEPUIS L'ACCUEIL (v87) — portage de
   SeancePrevue.kt et de la carte d'Aujourdhui.kt. Les deux doivent dire la
   même chose.

   Demandes de Nicolas, toutes reprises ici :
   - la séance prévue en haut de l'écran Entraînement se CONSULTE d'un appui
     (ce que demain nous réserve, avant d'y être) — y compris celle du
     lendemain, une fois la séance du jour terminée ;
   - le jour J, une croix : reporter, sauter cette fois, ou la retirer du
     programme quand elle revient chaque semaine ;
   - on la FAIT GLISSER pour voir la séance d'après, qu'on peut démarrer de la
     même façon : un vrai pager qui suit le doigt et bloque aux deux bouts
     (pager.js) ;
   - la fiche donne la charge conseillée pour les répétitions PRÉVUES, et non
     « dernière fois : 120 kg × 3 » pour un 4 × 15.
   ========================================================================== */

import { h, esc, toast, dateBreve } from './ui.js';
import { saveProgram, listWorkouts, sessionsOf } from './api.js';
import { chargeConseillee, historiqueDesExercices } from './charge.js';
import { devineMateriel } from './catalog.js';
import { kg, fmtRecup } from './model.js';
import { minuit, plusJours, heureTexte } from './programme-ia.js';
import * as PE from './programme-edition.js';
import { creerPager, pointsDuPager } from './pager.js';

const faite = (s) => (s.doneAt || 0) > 0;

/* ================================================================ lecture */

/** La séance du jour, ou la plus ancienne restée à faire : une séance manquée
 *  lundi se rattrape mardi, elle ne disparaît pas de la vue. */
export function duJour(p) {
  const auj = minuit(Date.now());
  return (p?.sessions || [])
    .filter(s => !faite(s) && !s.skipped && minuit(s.dateMs) <= auj)
    .sort((a, b) => a.dateMs - b.dateMs)[0] || null;
}

/** Program.next() : la première séance ni faite ni sautée. */
export function suivante(p) {
  return [...(p?.sessions || [])].sort((a, b) => a.dateMs - b.dateMs)
    .find(s => !faite(s) && !s.skipped) || null;
}

/** Celle que la carte met en haut : la séance du jour, sinon la prochaine. */
export const enHaut = (p) => duJour(p) || suivante(p);

/** Les cinq séances qui suivent `apres`, dans l'ordre du calendrier. */
export function prochaines(p, apres, n = 5) {
  return [...(p?.sessions || [])]
    .filter(s => !faite(s) && !s.skipped && s.id !== apres?.id)
    .sort((a, b) => a.dateMs - b.dateMs)
    .slice(0, n);
}

/** Celle du haut puis les cinq suivantes : ce qu'on parcourt en glissant. */
export function fiches(p) {
  const haut = enHaut(p);
  return [...(haut ? [haut] : []), ...prochaines(p, haut)];
}

/** Séances de ce modèle encore à faire : plus d'une, c'est qu'elle se répète. */
const aVenir = (p, s) => (p.sessions || []).filter(x => x.workoutId === s.workoutId && !faite(x) && !x.skipped).length;
export const serepete = (p, s) => aVenir(p, s) > 1;

/** « Aujourd'hui », « Demain », « À rattraper · lun. 2 nov. », « jeu. 5 nov. ». */
export function quand(p, s) {
  const auj = minuit(Date.now());
  const jour = minuit(s.dateMs);
  const d = new Date(s.dateMs);
  const heure = p.sansHeure ? '' : ` · ${heureTexte(false, d.getHours() * 60 + d.getMinutes())}`;
  if (jour === auj) return p.sansHeure ? "Aujourd'hui, dans la journée" : `Aujourd'hui${heure}`;
  if (jour === plusJours(auj, 1)) return `Demain${heure}`;
  if (jour < auj) return `À rattraper · ${dateBreve(s.dateMs)}`;
  return `${dateBreve(s.dateMs)}${heure}`;
}

/** PlannedSession.estimatedSec (ProgramModel.kt). */
function dureePrevue(items) {
  const parExo = (items || []).reduce((t, e) => {
    const n = Math.max(1, e.sets || 1);
    return t + 300 + 10 + (n - 1) * (e.recupSec || 0) + n * (e.reps || 0) * 3;
  }, 0);
  return Math.round((600 + parExo) * 0.9);
}
function approx(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const r = m % 60;
  return r ? `${Math.floor(m / 60)} h ${String(r).padStart(2, '0')}` : `${Math.floor(m / 60)} h`;
}
const dose = (it) => it.holdSec > 0
  ? `${it.sets} × ${it.holdSec} s de maintien`
  : `${it.sets} × ${it.reps}${it.recupSec ? ` · r ${fmtRecup(it.recupSec)}` : ''}`;

/* ============================================================ charge à viser */

/** L'historique de chaque exercice (charge.js), lu une fois. Vide si illisible. */
export async function chargerHistorique(moiId) {
  try { return historiqueDesExercices(await sessionsOf(moiId, { limit: 200 })); }
  catch { return new Map(); }
}

/**
 * Ce que la fiche dit de la charge d'un exercice : la charge CONSEILLÉE pour
 * les répétitions PRÉVUES d'abord (charge.js passe par le 1RM : 120 × 3 donne
 * bien moins à 15), et la dernière série en simple repère, en dessous.
 */
export function repereCharge(it, historique) {
  const seances = historique.get(it.name) || [];
  const derniere = seances[0]
    ? (() => {
        const top = seances[0].sets.reduce((a, b) => (b.weight > a.weight ? b : a));
        return { top, texte: `dernière fois : ${kg(top.weight)} × ${top.reps}  (${dateBreve(seances[0].quand)})` };
      })()
    : null;
  const sortie = (conseille) => ({ conseille, derniere: derniere?.texte || null });
  // Un maintien se compte en secondes, un poids du corps ne se charge pas :
  // une charge conseillée n'y a pas de sens.
  if (it.holdSec > 0 || !(it.reps > 0) || devineMateriel(it.name) === 'LIBRE') return sortie(null);
  const sug = chargeConseillee(it.name, historique, it.reps);
  if (!sug || !(sug.poids > 0)) return sortie(null);
  // Même série que la dernière fois : le conseil n'apprendrait rien de plus.
  if (derniere && derniere.top.reps === it.reps && Math.abs(derniere.top.weight - sug.poids) < 0.6) return sortie(null);
  return sortie(`≈ ${kg(sug.poids)} conseillés pour ${it.reps} reps${derniere ? '' : ' (estimation)'}`);
}

/* =================================================================== actions */

async function reporter(moi, p, s, jourMs) {
  s.dateMs = PE.deplacerAuJour(s.dateMs, jourMs);
  p.sessions.sort((a, b) => a.dateMs - b.dateMs);
  await saveProgram(moi.id, p);
}

/** Saute cette fois seulement : le programme continue, la séance reste dans la liste, barrée. */
async function sauter(moi, p, s) {
  s.skipped = true; s.doneAt = 0;
  await saveProgram(moi.id, p);
}

/**
 * Retire la séance du programme pour toujours : toutes ses occurrences à venir
 * disparaissent, celles déjà faites restent dans l'historique. Renvoie la
 * raison d'un refus, ou null.
 */
async function retirer(moi, p, s) {
  const lignes = await listWorkouts(moi.id);
  const etat = PE.etatPourProgramme(p, lignes);
  if (etat.workouts.length <= 1) return 'Le programme doit garder au moins une séance.';
  PE.retirerModele(etat, s.workoutId);
  const pb = PE.probleme(etat);
  if (pb) return pb;
  await PE.enregistrer(moi.id, etat);
  return null;
}

/* ---- Décaler plusieurs séances d'un coup (v88) ----

   Demande de Nicolas : « aujourd'hui je ne peux pas faire ma séance, je
   voudrais décaler tous les entraînements de la semaine, du lundi au
   dimanche » — et, dans l'écran du programme, tout le programme. Toutes les
   séances décalées bougent du MÊME nombre de jours : la forme du planning (un
   jour de repos entre deux séances…) est conservée. Portage de SeanceActions
   (SeancePrevue.kt). */

/** Nombre de jours entre deux dates, arrondi pour absorber le changement d'heure. */
export const joursEntre = (de, a) => Math.round((minuit(a) - minuit(de)) / 86400000);

/** Lundi 0 h de la semaine (lundi → dimanche) qui contient ce jour. */
function lundiDe(ms) {
  const d = new Date(minuit(ms));
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

/** Les séances encore à faire de la semaine (lundi → dimanche) de `s`. */
export function semaineDe(p, s) {
  const debut = lundiDe(s.dateMs);
  const fin = plusJours(debut, 7);
  return (p.sessions || [])
    .filter(x => !faite(x) && !x.skipped && x.dateMs >= debut && x.dateMs < fin)
    .sort((a, b) => a.dateMs - b.dateMs);
}

/** Ce que « décaler tout le programme » fait bouger : toutes les séances pas encore faites. */
export const aDecaler = (p) => (p.sessions || []).filter(x => !faite(x)).sort((a, b) => a.dateMs - b.dateMs);

/** « d'un jour », « de 3 jours » — le nombre se dit, il ne s'écrit pas « de 1 jours ». */
const deJours = (n) => {
  const j = Math.abs(n);
  if (j % 7 === 0) return j === 7 ? "d'une semaine" : `de ${j / 7} semaines`;
  return j === 1 ? "d'un jour" : `de ${j} jours`;
};

/** Décale les séances de `liste` de `jours` jours (l'heure de chacune est gardée). */
async function decalerSeances(moi, p, liste, jours) {
  liste.forEach(x => { x.dateMs = plusJours(x.dateMs, jours); });
  p.sessions.sort((a, b) => a.dateMs - b.dateMs);
  await saveProgram(moi.id, p);
}

/** « Aujourd'hui », « Demain », « jeu. 5 » : le libellé court d'un jour proposé. */
function libelleJour(k, jour) {
  return k === 0 ? "Aujourd'hui" : k === 1 ? 'Demain' : dateBreve(jour).split(' ').slice(0, 2).join(' ');
}

/**
 * Décaler TOUT le programme, depuis son écran : de combien, ce que ça donne (la
 * prochaine séance, la dernière), puis on confirme — un geste qui touche tout le
 * planning ne part jamais d'un seul appui. Les séances déjà faites ne bougent pas.
 * `apres` est appelé une fois le programme enregistré (la vue se redessine).
 */
export function ouvrirDecalageProgramme({ moi, p, apres }) {
  const liste = aDecaler(p);
  const choix = [[1, '1 jour'], [2, '2 jours'], [3, '3 jours'], [4, '4 jours'], [5, '5 jours'], [7, '1 semaine'], [14, '2 semaines']];
  const m = h(`
    <div class="modale" role="dialog" aria-label="Décaler tout le programme">
      <div class="modale-boite modale-boite-etroite menu-action">
        <p class="menu-action-titre">Décaler tout le programme</p>
        ${liste.length ? `
          <p class="menu-action-sous" style="margin:.4rem 0 .9rem">Les ${liste.length} séances à venir avancent du même nombre de jours. Celles déjà faites ne bougent pas.</p>
          <p class="champ-label">Décaler de</p>
          <div class="seance-jours" data-choix></div>
          <div class="decalage-apercu" data-apercu></div>
          <button class="btn btn-lg" data-oui type="button" disabled style="width:100%;margin-top:.9rem">Décaler</button>`
          : '<p class="menu-action-sous" style="margin:.6rem 0">Il ne reste aucune séance à faire dans ce programme.</p>'}
        <button class="lien-inline menu-action-annuler" data-fermer type="button">Annuler</button>
      </div>
    </div>`);
  const fermer = () => m.remove();
  m.addEventListener('click', (e) => { if (e.target === m) fermer(); });
  m.querySelector('[data-fermer]').onclick = fermer;

  if (liste.length) {
    let jours = 0;
    const oui = m.querySelector('[data-oui]');
    const apercu = m.querySelector('[data-apercu]');
    const puces = [];
    choix.forEach(([n, libelle]) => {
      const b = h(`<button type="button" class="chip-cat">${esc(libelle)}</button>`);
      b.onclick = () => {
        jours = n;
        puces.forEach(x => x.classList.toggle('on', x === b));
        const premiere = liste[0], derniere = liste[liste.length - 1];
        apercu.replaceChildren(h(`
          <div>
            <p>La prochaine : « ${esc(premiere.title)} »<br>
              <b>${esc(dateBreve(premiere.dateMs))} → ${esc(dateBreve(plusJours(premiere.dateMs, n)))}</b></p>
            ${liste.length > 1 ? `<p class="decalage-derniere">La dernière : « ${esc(derniere.title)} »<br>
              ${esc(dateBreve(derniere.dateMs))} → ${esc(dateBreve(plusJours(derniere.dateMs, n)))}</p>` : ''}
          </div>`));
        oui.disabled = false;
      };
      puces.push(b);
      m.querySelector('[data-choix]').appendChild(b);
    });
    oui.onclick = async () => {
      oui.disabled = true;
      try {
        await decalerSeances(moi, p, liste, jours);
        fermer();
        toast(`${liste.length} séances décalées ${deJours(jours)}`);
        apres?.();
      } catch (e) {
        toast(e.message || "Le programme n'a pas pu être décalé.");
        oui.disabled = false;
      }
    };
  }
  document.body.appendChild(m);
}

/* ============================================================ menu de la croix */

/**
 * Décaler la séance, ou toute la semaine d'un coup, la sauter cette fois, ou la
 * retirer du programme (seulement si elle revient chaque semaine — sinon sauter
 * suffit). Plusieurs écrans dans la même fenêtre : le menu, le choix du jour
 * (cette séance seule, ou la semaine), l'aperçu de ce que la semaine devient, la
 * confirmation d'un retrait. Un changement qui touche plusieurs séances ou qui
 * supprime ne part jamais d'un seul appui.
 */
export function ouvrirMenuSeance({ moi, p, s, apres }) {
  const m = h(`
    <div class="modale" role="dialog" aria-label="${esc(s.title)}">
      <div class="modale-boite modale-boite-etroite menu-action">
        <p class="menu-action-titre">${esc(s.title)}</p>
        <div data-corps></div>
        <button class="lien-inline menu-action-annuler" data-retour type="button">Annuler</button>
      </div>
    </div>`);
  const corps = m.querySelector('[data-corps]');
  const retour = m.querySelector('[data-retour]');
  const fermer = () => m.remove();
  m.addEventListener('click', (e) => { if (e.target === m) fermer(); });

  const termine = async (action, message) => {
    corps.querySelectorAll('button').forEach(b => { b.disabled = true; });
    try { await action(); } catch (e) { toast(e.message || "Le changement n'a pas pu être enregistré."); fermer(); return; }
    fermer(); toast(message); apres?.();
  };

  function menu() {
    retour.textContent = 'Annuler'; retour.onclick = fermer;
    const semaine = semaineDe(p, s);
    corps.replaceChildren(h(`
      <div>
        <p class="menu-action-sous">${esc(quand(p, s))}</p>
        <div class="menu-action-lignes">
          <button class="menu-action-ligne" data-seule type="button">Décaler cet entraînement</button>
          ${semaine.length >= 2 ? `
          <button class="menu-action-ligne" data-semaine type="button">Décaler toute la semaine</button>
          <p class="menu-action-sous">${semaine.length} séances, du lundi au dimanche, d'un coup</p>` : ''}
          <button class="menu-action-ligne" data-sauter type="button">Sauter cette séance</button>
          <p class="menu-action-sous">Le reste du programme continue.</p>
          ${serepete(p, s) ? '<button class="menu-action-ligne menu-action-ligne-danger" data-retirer type="button">Retirer du programme</button>' : ''}
        </div>
      </div>`));
    corps.querySelector('[data-seule]').onclick = () => jours('seule');
    corps.querySelector('[data-semaine]')?.addEventListener('click', () => jours('semaine'));
    corps.querySelector('[data-sauter]').onclick = () =>
      termine(() => sauter(moi, p, s), `« ${s.title} » sautée : elle ne compte pas pour cette fois`);
    corps.querySelector('[data-retirer]')?.addEventListener('click', confirmation);
  }

  /** Le jour où va la séance : pour elle seule, ou pour la semaine entière
   *  (les autres suivent du même nombre de jours, après un aperçu). */
  function jours(portee) {
    retour.textContent = 'Retour'; retour.onclick = menu;
    const auj = minuit(Date.now());
    // En retard, « Aujourd'hui » est le report le plus utile.
    const decalages = minuit(s.dateMs) < auj ? [0, 1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5, 6, 7];
    const zone = h('<div class="seance-jours"></div>');
    decalages.forEach(k => {
      const jour = plusJours(auj, k);
      const b = h(`<button type="button" class="chip-cat">${esc(libelleJour(k, jour))}</button>`);
      b.onclick = () => (portee === 'seule'
        ? termine(() => reporter(moi, p, s, jour), `« ${s.title} » décalée au ${dateBreve(jour)}`)
        : apercuSemaine(jour));
      zone.appendChild(b);
    });
    corps.replaceChildren(h(`<p class="menu-action-sous">${portee === 'seule'
      ? 'Décaler à quel jour ?'
      : `Cette séance passe à quel jour ? Les ${semaineDe(p, s).length} séances de la semaine suivent du même nombre de jours.`}</p>`), zone);
  }

  /** Ce que devient la semaine, ligne par ligne, avant de confirmer. */
  function apercuSemaine(jour) {
    retour.textContent = 'Retour'; retour.onclick = () => jours('semaine');
    const semaine = semaineDe(p, s);
    const n = joursEntre(s.dateMs, jour);
    const bloc = h(`
      <div>
        <p class="menu-action-sous" style="margin:.4rem 0 .6rem">Les ${semaine.length} séances de la semaine avancent ${deJours(n)} :</p>
        <ul class="decalage-liste">${semaine.map(x => `
          <li><b>${esc(x.title)}</b> : ${esc(dateBreve(x.dateMs))} → ${esc(dateBreve(plusJours(x.dateMs, n)))}</li>`).join('')}</ul>
        <button class="btn btn-lg" data-oui type="button" style="width:100%;margin-top:.8rem">Décaler les ${semaine.length} séances</button>
      </div>`);
    bloc.querySelector('[data-oui]').onclick = () =>
      termine(() => decalerSeances(moi, p, semaine, n), `${semaine.length} séances décalées ${deJours(n)}`);
    corps.replaceChildren(bloc);
  }

  function confirmation() {
    retour.textContent = 'Retour'; retour.onclick = menu;
    const n = aVenir(p, s);
    const bloc = h(`
      <div>
        <p class="menu-action-sous" style="margin:.4rem 0 1rem">Les ${n} séances « ${esc(s.title)} » à venir sont retirées du programme, chaque semaine. Celles déjà faites restent dans ton historique.</p>
        <p class="etat-mono" data-refus hidden style="color:var(--accent2)"></p>
        <button class="btn btn-lg" data-oui type="button" style="width:100%">Retirer du programme</button>
      </div>`);
    bloc.querySelector('[data-oui]').onclick = async () => {
      const bouton = bloc.querySelector('[data-oui]');
      bouton.disabled = true;
      try {
        const refus = await retirer(moi, p, s);
        if (refus) {
          const z = bloc.querySelector('[data-refus]'); z.textContent = refus; z.hidden = false;
          bouton.disabled = false;
          return;
        }
        fermer(); toast(`« ${s.title} » retirée du programme`); apres?.();
      } catch (e) {
        toast(e.message || "Le programme n'a pas pu être modifié.");
        bouton.disabled = false;
      }
    };
    corps.replaceChildren(bloc);
  }

  menu();
  document.body.appendChild(m);
}

/* ================================================================== la fiche */

function pageFiche({ moi, p, s, carnet, historique, fermer, apres }) {
  const w = carnet.find(r => String(r.local_id) === String(s.workoutId));
  const page = h(`
    <div class="fiche-page">
      <h2 class="fiche-titre">${esc(s.title)} — semaine ${s.week}</h2>
      <p class="ligne-meta">${esc(quand(p, s))} · environ ${approx(dureePrevue(s.items))}</p>
      ${s.deload ? '<p class="prog-decharge">Semaine de décharge : volume réduit volontairement.</p>' : ''}
      <ul class="prog-items">${(s.items || []).map(it => {
        const r = repereCharge(it, historique);
        return `<li><b>${esc(it.name)}</b> — ${esc(dose(it))}
          ${r.conseille ? `<span class="repere-conseille">${esc(r.conseille)}</span>` : ''}
          ${r.derniere ? `<span>${esc(r.derniere)}</span>` : ''}
          ${it.hint ? `<span>${esc(it.hint)}</span>` : ''}</li>`;
      }).join('')}</ul>
      ${!w ? '<p class="etat-mono">Le modèle de cette séance a été supprimé du carnet.</p>' : ''}
      <div class="prog-modale-actions">
        ${w && !faite(s) ? '<button class="btn btn-lg" data-go type="button">Démarrer la séance</button>' : ''}
        ${!faite(s) ? '<button class="lien-inline" data-actions type="button">Décaler, sauter ou retirer…</button>' : ''}
      </div>
    </div>`);
  page.querySelector('[data-go]')?.addEventListener('click', () => {
    // Séries et répétitions de CETTE semaine : l'écran de séance les lit au
    // démarrage et coche la séance à la fin (programme-edition.js).
    PE.annoncerSeancePrevue(p.id, s.id, s.workoutId);
    fermer();
    location.hash = `#/seances/${s.workoutId}/lancer`;
  });
  page.querySelector('[data-actions]')?.addEventListener('click', () => {
    fermer();
    ouvrirMenuSeance({ moi, p, s, apres });
  });
  return page;
}

/**
 * Le détail des séances, qu'on parcourt comme celles de la carte : la page
 * suit le doigt, droite vers gauche pour la suite, gauche vers droite pour
 * revenir, blocage aux bouts. Les flèches ‹ › font la même chose d'un appui.
 * Chaque séance garde son bouton Démarrer.
 */
export function ouvrirFiches({ moi, p, liste, depart, carnet, historique, apres }) {
  if (!liste.length) return;
  const m = h(`
    <div class="modale" role="dialog" aria-label="Séance prévue">
      <div class="modale-boite prog-modale">
        <div class="fiche-nav" ${liste.length > 1 ? '' : 'hidden'}>
          <button type="button" class="fiche-fleche" data-prec aria-label="Séance précédente">‹</button>
          <span data-compteur></span>
          <button type="button" class="fiche-fleche" data-suiv aria-label="Séance suivante">›</button>
        </div>
        <div data-pager class="fiche-pager"></div>
        <button class="lien-inline" data-fermer type="button" style="align-self:center;margin-top:.6rem">Fermer</button>
      </div>
    </div>`);
  const fermer = () => m.remove();
  const pages = liste.map(s => pageFiche({ moi, p, s, carnet, historique, fermer, apres }));
  const compteur = m.querySelector('[data-compteur]');
  const prec = m.querySelector('[data-prec]');
  const suiv = m.querySelector('[data-suiv]');
  const maj = (c) => {
    compteur.textContent = `${c + 1} / ${liste.length}`;
    prec.disabled = c === 0;
    suiv.disabled = c === liste.length - 1;
  };
  const pager = creerPager({ pages, depart, ecart: 24, auChangement: maj });
  maj(pager.courant());
  prec.onclick = () => pager.aller(pager.courant() - 1);
  suiv.onclick = () => pager.aller(pager.courant() + 1);
  m.querySelector('[data-pager]').appendChild(pager.racine);
  m.querySelector('[data-fermer]').onclick = fermer;
  m.addEventListener('click', (e) => { if (e.target === m) fermer(); });
  document.body.appendChild(m);
}

/* =============================================================== la carte */

function pageCarte({ moi, p, s, rang, estDuJour, carnet, ouvrir, menu, forme }) {
  const enRetard = minuit(s.dateMs) < minuit(Date.now());
  const etiquette = estDuJour && enRetard ? 'À RATTRAPER'
    : estDuJour ? "AUJOURD'HUI"
    : rang === 0 ? 'PROCHAINE SÉANCE' : 'ENSUITE';
  const w = carnet.find(r => String(r.local_id) === String(s.workoutId));
  const page = h(`
    <div class="carte-page">
      <div class="aujourdhui-tete">
        <b>${etiquette}</b>
        <span class="aujourdhui-droite">
          ${rang === 0 && forme ? `<span class="forme-${forme.classe}">${esc(forme.label)}</span>` : ''}
          ${estDuJour ? '<button class="croix-seance" data-croix type="button" aria-label="Décaler, sauter ou retirer cette séance">✕</button>' : ''}
        </span>
      </div>
      <div class="aujourdhui-seance">
        <button class="aujourdhui-titre" data-ouvrir type="button">
          <b>${esc(s.title)}</b>
          <span>${esc(quand(p, s))} · semaine ${s.week} · ${(s.items || []).length} exos</span>
        </button>
        ${w && !faite(s) ? '<button class="btn" data-demarrer type="button">Démarrer</button>'
          : `<a class="lien-inline" href="#/programmes/${esc(String(p.id))}">Programme ›</a>`}
      </div>
    </div>`);
  page.querySelector('[data-ouvrir]').onclick = () => ouvrir(s);
  page.querySelector('[data-croix]')?.addEventListener('click', () => menu(s));
  page.querySelector('[data-demarrer]')?.addEventListener('click', () => {
    PE.annoncerSeancePrevue(p.id, s.id, s.workoutId);
    location.hash = `#/seances/${s.workoutId}/lancer`;
  });
  return page;
}

/**
 * La carte « Aujourd'hui » : la séance du haut et les cinq suivantes, qu'on
 * parcourt en glissant. `apres` est appelé quand une action a modifié le
 * programme (la vue se redessine). Renvoie l'élément à poser, ou null s'il n'y
 * a aucune séance à venir.
 */
export function carrouselSeances({ moi, p, carnet, historique, forme, apres }) {
  const liste = fiches(p);
  if (!liste.length) return null;
  const aFaire = duJour(p);
  const ouvrir = (s) => ouvrirFiches({
    moi, p, liste, depart: Math.max(0, liste.findIndex(x => x.id === s.id)), carnet, historique, apres
  });
  const menu = (s) => ouvrirMenuSeance({ moi, p, s, apres });
  const pages = liste.map((s, rang) => pageCarte({
    moi, p, s, rang, estDuJour: s.id === aFaire?.id, carnet, ouvrir, menu, forme
  }));
  const racine = h('<div class="carrousel"></div>');
  let points = null;
  // Pas d'écart : chaque page porte son propre remplissage, et la séance voisine
  // glisse jusqu'au bord de la carte sans rien montrer de plus au repos.
  const pager = creerPager({ pages, ecart: 0, auChangement: (c) => points?.maj(c) });
  racine.appendChild(pager.racine);
  if (liste.length > 1) {
    points = pointsDuPager(pager);
    racine.appendChild(points.zone);
  }
  return racine;
}
