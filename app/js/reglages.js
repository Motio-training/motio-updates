/* ==========================================================================
   Réglages persistants côté navigateur — thème et bips. Deux contrôles que
   le natif expose depuis toujours (icônes palette/haut-parleur de l'en-tête,
   MainActivity.kt) mais qui n'existaient pas du tout côté web.

   Thème : ThemeStore (Theme.kt) — Sombre/Clair/Système, appliqué en posant
   data-theme sur <html> (app.css lit ce sélecteur). Pas de choix de palette
   couleur ici (une seule palette existe côté web pour l'instant).

   Bips : SoundSettings.kt, sous-ensemble « Sifflet » seulement — le profil
   « Enregistrement (Canard) » est un fichier audio embarqué dans l'appli,
   sans équivalent portable ici.
   ========================================================================== */

import { h } from './ui.js';

const CLE_THEME = 'motio_theme';       // 'sombre' | 'clair' | 'systeme'
const CLE_BIPS = 'motio_bips';         // JSON {freq,trill,volume,startFreq,startTrill,startVolume}

const BIPS_DEFAUT = {
  freq: 2750, trill: 43, volume: 1.0,
  startFreq: 2200, startTrill: 43, startVolume: 1.0
};
export const BIPS_BORNES = { freqMin: 1500, freqMax: 3500, trillMin: 0, trillMax: 90, volMin: 0.2, volMax: 1.0 };

/* ------------------------------------------------------------------ thème */

export function themeActuel() {
  return localStorage.getItem(CLE_THEME) || 'systeme';
}

/** À appeler au chargement ET à chaque changement — pose data-theme sur <html>. */
export function appliquerTheme() {
  const mode = themeActuel();
  const racine = document.documentElement;
  if (mode === 'systeme') racine.removeAttribute('data-theme');
  else racine.setAttribute('data-theme', mode === 'clair' ? 'light' : 'dark');

  const sombre = mode === 'sombre' ||
    (mode === 'systeme' && matchMedia('(prefers-color-scheme:dark)').matches);
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', sombre ? '#1E2216' : '#F4F3EE');
}

export function definirTheme(mode) {
  localStorage.setItem(CLE_THEME, mode);
  appliquerTheme();
}

export function ouvrirTheme() {
  const modale = h(`
    <div class="modale" role="dialog" aria-label="Thème">
      <div class="modale-boite">
        <div class="modale-tete"><h2>Thème</h2></div>
        <div class="rangee rangee-serree" data-modes style="margin-bottom:.6rem"></div>
        <p class="etat-mono" data-aide></p>
        <div class="modale-pied">
          <button class="btn" data-fermer type="button">Fermer</button>
        </div>
      </div>
    </div>`);

  const zoneModes = modale.querySelector('[data-modes]');
  const aide = modale.querySelector('[data-aide]');
  const MODES = [['sombre', 'Sombre'], ['clair', 'Clair'], ['systeme', 'Système']];

  function dessiner() {
    const actuel = themeActuel();
    zoneModes.replaceChildren();
    MODES.forEach(([id, label]) => {
      const b = h(`<button class="chip-cat ${actuel === id ? 'on' : ''}" type="button">${label}</button>`);
      b.onclick = () => { definirTheme(id); dessiner(); };
      zoneModes.appendChild(b);
    });
    aide.textContent = actuel === 'systeme'
      ? 'Suit le réglage jour/nuit du téléphone.'
      : 'Choix fixe, indépendant du réglage du téléphone.';
  }
  dessiner();

  modale.querySelector('[data-fermer]').onclick = () => modale.remove();
  modale.addEventListener('click', (e) => { if (e.target === modale) modale.remove(); });
  document.body.appendChild(modale);
}

/* ------------------------------------------------------------------- bips */

export function reglagesBips() {
  try { return { ...BIPS_DEFAUT, ...JSON.parse(localStorage.getItem(CLE_BIPS) || '{}') }; }
  catch { return { ...BIPS_DEFAUT }; }
}

function sauverBips(r) { localStorage.setItem(CLE_BIPS, JSON.stringify(r)); }

export function ouvrirReglagesBips(beeper) {
  const r = reglagesBips();
  const modale = h(`
    <div class="modale" role="dialog" aria-label="Réglage du son">
      <div class="modale-boite">
        <div class="modale-tete"><h2>Réglage du son</h2></div>
        <p class="etat-mono">Sifflet synthétisé — pas de fichier à charger, marche hors ligne.
          Le décompte (3 bips identiques) et le bip de départ se règlent séparément.</p>

        <p class="champ-label" style="margin-top:1rem">Décompte</p>
        <div data-decompte></div>

        <p class="champ-label" style="margin-top:1rem">Départ de série</p>
        <div data-depart></div>

        <button class="btn btn-ghost" data-tester type="button" style="width:100%;margin-top:1rem">▶ Tester</button>
        <div class="modale-pied">
          <button class="lien-inline" data-annuler type="button">Annuler</button>
          <button class="btn" data-valider type="button">Valider</button>
        </div>
      </div>
    </div>`);

  const curseur = (label, valeur, min, max, step, suffixe, onInput) => {
    const bloc = h(`
      <div class="rangee-titre" style="margin:.4rem 0 .1rem">
        <span style="font-size:.82rem;color:var(--encre-2)">${label}</span>
        <span class="son-valeur" style="font-size:.82rem;font-weight:700">${valeur}${suffixe}</span>
      </div>`);
    const input = h(`<input type="range" min="${min}" max="${max}" step="${step}" value="${valeur}" style="width:100%">`);
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      bloc.querySelector('.son-valeur').textContent = `${suffixe === ' %' ? Math.round(v * 100) : v}${suffixe}`;
      onInput(v);
    });
    const conteneur = h('<div></div>');
    conteneur.append(bloc, input);
    return conteneur;
  };

  const zoneDecompte = modale.querySelector('[data-decompte]');
  zoneDecompte.append(
    curseur('Fréquence', r.freq, BIPS_BORNES.freqMin, BIPS_BORNES.freqMax, 10, ' Hz', v => r.freq = v),
    curseur('Roulement', r.trill, BIPS_BORNES.trillMin, BIPS_BORNES.trillMax, 1, '', v => r.trill = v),
    curseur('Volume', r.volume, BIPS_BORNES.volMin, BIPS_BORNES.volMax, 0.05, ' %', v => r.volume = v)
  );
  const zoneDepart = modale.querySelector('[data-depart]');
  zoneDepart.append(
    curseur('Fréquence', r.startFreq, BIPS_BORNES.freqMin, BIPS_BORNES.freqMax, 10, ' Hz', v => r.startFreq = v),
    curseur('Roulement', r.startTrill, BIPS_BORNES.trillMin, BIPS_BORNES.trillMax, 1, '', v => r.startTrill = v),
    curseur('Volume', r.startVolume, BIPS_BORNES.volMin, BIPS_BORNES.volMax, 0.05, ' %', v => r.startVolume = v)
  );

  modale.querySelector('[data-tester]').onclick = () => {
    beeper.unlock();
    beeper.shortBeep(r); setTimeout(() => beeper.shortBeep(r), 260);
    setTimeout(() => beeper.shortBeep(r), 520); setTimeout(() => beeper.startBeep(r), 900);
  };
  modale.querySelector('[data-annuler]').onclick = () => modale.remove();
  modale.querySelector('[data-valider]').onclick = () => { sauverBips(r); modale.remove(); };
  modale.addEventListener('click', (e) => { if (e.target === modale) modale.remove(); });
  document.body.appendChild(modale);
}
