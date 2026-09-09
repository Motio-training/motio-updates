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

/* ============================================================
   LA VOIX DU COACH (CoachVoice.kt côté natif)

   Demande de Nicolas après sa première séance de mobilité : sur un réveil du
   dos ou une séance de yoga, le coup de sifflet est agressif et contredit
   exactement ce que la séance cherche à produire. Une voix qui annonce la
   posture, rappelle de respirer et prévient de ce qui arrive fait le même
   travail — dire où l'on en est sans regarder l'écran — dans le registre de
   la séance.

   Quand la synthèse vocale manque, on retombe sur le sifflet plutôt que sur
   le silence.
   ============================================================ */

/** Ce que la voix dit au départ du prochain EFFORT et du prochain REPOS,
 *  renseignés par l'écran de séance — seul à connaître les exercices. */
export const cues = { effort: '', repos: '' };

function voixDisponible() {
  if (typeof speechSynthesis === 'undefined') return false;
  const v = speechSynthesis.getVoices();
  // Liste vide = pas encore chargée par le navigateur ; on tente quand même,
  // la synthèse choisira sa voix par défaut.
  return !v.length || v.some(x => (x.lang || '').toLowerCase().startsWith('fr'));
}

export function say(texte) {
  if (!texte || typeof speechSynthesis === 'undefined') return false;
  try {
    // On coupe ce qui était en train d'être dit : au changement de phase, la
    // phrase qui compte est la nouvelle. Empiler laisserait la voix décrire
    // une posture déjà quittée, avec un retard qui s'aggrave à chaque tour.
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(texte);
    u.lang = 'fr-FR';
    u.rate = 0.94;
    const fr = speechSynthesis.getVoices().find(v => (v.lang || '').toLowerCase().startsWith('fr'));
    if (fr) u.voice = fr;
    speechSynthesis.speak(u);
    return true;
  } catch { return false; }
}

/**
 * Changement de phase d'un enchaînement chronométré — tabata, EMOM, maintien,
 * circuit. Seul endroit où la voix remplace vraiment le sifflet : ici on a
 * quelque chose à dire, là où un minuteur de récupération n'annonce rien de
 * plus que « c'est l'heure ».
 */
export function phaseBeep(effort, reglages) {
  const r = reglages || reglagesBips();
  if (r.voix && voixDisponible()) {
    const phrase = effort ? cues.effort : cues.repos;
    if (phrase && say(phrase)) return;
  }
  startBeep(r);
}

/** Phrase d'annonce d'une posture tenue : son nom, sa durée, et une consigne
 *  de respiration quand le maintien est assez long pour qu'elle serve. */
export function phraseEffort(nom, secondes) {
  let t = nom || 'Position suivante';
  if (secondes > 0) t += `, ${secondes} secondes`;
  t += secondes >= 20 ? '. Respire lentement, relâche les épaules.' : '.';
  return t;
}

/** Phrase de repos : ce qu'on fait maintenant, et ce qui arrive après. */
export function phraseRepos(suivant, secondes) {
  let t = 'Relâche';
  if (secondes > 0) t += `, ${secondes} secondes`;
  t += '.';
  if (suivant) t += ` Ensuite : ${suivant}.`;
  return t;
}
