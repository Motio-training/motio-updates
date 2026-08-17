/* ==========================================================================
   QR code de partage — port de Sharing.kt::WorkoutShare.qrBitmap/dessiner.
   Le natif encode avec ZXing puis redessine la matrice à la main sur Canvas ;
   le web encode avec vendor/qrcode.js (Kazuhiko Arase, déjà vendorisé pour le
   site marketing, chargé en script classique dans index.html → window.qrcode)
   et applique EXACTEMENT le même rendu à la main : modules en cercles,
   repères de position en carrés arrondis empilés, zone de silence de 4
   modules dessinée nous-mêmes (pas laissée à la librairie), logo au centre
   uniquement quand le niveau de correction retenu le permet.

   Repli en cascade H → Q → M → L (docstring Sharing.kt) : le niveau H
   récupère jusqu'à 30 % du contenu (le logo n'en couvre qu'environ 5 %,
   marge confortable), mais une séance très fournie peut dépasser sa
   capacité — on redescend d'un cran à la fois, le premier niveau qui
   accepte le contenu gagne. Le logo n'est posé qu'avec H ou Q.
   ========================================================================== */

const NIVEAUX = ['H', 'Q', 'M', 'L'];
const LOGO_SRC = '../assets/img/logo_m.png';

let logoPromise = null;
function chargerLogo() {
  if (!logoPromise) {
    logoPromise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = LOGO_SRC;
    });
  }
  return logoPromise;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Dessine le QR du texte donné sur un <canvas> déjà dans le DOM. Renvoie
 *  false si même le niveau L a échoué (contenu bien trop long — improbable
 *  pour un lien de séance ou d'invitation). */
export async function dessinerQR(canvas, texte, size = 900, { logo = true } = {}) {
  let qr = null, niveauUtilise = null;
  for (const niveau of NIVEAUX) {
    try {
      const candidat = window.qrcode(0, niveau);
      candidat.addData(texte);
      candidat.make();
      qr = candidat; niveauUtilise = niveau;
      break;
    } catch { /* niveau suivant, moins gourmand en redondance */ }
  }
  if (!qr) return false;

  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const n = qr.getModuleCount();
  const quiet = 4;
  const total = n + quiet * 2;
  const cell = size / total;

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  const estRepere = (x, y) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);

  ctx.fillStyle = '#000000';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!qr.isDark(y, x) || estRepere(x, y)) continue;
      const cx = (quiet + x + 0.5) * cell;
      const cy = (quiet + y + 0.5) * cell;
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function repere(gx, gy) {
    const left = (quiet + gx) * cell, top = (quiet + gy) * cell;
    const r = cell * 1.8;
    ctx.fillStyle = '#000000';
    roundRectPath(ctx, left, top, 7 * cell, 7 * cell, r);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    roundRectPath(ctx, left + cell, top + cell, 5 * cell, 5 * cell, r * 0.7);
    ctx.fill();
    ctx.fillStyle = '#000000';
    roundRectPath(ctx, left + 2 * cell, top + 2 * cell, 3 * cell, 3 * cell, r * 0.5);
    ctx.fill();
  }
  repere(0, 0); repere(n - 7, 0); repere(0, n - 7);

  if (logo && (niveauUtilise === 'H' || niveauUtilise === 'Q')) {
    const img = await chargerLogo();
    if (img) {
      const pad = size * 0.22;
      const centre = size / 2, demi = pad / 2;
      ctx.fillStyle = '#ffffff';
      roundRectPath(ctx, centre - demi, centre - demi, pad, pad, cell * 1.5);
      ctx.fill();
      const marge = pad * 0.12;
      ctx.drawImage(img, centre - demi + marge, centre - demi + marge, pad - marge * 2, pad - marge * 2);
    }
  }

  return true;
}
