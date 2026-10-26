/* ==========================================================================
   PROGRAMMES — liste, création, planning, modification, agenda.

   Pendant web de ProgramScreens.kt. Le web n'avait jusqu'ici qu'une liste et
   la génération par IA : pas de planning à suivre, pas de séance prévue à
   lancer, rien à modifier. Il fait maintenant tout ce que fait l'appli :

   - CRÉATION : un objectif type (algorithme maison, generateur-local.js) ou
     un objectif décrit en une phrase (Moti, programme-ia.js) ;
   - MODIFICATION, le même écran pour l'aperçu d'un programme neuf et pour un
     programme en cours : demander à Moti en une phrase, puis affiner à la
     main (exercices d'une séance, jour, nom, heure). Toute la logique est
     dans programme-edition.js, portage de ProgramEdit.kt ;
   - PLANNING : semaine par semaine, séance prévue lancée avec SES séries et
     répétitions, sautée, reportée, cochée à la fin ;
   - AGENDA : abonnement Google Agenda (ou Apple, Outlook) par une adresse
     secrète que l'agenda relit seul — le web ne peut pas écrire dans
     l'agenda d'un téléphone comme l'appli (voir api.js, fluxAgenda).
   ========================================================================== */

import { h, render, loading, empty, failure, esc, toast, dateBreve } from '../ui.js';
import { ajouterMicro } from '../dictee.js';
import { currentUser } from '../supabase.js';
import {
  listPrograms, deleteProgram, saveProgram, listWorkouts, deleteWorkout, aAccesIA,
  fluxAgenda, activerFluxAgenda, retirerFluxAgenda, urlFluxAgenda
} from '../api.js';
import { GOALS, LEVELS, fmtRecup, dureeDeLaSeance, nouvelleSeance, CIRCUIT_WORK_SEC } from '../model.js';
import { GEARS } from '../catalog.js';
import { niveauActuel, objectifActuel, definirNiveau, definirObjectif } from '../reglages.js';
import {
  genererProgrammeIA, defaultDaysFor, WEEK_DAYS, WEEK_DAY_LABELS, plusJours, minuit,
  MINUTE_LIBRE, heureTexte
} from '../programme-ia.js';
import { construireProgrammeLocal } from '../generateur-local.js';
import * as PE from '../programme-edition.js';
import { vignetteExercice } from '../exercise-visuals.js';
import { vueSeanceEdition, catColor } from './entrainement.js';

/* ================================================================ outils */

const CLE_VUE = 'motio.programme-vue';   // 'semaines' | 'mois' — vue du planning retenue
const NOMS_MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

const heureLabel = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const heureDe = (ms) => { const d = new Date(ms); return heureLabel(d.getHours() * 60 + d.getMinutes()); };

/** « à 18:30 », ou « dans la journée » quand le programme n'impose pas
 *  d'heure — celle du planning n'est alors qu'une convention interne, midi
 *  (Program.sansHeure, ProgramModel.kt). */
function heureDeLaSeance(p, s) {
  const d = new Date(s.dateMs);
  const txt = heureTexte(!!p.sansHeure, d.getHours() * 60 + d.getMinutes());
  return p.sansHeure ? txt : `à ${txt}`;
}
const faite = (s) => (s.doneAt || 0) > 0;
const libelleNiveau = (id) => (LEVELS.find(l => l.id === id) || {}).label || '';

/* ===================================================== attente de Moti */

/** Ce que Moti fait pendant qu'on attend un programme entier. */
const ETAPES_PROGRAMME = [
  'Il relit ton carnet : charges, records, fréquence réelle…',
  'Il choisit les exercices que ton matériel permet…',
  'Il découpe le programme en cycles d’entraînement…',
  'Il règle séries, répétitions et récupérations, semaine par semaine…',
  'Il écrit pourquoi chaque bloc est là…',
  'Dernières vérifications…'
];

/** Ce qu'il fait quand il réécrit un programme déjà construit. */
const ETAPES_MODIF = [
  'Il relit ton programme en entier…',
  'Il repère ce que ta demande change, et ce qu’elle implique…',
  'Il réécrit les semaines à venir…',
  'Il vérifie que les cycles se tiennent toujours…',
  'Presque fini…'
];

/**
 * L'ÉCRAN D'ATTENTE DE MOTI (EcranMotiTravaille, ProgramScreens.kt).
 *
 * Écrire un programme prend de trente secondes à une minute. Tant que ce
 * travail n'occupait qu'un libellé de bouton, on croyait que rien ne se
 * passait. L'écran entier l'annonce, et les étapes défilent pour qu'on voie
 * que ça avance. La dernière reste affichée : l'attente peut dépasser la
 * liste, et revenir à la première ferait croire que tout recommence.
 *
 * Renvoie l'élément à rendre et le `arreter()` à appeler quand c'est fini —
 * sans quoi le minuteur survivrait au changement d'écran.
 */
function ecranAttenteMoti(titre, etapes) {
  const el = h(`
    <section class="page page-etroite attente-moti">
      <img class="attente-avatar" src="../assets/img/moti_avatar.jpg" alt="">
      <h1>${esc(titre)}</h1>
      <div class="attente-barre"><span></span></div>
      <p class="attente-etape" data-etape>${esc(etapes[0] || '')}</p>
      <p class="etat-mono">Compte trente secondes à une minute. Reste sur cette page :
        elle se remplit toute seule dès que c’est prêt.</p>
    </section>`);
  let i = 0;
  const zone = el.querySelector('[data-etape]');
  const minuteur = setInterval(() => {
    if (i >= etapes.length - 1) return clearInterval(minuteur);
    i++;
    zone.textContent = etapes[i];
  }, 4500);
  return { el, arreter: () => clearInterval(minuteur) };
}

/**
 * L'EN-TÊTE D'UN CYCLE (BlockHeader, ProgramScreens.kt) : son nom, les
 * semaines qu'il couvre, et la raison pour laquelle il est là.
 *
 * C'est le cœur de ce qui fait voir que Moti programme et ne recopie pas : un
 * bloc de force et un bloc de volume ne se devinent pas en lisant des séries,
 * ils se lisent dans la phrase qui les annonce.
 */
function carteCycle(b) {
  return h(`
    <div class="bloc-cycle">
      <div class="bloc-cycle-tete">
        <span class="bloc-cycle-nom">${esc(b.label || 'Le programme')}</span>
        <span class="bloc-cycle-sem">${esc(PE.libelleSemaines(b))}${b.deload ? ' · décharge' : ''}</span>
      </div>
      ${b.goal ? `<p class="bloc-cycle-but">${esc(b.goal)}</p>` : ''}
    </div>`);
}

/** fmtApprox (ProgramScreens.kt) : « 1 h 05 » ou « 48 min ». */
function approx(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const r = m % 60;
  return r ? `${Math.floor(m / 60)} h ${String(r).padStart(2, '0')}` : `${Math.floor(m / 60)} h`;
}

/** PlannedSession.estimatedSec (ProgramModel.kt). */
function dureePrevue(items) {
  const parExo = (items || []).reduce((t, e) => {
    const n = Math.max(1, e.sets || 1);
    return t + 300 + 10 + (n - 1) * (e.recupSec || 0) + n * (e.reps || 0) * 3;
  }, 0);
  return Math.round((600 + parExo) * 0.9);
}

function doseItem(it) {
  return it.holdSec > 0 ? `${it.sets} × ${it.holdSec} s de maintien`
    : `${it.sets} × ${it.reps}${it.recupSec ? ` · r ${fmtRecup(it.recupSec)}` : ''}`;
}

function doseExercice(w, e) {
  if (w.circuit) return `${e.workSec > 0 ? e.workSec : CIRCUIT_WORK_SEC} s`;
  if (e.mode === 'MAINTIEN') return `${e.tabataSeries} × ${e.workSec} s`;
  if (e.targetReps > 0) return `${e.plannedSets} × ${e.targetReps} · r ${fmtRecup(e.recupSec)}`;
  return `${e.plannedSets} séries`;
}

/** Program.next() : la première séance ni faite ni sautée. */
function prochaine(p) {
  return [...(p.sessions || [])].sort((a, b) => a.dateMs - b.dateMs).find(s => !faite(s) && !s.skipped) || null;
}

/** Petite fenêtre : un titre, un texte, des boutons. Rend la valeur du bouton choisi. */
function demander({ titre, texte = '', champ = null, boutons }) {
  return new Promise((resolve) => {
    const m = h(`
      <div class="modale" role="dialog" aria-label="${esc(titre)}">
        <div class="modale-boite modale-boite-etroite">
          <div class="modale-tete"><h2>${esc(titre)}</h2></div>
          ${texte ? `<p class="etat-mono" style="text-align:left">${esc(texte)}</p>` : ''}
          ${champ ? `<label class="champ" style="text-align:left"><span>${esc(champ.label)}</span>
            <input type="text" data-champ maxlength="60" value="${esc(champ.valeur || '')}" placeholder="${esc(champ.placeholder || '')}"></label>` : ''}
          ${champ?.jour !== undefined ? `<label class="champ" style="text-align:left"><span>Chaque semaine, le</span>
            <select data-jour>${WEEK_DAYS.map(d => `<option value="${d}" ${d === champ.jour ? 'selected' : ''}>${PE.libelleJour(d)}</option>`).join('')}</select></label>` : ''}
          <div class="prog-boutons"></div>
        </div>
      </div>`);
    const zone = m.querySelector('.prog-boutons');
    const fermer = (v) => { m.remove(); resolve(v); };
    boutons.forEach(b => {
      const el = h(`<button type="button" class="${b.classe || 'btn'}">${esc(b.label)}</button>`);
      el.onclick = () => {
        if (!champ) return fermer(b.valeur);
        const texteSaisi = m.querySelector('[data-champ]').value.trim();
        if (b.valeur && !texteSaisi) return toast('Donne un nom.');
        fermer(b.valeur ? { texte: texteSaisi, jour: Number(m.querySelector('[data-jour]')?.value ?? 1) } : null);
      };
      zone.appendChild(el);
    });
    m.addEventListener('click', (e) => { if (e.target === m) fermer(null); });
    document.body.appendChild(m);
    m.querySelector('[data-champ]')?.focus();
  });
}

/* ================================================================ liste */

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
      { href: '#/programmes/nouveau', label: 'Créer un programme' }
    ));
  }

  const el = h(`
    <section class="page">
      <p class="eyebrow">Entraînement</p>
      <h1>Programmes</h1>
      <a class="btn" href="#/programmes/nouveau">Nouveau programme</a>
      <ul class="liste" data-liste></ul>
    </section>`);

  const ul = el.querySelector('[data-liste]');
  programmes
    .sort((a, b) => (b.data?.createdAt || 0) - (a.data?.createdAt || 0))
    .forEach(row => {
      const d = row.data || {};
      const faites = (d.sessions || []).filter(faite).length;
      const total = (d.sessions || []).length;
      const n = prochaine(d);
      const li = h(`
        <li class="ligne ligne-cliquable">
          <div class="ligne-tete">
            <span class="ligne-titre">${esc(d.name || row.name)}</span>
            <span class="ligne-meta">${n ? `Prochaine : ${esc(dateBreve(n.dateMs))}` : total ? 'Terminé' : ''}</span>
          </div>
          <p class="ligne-stats">
            <span>${d.weeks || '?'} semaines</span>
            <span>${d.daysPerWeek || '?'} séances / semaine</span>
            <span>${faites} / ${total} faites</span>
          </p>
        </li>`);
      // Toute la carte est cliquable, pas seulement le titre.
      li.onclick = () => { location.hash = `#/programmes/${row.local_id}`; };
      ul.appendChild(li);
    });
  render(el);
}

/* ============================================================== planning */

export async function vueProgramme(params) {
  render(loading('Chargement du programme'));
  const moi = await currentUser();

  let rows, carnet, flux = null;
  try {
    [rows, carnet] = await Promise.all([listPrograms(moi.id), listWorkouts(moi.id)]);
  } catch (e) { return render(failure(e, "Le programme n'a pas pu être chargé")); }
  const row = rows.find(r => String(r.local_id) === String(params.id));
  if (!row) {
    return render(empty('Programme introuvable', 'Il a peut-être été supprimé.',
      { href: '#/programmes', label: 'Mes programmes' }));
  }
  const p = row.data;
  try { flux = await fluxAgenda(moi.id, p.id); } catch { /* table absente ou hors ligne : pas d'agenda */ }

  const el = h(`<section class="page prog"></section>`);
  let vueMois = false;
  try { vueMois = localStorage.getItem(CLE_VUE) === 'mois'; } catch { /* stockage refusé : la liste */ }
  let moisAffiche = null;          // année × 12 + mois, null = celui de la prochaine séance
  let glisseVient = false;         // un glissé vient de finir : ce n'était pas un appui
  dessiner();
  render(el);

  /**
   * LE PLANNING EN MOIS (ProgramMonth, ProgramScreens.kt) : grille lundi →
   * dimanche, séances en pastilles de la couleur de leur catégorie. Un appui
   * ouvre la séance ; l'appui MAINTENU puis glissé la déplace sur un autre
   * jour, à la même heure. Ni séance faite déplacée, ni dépôt dans le passé.
   */
  function grilleMois() {
    const auj = minuit(Date.now());
    if (moisAffiche === null) {
      const ref = new Date(prochaine(p)?.dateMs || Date.now());
      moisAffiche = ref.getFullYear() * 12 + ref.getMonth();
    }
    const an = Math.floor(moisAffiche / 12), m = moisAffiche % 12;
    const d = new Date(an, m, 1);
    while (d.getDay() !== 1) d.setDate(d.getDate() - 1);
    const jours = [];
    do { for (let i = 0; i < 7; i++) { jours.push(d.getTime()); d.setDate(d.getDate() + 1); } }
    while (d.getMonth() === m && d.getFullYear() === an);
    const parJour = new Map();
    p.sessions.forEach(s => {
      const k = minuit(s.dateMs);
      if (!parJour.has(k)) parJour.set(k, []);
      parJour.get(k).push(s);
    });

    const bloc = h(`
      <div class="prog-mois">
        <div class="prog-mois-tete">
          <button type="button" class="btn btn-ghost btn-sm" data-prec aria-label="Mois précédent">‹</button>
          <b>${NOMS_MOIS[m]} ${an}</b>
          <button type="button" class="btn btn-ghost btn-sm" data-suiv aria-label="Mois suivant">›</button>
        </div>
        <div class="prog-mois-grille">${WEEK_DAY_LABELS.map(l => `<span class="prog-mois-jsem">${l}</span>`).join('')}</div>
        <p class="etat-mono">Touche une séance pour l'ouvrir. Maintiens-la puis fais-la glisser
          sur un autre jour pour la déplacer, à la même heure.</p>
      </div>`);
    bloc.querySelector('[data-prec]').onclick = () => { moisAffiche--; dessiner(); };
    bloc.querySelector('[data-suiv]').onclick = () => { moisAffiche++; dessiner(); };
    const grille = bloc.querySelector('.prog-mois-grille');
    jours.forEach(j => {
      const dj = new Date(j);
      const cellule = h(`<div class="prog-case ${dj.getMonth() !== m ? 'hors' : ''} ${j === auj ? 'auj' : ''}" data-jour="${j}">
          <span class="prog-case-num">${dj.getDate()}</span></div>`);
      (parJour.get(j) || []).sort((a, b) => a.dateMs - b.dateMs).forEach(s => {
        const pastille = h(`<button type="button" class="prog-pastille-mois ${faite(s) || s.skipped ? 'passee' : ''}"
            style="--cat:${catColor(s.category)}">${faite(s) ? '✓ ' : ''}${esc(s.title)}</button>`);
        pastille.onclick = () => { if (!glisseVient) ouvrirSeance(s); };
        if (!faite(s)) activerGlisser(pastille, s);
        cellule.appendChild(pastille);
      });
      grille.appendChild(cellule);
    });
    return bloc;
  }

  /** Appui maintenu (350 ms) puis glissé — au doigt comme à la souris. */
  function activerGlisser(pastille, s) {
    let minuteur = null, fantome = null, depart = null;
    const caseSous = (x, y) => document.elementFromPoint(x, y)?.closest?.('.prog-case');
    const placer = (x, y) => {
      fantome.style.left = `${x}px`; fantome.style.top = `${y}px`;
      document.querySelectorAll('.prog-case.survol').forEach(c => c.classList.remove('survol'));
      const c = caseSous(x, y);
      if (c && Number(c.dataset.jour) >= minuit(Date.now())) c.classList.add('survol');
    };
    pastille.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      depart = { x: e.clientX, y: e.clientY };
      pastille.setPointerCapture?.(e.pointerId);
      minuteur = setTimeout(() => {
        minuteur = null;
        fantome = pastille.cloneNode(true);
        fantome.classList.add('prog-fantome');
        document.body.appendChild(fantome);
        pastille.classList.add('tenue');
        navigator.vibrate?.(15);
        placer(depart.x, depart.y);
      }, 350);
    });
    pastille.addEventListener('pointermove', (e) => {
      if (minuteur && (Math.abs(e.clientX - depart.x) > 8 || Math.abs(e.clientY - depart.y) > 8)) {
        clearTimeout(minuteur); minuteur = null; return;
      }
      if (!fantome) return;
      e.preventDefault();
      placer(e.clientX, e.clientY);
    });
    const fin = (e) => {
      clearTimeout(minuteur); minuteur = null;
      if (!fantome) return;
      const cible = caseSous(e.clientX, e.clientY);
      fantome.remove(); fantome = null;
      pastille.classList.remove('tenue');
      document.querySelectorAll('.prog-case.survol').forEach(c => c.classList.remove('survol'));
      glisseVient = true; setTimeout(() => { glisseVient = false; }, 80);
      if (e.type === 'pointercancel' || !cible) return;
      const jour = Number(cible.dataset.jour);
      if (jour < minuit(Date.now()) || jour === minuit(s.dateMs)) return;
      s.dateMs = PE.deplacerAuJour(s.dateMs, jour);
      p.sessions.sort((a, b) => a.dateMs - b.dateMs);
      enregistrer(`« ${s.title} » déplacée au ${dateBreve(s.dateMs)}`);
    };
    pastille.addEventListener('pointerup', fin);
    pastille.addEventListener('pointercancel', fin);
  }

  function dessiner() {
    const total = p.sessions.length;
    const faites = p.sessions.filter(faite).length;
    const fini = total > 0 && p.sessions.every(s => faite(s) || s.skipped);
    const n = prochaine(p);
    const semaine = n ? n.week : p.weeks;
    const cycleEnCours = PE.blocDeSemaine(p, semaine);
    const actif = !!(flux?.token && !flux.revoked_at);

    el.replaceChildren(h(`
      <div>
        <p class="eyebrow"><a href="#/programmes">Programmes</a></p>
        <h1>${esc(p.name)}</h1>
        <p class="ligne-stats" style="margin:0 0 .8rem">
          <span>${esc(libelleNiveau(p.level))}</span>
          <span>${p.daysPerWeek} séances / semaine</span>
          <span>${p.weeks} semaines</span>
        </p>
        <div class="prog-barre"><div style="width:${total ? Math.round(faites / total * 100) : 0}%"></div></div>
        <p class="prog-etat">${fini ? `Programme terminé — ${faites} séances.` : `Semaine ${semaine} · ${faites} séances faites sur ${total}`}</p>
        <!-- Le cycle en cours, là où l'on regarde déjà : savoir qu'on est
             dans le bloc de force change la façon d'aborder la séance. -->
        ${!fini && cycleEnCours && cycleEnCours.label ? `<p class="etat-mono" style="margin:-.3rem 0 .6rem">Cycle
          en cours : ${esc(cycleEnCours.label)} (${esc(PE.libelleSemaines(cycleEnCours))})</p>` : ''}
        ${n ? `<button class="btn btn-lg prog-prochaine" data-prochaine type="button">Prochaine : ${esc(n.title)} — ${esc(dateBreve(n.dateMs))}</button>` : ''}
        <div class="prog-actions">
          <a class="btn btn-ghost" href="#/programmes/${esc(String(p.id))}/modifier">✎ Modifier</a>
          <button class="btn btn-ghost ${actif ? 'prog-agenda-ok' : ''}" data-agenda type="button">${actif ? 'Agenda ✓' : '＋ Google Agenda'}</button>
        </div>
        <div data-agenda-zone></div>
        ${(p.notes || '').trim() ? `<details class="notes-ia notes-ia-repli">
          <summary>Pourquoi ce programme</summary>
          <p>${esc(p.notes.trim()).replace(/\n/g, '<br>')}</p>
        </details>` : ''}
        <div data-planning></div>
        <div class="pied-liste">
          <a class="btn btn-ghost" href="#/programmes/nouveau">Nouveau programme</a>
          <button class="lien-inline lien-danger" data-supprimer type="button">Supprimer ce programme</button>
        </div>
      </div>`));

    el.querySelector('[data-prochaine]')?.addEventListener('click', () => ouvrirSeance(n));
    el.querySelector('[data-agenda]').onclick = () => (actif ? montrerAgenda(true) : ajouterAgenda());
    el.querySelector('[data-supprimer]').onclick = supprimer;
    montrerAgenda(false);

    const zone = el.querySelector('[data-planning]');
    /* Deux lectures du même planning : semaine par semaine, ou le MOIS, où
       l'on déplace une séance en la faisant glisser (ProgramMonth, v2.79). */
    const bascule = h(`<div class="rangee rangee-serree prog-vues">
        <button type="button" class="chip-cat ${vueMois ? '' : 'on'}" data-vue="semaines">Semaines</button>
        <button type="button" class="chip-cat ${vueMois ? 'on' : ''}" data-vue="mois">Mois</button>
      </div>`);
    bascule.querySelectorAll('[data-vue]').forEach(b => {
      b.onclick = () => {
        vueMois = b.dataset.vue === 'mois';
        try { localStorage.setItem(CLE_VUE, vueMois ? 'mois' : 'semaines'); } catch { /* pas grave */ }
        dessiner();
      };
    });
    zone.appendChild(bascule);
    if (vueMois) { zone.appendChild(grilleMois()); return; }
    for (let w = 1; w <= p.weeks; w++) {
      const ss = p.sessions.filter(s => s.week === w).sort((a, b) => a.dateMs - b.dateMs);
      if (!ss.length) continue;
      // Le cycle s'annonce à la semaine où il commence : en descendant le
      // planning, on voit le programme changer de nature.
      const debutCycle = (p.blocks || []).find(b => b.weekStart === w);
      if (debutCycle) zone.appendChild(carteCycle(debutCycle));
      zone.appendChild(h(`<p class="bloc-titre prog-semaine">Semaine ${w}${ss.some(s => s.deload) ? ' <span>décharge</span>' : ''}</p>`));
      ss.forEach(s => {
        const b = h(`
          <button type="button" class="prog-seance ${faite(s) || s.skipped ? 'passee' : ''}">
            <span class="prog-pastille ${s.skipped ? 'sautee' : ''}"></span>
            <span class="prog-seance-txt">
              <b>${esc(s.title)}</b>
              <span>${esc(dateBreve(s.dateMs))} · ${(s.items || []).length} exos · ${approx(dureePrevue(s.items))}</span>
            </span>
            <span class="prog-seance-etat ${faite(s) ? 'ok' : ''}">${faite(s) ? '✓' : s.skipped ? '—' : '›'}</span>
          </button>`);
        b.onclick = () => ouvrirSeance(s);
        zone.appendChild(b);
      });
    }
  }

  async function enregistrer(msg) {
    try { await saveProgram(moi.id, p); if (msg) toast(msg); }
    catch (e) { toast(e.message || "Le programme n'a pas pu être enregistré."); }
    dessiner();
  }

  function ouvrirSeance(s) {
    const w = carnet.find(r => String(r.local_id) === String(s.workoutId));
    const m = h(`
      <div class="modale" role="dialog" aria-label="Séance prévue">
        <div class="modale-boite prog-modale">
          <div class="modale-tete"><h2>${esc(s.title)} — semaine ${s.week}</h2></div>
          <p class="ligne-meta">${esc(dateBreve(s.dateMs))}, ${esc(heureDeLaSeance(p, s))} · environ ${approx(dureePrevue(s.items))}</p>
          ${s.deload ? '<p class="prog-decharge">Semaine de décharge : volume réduit volontairement.</p>' : ''}
          <ul class="prog-items">${(s.items || []).map(it => `
            <li><b>${esc(it.name)}</b> — ${esc(doseItem(it))}${it.hint ? `<span>${esc(it.hint)}</span>` : ''}</li>`).join('')}
          </ul>
          ${!w ? '<p class="etat-mono">Le modèle de cette séance a été supprimé du carnet.</p>' : ''}
          <div class="prog-modale-actions">
            ${w && !faite(s) ? '<button class="btn btn-lg" data-go type="button">Démarrer la séance</button>' : ''}
            <button class="lien-inline" data-sauter type="button">${s.skipped ? 'Ne plus la sauter' : 'Sauter cette séance'}</button>
            <button class="lien-inline" data-reporter type="button">Reporter d'un jour</button>
            ${faite(s) ? '<button class="lien-inline lien-danger" data-non-faite type="button">Marquer comme non faite</button>' : ''}
            <button class="lien-inline" data-fermer type="button">Fermer</button>
          </div>
        </div>
      </div>`);
    const fermer = () => m.remove();
    m.addEventListener('click', (e) => { if (e.target === m) fermer(); });
    m.querySelector('[data-fermer]').onclick = fermer;
    m.querySelector('[data-go]')?.addEventListener('click', () => {
      // Séries et répétitions de CETTE semaine : l'écran de séance les lit
      // au démarrage et coche la séance à la fin (programme-edition.js).
      PE.annoncerSeancePrevue(p.id, s.id, s.workoutId);
      fermer();
      location.hash = `#/seances/${s.workoutId}/lancer`;
    });
    m.querySelector('[data-sauter]').onclick = () => {
      s.skipped = !s.skipped; if (s.skipped) s.doneAt = 0;
      fermer(); enregistrer(s.skipped ? 'Séance sautée.' : 'Séance remise au planning.');
    };
    m.querySelector('[data-reporter]').onclick = () => {
      s.dateMs = plusJours(s.dateMs, 1);
      p.sessions.sort((a, b) => a.dateMs - b.dateMs);
      fermer(); enregistrer(`Reportée au ${dateBreve(s.dateMs)}.`);
    };
    m.querySelector('[data-non-faite]')?.addEventListener('click', () => {
      s.doneAt = 0; s.skipped = false;
      fermer(); enregistrer('Séance remise à faire.');
    });
    document.body.appendChild(m);
  }

  /* ------------------------------------------------------------ agenda */

  function liens(token) {
    const https = urlFluxAgenda(token);
    const webcal = https.replace(/^https:/, 'webcal:');
    return {
      https, webcal,
      google: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`
    };
  }

  /** EN UN CLIC : l'abonnement est créé et Google Agenda s'ouvre sur
   *  « Ajouter cet agenda ? ». La fenêtre est ouverte AVANT l'appel réseau,
   *  sinon le navigateur la prendrait pour une fenêtre surgissante. */
  async function ajouterAgenda() {
    const fenetre = window.open('', '_blank');
    try {
      const token = await activerFluxAgenda(moi.id, p.id);
      flux = { token, revoked_at: null };
      const { google } = liens(token);
      if (fenetre) fenetre.location = google;
      else window.location.href = google;
      dessiner();
      montrerAgenda(true);
    } catch (e) {
      fenetre?.close();
      toast(e.message || "L'agenda n'a pas pu être préparé.");
    }
  }

  function montrerAgenda(deplie) {
    const zone = el.querySelector('[data-agenda-zone]');
    const actif = !!(flux?.token && !flux.revoked_at);
    const surTelephone = p.sessions.some(s => (s.eventId || 0) > 0);
    zone.replaceChildren();
    if (!actif) {
      if (surTelephone) {
        zone.appendChild(h(`<p class="prog-agenda-note">Ce programme est déjà dans l'agenda de ton
          téléphone (appli Motio) : l'ajouter ici aussi mettrait chaque séance en double.</p>`));
      }
      return;
    }
    if (!deplie) return;
    const { https, webcal, google } = liens(flux.token);
    const bloc = h(`
      <div class="prog-agenda">
        <p><b>Dans ton agenda.</b> Google Agenda relit ce programme de lui-même, plusieurs fois
          par jour : tes modifications y arrivent sans rien faire.</p>
        <div class="rangee rangee-serree">
          <a class="btn btn-sm" href="${esc(google)}" target="_blank" rel="noopener">Ouvrir dans Google Agenda</a>
          <a class="btn btn-sm btn-ghost" href="${esc(webcal)}">Apple, Outlook…</a>
          <button class="btn btn-sm btn-ghost" data-copier type="button">Copier le lien</button>
        </div>
        <p class="etat-mono">Si Google n'a rien proposé : Google Agenda › Autres agendas › ＋ ›
          À partir de l'URL, et colle le lien.</p>
        <button class="lien-inline lien-danger" data-retirer type="button">Retirer de l'agenda</button>
      </div>`);
    bloc.querySelector('[data-copier]').onclick = async () => {
      try { await navigator.clipboard.writeText(https); toast('Lien copié.'); }
      catch { prompt('Lien de l\'agenda :', https); }
    };
    bloc.querySelector('[data-retirer]').onclick = async () => {
      try {
        await retirerFluxAgenda(moi.id, p.id);
        flux = { ...flux, revoked_at: new Date().toISOString() };
        toast("Les séances quitteront Google Agenda à sa prochaine relecture.");
        dessiner();
      } catch (e) { toast(e.message || "L'agenda n'a pas pu être retiré."); }
    };
    zone.appendChild(bloc);
  }

  /* ------------------------------------------------------- suppression */

  async function supprimer() {
    const ok = await demander({
      titre: 'Supprimer ce programme ?',
      texte: `Le planning sera effacé, ainsi que ses séances dans l'agenda. Les séances du carnet `
        + `déjà faites sont conservées, avec tout leur historique.`,
      boutons: [
        { label: 'Annuler', valeur: false, classe: 'btn btn-ghost' },
        { label: 'Supprimer', valeur: true, classe: 'btn btn-danger' }
      ]
    });
    if (!ok) return;
    try {
      if (flux?.token && !flux.revoked_at) await retirerFluxAgenda(moi.id, p.id).catch(() => {});
      await deleteProgram(moi.id, p.id);
      // Comme ProgramStore.delete : les modèles jamais utilisés partent avec lui.
      for (const id of p.workoutIds || []) {
        const w = carnet.find(r => String(r.local_id) === String(id));
        if (w && !((w.data || {}).history || []).length) await deleteWorkout(moi.id, id).catch(() => {});
      }
      toast('Programme supprimé.');
      location.hash = '#/programmes';
    } catch (e) { toast(e.message || "Le programme n'a pas pu être supprimé."); }
  }
}

/* ============================================================== création */

export async function vueProgrammeNouveau() {
  render(loading('Chargement'));
  const moi = await currentUser();
  let avecIA = false;
  try { avecIA = await aAccesIA(moi.id); } catch { /* sans réseau : pas d'IA */ }

  const objectif = objectifActuel();
  const etat = {
    objectif: GOALS.some(g => g.id === objectif) ? objectif : 'MASSE',
    goalText: '', level: niveauActuel(), daysPerWeek: 3, weeks: 8,
    gears: [], weekdays: defaultDaysFor(3), heure: '18:00',
    date: new Date().toISOString().slice(0, 10),
    /* DURÉE NON IMPOSÉE : c'est l'objectif qui commande le nombre de semaines,
       pas une habitude. `weeks` à 0 laisse Moti décider ; une date objectif
       (compétition, course, test) la fixe et lui demande d'y amener, affûtage
       compris. Les deux n'ont de sens qu'avec Moti — le générateur local, à
       règles fixes, ne sait pas raisonner sur une échéance et retombe sur
       8 semaines. */
    echeance: '',
    /* « Dans la journée » : la séance est à faire ce jour-là, l'heure n'a
       aucune importance (Program.sansHeure, ProgramModel.kt). */
    sansHeure: false
  };
  const el = h(`<section class="page page-etroite"></section>`);
  render(el);
  dessiner();

  /* Ce que le bouton va faire, d'après les précisions écrites : c'est ce qui
     décide du libellé ET de la branche de génération. */
  function modeIA() { return avecIA && !!etat.goalText.trim(); }
  function libelleBouton() { return modeIA() ? 'Générer avec Moti' : "Voir l'aperçu"; }

  /** Semaines jusqu'à l'échéance, arrondies au-dessus : une course dans dix
   *  jours fait deux semaines de préparation, pas une. */
  function semainesEcheance() {
    if (!etat.echeance) return null;
    const cible = new Date(`${etat.echeance}T00:00:00`).getTime();
    const depart = new Date(`${etat.date}T00:00:00`).getTime();
    if (!Number.isFinite(cible) || !Number.isFinite(depart)) return null;
    const jours = Math.round((cible - depart) / 86400000);
    return Math.min(52, Math.max(1, Math.ceil(jours / 7)));
  }

  /** Ce qu'on demande à Moti : la durée jusqu'à l'échéance, celle qu'il doit
   *  choisir lui-même (0), ou celle qui est cochée. */
  function semainesIA() { return semainesEcheance() ?? etat.weeks; }

  /** Le générateur local, lui, a toujours besoin d'un nombre. */
  function semainesLocal() { return semainesEcheance() ?? (etat.weeks || 8); }

  /** « samedi 17 janvier 2026 » : la date telle qu'on la donne à Moti, qui
   *  doit la relire dans sa consigne — pas une date ISO (dateLongue,
   *  ProgramScreens.kt). */
  function echeanceLongue() {
    if (!etat.echeance) return '';
    return new Date(`${etat.echeance}T00:00:00`)
      .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  /**
   * La demande envoyée à Moti : l'objectif donne le cadre, les précisions le
   * détail. Envoyer les précisions seules ferait perdre le type d'objectif,
   * que l'utilisateur vient pourtant de choisir juste au-dessus. Formulation
   * identique côté natif (demandeAvecObjectif, ProgramScreens.kt) : les deux
   * doivent produire le même texte, sinon le même programme demandé des deux
   * côtés ne sortirait pas pareil.
   */
  function demandeComposee() {
    const g = GOALS.find(x => x.id === etat.objectif);
    const cadre = g ? `${g.label} (${g.desc.toLowerCase()})` : etat.objectif;
    return `Objectif : ${cadre}.\nPrécisions de l'utilisateur : ${etat.goalText.trim()}`;
  }

  function dessiner() {
    el.replaceChildren(h(`
      <div>
        <p class="eyebrow"><a href="#/programmes">Programmes</a></p>
        <h1>Nouveau programme</h1>
        <p class="lede">Choisis ton objectif, Motio construit le programme. Tu l'ajustes ensuite
          comme tu veux, à la main ou en le demandant à Moti.</p>

        <p class="champ-label">Objectif</p>
        <div class="prog-objectifs" data-objectifs></div>
        <!-- Le champ reste affiché sans abonnement, mais inerte : on voit ce
             qu'il apporte au lieu de découvrir son existence en s'abonnant.
             Même règle que la génération d'une séance (ouvrirGenerationSeance)
             et que le natif (AutoSessionDialog, ProgramScreens.kt). -->
        <label class="champ" style="max-width:none">
          <span>Des précisions pour Moti ? (facultatif)</span>
          <textarea data-objectif-texte rows="3" maxlength="600" ${avecIA ? '' : 'disabled'}
            placeholder="${avecIA
              ? 'Ex. : épaule droite fragile, pas de développé militaire ; insiste sur les jambes ; 45 min maximum par séance ; créneau du midi en salle…'
              : "Décris ce que tu veux et le coach écrit le programme — avec l'abonnement."}">${esc(etat.goalText)}</textarea></label>
        <p class="etat-mono" style="margin:-.6rem 0 1.25rem">${avecIA
          ? "Laissé vide, le programme est construit tout de suite par l’algorithme de Motio, sans attendre. Rempli, c’est Moti qui l’écrit en tenant compte de ce que tu demandes."
          : 'Sans abonnement, le programme est construit par l’algorithme de Motio à partir des réglages ci-dessous. Avec, tu décris ce que tu veux et le coach l’écrit.'}</p>

        <div class="rangee">
          <label class="champ champ-mini"><span>Niveau</span>
            <select data-niveau>${LEVELS.map(l => `<option value="${l.id}" ${l.id === etat.level ? 'selected' : ''}>${esc(l.label)}</option>`).join('')}</select></label>
          <label class="champ champ-mini"><span>Durée</span>
            <select data-semaines ${etat.echeance ? 'disabled' : ''}>${[4, 6, 8, 12].map(n => `<option value="${n}" ${n === etat.weeks ? 'selected' : ''}>${n} semaines</option>`).join('')}<option value="0" ${etat.weeks === 0 ? 'selected' : ''}>Moti décide</option></select></label>
          <label class="champ champ-mini"><span>Séances / semaine</span>
            <select data-par-semaine>${[2, 3, 4, 5, 6].map(n => `<option value="${n}" ${n === etat.daysPerWeek ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        </div>

        <p class="champ-label">Jours d'entraînement</p>
        <div class="rangee rangee-serree" data-jours></div>
        <p class="etat-mono" data-jours-etat style="margin:.4rem 0 1rem"></p>

        <label class="champ" style="max-width:none"><span>Date objectif (facultatif)</span>
          <input type="date" data-echeance value="${esc(etat.echeance)}"
            min="${new Date().toISOString().slice(0, 10)}"></label>
        <p class="etat-mono" style="margin:-.6rem 0 1.25rem">${etat.echeance
          ? `${semainesEcheance()} semaines d'ici là : Moti construit la montée en charge pour que tu y arrives au mieux, affûtage compris.`
          : etat.weeks === 0
            ? (avecIA
              ? 'Moti prend le nombre de semaines qu’il faut pour l’objectif, et dit pourquoi dans son explication.'
              : 'Laisser Moti décider demande l’abonnement : sans lui, le programme est construit sur 8 semaines.')
            : 'Une compétition, une course, un test physique : donne la date et le programme est construit pour t’y amener.'}</p>

        <div class="rangee">
          <label class="champ champ-mini"><span>Heure des séances</span>
            <input type="time" data-heure value="${esc(etat.heure)}" ${etat.sansHeure ? 'disabled' : ''}></label>
          <label class="champ champ-mini"><span>À partir du</span>
            <input type="date" data-date value="${esc(etat.date)}"></label>
        </div>
        <label class="case-ligne">
          <input type="checkbox" data-sans-heure ${etat.sansHeure ? 'checked' : ''}>
          <span>Peu importe l'heure — à faire dans la journée</span></label>
        <p class="etat-mono" style="margin:.2rem 0 1.25rem">${etat.sansHeure
          ? 'La séance est à faire ce jour-là, à l’heure qui t’arrange. Dans l’agenda, elle occupe la journée entière au lieu d’un créneau.'
          : 'Décoche si tu préfères t’entraîner quand tu peux, sans heure fixe.'}</p>

        <p class="champ-label">Matériel disponible (aucun coché = tout matériel)</p>
        <div class="rangee rangee-serree" data-materiel style="margin-bottom:1.25rem"></div>

        <button class="btn btn-lg" data-generer type="button" style="width:100%">${libelleBouton()}</button>
      </div>`));

    // Plus de vignette « Objectif précis » : elle menait à un écran jumeau
    // dont le seul apport était le champ libre, qui vit maintenant sous les
    // objectifs. Un objectif très particulier se décrit dans ce champ, avec
    // le gabarit le plus proche comme cadre.
    const zoneObj = el.querySelector('[data-objectifs]');
    GOALS.forEach(g => {
      const b = h(`<button type="button" class="prog-objectif ${etat.objectif === g.id ? 'on' : ''}">
            <b>${esc(g.label)}</b><span>${esc(g.desc)}</span></button>`);
      b.onclick = () => { etat.objectif = g.id; dessiner(); };
      zoneObj.appendChild(b);
    });

    // Le bouton annonce ce qu'il va faire, et ça change dès la première
    // lettre tapée : on le réétiquette sur place plutôt que de redessiner,
    // qui ferait perdre le curseur au milieu de la phrase.
    el.querySelector('[data-objectif-texte]')?.addEventListener('input', (e) => {
      etat.goalText = e.target.value;
      const b = el.querySelector('[data-generer]');
      if (b && !b.disabled) b.textContent = libelleBouton();
    });
    ajouterMicro(el.querySelector('[data-objectif-texte]'));
    el.querySelector('[data-niveau]').onchange = (e) => { etat.level = e.target.value; };
    el.querySelector('[data-semaines]').onchange = (e) => { etat.weeks = Number(e.target.value); dessiner(); };
    el.querySelector('[data-echeance]').onchange = (e) => {
      etat.echeance = e.target.value;
      // Une échéance fixe la durée : le choix « Moti décide » n'aurait plus
      // de sens à côté d'elle.
      if (etat.echeance && etat.weeks === 0) etat.weeks = 8;
      dessiner();
    };
    el.querySelector('[data-sans-heure]').onchange = (e) => {
      etat.sansHeure = e.target.checked;
      dessiner();
    };
    el.querySelector('[data-par-semaine]').onchange = (e) => {
      etat.daysPerWeek = Number(e.target.value);
      etat.weekdays = defaultDaysFor(etat.daysPerWeek);
      dessinerJours();
    };
    el.querySelector('[data-heure]').oninput = (e) => { etat.heure = e.target.value; };
    el.querySelector('[data-date]').oninput = (e) => { etat.date = e.target.value; };

    const zoneJours = el.querySelector('[data-jours]');
    const etatJours = el.querySelector('[data-jours-etat]');
    function dessinerJours() {
      zoneJours.replaceChildren();
      WEEK_DAYS.forEach((dow, i) => {
        const on = etat.weekdays.includes(dow);
        const b = h(`<button type="button" class="chip-cat ${on ? 'on' : ''}">${WEEK_DAY_LABELS[i]}</button>`);
        b.onclick = () => {
          etat.weekdays = on ? etat.weekdays.filter(d => d !== dow) : [...etat.weekdays, dow];
          dessinerJours();
        };
        zoneJours.appendChild(b);
      });
      const ok = etat.weekdays.length === etat.daysPerWeek;
      etatJours.textContent = ok ? `${etat.weekdays.length} jour(s) sélectionné(s)`
        : `Sélectionne exactement ${etat.daysPerWeek} jour(s) — ${etat.weekdays.length} coché(s).`;
      etatJours.classList.toggle('prog-alerte', !ok);
    }
    dessinerJours();

    const zoneMat = el.querySelector('[data-materiel]');
    Object.entries(GEARS).forEach(([id, g]) => {
      const on = etat.gears.includes(id);
      const b = h(`<button type="button" class="chip-cat ${on ? 'on' : ''}">${esc(g.label)}</button>`);
      b.onclick = () => {
        etat.gears = on ? etat.gears.filter(x => x !== id) : [...etat.gears, id];
        b.classList.toggle('on', !on);
        dessiner();
      };
      zoneMat.appendChild(b);
    });

    el.querySelector('[data-generer]').onclick = async (e) => {
      if (etat.weekdays.length !== etat.daysPerWeek) {
        return toast(`Choisis ${etat.daysPerWeek} jour(s) d'entraînement.`);
      }
      const [hh, mm] = (etat.heure || '18:00').split(':').map(Number);
      const reglages = {
        level: etat.level, daysPerWeek: etat.daysPerWeek, gears: etat.gears,
        weekdays: etat.weekdays,
        // « Dans la journée » : les séances sont datées à midi, mais l'heure
        // n'est jamais affichée (MINUTE_LIBRE, programme-ia.js).
        minuteOfDay: etat.sansHeure ? MINUTE_LIBRE : hh * 60 + mm,
        startMs: new Date(`${etat.date}T00:00:00`).getTime()
      };
      definirNiveau(etat.level);
      definirObjectif(etat.objectif);
      // Un objectif SANS précisions reste construit localement : c'est
      // instantané, ça marche hors ligne et sans abonnement. Dès qu'il y a
      // des précisions, elles n'ont de sens que si Moti les lit.
      if (!modeIA()) {
        try {
          const draft = construireProgrammeLocal({
            goal: etat.objectif, weeks: semainesLocal(), ...reglages
          });
          draft.program.sansHeure = etat.sansHeure;
          return ouvrirEditeur(moi, PE.etatDepuisBrouillon(draft), { onReglages: () => { render(el); dessiner(); } });
        } catch (err) { return toast(err.message); }
      }
      const texte = demandeComposee();
      /* ÉCRAN D'ATTENTE. Une génération dure de trente secondes à une minute :
         tant que seul le bouton changeait de libellé, on croyait que rien ne
         se passait — Nicolas dit que ça donnait presque envie de recharger la
         page. L'écran entier annonce le travail en cours, et les étapes
         défilent pour qu'on voie que ça avance (EcranMotiTravaille,
         ProgramScreens.kt). */
      const attente = ecranAttenteMoti('Moti construit ton programme', ETAPES_PROGRAMME);
      render(attente.el);
      try {
        const { draft } = await genererProgrammeIA({
          goalText: texte, weeks: semainesIA(), targetDate: echeanceLongue(),
          sansHeure: etat.sansHeure, ...reglages
        });
        attente.arreter();
        ouvrirEditeur(moi, PE.etatDepuisBrouillon(draft), { onReglages: () => { render(el); dessiner(); } });
      } catch (err) {
        attente.arreter();
        render(el);
        dessiner();
        toast(err.message || 'La génération a échoué.');
      }
    };
  }
}

/* ======================================================== modification */

export async function vueProgrammeModifier(params) {
  render(loading('Chargement du programme'));
  const moi = await currentUser();
  let rows, carnet;
  try { [rows, carnet] = await Promise.all([listPrograms(moi.id), listWorkouts(moi.id)]); }
  catch (e) { return render(failure(e, "Le programme n'a pas pu être chargé")); }
  const row = rows.find(r => String(r.local_id) === String(params.id));
  if (!row) {
    return render(empty('Programme introuvable', 'Il a peut-être été supprimé.',
      { href: '#/programmes', label: 'Mes programmes' }));
  }
  ouvrirEditeur(moi, PE.etatPourProgramme(row.data, carnet), {});
}

/**
 * L'ÉCRAN DE MODIFICATION — le même pour l'aperçu d'un programme qui vient
 * d'être généré et pour un programme déjà en cours (ProgramEditor,
 * ProgramScreens.kt). Moti d'abord, en une phrase ; la main ensuite. Tout se
 * fait sur une copie, rien n'est enregistré avant le bouton du bas.
 */
async function ouvrirEditeur(moi, etatInitial, { onReglages = null }) {
  let etat = etatInitial;
  let avantMoti = null;
  let messageMoti = '';
  let enCours = false;
  let avecIA = false;
  try { avecIA = await aAccesIA(moi.id); } catch { /* pas d'IA hors ligne */ }

  const page = h(`<section class="page prog-editeur"></section>`);
  render(page);
  dessiner();

  function dessiner() {
    const p = etat.program;
    const ws = PE.parJour(etat);
    const cycles = PE.parBloc(etat);
    const parSemaine = PE.seancesParSemaine(p);
    const periodise = (p.blocks || []).length > 0;
    const neuf = !etat.original;
    const minute = PE.minuteDuJour(p);
    const intact = PE.intact(p);
    const prem = p.sessions.length ? Math.min(...p.sessions.map(s => s.dateMs)) : null;
    const dern = p.sessions.length ? Math.max(...p.sessions.map(s => s.dateMs)) : null;
    const pb = PE.probleme(etat);

    page.replaceChildren(h(`
      <div>
        <p class="eyebrow">${neuf ? 'Aperçu du programme' : 'Modifier le programme'}</p>
        <label class="champ" style="max-width:none"><span>Nom du programme</span>
          <input type="text" data-nom maxlength="80" value="${esc(p.name)}"></label>
        <p class="ligne-stats" style="margin:0 0 .6rem">
          <span>${p.weeks} semaines</span>
          <span>${parSemaine} séance${parSemaine > 1 ? 's' : ''} / semaine</span>
          ${p.blocks && p.blocks.length > 1 ? `<span>${p.blocks.length} cycles</span>` : ''}
          <span>${esc(libelleNiveau(p.level))}</span>
        </p>
        ${neuf ? `<p class="etat-mono" style="margin:0 0 1rem">Rien n'est encore enregistré. Ajuste ce que tu
          veux, à la main ou en le demandant à Moti, puis valide.</p>` : ''}

        <div class="moti-boite">
          <p class="moti-tag"><img src="../assets/img/moti_avatar.jpg" alt=""> Demander à Moti</p>
          <p class="moti-aide">Dis-lui en une phrase ce que tu veux changer, il réécrit le programme.
            Tu pourras encore tout affiner à la main.</p>
          ${avecIA ? `
            <textarea data-demande rows="2" maxlength="600" ${enCours ? 'disabled' : ''}
              placeholder="Ex. : remplace le squat par la presse, ajoute du gainage le samedi, allège la semaine 3…"></textarea>
            <button class="btn" data-appliquer type="button" ${enCours ? 'disabled' : ''}>${enCours ? 'Moti réécrit le programme… (30 s à 1 min)' : 'Appliquer'}</button>
            ${messageMoti ? `<div class="moti-retour"><p>${esc(messageMoti)}</p>
              ${avantMoti ? '<button class="lien-inline lien-danger" data-annuler-moti type="button">Annuler cette modification</button>' : ''}</div>` : ''}`
          : `<p class="prog-alerte">Les modifications par Moti font partie de l'abonnement Motio.
              Tout reste modifiable à la main ci-dessous.</p>`}
        </div>

        ${(p.notes || '').trim() ? `<details class="notes-ia notes-ia-repli">
          <summary>Pourquoi ce programme</summary>
          <p>${esc(p.notes.trim()).replace(/\n/g, '<br>')}</p>
        </details>` : ''}

        <!-- PROGRAMME PÉRIODISÉ : les séances sont rangées par cycle, parce
             qu'un bloc d'accumulation et un bloc de force n'ont ni les mêmes
             exercices ni le même format. Une séance identique d'un bloc à
             l'autre apparaît sous chacun : c'est la même, et la modifier dans
             un bloc la modifie partout. -->
        <p class="bloc-titre" style="margin-top:1.5rem">${periodise ? 'Les cycles du programme' : 'Séances de la semaine'}</p>
        ${periodise ? `<p class="etat-mono" style="margin:-.4rem 0 .6rem">Le programme avance par
          blocs. Chaque bloc a son but, et peut avoir ses propres exercices, son propre format
          et ses propres méthodes.</p>` : ''}
        <div data-modeles></div>
        <button class="btn btn-ghost" data-ajouter type="button" style="width:100%">＋ Ajouter une séance</button>
        ${periodise && p.blocks.length > 1 ? `<p class="etat-mono" style="margin:.4rem 0 0">Une séance
          ajoutée ici revient chaque semaine, dans tous les cycles.</p>` : ''}

        <p class="bloc-titre" style="margin-top:1.5rem">Heure des séances</p>
        <label class="case-ligne">
          <input type="checkbox" data-sans-heure ${p.sansHeure ? 'checked' : ''}>
          <span>Peu importe l'heure — à faire dans la journée</span></label>
        ${p.sansHeure ? `<p class="etat-mono" style="margin:.2rem 0 0">À faire ce jour-là, à l'heure
          qui t'arrange.</p>` : `
        <div class="prog-pas">
          <button class="btn btn-ghost" data-heure="-15" type="button">−</button>
          <b>${heureLabel(minute)}</b>
          <button class="btn btn-ghost" data-heure="15" type="button">+</button>
        </div>`}
        ${intact && prem ? `
          <p class="bloc-titre">Première séance</p>
          <div class="prog-pas">
            <button class="btn btn-ghost" data-decaler="-1" type="button">‹</button>
            <b>${esc(dateBreve(prem))}</b>
            <button class="btn btn-ghost" data-decaler="1" type="button">›</button>
          </div>` : ''}
        <p class="etat-mono">${prem ? `${p.sessions.length} séances datées, du ${esc(dateBreve(prem))} au ${esc(dateBreve(dern))}` : 'Aucune séance datée.'}</p>
        <details class="prog-planning"><summary>Voir le planning semaine par semaine</summary><div data-planning></div></details>

        ${pb ? `<p class="prog-alerte" style="margin-top:1rem">${esc(pb)}</p>` : ''}
        <div class="barre-action prog-valider">
          <button class="btn btn-ghost" data-annuler type="button">Annuler</button>
          ${onReglages ? '<button class="btn btn-ghost" data-reglages type="button">Repartir des réglages</button>' : ''}
          <button class="btn btn-lg" data-enregistrer type="button" ${pb || enCours ? 'disabled' : ''}>${neuf ? 'Valider et ajouter à mon carnet' : 'Enregistrer les modifications'}</button>
        </div>
      </div>`));

    page.querySelector('[data-nom]').addEventListener('input', (e) => {
      p.name = e.target.value.trim();
      const pb2 = PE.probleme(etat);
      page.querySelector('[data-enregistrer]').disabled = !!pb2 || enCours;
    });

    // ---- Moti ----
    ajouterMicro(page.querySelector('[data-demande]'));
    page.querySelector('[data-appliquer]')?.addEventListener('click', async () => {
      const demande = page.querySelector('[data-demande]').value.trim();
      if (!demande) return toast('Dis à Moti ce que tu veux changer.');
      enCours = true; messageMoti = '';
      // Une réécriture dure aussi longtemps qu'une génération : même écran
      // d'attente, pour la même raison.
      const attente = ecranAttenteMoti('Moti réécrit ton programme', ETAPES_MODIF);
      render(attente.el);
      // Moti travaille sur une COPIE : en cas d'échec, rien n'a bougé.
      const travail = PE.copierEtat(etat);
      try {
        const changes = await PE.modifierProgrammeIA(travail, demande);
        avantMoti = etat;
        etat = travail;
        messageMoti = changes;
      } catch (err) {
        toast(err.message || 'Moti n\'a pas pu modifier le programme.');
      }
      attente.arreter();
      enCours = false;
      render(page);
      dessiner();
    });
    page.querySelector('[data-annuler-moti]')?.addEventListener('click', () => {
      etat = avantMoti; avantMoti = null; messageMoti = '';
      dessiner();
    });

    // ---- séances ----
    const zone = page.querySelector('[data-modeles]');
    function carteModele(w) {
      const jour = PE.jourDe(p, w.id);
      const carte = h(`
        <div class="prog-modele">
          <div class="prog-modele-tete">
            <div>
              <b>${esc(w.name)}</b>
              <span class="ligne-meta">${(w.exercises || []).length} exercice${(w.exercises || []).length > 1 ? 's' : ''}${(w.exercises || []).length ? ` · environ ${approx(dureeDeLaSeance(w))}` : ''}${w.circuit ? ' · circuit' : ''}</span>
            </div>
            <select class="prog-jour" data-jour aria-label="Jour de la séance">
              ${WEEK_DAYS.map(d => `<option value="${d}" ${d === jour ? 'selected' : ''}>${PE.libelleJour(d)}</option>`).join('')}
            </select>
          </div>
          <ul class="prog-exos"></ul>
          <div class="prog-modele-actions">
            <button class="lien-inline" data-exos type="button">✎ Exercices</button>
            <button class="lien-inline" data-renommer type="button">Renommer</button>
            <button class="lien-inline lien-danger" data-retirer type="button">Retirer</button>
          </div>
        </div>`);
      const ul = carte.querySelector('.prog-exos');
      if (!(w.exercises || []).length) ul.appendChild(h('<li class="prog-alerte">Aucun exercice pour l\'instant.</li>'));
      (w.exercises || []).forEach(e => {
        /* Taper l'exercice mène là où on peut le remplacer : la liste de la
           séance, où son nom ouvre le catalogue. C'est le geste qu'on essaie
           d'abord, et il ne menait nulle part. */
        const li = h(`<li><button type="button" class="prog-exo-lien">${esc(e.name)} — ${esc(doseExercice(w, e))}</button></li>`);
        li.querySelector('button').onclick = () => editerSeance(w);
        const vg = vignetteExercice(e.name, 30);
        if (vg) li.prepend(vg);
        ul.appendChild(li);
      });
      carte.querySelector('[data-jour]').onchange = (ev) => {
        PE.changerJour(p, w.id, Number(ev.target.value));
        dessiner();
      };
      carte.querySelector('[data-exos]').onclick = () => editerSeance(w);
      carte.querySelector('[data-renommer]').onclick = async () => {
        const r = await demander({
          titre: 'Renommer la séance', champ: { label: 'Nom', valeur: w.name },
          boutons: [{ label: 'Annuler', valeur: false, classe: 'btn btn-ghost' }, { label: 'Valider', valeur: true }]
        });
        if (r) { PE.renommer(etat, w.id, r.texte); dessiner(); }
      };
      carte.querySelector('[data-retirer]').onclick = async () => {
        const ok = await demander({
          titre: `Retirer « ${w.name} » ?`,
          texte: 'Ses séances à venir disparaissent du planning. Celles déjà faites restent dans ton historique.',
          boutons: [{ label: 'Annuler', valeur: false, classe: 'btn btn-ghost' }, { label: 'Retirer', valeur: true, classe: 'btn btn-danger' }]
        });
        if (ok) { PE.retirerModele(etat, w.id); dessiner(); }
      };
      return carte;
    }
    if (periodise) {
      cycles.forEach(({ bloc, modeles }) => {
        zone.appendChild(carteCycle(bloc));
        modeles.forEach(w => zone.appendChild(carteModele(w)));
      });
    } else {
      ws.forEach(w => zone.appendChild(carteModele(w)));
    }

    page.querySelector('[data-ajouter]').onclick = async () => {
      const pris = ws.map(w => PE.jourDe(p, w.id));
      const r = await demander({
        titre: 'Nouvelle séance',
        champ: { label: 'Nom', placeholder: 'Gainage, Full body…', jour: WEEK_DAYS.find(d => !pris.includes(d)) ?? 6 },
        texte: 'Tu choisis ses exercices juste après.',
        boutons: [{ label: 'Annuler', valeur: false, classe: 'btn btn-ghost' }, { label: 'Choisir les exercices', valeur: true }]
      });
      if (!r) return;
      const w = nouvelleSeance(r.texte, 'Full body');
      w.id = Date.now();
      PE.ajouterModele(etat, w, r.jour);
      dessiner();
      editerSeance(w);
    };

    // ---- planning ----
    page.querySelector('[data-sans-heure]').onchange = (ev) => {
      PE.changerSansHeure(p, ev.target.checked);
      dessiner();
    };
    page.querySelectorAll('[data-heure]').forEach(b => {
      b.onclick = () => { PE.changerHeure(p, (minute + Number(b.dataset.heure) + 1440) % 1440); dessiner(); };
    });
    page.querySelectorAll('[data-decaler]').forEach(b => {
      b.onclick = () => { if (PE.decalerSemaines(p, Number(b.dataset.decaler))) dessiner(); };
    });
    const zonePlanning = page.querySelector('[data-planning]');
    for (let s = 1; s <= p.weeks; s++) {
      const ss = p.sessions.filter(x => x.week === s).sort((a, b) => a.dateMs - b.dateMs);
      if (!ss.length) continue;
      // Le cycle s'annonce à la semaine où il commence : c'est ce qui fait
      // voir, en déroulant le planning, que le programme change de nature.
      const debutCycle = (p.blocks || []).find(b => b.weekStart === s);
      if (debutCycle) zonePlanning.appendChild(carteCycle(debutCycle));
      zonePlanning.appendChild(h(`<p class="prog-semaine-mini">Semaine ${s}${ss.some(x => x.deload) ? ' · décharge' : ''}</p>`));
      ss.forEach(x => zonePlanning.appendChild(h(
        `<p class="prog-ligne-mini ${faite(x) ? 'passee' : ''}">${faite(x) ? '✓ ' : ''}${esc(dateBreve(x.dateMs))} · ${esc(x.title)}</p>`)));
    }

    // ---- validation ----
    page.querySelector('[data-annuler]').onclick = () => {
      location.hash = etat.original ? `#/programmes/${etat.original.id}` : '#/programmes';
    };
    page.querySelector('[data-reglages]')?.addEventListener('click', () => onReglages());
    page.querySelector('[data-enregistrer]').onclick = async (ev) => {
      if (PE.probleme(etat)) return;
      ev.target.disabled = true;
      ev.target.textContent = 'Enregistrement…';
      try {
        await PE.enregistrer(moi.id, etat);
        toast(etat.original ? 'Programme mis à jour ✓' : 'Programme enregistré ✓');
        location.hash = `#/programmes/${etat.program.id}`;
      } catch (err) {
        toast(err.message || "Le programme n'a pas pu être enregistré.");
        ev.target.disabled = false;
        dessiner();
      }
    };
  }

  /** Les exercices d'une séance du programme : l'éditeur de séance habituel,
   *  en mode intégré — il rend la séance modifiée au lieu de l'enregistrer. */
  function editerSeance(w) {
    vueSeanceEdition({ id: String(w.id) }, {
      seance: w,
      onValider: (modifiee) => {
        PE.remplacerModele(etat, modifiee);
        render(page);
        dessiner();
      },
      onAnnuler: () => { render(page); dessiner(); }
    });
  }
}
