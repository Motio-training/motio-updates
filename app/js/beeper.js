/* ==========================================================================
   Bips — synthétisés via Web Audio (pas de fichier son à charger : marche
   hors ligne, aucune requête réseau). Deux sons, comme Beeper.kt :
   - shortBeep() : un tic du décompte 3-2-1 avant un départ.
   - startBeep()  : le signal de départ (fin de récup, changement de phase),
     plus grave et plus long — même intention que « un coup de départ plus
     grave » (SoundSettings.kt).

   Réglable via reglages.js (fréquence, roulement, volume — le sous-ensemble
   « Sifflet » de SoundSettings.kt ; le profil « Enregistrement » natif n'a
   pas d'équivalent portable). Sans réglage sauvegardé, tone() reçoit les
   valeurs par défaut de reglagesBips().

   iOS/Safari n'autorise la lecture audio qu'après un geste utilisateur :
   unlock() doit être appelé depuis le gestionnaire de clic qui démarre la
   séance, avant tout appel à un bip.
   ========================================================================== */

import { reglagesBips } from './reglages.js';

let ctx = null;

function contexte() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

export function unlock() {
  const c = contexte();
  if (c.state === 'suspended') c.resume();
}

/** trill (Hz) : vitesse du roulement — une LFO module la fréquence de l'oscillateur. */
function tone(freq, dureeMs, volume, trill) {
  const c = contexte();
  if (c.state === 'suspended') c.resume();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  const t0 = c.currentTime;
  const t1 = t0 + dureeMs / 1000;

  osc.frequency.setValueAtTime(freq, t0);
  let lfo = null;
  if (trill > 0) {
    lfo = c.createOscillator();
    const lfoGain = c.createGain();
    lfo.frequency.value = trill;
    lfoGain.gain.value = freq * 0.06;
    lfo.connect(lfoGain).connect(osc.frequency);
    lfo.start(t0);
  }

  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume * 0.35, t0 + 0.01);
  gain.gain.linearRampToValueAtTime(0, t1);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t1 + 0.02);
  lfo?.stop(t1 + 0.02);
}

export function shortBeep(reglages) {
  const r = reglages || reglagesBips();
  tone(r.freq, 110, r.volume, r.trill);
}

export function startBeep(reglages) {
  const r = reglages || reglagesBips();
  tone(r.startFreq, 340, r.startVolume, r.startTrill);
}
