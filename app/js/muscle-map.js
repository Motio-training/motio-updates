/* ==========================================================================
   Carte musculaire — portage de MuscleMap.kt : deux silhouettes (face/dos)
   teintées selon le travail fourni, dessinées sur un canvas 2D à partir des
   mêmes masques PNG que le natif (un fichier par groupe musculaire, muscle
   en blanc opaque, fond transparent, rogné à sa boîte englobante).

   Écarts assumés face au natif : pas de zoom plein écran (pincer-écarter),
   pas de bulle de nom au survol/appui — carte statique, légendée par
   Face/Dos et un dégradé, ce qui reste l'essentiel de l'information.
   ========================================================================== */

import { Mus, musLabel } from './muscle-lexicon.js';

export const CANVAS_W = 792;
export const CANVAS_H = 545;

export const MuscleScale = { SESSION: 6, WEEK: 16 };

const BASE = '../assets/img/muscles/';

/** ZONES_HOMME (MuscleMap.kt) : fichier + place sur la toile commune 792×545. */
const ZONES = [
  { key: Mus.TRAPEZES, file: 'muscle_trapezes.png', x: 98, y: 55, w: 605, h: 133 },
  { key: Mus.EPAULES, file: 'muscle_epaules.png', x: 64, y: 103, w: 154, h: 50 },
  { key: Mus.EPAULES_AR, file: 'muscle_epaules_ar.png', x: 572, y: 102, w: 156, h: 48 },
  { key: Mus.PECTORAUX, file: 'muscle_pectoraux.png', x: 82, y: 108, w: 119, h: 54 },
  { key: Mus.DORSAUX, file: 'muscle_dorsaux.png', x: 596, y: 149, w: 107, h: 79 },
  { key: Mus.BICEPS, file: 'muscle_biceps.png', x: 64, y: 140, w: 154, h: 59 },
  { key: Mus.TRICEPS, file: 'muscle_triceps.png', x: 567, y: 136, w: 165, h: 65 },
  { key: Mus.LOMBAIRES, file: 'muscle_lombaires.png', x: 640, y: 201, w: 20, h: 40 },
  { key: Mus.ABDOS, file: 'muscle_abdos.png', x: 97, y: 159, w: 89, h: 112 },
  { key: Mus.AVANTBRAS, file: 'muscle_avantbras.png', x: 38, y: 183, w: 708, h: 87 },
  { key: Mus.FESSIERS, file: 'muscle_fessiers.png', x: 596, y: 229, w: 107, h: 130 },
  { key: Mus.QUADRICEPS, file: 'muscle_quadriceps.png', x: 91, y: 247, w: 100, h: 131 },
  { key: Mus.ISCHIOS, file: 'muscle_ischios.png', x: 602, y: 293, w: 96, h: 110 },
  { key: Mus.MOLLETS, file: 'muscle_mollets.png', x: 606, y: 383, w: 87, h: 146 }
];
const LINES_FILE = 'muscle_lines.png';

const imgCache = new Map();
function loadImg(file) {
  if (imgCache.has(file)) return imgCache.get(file);
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Image introuvable : ${file}`));
    img.src = BASE + file;
  });
  /* Un échec ne doit pas empoisonner le cache pour le reste de la session —
     un raté réseau ponctuel serait sinon définitif tant que l'onglet reste
     ouvert, sans jamais pouvoir réessayer. */
  p.catch(() => imgCache.delete(file));
  imgCache.set(file, p);
  return p;
}

/** Teinte une image-masque (blanc opaque + alpha) : dessine puis remplace tout
 *  pixel non transparent par la couleur donnée (recette standard Canvas 2D,
 *  équivalent de ColorFilter.tint() en Compose). */
function drawTinted(ctx, img, dx, dy, dw, dh, color) {
  const off = document.createElement('canvas');
  off.width = dw; off.height = dh;
  const octx = off.getContext('2d');
  octx.drawImage(img, 0, 0, dw, dh);
  octx.globalCompositeOperation = 'source-in';
  octx.fillStyle = color;
  octx.fillRect(0, 0, dw, dh);
  ctx.drawImage(off, dx, dy);
}

/** Dégradé éteint → vert → doré (MuscleMap.shade), deux segments. */
function shade(t, cold, warm, hot) {
  const seg = t < 0.5 ? [cold, warm, t * 2] : [warm, hot, (t - 0.5) * 2];
  return lerpColor(seg[0], seg[1], seg[2]);
}
function lerpColor(a, b, t) {
  const pa = parseRgb(a), pb = parseRgb(b);
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
  return `rgb(${r},${g},${bl})`;
}
function parseRgb(s) {
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (m) return m[1].split(',').map(Number);
  const c = document.createElement('canvas').getContext('2d');
  c.fillStyle = s; const hex = c.fillStyle;
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/**
 * Dessine la carte musculaire dans `canvas` (déjà dimensionné en CSS,
 * dessiné à sa résolution réelle en pixels pour rester net).
 * `load` : { zone: séries pondérées }. `fullScale` : plafond de l'échelle
 * (MuscleScale.SESSION ou .WEEK). `colors` : palette figée optionnelle
 * ({cold,warm,hot,line}) — sert à la carte de partage, dont l'image doit
 * toujours rendre pareil quel que soit le thème choisi dans l'appli
 * (SummaryImage.kt, palette FIXE plutôt que le thème dynamique). Sans elle,
 * les couleurs suivent le thème courant via les variables CSS.
 */
export async function drawMuscleMap(canvas, load, fullScale = MuscleScale.SESSION, colors = null) {
  const cs = getComputedStyle(document.documentElement);
  const cold = colors?.cold || cs.getPropertyValue('--creme-2').trim() || '#333A24';
  const warm = colors?.warm || cs.getPropertyValue('--accent').trim() || '#A9C25E';
  const hot = colors?.hot || cs.getPropertyValue('--dore').trim() || '#C9A44A';
  const lineColor = colors?.line || cs.getPropertyValue('--encre').trim() || '#ECEADD';

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = canvas.clientWidth || CANVAS_W;
  const cssH = cssW * (CANVAS_H / CANVAS_W);
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  canvas.style.height = cssH + 'px';

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr * (cssW / CANVAS_W), 0, 0, dpr * (cssW / CANVAS_W), 0, 0);
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  function tint(v) {
    if (!v || v <= 0) return cold;
    const t = Math.min(1, Math.max(0.14, v / fullScale));
    return shade(t, cold, warm, hot);
  }

  const [lines, masks] = await Promise.all([
    loadImg(LINES_FILE),
    Promise.all(ZONES.map(async z => [z, await loadImg(z.file)]))
  ]);

  drawTinted(ctx, lines, 0, 0, CANVAS_W, CANVAS_H, lineColor);
  for (const [z, img] of masks) {
    drawTinted(ctx, img, z.x, z.y, z.w, z.h, tint(load[z.key] || 0));
  }
}

/** Étiquettes Face/Dos + dégradé de légende, posés sous le canvas. */
export function drawLegend(canvas, fullScale = MuscleScale.SESSION) {
  const cs = getComputedStyle(document.documentElement);
  const cold = cs.getPropertyValue('--creme-2').trim() || '#333A24';
  const warm = cs.getPropertyValue('--accent').trim() || '#A9C25E';
  const hot = cs.getPropertyValue('--dore').trim() || '#C9A44A';

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = canvas.clientWidth;
  const cssH = 8;
  canvas.width = cssW * dpr; canvas.height = cssH * dpr;
  canvas.style.height = cssH + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const n = 32;
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = shade(i / (n - 1), cold, warm, hot);
    ctx.fillRect(Math.floor(cssW * i / n), 0, Math.ceil(cssW / n) + 1, cssH);
  }
}

export { musLabel };
