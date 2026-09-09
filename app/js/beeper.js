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

/** `compte` = seconde restante (3, 2, 1). En mode voix, le décompte SE COMPTE :
 *  « trois, deux, un » vaut mieux qu'un coup de sifflet sur une séance calme.
 *  Le guide se tait dans les dernières secondes exprès pour leur laisser la
 *  place (coach-guide.js). */
export function shortBeep(reglages, compte = 0) {
  const r = reglages || reglagesBips();
  if (r.voix && compte >= 1 && compte <= 3 && guidageActif() && phraseDisponible(r)) {
    say(compte === 3 ? 'Trois' : compte === 2 ? 'Deux' : 'Un');
    return;
  }
  tone(r.freq, 110, r.volume, r.trill);
}

/* Le guide vit dans coach-guide.js, qui importe déjà ce module : l'importer en
   retour ferait un cycle. Il pose donc lui-même l'état ici. */
let guidage = false;
export function definirGuidageActif(v) { guidage = v; }
function guidageActif() { return guidage; }

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

/** Vrai quand la voix peut réellement parler : réglage actif ET synthèse
 *  disponible. Ce que coach-guide.js interroge avant de préparer une phrase. */
export function phraseDisponible(reglages) {
  const r = reglages || reglagesBips();
  if (!r.voix || typeof speechSynthesis === 'undefined') return false;
  const v = speechSynthesis.getVoices();
  // Liste vide = pas encore chargée par le navigateur ; on tente quand même,
  // la synthèse choisira sa voix par défaut.
  return !v.length || v.some(x => (x.lang || '').toLowerCase().startsWith('fr'));
}

/* Prénoms des voix françaises courantes, par genre. Aucun navigateur n'expose
   le genre d'une voix : il est dans son NOM, soit explicitement (« male »,
   « female » sur Android) soit par le prénom (Thomas, Amélie…). D'où ces deux
   listes, et un repli sur n'importe quelle voix française quand rien ne
   tranche — mieux vaut la mauvaise voix que pas de voix. */
const VOIX_HOMME = ['thomas', 'paul', 'nicolas', 'henri', 'claude', 'daniel', 'guillaume', 'mathieu'];
const VOIX_FEMME = ['amelie', 'amélie', 'audrey', 'marie', 'hortense', 'julie', 'virginie', 'chantal', 'aurelie', 'aurélie'];

/**
 * LA MEILLEURE VOIX FRANÇAISE DU GENRE DEMANDÉ.
 *
 * Nicolas trouvait le résultat « robotique » : les navigateurs listent souvent
 * plusieurs voix françaises, dont une compacte à la prosodie plate qui se
 * trouve être la première. Les voix distantes (`localService` faux) sonnent
 * nettement mieux, on les préfère quand elles sont là.
 */
function meilleureVoix(masculine) {
  const fr = speechSynthesis.getVoices()
    .filter(v => (v.lang || '').toLowerCase().startsWith('fr'));
  if (!fr.length) return null;
  const genre = (v) => {
    const n = (v.name || '').toLowerCase();
    if (n.includes('female') || VOIX_FEMME.some(x => n.includes(x))) return false;
    if (n.includes('male') || VOIX_HOMME.some(x => n.includes(x))) return true;
    return null;
  };
  const duGenre = fr.filter(v => genre(v) === masculine);
  const pool = duGenre.length ? duGenre : fr;
  return pool.find(v => !v.localService) || pool[0];
}

/**
 * Dit `texte`. `suite` à vrai enchaîne à la suite de ce qui est en train
 * d'être dit, au lieu de le couper : c'est ce qui permet d'annoncer une
 * posture PUIS sa consigne comme une seule phrase parlée. Par défaut on
 * coupe — au changement de phase, la phrase qui compte est la nouvelle.
 */
export function say(texte, suite = false, reglages) {
  if (!texte || typeof speechSynthesis === 'undefined') return false;
  const r = reglages || reglagesBips();
  try {
    if (!suite) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(texte);
    u.lang = 'fr-FR';
    // Lent et posé : on annonce une posture à quelqu'un qui a la tête en bas,
    // pas une station de métro. Et la voix masculine descend d'un cran, les
    // moteurs de synthèse sortant par défaut un timbre un peu haut.
    u.rate = r.voixDebit ?? 0.88;
    u.pitch = r.voixMasculine ? 0.9 : 1.0;
    const v = meilleureVoix(!!r.voixMasculine);
    if (v) u.voice = v;
    speechSynthesis.speak(u);
    return true;
  } catch { return false; }
}

export function stopVoix() {
  try { speechSynthesis.cancel(); } catch { /* pas de synthèse ici */ }
}

/**
 * Changement de phase d'un enchaînement chronométré — tabata, EMOM, maintien,
 * circuit.
 *
 * En mode voix, c'est coach-guide.js qui parle : il est appelé à chaque
 * seconde et dit bien plus qu'un changement de phase (la consigne, le tempo de
 * respiration, le tour suivant). Siffler EN PLUS reviendrait à couvrir la
 * première syllabe de ce qu'il annonce.
 */
export function phaseBeep(effort, reglages) {
  const r = reglages || reglagesBips();
  if (r.voix && phraseDisponible(r)) return;
  startBeep(r);
}
