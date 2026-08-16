/* ==========================================================================
   Bips — synthétisés via Web Audio (pas de fichier son à charger : marche
   hors ligne, aucune requête réseau). Deux sons, comme Beeper.kt :
   - shortBeep(n) : le tic du décompte 3-2-1 avant un départ.
   - startBeep()  : le signal de départ (fin de récup, changement de phase).

   iOS/Safari n'autorise la lecture audio qu'après un geste utilisateur :
   unlock() doit être appelé depuis le gestionnaire de clic qui démarre la
   séance, avant tout appel à un bip.
   ========================================================================== */

let ctx = null;

function contexte() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

export function unlock() {
  const c = contexte();
  if (c.state === 'suspended') c.resume();
}

function tone(freq, dureeMs, volume = 0.35) {
  const c = contexte();
  if (c.state === 'suspended') c.resume();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const t0 = c.currentTime;
  const t1 = t0 + dureeMs / 1000;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.01);
  gain.gain.linearRampToValueAtTime(0, t1);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t1 + 0.02);
}

export function shortBeep() { tone(880, 110); }
export function startBeep() { tone(523, 260); setTimeout(() => tone(659, 320), 90); }
