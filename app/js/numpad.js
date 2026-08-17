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
 * @param {'poids'|'reps'} p.kind
 * @param {(valeur: string) => void} p.onValider appelé avec la chaîne tapée
 *   (peut être vide — c'est à l'appelant de garder l'ancienne valeur dans ce cas)
 */
export function ouvrirPave({ kind, onValider }) {
  const allowDot = kind === 'poids';
  const titre = kind === 'poids' ? 'POIDS (kg)' : 'RÉPÉTITIONS';
  let valeur = '';

  const modale = h(`
    <div class="modale" role="dialog" aria-label="${titre}">
      <div class="modale-boite modale-boite-etroite pave-numerique">
        <p class="pave-titre">${titre}</p>
        <p class="pave-valeur" data-valeur>0</p>
        <div class="pave-grille" data-grille></div>
        <div class="modale-pied" style="justify-content:center">
          <button class="btn btn-ghost" data-annuler type="button" style="flex:1">Annuler</button>
          <button class="btn" data-ok type="button" style="flex:1">OK</button>
        </div>
      </div>
    </div>`);

  const affichage = modale.querySelector('[data-valeur]');
  const grille = modale.querySelector('[data-grille]');
  const rangs = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], [allowDot ? '.' : '', '0', '⌫']];
  rangs.flat().forEach(touche => {
    if (touche === '') { grille.appendChild(h('<span></span>')); return; }
    const b = h(`<button type="button" class="pave-touche" aria-label="${touche === '⌫' ? 'Effacer' : touche}">${touche}</button>`);
    b.onclick = () => {
      if (touche === '⌫') valeur = valeur.slice(0, -1);
      else if (touche === '.') { if (allowDot && !valeur.includes('.') && valeur) valeur += '.'; }
      else if (valeur.length < 6) valeur += touche;
      affichage.textContent = valeur || '0';
    };
    grille.appendChild(b);
  });

  const fermer = () => modale.remove();
  modale.querySelector('[data-annuler]').onclick = fermer;
  modale.querySelector('[data-ok]').onclick = () => { fermer(); onValider(valeur); };
  modale.addEventListener('click', (e) => { if (e.target === modale) fermer(); });
  document.body.appendChild(modale);
}
