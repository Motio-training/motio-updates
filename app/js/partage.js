/* ==========================================================================
   Partage — génère l'image « bilan de séance » (format story, 1080×1920) à
   partir d'une ligne shared_sessions et l'affiche dans une modale avec un
   bouton de téléchargement / partage natif.

   Fonctionnement : le visuel est un fragment XHTML autonome (polices en
   data URI, aucune ressource externe) placé dans un <foreignObject> SVG,
   rastérisé sur un <canvas> puis exporté en PNG. Aucune dépendance.
   ========================================================================== */

import { h, esc, toast, duree } from './ui.js';

const CARTE_L = 1080;
const CARTE_H = 1920;
const ECHELLE_EXPORT = 2;

const URL_OUTFIT = new URL('../fonts/outfit-variable.woff2', import.meta.url).href;
const URL_JBMONO = new URL('../fonts/jbmono-variable.woff2', import.meta.url).href;

let policesEnCache = null;

/* Palette figée de la carte — dupliquée en couleurs littérales (et non en
   var() CSS) partout où elle sert à composer des images SVG autonomes : une
   fois passées en data URI (background-image), ces images n'ont plus accès
   aux propriétés personnalisées de la feuille de style hôte. */
const CREME = '#EEEFE4';
const OLIVE_CLAIR = '#B7CE6A';
const TRAIT = 'rgba(48,57,33,.47)';
const TICK_MINEUR = '#4A5433';

/** Encode un fragment SVG autonome en data URI, pour un usage en
 *  background-image : un <svg> imbriqué dans le XHTML d'un foreignObject ne
 *  se rastérise pas quand l'ensemble est chargé via <img> (limitation
 *  connue de Chromium), alors qu'une image référencée reste fiable. */
function versDataURISVG(svg) {
  // encodeURIComponent laisse passer ' ( ) " tels quels ; on les échappe
  // aussi, faute de quoi ils casseraient l'attribut style="…url('…')" qui
  // accueille ce data URI.
  const code = encodeURIComponent(svg)
    .replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/"/g, '%22');
  return `data:image/svg+xml,${code}`;
}

/* ---------------------------------------------------------------- données */

function fmtNombre(v) {
  if (v == null) return '—';
  return Math.abs(v % 1) < 0.05 ? String(Math.round(v)) : v.toFixed(1).replace('.', ',');
}

function formaterTonnage(v) {
  // espace normale plutôt que l'insécable fine renvoyée par l'API Intl :
  // plus sûre sur une police embarquée qui ne définit pas forcément ce
  // point de code précis.
  return Math.round(v || 0).toLocaleString('fr-FR').replace(/[\u00a0\u202f]/g, ' ');
}

function dureeCourte(sec) {
  if (!sec) return '—';
  const h_ = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h_ ? `${h_}h${String(m).padStart(2, '0')}` : `${m} min`;
}

function formaterDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Résume les séries d'un exercice : uniformes → « 4 × 10 » / « @ 30 kg »,
 *  sinon un total de séries et l'écart de charge constaté. */
function resumerExercice(sets) {
  if (!sets.length) return { gras: '—', muet: '' };
  const poids = sets.map(s => s.w ?? 0);
  const reps = sets.map(s => s.r ?? 0);
  const memeReps = reps.every(r => r === reps[0]);
  const memePoids = poids.every(p => p === poids[0]);
  if (memeReps && memePoids) {
    return { gras: `${sets.length} × ${reps[0]}`, muet: `@ ${fmtNombre(poids[0])} kg` };
  }
  const min = Math.min(...poids), max = Math.max(...poids);
  return {
    gras: `${sets.length} séries`,
    muet: min === max ? `@ ${fmtNombre(min)} kg` : `${fmtNombre(min)}–${fmtNombre(max)} kg`
  };
}

const MAX_EXERCICES_AFFICHES = 7;

/** Transforme une ligne shared_sessions (voir api.js) en données prêtes à
 *  injecter dans le gabarit de la carte. */
export function normaliserSeance(s) {
  const brut = Array.isArray(s.details) ? s.details : [];
  const exercices = brut
    .map(ex => ({ nom: ex.n || 'Exercice', ...resumerExercice(Array.isArray(ex.s) ? ex.s : []) }))
    .filter(e => e.muet);

  const visibles = exercices.slice(0, MAX_EXERCICES_AFFICHES);
  const reste = exercices.length - visibles.length;
  if (reste > 0) {
    visibles.push({ nom: `+ ${reste} autre${reste > 1 ? 's' : ''} exercice${reste > 1 ? 's' : ''}`, gras: '', muet: '' });
  }

  return {
    titre: s.workout_name || 'Séance',
    date: formaterDate(s.started_at),
    tonnage: formaterTonnage(s.volume_kg),
    dureeTxt: dureeCourte((s.duration_ms || 0) / 1000),
    tensionTxt: s.tension_ms ? duree(s.tension_ms / 1000) : '—',
    exercices: visibles
  };
}

/* ------------------------------------------------------------------ svg */

/** Graduations + arc balayé du cadran, en unités du viewBox (0–200). */
function cadranSVG({ taille = 200, n = 60, majeureTous = 5, arcDeg = 252 } = {}) {
  const c = taille / 2;
  const rExt = taille * 0.5 - 2;
  const rIntMineur = rExt - taille * 0.028;
  const rIntMajeur = rExt - taille * 0.06;
  let lignes = '';
  for (let i = 0; i < n; i++) {
    const angle = ((360 / n) * i - 90) * Math.PI / 180;
    const majeure = i % majeureTous === 0;
    const rInt = majeure ? rIntMajeur : rIntMineur;
    const x1 = c + rInt * Math.cos(angle), y1 = c + rInt * Math.sin(angle);
    const x2 = c + rExt * Math.cos(angle), y2 = c + rExt * Math.sin(angle);
    lignes += `<line class="${majeure ? 'tick-major' : 'tick-minor'}" x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}"/>`;
  }
  const rArc = rExt + taille * 0.018;
  const debut = -90 * Math.PI / 180;
  const fin = (-90 + arcDeg) * Math.PI / 180;
  const x1 = c + rArc * Math.cos(debut), y1 = c + rArc * Math.sin(debut);
  const x2 = c + rArc * Math.cos(fin), y2 = c + rArc * Math.sin(fin);
  const grand = arcDeg > 180 ? 1 : 0;
  const chemin = `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${rArc.toFixed(2)} ${rArc.toFixed(2)} 0 ${grand} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${taille} ${taille}" fill="none">
    <style>
      .tick-minor{stroke:${TICK_MINEUR};stroke-width:1.1;stroke-linecap:round}
      .tick-major{stroke:${OLIVE_CLAIR};stroke-width:2;stroke-linecap:round;opacity:.95}
      .dial-rim{stroke:${TRAIT};stroke-width:1}
      .dial-arc{stroke:${OLIVE_CLAIR};stroke-width:2.4;stroke-linecap:round;opacity:.65}
    </style>
    <circle class="dial-rim" cx="${c}" cy="${c}" r="${(rExt + taille * 0.018).toFixed(2)}"/>
    <path class="dial-arc" d="${chemin}"/>
    ${lignes}
  </svg>`;
}

function emblemeSVG({ accentCercle = false } = {}) {
  const cCercle = accentCercle ? OLIVE_CLAIR : CREME;
  const cTics = accentCercle ? OLIVE_CLAIR : CREME;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
    <circle cx="16" cy="17" r="12.5" stroke="${cCercle}" stroke-width="1.7"/>
    <path d="M12 3.5h8" stroke="${CREME}" stroke-width="1.7" stroke-linecap="round"/>
    <path d="M23.5 6.5l1.8-1.8" stroke="${CREME}" stroke-width="1.7" stroke-linecap="round"/>
    <rect x="14.4" y="2.2" width="3.2" height="2.6" rx="1" fill="${CREME}"/>
    <g stroke="${cTics}" stroke-width="1.1" opacity=".55">
      <path d="M16 6.6v2"/><path d="M16 27.4v-2"/>
      <path d="M5.5 17h2"/><path d="M26.5 17h-2"/>
    </g>
    <path d="M16 17l4.6-3.4" stroke="${OLIVE_CLAIR}" stroke-width="2.1" stroke-linecap="round"/>
    <circle cx="16" cy="17" r="1.6" fill="${OLIVE_CLAIR}"/>
  </svg>`;
}

function feuilleDeStyle(outfitURI, monoURI) {
  return `
@font-face{font-family:"Outfit Var";src:url(${outfitURI}) format("woff2");font-weight:100 900;font-style:normal}
@font-face{font-family:"JetBrains Mono Var";src:url(${monoURI}) format("woff2");font-weight:100 800;font-style:normal}

:root{
  --charbon:#0F1209;--charbon-2:#171B10;
  --trait:#30392177;--trait-strong:#303921;
  --creme:#EEEFE4;--creme-dim:#A7AF92;
  --olive-clair:#B7CE6A;--dore:#D8B24C;
}
*{box-sizing:border-box;margin:0;padding:0}

.card{
  position:relative;width:${CARTE_L}px;height:${CARTE_H}px;overflow:hidden;
  background:
    radial-gradient(120% 85% at 82% -6%, #29391a 0%, transparent 58%),
    radial-gradient(90% 70% at 8% 108%, #241c0c 0%, transparent 52%),
    linear-gradient(174deg, var(--charbon) 0%, var(--charbon-2) 46%, #191d10 100%);
  color:var(--creme);
  font-family:"JetBrains Mono Var",monospace;
  -webkit-font-smoothing:antialiased;
}
.card-inner{position:relative;height:100%;display:flex;flex-direction:column;padding:76px 66px 64px}

.topbar{display:flex;align-items:center;justify-content:space-between}
.brand{display:flex;align-items:center;gap:14px}
.embleme{background-size:contain;background-repeat:no-repeat;background-position:center}
.brand .embleme{width:42px;height:42px}
.brand span{font-family:"Outfit Var",sans-serif;font-weight:700;font-size:21px;letter-spacing:.16em;color:var(--creme)}
.date{font-size:14px;letter-spacing:.06em;color:var(--creme-dim);text-transform:uppercase}

.eyebrow{margin-top:38px;font-size:15px;font-weight:600;letter-spacing:.26em;text-transform:uppercase;color:var(--olive-clair)}
h1{
  margin-top:10px;font-family:"Outfit Var",sans-serif;font-weight:650;text-transform:uppercase;
  font-size:70px;line-height:.98;letter-spacing:-.01em;max-width:88%;
  overflow-wrap:break-word;
}
.rule{width:150px;height:9px;margin-top:22px;
  background:repeating-linear-gradient(90deg, var(--olive-clair) 0 3px, transparent 3px 16px);opacity:.85}

.dial-wrap{position:relative;margin:30px auto 0;width:560px;height:560px;display:flex;align-items:center;justify-content:center;flex:none}
.dial-svg{position:absolute;inset:0;width:100%;height:100%;background-size:100% 100%;background-repeat:no-repeat}
.dial-face{
  position:relative;width:432px;height:432px;border-radius:50%;
  background:radial-gradient(circle at 34% 28%, #232a17 0%, #12150d 72%, #0c0f08 100%);
  border:1px solid var(--trait);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;
}
.dial-label{font-size:13.5px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--creme-dim)}
.dial-value{margin-top:10px;font-family:"Outfit Var",sans-serif;font-weight:650;font-size:96px;line-height:.92;letter-spacing:-.02em;color:var(--olive-clair)}
.dial-unit{margin-top:6px;font-size:20px;font-weight:600;letter-spacing:.1em;color:var(--creme-dim)}

.stats{display:flex;gap:14px;margin-top:34px}
.stat{position:relative;flex:1;padding:20px 22px 18px 24px;
  background:linear-gradient(180deg, rgba(255,255,255,.035), rgba(255,255,255,0));
  border:1px solid var(--trait);border-radius:16px;overflow:hidden}
.stat::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--rail, var(--olive-clair))}
.stat.b::before{--rail:var(--dore)}
.stat span{display:block;font-size:12.5px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--creme-dim)}
.stat b{display:block;margin-top:8px;font-family:"Outfit Var",sans-serif;font-size:46px;font-weight:600;letter-spacing:-.01em}

.exo-head{display:flex;align-items:baseline;justify-content:space-between;margin-top:38px}
.exo-head span{font-size:13.5px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:var(--olive-clair)}
.exo-head em{font-style:normal;font-size:12.5px;letter-spacing:.05em;color:var(--creme-dim)}

.exo-list{list-style:none;margin-top:6px}
.exo-row{display:flex;align-items:baseline;gap:10px;padding:15px 0;border-bottom:1px solid var(--trait);font-family:"Outfit Var",sans-serif}
.exo-row:last-child{border-bottom:0}
.exo-nom{flex:0 1 auto;font-size:21px;font-weight:500;color:var(--creme);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.exo-fil{flex:1 1 auto;border-bottom:1px dotted #4a533280;margin-bottom:6px;min-width:14px}
.exo-data{flex:0 0 auto;display:flex;align-items:baseline;gap:8px;font-family:"JetBrains Mono Var",monospace;white-space:nowrap}
.exo-data b{font-size:20px;font-weight:600;color:var(--creme)}
.exo-data i{font-style:normal;font-size:16px;color:var(--creme-dim)}

.foot{margin-top:auto;padding-top:34px;border-top:1px solid var(--trait);display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center}
.foot-brand{display:flex;align-items:center;gap:16px}
.foot-brand .embleme{width:52px;height:52px}
.foot-brand b{font-family:"Outfit Var",sans-serif;font-weight:700;font-size:34px;letter-spacing:.2em;color:var(--olive-clair)}
.foot-tag{font-size:13.5px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:var(--creme-dim)}
`;
}

function ligneExercice(ex) {
  if (!ex.gras) {
    return `<li class="exo-row"><span class="exo-nom">${esc(ex.nom)}</span></li>`;
  }
  return `<li class="exo-row">
    <span class="exo-nom">${esc(ex.nom)}</span>
    <span class="exo-fil"></span>
    <span class="exo-data"><b>${esc(ex.gras)}</b><i>${esc(ex.muet)}</i></span>
  </li>`;
}

/** Un <div> dont le fond est l'image SVG donnée — voir versDataURISVG(). */
function imageDiv(classe, svg) {
  return `<div class="${classe}" style="background-image:url('${versDataURISVG(svg)}')"></div>`;
}

function contenuCarte(d) {
  return `<div class="card">
    <div class="card-inner">
      <div class="topbar">
        <div class="brand">${imageDiv('embleme', emblemeSVG())}<span>MOTIO</span></div>
        <div class="date">${esc(d.date)}</div>
      </div>

      <p class="eyebrow">Bilan de séance</p>
      <h1>${esc(d.titre)}</h1>
      <div class="rule"></div>

      <div class="dial-wrap">
        ${imageDiv('dial-svg', cadranSVG())}
        <div class="dial-face">
          <span class="dial-label">Charge déplacée</span>
          <span class="dial-value">${esc(d.tonnage)}</span>
          <span class="dial-unit">KILOGRAMMES</span>
        </div>
      </div>

      <div class="stats">
        <div class="stat a"><span>Durée</span><b>${esc(d.dureeTxt)}</b></div>
        <div class="stat b"><span>Temps sous tension</span><b>${esc(d.tensionTxt)}</b></div>
      </div>

      ${d.exercices.length ? `
      <div class="exo-head"><span>Par exercice</span><em>séries × reps</em></div>
      <ul class="exo-list">${d.exercices.map(ligneExercice).join('')}</ul>` : ''}

      <div class="foot">
        <div class="foot-brand">${imageDiv('embleme', emblemeSVG({ accentCercle: true }))}<b>MOTIO</b></div>
        <p class="foot-tag">Ton coach personnel, toujours dans ta poche</p>
      </div>
    </div>
  </div>`;
}

/* ------------------------------------------------------------ génération */

async function octetsEnDataURI(url, mime) {
  const tampon = await fetch(url).then(r => {
    if (!r.ok) throw new Error(`Police introuvable (${r.status})`);
    return r.arrayBuffer();
  });
  const octets = new Uint8Array(tampon);
  let binaire = '';
  for (let i = 0; i < octets.length; i++) binaire += String.fromCharCode(octets[i]);
  return `data:${mime};base64,${btoa(binaire)}`;
}

async function chargerPolices() {
  if (policesEnCache) return policesEnCache;
  policesEnCache = (async () => {
    const [outfitURI, monoURI] = await Promise.all([
      octetsEnDataURI(URL_OUTFIT, 'font/woff2'),
      octetsEnDataURI(URL_JBMONO, 'font/woff2')
    ]);
    const outfit = new FontFace('Outfit Var', `url(${outfitURI})`, { weight: '100 900' });
    const mono = new FontFace('JetBrains Mono Var', `url(${monoURI})`, { weight: '100 800' });
    const [o, m] = await Promise.all([outfit.load(), mono.load()]);
    document.fonts.add(o);
    document.fonts.add(m);
    await document.fonts.ready;
    return { outfitURI, monoURI };
  })();
  return policesEnCache;
}

async function chargerImage(svgMarkup) {
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgMarkup);
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

/** Génère l'image PNG (data URL) du bilan de la séance donnée. */
export async function genererImageSeance(session) {
  const d = normaliserSeance(session);
  const { outfitURI, monoURI } = await chargerPolices();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CARTE_L}" height="${CARTE_H}" viewBox="0 0 ${CARTE_L} ${CARTE_H}">
<foreignObject x="0" y="0" width="${CARTE_L}" height="${CARTE_H}">
<div xmlns="http://www.w3.org/1999/xhtml"><style>${feuilleDeStyle(outfitURI, monoURI)}</style>${contenuCarte(d)}</div>
</foreignObject>
</svg>`;
  const img = await chargerImage(svg);
  const canvas = document.createElement('canvas');
  canvas.width = CARTE_L * ECHELLE_EXPORT;
  canvas.height = CARTE_H * ECHELLE_EXPORT;
  const ctx = canvas.getContext('2d');
  ctx.scale(ECHELLE_EXPORT, ECHELLE_EXPORT);
  ctx.drawImage(img, 0, 0, CARTE_L, CARTE_H);
  return { dataURL: canvas.toDataURL('image/png'), titre: d.titre };
}

/* --------------------------------------------------------------- modale */

function dataURLVersFichier(dataURL, nom) {
  const [entete, base64] = dataURL.split(',');
  const mime = entete.match(/:(.*?);/)[1];
  const bin = atob(base64);
  const octets = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i);
  return new File([octets], nom, { type: mime });
}

/** Ouvre la modale de partage pour une ligne shared_sessions (ou compatible). */
export async function ouvrirPartage(session) {
  toast("Génération de l'image…");
  let resultat;
  try {
    resultat = await genererImageSeance(session);
  } catch (err) {
    console.error(err);
    toast("L'image n'a pas pu être générée.");
    return;
  }

  const nomFichier = `motio-${(session.started_at || '').slice(0, 10) || Date.now()}.png`;

  const modale = h(`
    <div class="modale" role="dialog" aria-label="Partager la séance">
      <div class="modale-boite">
        <div class="modale-tete">
          <h2>Partager la séance</h2>
          <button class="lien-inline" data-fermer>Fermer</button>
        </div>
        <div class="modale-corps" data-corps>
          <img data-apercu alt="Bilan de la séance" style="width:100%;max-width:22rem;display:block;margin:0 auto;border-radius:var(--r-l);box-shadow:var(--ombre-2)">
        </div>
        <div class="modale-pied">
          <button class="btn" data-telecharger type="button">Télécharger l'image</button>
          <button class="btn btn-ghost" data-partager-natif type="button" hidden>Partager…</button>
        </div>
      </div>
    </div>`);

  modale.querySelector('[data-apercu]').src = resultat.dataURL;

  modale.querySelector('[data-telecharger]').onclick = () => {
    const a = document.createElement('a');
    a.href = resultat.dataURL;
    a.download = nomFichier;
    a.click();
  };

  const btnPartager = modale.querySelector('[data-partager-natif]');
  const fichier = () => dataURLVersFichier(resultat.dataURL, nomFichier);
  if (navigator.canShare && navigator.canShare({ files: [fichier()] })) {
    btnPartager.hidden = false;
    btnPartager.onclick = async () => {
      try {
        await navigator.share({ files: [fichier()], title: resultat.titre, text: `${resultat.titre} — Motio` });
      } catch (err) {
        if (err?.name !== 'AbortError') toast('Le partage a échoué.');
      }
    };
  }

  modale.querySelector('[data-fermer]').onclick = () => modale.remove();
  modale.addEventListener('click', (e) => { if (e.target === modale) modale.remove(); });
  document.addEventListener('keydown', function esc_(e) {
    if (e.key === 'Escape') { modale.remove(); document.removeEventListener('keydown', esc_); }
  });

  document.body.appendChild(modale);
}
