/* ==========================================================================
   Nutrition — journal du jour, objectif, courbe de poids, ajout d'aliment.

   Quatre écrans, un seul fichier :
     #/nutrition                       journal du jour (repas, totaux vs cible)
     #/nutrition/ajouter/:repas/:jour  recherche d'aliment, quantité, ajout
     #/nutrition/poids                 pesées, tendance, correction de cible
     #/nutrition/objectif              profil, objectif (masse / sèche), cible

   Le calcul vit dans nutrition-calc.js, les données dans nutrition.js.
   Tout texte venu d'ailleurs (Open Food Facts, aliments perso) passe par
   esc() : ce sont des saisies libres de tiers, jamais du HTML de confiance.
   ========================================================================== */

import { h, render, loading, failure, empty, esc, toast } from '../ui.js';
import { currentUser } from '../supabase.js';
import { getMyWeight } from '../api.js';
import {
  ACTIVITES, OBJECTIFS, age, calculerCible, cleJour, decalerJour, pourPortion,
  totaux, lisser, penteHebdo, ajustementConseille
} from '../nutrition-calc.js';
import {
  REPAS, getObjectif, saveObjectif, entreesDuJour, entreesPeriode, ajouterEntree,
  supprimerEntree, parJour, alimentsPerso, creerAlimentPerso,
  pesees, enregistrerPesee, supprimerPesee, chercherLocal, chercherOFF, produitParCode
} from '../nutrition.js';

const num = (s) => parseFloat(String(s ?? '').replace(',', '.'));
const fmt = (v, d = 0) => (Math.round(v * 10 ** d) / 10 ** d).toLocaleString('fr-FR', { maximumFractionDigits: d });

const ONGLETS = [
  ['journal', 'Journal', '#/nutrition'],
  ['poids', 'Poids', '#/nutrition/poids'],
  ['objectif', 'Objectif', '#/nutrition/objectif']
];

function entete(actif) {
  return h(`<div class="social-entete"><div class="social-tabs">${ONGLETS.map(([id, label, href]) =>
    `<a class="chip-cat social-tab ${id === actif ? 'on' : ''}" href="${href}">${label}</a>`).join('')}</div></div>`);
}

/** Poids de référence : dernière pesée, sinon le poids du compte. */
async function poidsActuel(userId) {
  const l = await pesees(userId, 365).catch(() => []);
  if (l.length) return { kg: l[l.length - 1].kg, pesees: l };
  return { kg: await getMyWeight(userId).catch(() => 0), pesees: l };
}

function libelleJour(cle) {
  const auj = cleJour();
  if (cle === auj) return "Aujourd'hui";
  if (cle === decalerJour(auj, -1)) return 'Hier';
  if (cle === decalerJour(auj, 1)) return 'Demain';
  const [a, m, j] = cle.split('-').map(Number);
  return new Date(a, m - 1, j).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

/* =============================================================== journal */

export async function vueNutrition() {
  render(loading('Chargement de la nutrition'));
  const moi = await currentUser();
  let jour = cleJour();
  const el = h('<section class="page"></section>');

  async function charger() {
    try {
      const [objectif, entrees, ref] = await Promise.all([
        getObjectif(moi.id), entreesDuJour(moi.id, jour), poidsActuel(moi.id)
      ]);
      const sem = parJour(await entreesPeriode(moi.id, decalerJour(jour, -6), jour).catch(() => []));
      dessiner(objectif, entrees, ref.kg, sem);
    } catch (e) {
      el.replaceChildren(entete('journal'), failure(e, "La nutrition n'a pas pu être chargée"));
    }
  }

  function dessiner(objectif, entrees, poids, sem) {
    el.replaceChildren(entete('journal'));

    const nav = h(`
      <div class="nut-jour">
        <button class="nut-fleche" type="button" data-prec aria-label="Jour précédent">‹</button>
        <strong>${esc(libelleJour(jour))}</strong>
        <button class="nut-fleche" type="button" data-suiv aria-label="Jour suivant" ${jour >= cleJour() ? 'disabled' : ''}>›</button>
      </div>`);
    nav.querySelector('[data-prec]').onclick = () => { jour = decalerJour(jour, -1); charger(); };
    nav.querySelector('[data-suiv]').onclick = () => { jour = decalerJour(jour, 1); charger(); };
    el.appendChild(nav);

    const cible = objectif && poids ? calculerCible(objectif, poids) : null;
    const t = totaux(entrees);

    if (!objectif || !poids) {
      el.appendChild(h(`
        <div class="carte">
          <h2 class="carte-titre">Fixe ton objectif</h2>
          <p>${!objectif
            ? 'Prise de masse, sèche ou maintien : dis-nous où tu en es et Motio calcule tes calories et tes macros.'
            : 'Il manque ton poids pour calculer ta cible : enregistre une pesée.'}</p>
          <div class="carte-actions">
            <a class="btn" href="${!objectif ? '#/nutrition/objectif' : '#/nutrition/poids'}">${!objectif ? 'Définir mon objectif' : 'Ajouter une pesée'}</a>
          </div>
        </div>`));
    } else {
      el.appendChild(resume(t, cible));
    }

    for (const [id, label] of REPAS) {
      const lignes = entrees.filter(e => e.repas === id);
      const tr = totaux(lignes);
      const bloc = h(`
        <div class="carte nut-repas">
          <div class="carte-tete">
            <h3 class="carte-titre" style="margin:0">${esc(label)}</h3>
            <span class="etat-mono">${lignes.length ? `${tr.kcal} kcal` : ''}</span>
          </div>
          <ul class="nut-lignes"></ul>
          <div class="carte-actions"><a class="btn btn-ghost btn-sm" href="#/nutrition/ajouter/${id}/${jour}">+ Ajouter</a></div>
        </div>`);
      const ul = bloc.querySelector('ul');
      for (const e of lignes) {
        const li = h(`
          <li>
            <span class="nut-nom">${esc(e.nom)}<small>${fmt(e.grammes)} g · P ${fmt(e.proteines)} · G ${fmt(e.glucides)} · L ${fmt(e.lipides)}</small></span>
            <span class="nut-kcal">${fmt(e.kcal)}</span>
            <button class="lien-inline" type="button" aria-label="Supprimer ${esc(e.nom)}">×</button>
          </li>`);
        li.querySelector('button').onclick = async () => {
          try { await supprimerEntree(e.id); charger(); } catch (err) { toast("Suppression impossible"); console.error(err); }
        };
        ul.appendChild(li);
      }
      el.appendChild(bloc);
    }

    if (cible && sem.size > 1) el.appendChild(semaine(sem, cible, jour));
  }

  render(el);
  charger();
}

function barre(label, valeur, cible, unite) {
  const pct = cible > 0 ? Math.min(100, Math.round(valeur / cible * 100)) : 0;
  const trop = cible > 0 && valeur > cible * 1.05;
  return `
    <div class="nut-macro">
      <div class="nut-macro-tete"><span>${label}</span><span class="etat-mono">${fmt(valeur)} / ${fmt(cible)} ${unite}</span></div>
      <div class="nut-barre" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
        <i class="${trop ? 'trop' : ''}" style="width:${pct}%"></i>
      </div>
    </div>`;
}

function resume(t, c) {
  const reste = c.kcal - t.kcal;
  return h(`
    <div class="carte">
      <div class="nut-gros">
        <strong>${fmt(Math.abs(reste))}</strong>
        <span>${reste >= 0 ? 'kcal restantes' : 'kcal au-dessus de la cible'}</span>
      </div>
      ${barre('Calories', t.kcal, c.kcal, 'kcal')}
      ${barre('Protéines', t.proteines, c.proteines, 'g')}
      ${barre('Glucides', t.glucides, c.glucides, 'g')}
      ${barre('Lipides', t.lipides, c.lipides, 'g')}
    </div>`);
}

function semaine(sem, cible, jourCourant) {
  const jours = Array.from({ length: 7 }, (_, i) => decalerJour(jourCourant, i - 6));
  const max = Math.max(cible.kcal * 1.2, ...jours.map(j => sem.get(j)?.kcal || 0));
  const cols = jours.map(j => {
    const k = sem.get(j)?.kcal || 0;
    const [, , d] = j.split('-');
    return `<div class="nut-col ${j === jourCourant ? 'on' : ''}" title="${esc(libelleJour(j))} : ${k} kcal">
      <i style="height:${Math.round(k / max * 100)}%" class="${k > cible.kcal * 1.05 ? 'trop' : ''}"></i><span>${Number(d)}</span></div>`;
  }).join('');
  return h(`
    <div class="carte">
      <h3 class="carte-titre" style="margin-top:0">7 derniers jours</h3>
      <div class="nut-semaine" style="--cible:${Math.round(cible.kcal / max * 100)}%">${cols}</div>
      <p class="etat-mono">Cible : ${fmt(cible.kcal)} kcal par jour</p>
    </div>`);
}

/* ================================================================ objectif */

export async function vueNutritionObjectif() {
  render(loading("Chargement de l'objectif"));
  const moi = await currentUser();
  let existant = null, ref = { kg: 0, pesees: [] };
  try {
    [existant, ref] = await Promise.all([getObjectif(moi.id), poidsActuel(moi.id)]);
  } catch (e) { render(failure(e, "L'objectif n'a pas pu être chargé")); return; }

  const etat = {
    sexe: existant?.sexe || 'H',
    anneeNaissance: existant?.anneeNaissance || '',
    tailleCm: existant?.tailleCm || '',
    activite: existant?.activite || 'modere',
    objectif: existant?.objectif || 'MASSE',
    rythmePct: existant?.rythmePct ?? OBJECTIFS.MASSE.rythmeDefaut,
    poids: ref.kg || ''
  };

  const el = h(`
    <section class="page page-etroite">
      <div data-entete></div>
      <h2 class="carte-titre">Mon objectif</h2>
      <div class="rangee rangee-serree" data-objectifs style="margin-bottom:.6rem"></div>
      <p class="etat-mono" data-aide></p>
      <p class="champ-label">Rythme visé (variation du poids par semaine)</p>
      <div class="rangee rangee-serree" data-rythmes style="margin-bottom:1.2rem"></div>

      <div class="rangee rangee-serree" data-sexe style="margin-bottom:1rem"></div>
      <div class="rangee">
        <label class="champ"><span>Année de naissance</span><input data-annee inputmode="numeric" placeholder="1996" value="${esc(etat.anneeNaissance)}"></label>
        <label class="champ"><span>Taille (cm)</span><input data-taille inputmode="decimal" placeholder="180" value="${esc(etat.tailleCm)}"></label>
        <label class="champ"><span>Poids (kg)</span><input data-poids inputmode="decimal" placeholder="80" value="${esc(etat.poids)}"></label>
      </div>
      <label class="champ"><span>Activité</span><select data-activite>${ACTIVITES.map(a =>
        `<option value="${a.id}" ${a.id === etat.activite ? 'selected' : ''}>${esc(a.label)} — ${esc(a.aide)}</option>`).join('')}</select></label>

      <div data-apercu></div>
      <p class="etat-mono" data-erreur style="color:var(--alerte)"></p>
      <div class="barre-action" style="margin-top:1rem;padding-top:1rem">
        <button class="btn btn-lg" type="button" data-sauver>Enregistrer</button>
      </div>
    </section>`);
  el.querySelector('[data-entete]').replaceWith(entete('objectif'));

  const q = (s) => el.querySelector(s);

  function lire() {
    return {
      ...etat,
      anneeNaissance: parseInt(q('[data-annee]').value, 10),
      tailleCm: num(q('[data-taille]').value),
      poids: num(q('[data-poids]').value),
      activite: q('[data-activite]').value
    };
  }
  const valide = (p) => p.anneeNaissance > 1900 && age(p.anneeNaissance) >= 14 && age(p.anneeNaissance) <= 100
    && p.tailleCm >= 100 && p.tailleCm <= 250 && p.poids >= 30 && p.poids <= 300;

  function dessinerChoix() {
    const zo = q('[data-objectifs]'); zo.replaceChildren();
    for (const o of Object.values(OBJECTIFS)) {
      const b = h(`<button class="chip-cat ${etat.objectif === o.id ? 'on' : ''}" type="button">${esc(o.label)}</button>`);
      b.onclick = () => { Object.assign(etat, lire()); etat.objectif = o.id; etat.rythmePct = o.rythmeDefaut; dessinerChoix(); apercu(); };
      zo.appendChild(b);
    }
    q('[data-aide]').textContent = OBJECTIFS[etat.objectif].aide;

    const zr = q('[data-rythmes]'); zr.replaceChildren();
    const rythmes = OBJECTIFS[etat.objectif].rythmes;
    if (etat.objectif === 'MAINTIEN') zr.appendChild(h('<span class="etat-mono">Aucun : le poids reste stable.</span>'));
    else for (const r of rythmes) {
      const b = h(`<button class="chip-cat ${etat.rythmePct === r ? 'on' : ''}" type="button">${fmt(r, 2)} %</button>`);
      b.onclick = () => { Object.assign(etat, lire()); etat.rythmePct = r; dessinerChoix(); apercu(); };
      zr.appendChild(b);
    }

    const zs = q('[data-sexe]'); zs.replaceChildren();
    [['H', 'Homme'], ['F', 'Femme']].forEach(([id, label]) => {
      const b = h(`<button class="chip-cat ${etat.sexe === id ? 'on' : ''}" type="button">${label}</button>`);
      b.onclick = () => { Object.assign(etat, lire()); etat.sexe = id; dessinerChoix(); apercu(); };
      zs.appendChild(b);
    });
  }

  function apercu() {
    const p = lire();
    const zone = q('[data-apercu]');
    if (!valide(p)) { zone.replaceChildren(); return; }
    const c = calculerCible({ ...p, ajustementKcal: 0 }, p.poids);
    zone.replaceChildren(h(`
      <div class="carte">
        <h3 class="carte-titre" style="margin-top:0">Ta cible quotidienne</h3>
        <div class="nut-gros"><strong>${fmt(c.kcal)}</strong><span>kcal</span></div>
        <p>Protéines <b>${c.proteines} g</b> · Glucides <b>${c.glucides} g</b> · Lipides <b>${c.lipides} g</b></p>
        <p class="etat-mono">Métabolisme de base ${fmt(c.bmr)} kcal · dépense estimée ${fmt(c.tdee)} kcal${c.ecart ? ` · ${c.ecart > 0 ? '+' : ''}${c.ecart} kcal` : ''}.
          C'est un point de départ : la courbe de poids l'ajustera.</p>
        ${c.plancherAtteint ? '<p class="etat-mono">⚠ La cible a été remontée au minimum de sécurité. Choisis un rythme plus doux.</p>' : ''}
      </div>`));
  }

  el.addEventListener('input', apercu);
  q('[data-activite]').addEventListener('change', apercu);

  q('[data-sauver]').onclick = async (ev) => {
    const p = lire();
    if (!valide(p)) { q('[data-erreur]').textContent = 'Vérifie l’année de naissance, la taille et le poids.'; return; }
    q('[data-erreur]').textContent = '';
    ev.target.disabled = true;
    try {
      // Changer d'objectif ou de rythme repart d'une correction nulle : l'ancienne
      // correction avait été apprise pour un autre objectif.
      const change = !existant || existant.objectif !== p.objectif || existant.rythmePct !== p.rythmePct;
      await saveObjectif(moi.id, {
        sexe: p.sexe, anneeNaissance: p.anneeNaissance, tailleCm: p.tailleCm, activite: p.activite,
        objectif: p.objectif, rythmePct: p.objectif === 'MAINTIEN' ? 0 : p.rythmePct,
        ajustementKcal: change ? 0 : existant.ajustementKcal
      });
      if (!ref.kg || Math.abs(ref.kg - p.poids) > 0.05) await enregistrerPesee(moi.id, cleJour(), p.poids);
      toast('Objectif enregistré');
      location.hash = '#/nutrition';
    } catch (e) {
      ev.target.disabled = false;
      q('[data-erreur]').textContent = "Enregistrement impossible : " + (e?.message || 'erreur inconnue');
    }
  };

  dessinerChoix(); apercu();
  render(el);
}

/* ================================================================== poids */

function courbe(lisse) {
  if (lisse.length < 2) return '';
  const W = 320, H = 140, P = 16;
  const kgs = lisse.flatMap(p => [p.kg, p.tendance]);
  const min = Math.min(...kgs) - 0.5, max = Math.max(...kgs) + 0.5;
  const x = (i) => P + i * (W - 2 * P) / (lisse.length - 1);
  const y = (v) => H - P - (v - min) / (max - min) * (H - 2 * P);
  const pts = lisse.map((p, i) => `${x(i).toFixed(1)},${y(p.tendance).toFixed(1)}`).join(' ');
  const points = lisse.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.kg).toFixed(1)}" r="2.5"/>`).join('');
  return `<svg class="nut-courbe" viewBox="0 0 ${W} ${H}" role="img"
      aria-label="Courbe de poids de ${fmt(lisse[0].kg, 1)} à ${fmt(lisse[lisse.length - 1].kg, 1)} kg">
      <g class="pesees">${points}</g><polyline points="${pts}"/>
      <text x="${P}" y="12">${fmt(max, 1)} kg</text><text x="${P}" y="${H - 3}">${fmt(min, 1)} kg</text></svg>`;
}

export async function vueNutritionPoids() {
  render(loading('Chargement du poids'));
  const moi = await currentUser();
  const el = h('<section class="page page-etroite"></section>');

  async function charger() {
    try {
      const [objectif, liste] = await Promise.all([getObjectif(moi.id), pesees(moi.id, 120)]);
      dessiner(objectif, liste);
    } catch (e) {
      el.replaceChildren(entete('poids'), failure(e, "Le poids n'a pas pu être chargé"));
    }
  }

  function dessiner(objectif, liste) {
    el.replaceChildren(entete('poids'));
    const lisse = lisser(liste);
    const dernier = lisse[lisse.length - 1];

    const form = h(`
      <div class="carte">
        <h3 class="carte-titre" style="margin-top:0">Peser</h3>
        <div class="rangee">
          <label class="champ"><span>Date</span><input type="date" data-date value="${cleJour()}" max="${cleJour()}"></label>
          <label class="champ"><span>Poids (kg)</span><input data-kg inputmode="decimal" placeholder="${dernier ? fmt(dernier.kg, 1) : '80'}"></label>
          <button class="btn" type="button" data-ok style="margin-bottom:1rem">Enregistrer</button>
        </div>
        <p class="etat-mono" style="margin:0">Pèse-toi le matin, à jeun, dans les mêmes conditions : c'est la tendance qui compte, pas le chiffre du jour.</p>
      </div>`);
    form.querySelector('[data-ok]').onclick = async () => {
      const kg = num(form.querySelector('[data-kg]').value);
      const jour = form.querySelector('[data-date]').value;
      if (!(kg >= 30 && kg <= 300) || !jour) { toast('Poids invalide'); return; }
      try { await enregistrerPesee(moi.id, jour, Math.round(kg * 10) / 10); charger(); }
      catch (e) { toast('Enregistrement impossible'); console.error(e); }
    };
    el.appendChild(form);

    if (!liste.length) { el.appendChild(empty('Aucune pesée', 'Enregistre ton poids pour suivre la tendance.')); return; }

    const pente = penteHebdo(liste);
    const carte = h(`
      <div class="carte">
        <div class="nut-gros"><strong>${fmt(dernier.tendance, 1)}</strong><span>kg de tendance (dernière pesée : ${fmt(dernier.kg, 1)} kg)</span></div>
        ${courbe(lisse)}
        <p class="etat-mono" data-pente></p>
        <div data-conseil></div>
      </div>`);
    carte.querySelector('[data-pente]').textContent = pente == null
      ? 'Encore quelques pesées étalées sur deux semaines et la tendance apparaîtra.'
      : `Variation sur les 4 dernières semaines : ${pente > 0 ? '+' : ''}${fmt(pente, 2)} kg par semaine.`;

    if (objectif && pente != null) {
      const aj = ajustementConseille({ objectif: objectif.objectif, rythmePct: objectif.rythmePct, poidsKg: dernier.tendance, penteKgSem: pente });
      const zone = carte.querySelector('[data-conseil]');
      if (aj && aj.kcal === 0) {
        zone.appendChild(h(`<p>✔ Tu es dans le rythme visé : ne change rien.</p>`));
      } else if (aj) {
        const conseil = h(`
          <div>
            <p><b>${aj.kcal > 0 ? '+' : ''}${aj.kcal} kcal par jour</b> te rapprocheraient de l'objectif
               (visé ${aj.vise > 0 ? '+' : ''}${fmt(aj.vise, 2)} kg/sem, constaté ${aj.reel > 0 ? '+' : ''}${fmt(aj.reel, 2)}).</p>
            <button class="btn btn-sm" type="button">Appliquer à ma cible</button>
          </div>`);
        conseil.querySelector('button').onclick = async (ev) => {
          ev.target.disabled = true;
          try {
            await saveObjectif(moi.id, { ...objectif, ajustementKcal: (objectif.ajustementKcal || 0) + aj.kcal });
            toast('Cible ajustée');
            charger();
          } catch (e) { ev.target.disabled = false; toast('Ajustement impossible'); console.error(e); }
        };
        zone.appendChild(conseil);
      }
    }
    el.appendChild(carte);

    const histo = h('<div class="carte"><ul class="nut-lignes" style="margin:0"></ul></div>');
    const ul = histo.querySelector('ul');
    for (const p of [...liste].reverse().slice(0, 14)) {
      const li = h(`<li><span class="nut-nom">${esc(libelleJour(p.jour))}</span><span class="nut-kcal">${fmt(p.kg, 1)} kg</span>
        <button class="lien-inline" type="button" aria-label="Supprimer la pesée du ${esc(p.jour)}">×</button></li>`);
      li.querySelector('button').onclick = async () => {
        try { await supprimerPesee(moi.id, p.jour); charger(); } catch (e) { toast('Suppression impossible'); console.error(e); }
      };
      ul.appendChild(li);
    }
    el.appendChild(histo);
  }

  render(el);
  charger();
}

/* ================================================================ ajouter */

export async function vueNutritionAjouter({ repas, jour }) {
  const nomRepas = REPAS.find(([id]) => id === repas)?.[1];
  if (!nomRepas || !/^\d{4}-\d{2}-\d{2}$/.test(jour)) {
    render(empty('Page introuvable', 'Ce repas n’existe pas.', { href: '#/nutrition', label: 'Retour au journal' }));
    return;
  }
  render(loading('Chargement'));
  const moi = await currentUser();
  let perso = [], recents = [];
  try {
    perso = await alimentsPerso(moi.id);
    const fin = cleJour();
    const vus = new Map();
    for (const e of (await entreesPeriode(moi.id, decalerJour(fin, -30), fin)).reverse()) {
      const cle = `${e.nom}|${e.marque || ''}`;
      if (vus.has(cle) || e.grammes <= 0) continue;
      const k = 100 / e.grammes;
      vus.set(cle, {
        id: `rec-${cle}`, source: 'recent', nom: e.nom, marque: e.marque || '', codeBarres: e.code_barres || '',
        kcal: Math.round(e.kcal * k), proteines: Math.round(e.proteines * k * 10) / 10,
        glucides: Math.round(e.glucides * k * 10) / 10, lipides: Math.round(e.lipides * k * 10) / 10,
        portion: e.grammes
      });
      if (vus.size >= 12) break;
    }
    recents = [...vus.values()];
  } catch { /* le reste fonctionne sans */ }

  const el = h(`
    <section class="page page-etroite">
      <p><a class="lien-inline" href="#/nutrition">‹ Journal</a></p>
      <h2 class="carte-titre">${esc(nomRepas)} <small class="etat-mono">${esc(libelleJour(jour))}</small></h2>
      <label class="champ" style="max-width:none"><span>Rechercher un aliment ou un code-barres</span>
        <input data-q type="search" autocomplete="off" placeholder="poulet, skyr, 3017620422003…"></label>
      <div data-resultats></div>
      <div data-quantite></div>
      <details class="carte" data-creer>
        <summary><b>Créer un aliment</b></summary>
        <div class="rangee" style="margin-top:.8rem">
          <label class="champ"><span>Nom</span><input data-c-nom></label>
          <label class="champ"><span>kcal / 100 g</span><input data-c-kcal inputmode="decimal"></label>
          <label class="champ"><span>Protéines / 100 g</span><input data-c-p inputmode="decimal"></label>
          <label class="champ"><span>Glucides / 100 g</span><input data-c-g inputmode="decimal"></label>
          <label class="champ"><span>Lipides / 100 g</span><input data-c-l inputmode="decimal"></label>
          <label class="champ"><span>Portion usuelle (g)</span><input data-c-portion inputmode="decimal"></label>
        </div>
        <button class="btn btn-sm" type="button" data-c-ok>Créer l'aliment</button>
      </details>
    </section>`);
  const q = (s) => el.querySelector(s);
  const zoneRes = q('[data-resultats]');
  const zoneQte = q('[data-quantite]');

  function ligneAliment(a) {
    const li = h(`
      <li>
        <span class="nut-nom">${esc(a.nom)}<small>${a.marque ? esc(a.marque) + ' · ' : ''}${fmt(a.kcal)} kcal · P ${fmt(a.proteines)} · G ${fmt(a.glucides)} · L ${fmt(a.lipides)} /100 g</small></span>
        <button class="btn btn-ghost btn-sm" type="button">Choisir</button>
      </li>`);
    li.querySelector('button').onclick = () => choisir(a);
    return li;
  }

  function section(titre, liste, extra) {
    if (!liste.length && !extra) return null;
    const bloc = h(`<div class="carte"><h3 class="carte-titre" style="margin-top:0">${esc(titre)}</h3><ul class="nut-lignes"></ul></div>`);
    liste.forEach(a => bloc.querySelector('ul').appendChild(ligneAliment(a)));
    if (extra) bloc.appendChild(extra);
    return bloc;
  }

  function accueil() {
    zoneRes.replaceChildren();
    const s = section('Récents', recents);
    if (s) zoneRes.appendChild(s);
    const p = section('Mes aliments', perso);
    if (p) zoneRes.appendChild(p);
    if (!s && !p) zoneRes.appendChild(h('<p class="etat-mono">Tape un nom d’aliment pour commencer.</p>'));
  }

  let courant = 0, minuteur = null, abort = null;

  async function chercher(terme) {
    const id = ++courant;
    abort?.abort();
    if (terme.length < 2) { accueil(); return; }
    const locaux = chercherLocal(terme, perso);
    const distantOk = terme.length >= 3 || /^\d{8,14}$/.test(terme);
    const attente = h('<p class="etat-mono" data-attente>Recherche Open Food Facts…</p>');
    zoneRes.replaceChildren();
    const sl = section('Aliments courants', locaux.slice(0, 15));
    if (sl) zoneRes.appendChild(sl);
    if (distantOk) zoneRes.appendChild(attente);
    if (!distantOk) return;

    abort = new AbortController();
    try {
      const codeBarres = /^\d{8,14}$/.test(terme);
      const produits = codeBarres
        ? [await produitParCode(terme, { signal: abort.signal })].filter(Boolean)
        : await chercherOFF(terme, { signal: abort.signal });
      if (id !== courant) return;
      attente.remove();
      const so = section('Open Food Facts', produits);
      if (so) zoneRes.appendChild(so);
      else if (!sl) zoneRes.appendChild(h('<p>Aucun résultat. Tu peux créer l’aliment ci-dessous.</p>'));
    } catch (e) {
      if (e.name === 'AbortError' || id !== courant) return;
      attente.textContent = "Open Food Facts ne répond pas : seuls les aliments courants et les tiens sont proposés.";
    }
  }

  q('[data-q]').addEventListener('input', (ev) => {
    clearTimeout(minuteur);
    const t = ev.target.value.trim();
    minuteur = setTimeout(() => chercher(t), 400);
  });

  function choisir(a) {
    const base = a.portion > 0 ? a.portion : 100;
    const bloc = h(`
      <div class="carte nut-quantite">
        <h3 class="carte-titre" style="margin-top:0">${esc(a.nom)}</h3>
        <label class="champ"><span>Quantité (g)</span><input data-g inputmode="decimal" value="${esc(base)}"></label>
        <p data-calc class="nut-gros"></p>
        <div class="carte-actions">
          <button class="btn" type="button" data-ajouter>Ajouter au journal</button>
          <button class="btn btn-ghost" type="button" data-annuler>Annuler</button>
        </div>
      </div>`);
    const champ = bloc.querySelector('[data-g]');
    const calc = bloc.querySelector('[data-calc]');
    const maj = () => {
      const p = pourPortion(a, num(champ.value));
      calc.innerHTML = `<strong>${p.kcal}</strong><span>kcal · P ${fmt(p.proteines)} · G ${fmt(p.glucides)} · L ${fmt(p.lipides)}</span>`;
    };
    champ.addEventListener('input', maj); maj();
    bloc.querySelector('[data-annuler]').onclick = () => zoneQte.replaceChildren();
    bloc.querySelector('[data-ajouter]').onclick = async (ev) => {
      const g = num(champ.value);
      if (!(g > 0 && g <= 5000)) { toast('Quantité invalide'); return; }
      ev.target.disabled = true;
      try {
        const p = pourPortion(a, g);
        await ajouterEntree(moi.id, {
          jour, repas, nom: a.nom, marque: a.marque, codeBarres: a.codeBarres, grammes: g, ...p
        });
        toast('Ajouté');
        location.hash = '#/nutrition';
      } catch (e) { ev.target.disabled = false; toast('Ajout impossible'); console.error(e); }
    };
    zoneQte.replaceChildren(bloc);
    bloc.scrollIntoView({ behavior: 'smooth', block: 'center' });
    champ.focus({ preventScroll: true });
    champ.select();
  }

  q('[data-c-ok]').onclick = async (ev) => {
    const v = (s) => q(s).value;
    const nom = v('[data-c-nom]').trim();
    const kcal = num(v('[data-c-kcal]'));
    if (!nom || !(kcal >= 0)) { toast('Nom et calories requis'); return; }
    const a = {
      nom, kcal, proteines: num(v('[data-c-p]')) || 0, glucides: num(v('[data-c-g]')) || 0,
      lipides: num(v('[data-c-l]')) || 0, portion: num(v('[data-c-portion]')) || 0
    };
    ev.target.disabled = true;
    try {
      const r = await creerAlimentPerso(moi.id, a);
      const cree = { ...a, id: r.id, source: 'perso', marque: '' };
      perso = [cree, ...perso];
      q('[data-creer]').open = false;
      toast('Aliment créé');
      choisir(cree);
    } catch (e) { toast('Création impossible'); console.error(e); }
    ev.target.disabled = false;
  };

  accueil();
  render(el);
}
