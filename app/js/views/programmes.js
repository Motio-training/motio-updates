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
import { currentUser } from '../supabase.js';
import {
  listPrograms, deleteProgram, saveProgram, listWorkouts, deleteWorkout, aAccesIA,
  fluxAgenda, activerFluxAgenda, retirerFluxAgenda, urlFluxAgenda
} from '../api.js';
import { GOALS, LEVELS, fmtRecup, dureeDeLaSeance, nouvelleSeance, CIRCUIT_WORK_SEC } from '../model.js';
import { GEARS } from '../catalog.js';
import { niveauActuel, objectifActuel, definirNiveau, definirObjectif } from '../reglages.js';
import { genererProgrammeIA, defaultDaysFor, WEEK_DAYS, WEEK_DAY_LABELS, plusJours } from '../programme-ia.js';
import { construireProgrammeLocal } from '../generateur-local.js';
import * as PE from '../programme-edition.js';
import { vignetteExercice } from '../exercise-visuals.js';
import { vueSeanceEdition } from './entrainement.js';

/* ================================================================ outils */

const heureLabel = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const heureDe = (ms) => { const d = new Date(ms); return heureLabel(d.getHours() * 60 + d.getMinutes()); };
const faite = (s) => (s.doneAt || 0) > 0;
const libelleNiveau = (id) => (LEVELS.find(l => l.id === id) || {}).label || '';

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
  dessiner();
  render(el);

  function dessiner() {
    const total = p.sessions.length;
    const faites = p.sessions.filter(faite).length;
    const fini = total > 0 && p.sessions.every(s => faite(s) || s.skipped);
    const n = prochaine(p);
    const semaine = n ? n.week : p.weeks;
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
    for (let w = 1; w <= p.weeks; w++) {
      const ss = p.sessions.filter(s => s.week === w).sort((a, b) => a.dateMs - b.dateMs);
      if (!ss.length) continue;
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
          <p class="ligne-meta">${esc(dateBreve(s.dateMs))} à ${heureDe(s.dateMs)} · environ ${approx(dureePrevue(s.items))}</p>
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
    date: new Date().toISOString().slice(0, 10)
  };
  const el = h(`<section class="page page-etroite"></section>`);
  render(el);
  dessiner();

  function dessiner() {
    const ia = etat.objectif === 'IA';
    el.replaceChildren(h(`
      <div>
        <p class="eyebrow"><a href="#/programmes">Programmes</a></p>
        <h1>Nouveau programme</h1>
        <p class="lede">Choisis ton objectif, Motio construit le programme. Tu l'ajustes ensuite
          comme tu veux, à la main ou en le demandant à Moti.</p>

        <p class="champ-label">Objectif</p>
        <div class="prog-objectifs" data-objectifs></div>
        ${ia ? `<label class="champ" style="max-width:none"><span>Ton objectif, en une phrase</span>
          <textarea data-objectif-texte rows="3" maxlength="600"
            placeholder="Ex. : record au développé couché dans 8 semaines, explosivité en saut, préparation à un semi-marathon…">${esc(etat.goalText)}</textarea></label>` : ''}

        <div class="rangee">
          <label class="champ champ-mini"><span>Niveau</span>
            <select data-niveau>${LEVELS.map(l => `<option value="${l.id}" ${l.id === etat.level ? 'selected' : ''}>${esc(l.label)}</option>`).join('')}</select></label>
          <label class="champ champ-mini"><span>Durée</span>
            <select data-semaines>${[4, 6, 8, 12].map(n => `<option value="${n}" ${n === etat.weeks ? 'selected' : ''}>${n} semaines</option>`).join('')}</select></label>
          <label class="champ champ-mini"><span>Séances / semaine</span>
            <select data-par-semaine>${[2, 3, 4, 5, 6].map(n => `<option value="${n}" ${n === etat.daysPerWeek ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        </div>

        <p class="champ-label">Jours d'entraînement</p>
        <div class="rangee rangee-serree" data-jours></div>
        <p class="etat-mono" data-jours-etat style="margin:.4rem 0 1rem"></p>

        <div class="rangee">
          <label class="champ champ-mini"><span>Heure des séances</span>
            <input type="time" data-heure value="${esc(etat.heure)}"></label>
          <label class="champ champ-mini"><span>À partir du</span>
            <input type="date" data-date value="${esc(etat.date)}"></label>
        </div>

        <p class="champ-label">Matériel disponible (aucun coché = tout matériel)</p>
        <div class="rangee rangee-serree" data-materiel style="margin-bottom:1.25rem"></div>

        <button class="btn btn-lg" data-generer type="button" style="width:100%">${ia ? 'Générer avec Moti' : "Voir l'aperçu"}</button>
      </div>`));

    const zoneObj = el.querySelector('[data-objectifs]');
    [...GOALS, { id: 'IA', label: 'Objectif précis', desc: avecIA ? 'Décris-le en une phrase, Moti construit le programme' : 'Réservé aux abonnés : Moti construit le programme' }]
      .forEach(g => {
        const b = h(`<button type="button" class="prog-objectif ${etat.objectif === g.id ? 'on' : ''}" ${g.id === 'IA' && !avecIA ? 'disabled' : ''}>
            <b>${esc(g.label)}${g.id === 'IA' ? ' <span class="badge-ia">IA</span>' : ''}</b><span>${esc(g.desc)}</span></button>`);
        b.onclick = () => { etat.objectif = g.id; dessiner(); };
        zoneObj.appendChild(b);
      });

    el.querySelector('[data-objectif-texte]')?.addEventListener('input', (e) => { etat.goalText = e.target.value; });
    el.querySelector('[data-niveau]').onchange = (e) => { etat.level = e.target.value; };
    el.querySelector('[data-semaines]').onchange = (e) => { etat.weeks = Number(e.target.value); };
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
        level: etat.level, daysPerWeek: etat.daysPerWeek, weeks: etat.weeks, gears: etat.gears,
        weekdays: etat.weekdays, minuteOfDay: hh * 60 + mm,
        startMs: new Date(`${etat.date}T00:00:00`).getTime()
      };
      definirNiveau(etat.level);
      if (!ia) {
        definirObjectif(etat.objectif);
        try {
          const draft = construireProgrammeLocal({ goal: etat.objectif, ...reglages });
          return ouvrirEditeur(moi, PE.etatDepuisBrouillon(draft), { onReglages: () => { render(el); dessiner(); } });
        } catch (err) { return toast(err.message); }
      }
      const texte = etat.goalText.trim();
      if (!texte) return toast('Décris ton objectif en quelques mots.');
      e.target.disabled = true;
      e.target.textContent = 'Moti construit ton programme… (20-30 s)';
      try {
        const { draft } = await genererProgrammeIA({ goalText: texte, ...reglages });
        ouvrirEditeur(moi, PE.etatDepuisBrouillon(draft), { onReglages: () => { render(el); dessiner(); } });
      } catch (err) {
        toast(err.message || 'La génération a échoué.');
        e.target.disabled = false;
        e.target.textContent = 'Générer avec Moti';
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
          <span>${ws.length} séance${ws.length > 1 ? 's' : ''} / semaine</span>
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

        <p class="bloc-titre" style="margin-top:1.5rem">Séances de la semaine</p>
        <div data-modeles></div>
        <button class="btn btn-ghost" data-ajouter type="button" style="width:100%">＋ Ajouter une séance</button>

        <p class="bloc-titre" style="margin-top:1.5rem">Heure des séances</p>
        <div class="prog-pas">
          <button class="btn btn-ghost" data-heure="-15" type="button">−</button>
          <b>${heureLabel(minute)}</b>
          <button class="btn btn-ghost" data-heure="15" type="button">+</button>
        </div>
        ${intact && prem ? `
          <p class="bloc-titre">Première séance</p>
          <div class="prog-pas">
            <button class="btn btn-ghost" data-decaler="-1" type="button">‹</button>
            <b>${esc(dateBreve(prem))}</b>
            <button class="btn btn-ghost" data-decaler="1" type="button">›</button>
          </div>` : ''}
        <p class="etat-mono">${prem ? `${p.sessions.length} séances datées, du ${esc(dateBreve(prem))} au ${esc(dateBreve(dern))}.` : 'Aucune séance datée.'}</p>
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
    page.querySelector('[data-appliquer]')?.addEventListener('click', async () => {
      const demande = page.querySelector('[data-demande]').value.trim();
      if (!demande) return toast('Dis à Moti ce que tu veux changer.');
      enCours = true; messageMoti = '';
      dessiner();
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
      enCours = false;
      dessiner();
    });
    page.querySelector('[data-annuler-moti]')?.addEventListener('click', () => {
      etat = avantMoti; avantMoti = null; messageMoti = '';
      dessiner();
    });

    // ---- séances ----
    const zone = page.querySelector('[data-modeles]');
    ws.forEach(w => {
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
        const li = h(`<li><span>${esc(e.name)} — ${esc(doseExercice(w, e))}</span></li>`);
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
      zone.appendChild(carte);
    });

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
