/* ==========================================================================
   Pavé numérique dédié — portage de NumPadDialog (TrainingScreens.kt) :
   grosse valeur affichée, grille 1-9/./0/⌫, Annuler/OK. S'ouvre TOUJOURS
   vide (même en correction d'une valeur existante) — valider à vide ne
   change rien, l'ancienne valeur est conservée. C'est l'appelant qui décide
   quoi faire d'une valeur vide dans onValider().
   ========================================================================== */

import { h } from './ui.js';

/**
 * @param {object} p
 * @param {'poids'|'reps'} p.kind — les DURÉES passent par ouvrirPaveDuree()
 * @param {boolean} [p.negatif] autorise une charge NÉGATIVE (touche « ± ») —
 *   réservé aux mouvements au poids du corps, où la valeur tapée est un
 *   supplément et où l'on peut se délester.
 * @param {(valeur: string) => void} p.onValider appelé avec la chaîne tapée
 *   (peut être vide — c'est à l'appelant de garder l'ancienne valeur dans ce cas)
 */
export function ouvrirPave({ kind, negatif = false, onValider }) {
  const allowDot = kind === 'poids';
  const allowNeg = negatif && kind === 'poids';
  const titre = kind === 'poids'
    ? (allowNeg ? 'CHARGE EN PLUS OU EN MOINS (kg)' : 'POIDS (kg)')
    : 'RÉPÉTITIONS';
  let valeur = '';
  let moins = false;

  const modale = h(`
    <div class="modale" role="dialog" aria-label="${titre}">
      <div class="modale-boite modale-boite-etroite pave-numerique">
        <div class="pave-defile">
          <p class="pave-titre">${titre}</p>
          <p class="pave-valeur" data-valeur>0</p>
          <div class="pave-grille" data-grille></div>
          ${allowNeg ? '<button class="pave-signe" data-signe type="button">± se délester</button>' : ''}
        </div>
        <div class="modale-pied" style="justify-content:center">
          <button class="btn btn-ghost" data-annuler type="button" style="flex:1">Annuler</button>
          <button class="btn" data-ok type="button" style="flex:1">OK</button>
        </div>
      </div>
    </div>`);

  const affichage = modale.querySelector('[data-valeur]');
  const grille = modale.querySelector('[data-grille]');
  const boutonSigne = modale.querySelector('[data-signe]');

  function majAffichage() {
    affichage.textContent = (moins && valeur ? '−' : '') + (valeur || '0');
    affichage.classList.toggle('pave-valeur-moins', moins && !!valeur);
  }

  const rangs = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], [allowDot ? '.' : '', '0', '⌫']];
  rangs.flat().forEach(touche => {
    if (touche === '') { grille.appendChild(h('<span></span>')); return; }
    const b = h(`<button type="button" class="pave-touche" aria-label="${touche === '⌫' ? 'Effacer' : touche}">${touche}</button>`);
    b.onclick = () => {
      if (touche === '⌫') valeur = valeur.slice(0, -1);
      else if (touche === '.') { if (allowDot && !valeur.includes('.') && valeur) valeur += '.'; }
      else if (valeur.length < 6) valeur += touche;
      majAffichage();
    };
    grille.appendChild(b);
  });

  if (boutonSigne) {
    boutonSigne.onclick = () => {
      moins = !moins;
      boutonSigne.classList.toggle('on', moins);
      boutonSigne.textContent = moins ? '− délestage' : '± se délester';
      majAffichage();
    };
  }

  const fermer = () => modale.remove();
  modale.querySelector('[data-annuler]').onclick = fermer;
  modale.querySelector('[data-ok]').onclick = () => {
    fermer();
    onValider(valeur && moins ? '-' + valeur : valeur);
  };
  modale.addEventListener('click', (e) => { if (e.target === modale) fermer(); });
  document.body.appendChild(modale);
}

/* ==========================================================================
   Pavé de DURÉE — minutes et secondes, séparément (TimePad.kt côté natif).

   L'ancien pavé de durée lisait des secondes brutes : il fallait taper 90
   pour 1:30, et il affichait « 0:59 » sur une valeur de départ mal relue.
   Ici les deux champs se touchent : on tape sur les minutes ou sur les
   secondes, puis on tape le nombre. Le premier chiffre REMPLACE (pas besoin
   d'effacer d'abord), le second complète, et après deux chiffres sur les
   minutes le curseur passe tout seul aux secondes.
   ========================================================================== */

/**
 * @param {object} p
 * @param {string} p.titre
 * @param {number} p.valeurSec valeur de départ, en secondes
 * @param {number} [p.min] plancher (secondes)
 * @param {number} [p.max] plafond (secondes)
 * @param {(sec: number) => void} p.onValider
 */
export function ouvrirPaveDuree({ titre, valeurSec, min = 0, max = 3600, onValider }) {
  const depart = Math.min(max, Math.max(min, Math.round(valeurSec || 0)));
  let mn = Math.min(99, Math.floor(depart / 60));
  let sc = depart % 60;
  let surMinutes = true;   // champ en cours de saisie
  let vierge = true;       // le prochain chiffre remplace

  const modale = h(`
    <div class="modale" role="dialog" aria-label="${titre}">
      <div class="modale-boite modale-boite-etroite pave-numerique">
        <div class="pave-defile">
          <p class="pave-titre">${titre}</p>
          <p class="pave-duree">
            <button type="button" class="pave-seg" data-min></button><span class="pave-sep">:</span><button type="button" class="pave-seg" data-sec></button>
          </p>
          <p class="pave-duree-aide" data-aide>Minutes</p>
          <div class="pave-grille" data-grille></div>
        </div>
        <div class="modale-pied" style="justify-content:center">
          <button class="btn btn-ghost" data-annuler type="button" style="flex:1">Annuler</button>
          <button class="btn" data-ok type="button" style="flex:1">OK</button>
        </div>
      </div>
    </div>`);

  const segMin = modale.querySelector('[data-min]');
  const segSec = modale.querySelector('[data-sec]');
  const aide = modale.querySelector('[data-aide]');
  const grille = modale.querySelector('[data-grille]');

  function dessiner() {
    segMin.textContent = String(mn);
    segSec.textContent = String(sc).padStart(2, '0');
    segMin.classList.toggle('on', surMinutes);
    segSec.classList.toggle('on', !surMinutes);
    aide.textContent = surMinutes ? 'Minutes' : 'Secondes';
  }

  function chiffre(d) {
    if (surMinutes) {
      if (vierge) { mn = d; vierge = false; }
      else {
        const n = mn * 10 + d;
        if (n > 99) mn = d;
        else { mn = n; surMinutes = false; vierge = true; }   // deux chiffres → aux secondes
      }
    } else if (vierge) { sc = d; vierge = false; }
    else {
      const n = sc * 10 + d;
      sc = n > 59 ? d : n;
    }
    dessiner();
  }

  segMin.onclick = () => { surMinutes = true; vierge = true; dessiner(); };
  segSec.onclick = () => { surMinutes = false; vierge = true; dessiner(); };

  [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['', '0', '⌫']].flat().forEach(touche => {
    if (touche === '') { grille.appendChild(h('<span></span>')); return; }
    const b = h(`<button type="button" class="pave-touche" aria-label="${touche === '⌫' ? 'Effacer' : touche}">${touche}</button>`);
    b.onclick = () => {
      if (touche === '⌫') {
        if (surMinutes) mn = Math.floor(mn / 10); else sc = Math.floor(sc / 10);
        vierge = false;
        dessiner();
      } else chiffre(Number(touche));
    };
    grille.appendChild(b);
  });

  const fermer = () => modale.remove();
  modale.querySelector('[data-annuler]').onclick = fermer;
  modale.querySelector('[data-ok]').onclick = () => {
    fermer();
    onValider(Math.min(max, Math.max(min, mn * 60 + sc)));
  };
  modale.addEventListener('click', (e) => { if (e.target === modale) fermer(); });
  dessiner();
  document.body.appendChild(modale);
}
