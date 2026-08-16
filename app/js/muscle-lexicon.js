/* ==========================================================================
   Lexique d'exercices → muscles sollicités — portage de MuscleLexicon.kt.

   Comprendre ce que l'utilisateur a ÉCRIT : chaque famille d'exercices porte
   ses coefficients de sollicitation (1 = moteur principal, 0.5 = assistant,
   0.25 = stabilisateur), reconnus sur le texte normalisé (sans accents, sans
   pluriel, tolérant aux fautes de frappe). Cascade : lexique exact → lexique
   approché → groupe du catalogue. Ce qui n'est reconnu par rien est signalé
   plutôt que compté à zéro en silence.

   Écart assumé face au natif : pas de rattachement manuel persistant
   (MuscleOverrides + MuscleAssignDialog) — un exercice non reconnu est
   simplement listé, sans pouvoir lui assigner un muscle depuis le web.
   ========================================================================== */

export const Mus = {
  TRAPEZES: 'TRAPEZES', EPAULES: 'EPAULES', EPAULES_AR: 'EPAULES_AR',
  PECTORAUX: 'PECTORAUX', DORSAUX: 'DORSAUX', BICEPS: 'BICEPS', TRICEPS: 'TRICEPS',
  LOMBAIRES: 'LOMBAIRES', ABDOS: 'ABDOS', AVANTBRAS: 'AVANTBRAS',
  FESSIERS: 'FESSIERS', QUADRICEPS: 'QUADRICEPS', ISCHIOS: 'ISCHIOS', MOLLETS: 'MOLLETS'
};

export const MUS_ALL = [
  Mus.TRAPEZES, Mus.EPAULES, Mus.EPAULES_AR, Mus.PECTORAUX, Mus.DORSAUX,
  Mus.BICEPS, Mus.TRICEPS, Mus.AVANTBRAS, Mus.ABDOS, Mus.LOMBAIRES,
  Mus.FESSIERS, Mus.QUADRICEPS, Mus.ISCHIOS, Mus.MOLLETS
];

const LABELS = {
  TRAPEZES: 'Trapèzes', EPAULES: 'Épaules (avant)', EPAULES_AR: 'Épaules (arrière)',
  PECTORAUX: 'Pectoraux', DORSAUX: 'Dorsaux', BICEPS: 'Biceps', TRICEPS: 'Triceps',
  LOMBAIRES: 'Lombaires', ABDOS: 'Abdominaux', AVANTBRAS: 'Avant-bras',
  FESSIERS: 'Fessiers', QUADRICEPS: 'Quadriceps', ISCHIOS: 'Ischios-jambiers', MOLLETS: 'Mollets'
};
export function musLabel(key) { return LABELS[key] || key; }

/* ---------------------------------------------------------------- normalisation */

const LINKERS = new Set([
  'a', 'au', 'aux', 'la', 'le', 'les', 'l', 'de', 'du', 'des', 'd', 'en',
  'sur', 'avec', 'et', 'the', 'un', 'une', 'pour', 'par', 'dans', 'type'
]);

/** Retire les diacritiques (accents) d'une chaîne déjà décomposée en NFD :
 *  filtre les points de code combinants (plage Unicode 0x300-0x36f) sans
 *  passer par un littéral regex \u, plus sûr à transcrire ici que le texte
 *  source. */
function stripDiacritics(nfd) {
  let out = '';
  for (const ch of nfd) {
    const c = ch.codePointAt(0);
    if (c < 0x300 || c > 0x36f) out += ch;
  }
  return out;
}

/** Ramène un nom libre à une forme comparable, encadrée d'espaces. */
export function musNorm(raw) {
  const flat = stripDiacritics(String(raw ?? '').normalize('NFD'))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!flat) return ' ';
  const words = flat.split(' ').filter(Boolean).map(w => {
    if (LINKERS.has(w)) return null;
    return (w.length > 2 && w.endsWith('s')) ? w.slice(0, -1) : w;
  }).filter(w => w !== null);
  return ' ' + words.join(' ') + ' ';
}

/** Distance de Levenshtein bornée — absorbe les fautes de frappe. */
function lev(a, b, maxD) {
  if (Math.abs(a.length - b.length) > maxD) return maxD + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let cur = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let best = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      best = Math.min(best, cur[j]);
    }
    if (best > maxD) return maxD + 1;
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}
function tol(w) { return w.length <= 4 ? 0 : w.length <= 7 ? 1 : 2; }

/* ---------------------------------------------------------------- le lexique */

function z(...pairs) { return Object.fromEntries(pairs); }
/** e("developpe couche | bench press", zones) — variantes séparées par « | ». */
function e(spec, zones) {
  const variants = spec.split('|')
    .map(v => musNorm(v).trim().split(' ').filter(Boolean))
    .filter(v => v.length);
  return { variants, zones };
}

const LEXICON = [
  /* ---------- PECTORAUX ---------- */
  e('developpe couche prise serree | bench prise serree | close grip bench',
    z([Mus.TRICEPS, 1], [Mus.PECTORAUX, 0.6], [Mus.EPAULES, 0.3])),
  e('developpe incline | incline dumbbell press | incline press',
    z([Mus.PECTORAUX, 1], [Mus.EPAULES, 0.6], [Mus.TRICEPS, 0.5], [Mus.BICEPS, 0.15], [Mus.ABDOS, 0.15])),
  e('developpe decline | decline press',
    z([Mus.PECTORAUX, 1], [Mus.TRICEPS, 0.5], [Mus.EPAULES, 0.2], [Mus.BICEPS, 0.15], [Mus.ABDOS, 0.15])),
  e('developpe couche | bench press | couche barre | couche haltere | chest press | developpe pectoraux',
    z([Mus.PECTORAUX, 1], [Mus.TRICEPS, 0.5], [Mus.EPAULES, 0.4], [Mus.BICEPS, 0.15], [Mus.ABDOS, 0.15])),
  e('ecarte | ecartes poulie | pec deck | butterfly | peck deck | vis vis | cable crossover | crossover poulie | fly haltere | chest fly',
    z([Mus.PECTORAUX, 1], [Mus.EPAULES, 0.2])),
  e('pompe | push up | pushup | pompes militaire | pompe diamant',
    z([Mus.PECTORAUX, 1], [Mus.TRICEPS, 0.5], [Mus.EPAULES, 0.3], [Mus.ABDOS, 0.25])),
  e('dips buste penche | dips pectoraux | dips lestes pectoraux',
    z([Mus.PECTORAUX, 1], [Mus.TRICEPS, 0.6], [Mus.EPAULES, 0.3], [Mus.ABDOS, 0.2])),
  e('pullover poulie | pull over poulie | pullover corde | pullover haute',
    z([Mus.DORSAUX, 1], [Mus.TRICEPS, 0.4])),
  e('pullover haltere | pull over haltere | pullover banc | pullover couche | pullover kettlebell | pullover barre',
    z([Mus.DORSAUX, 1], [Mus.PECTORAUX, 0.7], [Mus.TRICEPS, 0.3])),
  e('pullover | pull over', z([Mus.DORSAUX, 1], [Mus.TRICEPS, 0.3])),

  /* ---------- ÉPAULES ---------- */
  e('developpe militaire | military press | overhead press | developpe epaule | shoulder press | developpe nuque | arnold press | developpe assis haltere | push press',
    z([Mus.EPAULES, 1], [Mus.TRICEPS, 0.5], [Mus.TRAPEZES, 0.4], [Mus.ABDOS, 0.2])),
  e('elevation laterale | lateral raise | side raise | elevations laterale poulie',
    z([Mus.EPAULES, 1], [Mus.TRAPEZES, 0.25])),
  e('elevation frontale | front raise | elevation avant',
    z([Mus.EPAULES, 1], [Mus.PECTORAUX, 0.2])),
  e('oiseau | reverse fly | rear delt | deltoide posterieur | ecarte inverse | reverse pec deck',
    z([Mus.EPAULES_AR, 1], [Mus.TRAPEZES, 0.6], [Mus.DORSAUX, 0.3])),
  e('face pull | facepull', z([Mus.EPAULES_AR, 1], [Mus.TRAPEZES, 0.8], [Mus.DORSAUX, 0.3])),
  e('rowing menton | upright row | tirage menton',
    z([Mus.TRAPEZES, 1], [Mus.EPAULES, 0.8], [Mus.BICEPS, 0.3])),
  e('rotation externe | rotateur | coiffe rotateur | face rotation epaule',
    z([Mus.EPAULES_AR, 1], [Mus.EPAULES, 0.3])),

  /* ---------- TRICEPS ---------- */
  e('barre front | skull crusher | extension nuque | extension triceps | extension poulie | pushdown | triceps poulie | kickback triceps | extension coude | french press | triceps corde | triceps barre | triceps haltere',
    z([Mus.TRICEPS, 1])),
  e('dips', z([Mus.TRICEPS, 1], [Mus.PECTORAUX, 0.7], [Mus.EPAULES, 0.4], [Mus.ABDOS, 0.2])),
  e('dips banc | bench dips', z([Mus.TRICEPS, 1], [Mus.PECTORAUX, 0.4], [Mus.EPAULES, 0.3], [Mus.ABDOS, 0.15])),

  /* ---------- DOS ---------- */
  e('traction | pull up | pullup | pull ups | chin up | chinup | traction pronation | traction supination | traction lestee | traction australienne',
    z([Mus.DORSAUX, 1], [Mus.BICEPS, 0.6], [Mus.AVANTBRAS, 0.4], [Mus.TRAPEZES, 0.4], [Mus.ABDOS, 0.2])),
  e('tirage vertical | lat pulldown | pulldown | tirage poitrine | tirage nuque',
    z([Mus.DORSAUX, 1], [Mus.BICEPS, 0.5], [Mus.TRAPEZES, 0.4], [Mus.AVANTBRAS, 0.25])),
  e('tirage horizontal | seated row | tirage assis | rowing poulie basse | tirage poulie basse',
    z([Mus.DORSAUX, 1], [Mus.TRAPEZES, 0.6], [Mus.BICEPS, 0.5], [Mus.EPAULES_AR, 0.4], [Mus.AVANTBRAS, 0.25])),
  e('rowing | row barre | bent over row | pendlay | yates | t bar row | tbar | rowing machine | rowing haltere | rowing buste penche | chest supported row',
    z([Mus.DORSAUX, 1], [Mus.TRAPEZES, 0.6], [Mus.BICEPS, 0.5], [Mus.LOMBAIRES, 0.4], [Mus.AVANTBRAS, 0.3], [Mus.EPAULES_AR, 0.4])),
  e('tirage bras tendu | straight arm pulldown | pull down bras tendu',
    z([Mus.DORSAUX, 1], [Mus.TRICEPS, 0.3], [Mus.ABDOS, 0.2])),
  e('machine convergente | machine tirage | high row',
    z([Mus.DORSAUX, 1], [Mus.TRAPEZES, 0.5], [Mus.BICEPS, 0.4])),
  e('shrug | haussement epaule | trapeze barre | trapeze haltere',
    z([Mus.TRAPEZES, 1], [Mus.AVANTBRAS, 0.4])),

  /* ---------- BICEPS / AVANT-BRAS ---------- */
  e('curl marteau | hammer curl', z([Mus.BICEPS, 1], [Mus.AVANTBRAS, 0.7])),
  e('curl poignet | wrist curl | extension poignet | roulette poignet', z([Mus.AVANTBRAS, 1])),
  e('suspension barre | dead hang | grip | pince | prehension | farmer walk | farmer carry | marche fermier',
    z([Mus.AVANTBRAS, 1], [Mus.TRAPEZES, 0.8], [Mus.ABDOS, 0.4])),
  e('curl | biceps | preacher curl | pupitre | larry scott | curl incline | curl concentration | curl poulie | curl barre ez | drag curl | spider curl',
    z([Mus.BICEPS, 1], [Mus.AVANTBRAS, 0.4])),

  /* ---------- SOULEVÉ DE TERRE ---------- */
  e('souleve terre roumain | sdt roumain | romanian deadlift | rdl | souleve terre jambe tendue | stiff leg deadlift | stiff deadlift',
    z([Mus.ISCHIOS, 1], [Mus.FESSIERS, 0.8], [Mus.LOMBAIRES, 0.7], [Mus.TRAPEZES, 0.3], [Mus.AVANTBRAS, 0.3])),
  e('souleve terre sumo | sumo deadlift',
    z([Mus.FESSIERS, 1], [Mus.LOMBAIRES, 0.8], [Mus.QUADRICEPS, 0.7], [Mus.ISCHIOS, 0.7], [Mus.TRAPEZES, 0.5], [Mus.AVANTBRAS, 0.4])),
  e('souleve terre | deadlift | sdt',
    z([Mus.LOMBAIRES, 1], [Mus.FESSIERS, 0.9], [Mus.ISCHIOS, 0.8], [Mus.TRAPEZES, 0.6], [Mus.QUADRICEPS, 0.5], [Mus.DORSAUX, 0.5], [Mus.AVANTBRAS, 0.4])),
  e('good morning', z([Mus.ISCHIOS, 1], [Mus.LOMBAIRES, 0.9], [Mus.FESSIERS, 0.6])),

  /* ---------- QUADRICEPS ---------- */
  e('front squat | squat avant', z([Mus.QUADRICEPS, 1], [Mus.FESSIERS, 0.5], [Mus.ABDOS, 0.5], [Mus.LOMBAIRES, 0.4])),
  e('hack squat | squat machine | pendulum squat', z([Mus.QUADRICEPS, 1], [Mus.FESSIERS, 0.5])),
  e('goblet squat', z([Mus.QUADRICEPS, 1], [Mus.FESSIERS, 0.6], [Mus.ABDOS, 0.4])),
  e('bulgarian split squat | split squat | squat bulgare | fente bulgare',
    z([Mus.QUADRICEPS, 1], [Mus.FESSIERS, 0.9], [Mus.ISCHIOS, 0.4])),
  e('squat | back squat | squat barre | air squat | squat sumo | box squat',
    z([Mus.QUADRICEPS, 1], [Mus.FESSIERS, 0.7], [Mus.ISCHIOS, 0.4], [Mus.LOMBAIRES, 0.4], [Mus.ABDOS, 0.3])),
  e('presse cuisse pied haut | leg press pied haut | presse pied haut',
    z([Mus.FESSIERS, 1], [Mus.ISCHIOS, 0.7], [Mus.QUADRICEPS, 0.5])),
  e('presse cuisse | leg press | presse jambe | presse horizontale | presse inclinee',
    z([Mus.QUADRICEPS, 1], [Mus.FESSIERS, 0.6], [Mus.ISCHIOS, 0.3])),
  e('extension jambe | leg extension | leg extention | legextension', z([Mus.QUADRICEPS, 1])),
  e('fente | lunge | fente marchee | fente arriere | fente avant | walking lunge',
    z([Mus.QUADRICEPS, 1], [Mus.FESSIERS, 0.9], [Mus.ISCHIOS, 0.4], [Mus.ABDOS, 0.2])),
  e('montee banc | step up | montee marche | step ups',
    z([Mus.QUADRICEPS, 1], [Mus.FESSIERS, 0.8], [Mus.MOLLETS, 0.3])),
  e('sissy squat | wall sit | chaise', z([Mus.QUADRICEPS, 1])),

  /* ---------- ISCHIOS ---------- */
  e('legcurl | leg curl | leg curls | curl jambe | curl ischio | ischio machine | machine ischio | flexion jambe | hamstring curl | leg curl allonge | leg curl assis',
    z([Mus.ISCHIOS, 1], [Mus.MOLLETS, 0.2])),
  e('nordic curl | nordic hamstring | glute ham raise | ghr', z([Mus.ISCHIOS, 1], [Mus.FESSIERS, 0.5], [Mus.LOMBAIRES, 0.3])),

  /* ---------- FESSIERS ---------- */
  e('hip thrust | hipthrust | pont fessier | glute bridge | releve bassin | bridge fessier',
    z([Mus.FESSIERS, 1], [Mus.ISCHIOS, 0.5], [Mus.QUADRICEPS, 0.2])),
  e('kickback | donkey kick | extension hanche | pull through', z([Mus.FESSIERS, 1], [Mus.ISCHIOS, 0.4])),
  e('abduction | abducteur | machine abduction | elastique abduction', z([Mus.FESSIERS, 1])),
  e('adduction | adducteur | machine adduction', z([Mus.FESSIERS, 0.5], [Mus.QUADRICEPS, 0.4])),
  e('kettlebell swing | swing kettlebell | swing',
    z([Mus.FESSIERS, 1], [Mus.ISCHIOS, 0.8], [Mus.LOMBAIRES, 0.6], [Mus.TRAPEZES, 0.3], [Mus.ABDOS, 0.3])),

  /* ---------- MOLLETS ---------- */
  e('mollet | elevation debout | calf raise | calf | donkey calf | extension cheville | releve pointe | elevation mollet',
    z([Mus.MOLLETS, 1])),
  e('corde sauter | saut corde | jump rope | skipping', z([Mus.MOLLETS, 1], [Mus.QUADRICEPS, 0.4])),

  /* ---------- ABDOS / LOMBAIRES ---------- */
  e('extension lombaire | hyperextension | banc lombaire | back extension | superman | chaise romaine lombaire',
    z([Mus.LOMBAIRES, 1], [Mus.FESSIERS, 0.6], [Mus.ISCHIOS, 0.5])),
  e('bird dog | dead bug | pallof', z([Mus.ABDOS, 1], [Mus.LOMBAIRES, 0.6])),
  e('gainage | planche | plank | hollow | hollow hold | gainage lateral | side plank',
    z([Mus.ABDOS, 1], [Mus.LOMBAIRES, 0.4], [Mus.EPAULES, 0.2])),
  e('roue abdominale | ab wheel | ab roller', z([Mus.ABDOS, 1], [Mus.DORSAUX, 0.3], [Mus.LOMBAIRES, 0.3])),
  e('crunch | sit up | situp | releve jambe | leg raise | russian twist | abdo | abdominaux | mountain climber | toes to bar | v up | enroulement bassin',
    z([Mus.ABDOS, 1])),

  /* ---------- HALTÉROPHILIE / POLYARTICULAIRE ---------- */
  e('epaule jete | clean and jerk | clean jerk | epaule barre',
    z([Mus.QUADRICEPS, 0.8], [Mus.FESSIERS, 0.8], [Mus.TRAPEZES, 0.8], [Mus.EPAULES, 0.7], [Mus.LOMBAIRES, 0.7], [Mus.ISCHIOS, 0.5], [Mus.AVANTBRAS, 0.4])),
  e('arrache | snatch',
    z([Mus.TRAPEZES, 0.9], [Mus.EPAULES, 0.8], [Mus.QUADRICEPS, 0.8], [Mus.FESSIERS, 0.7], [Mus.LOMBAIRES, 0.7], [Mus.ISCHIOS, 0.5])),
  e('power clean | clean | tirage nuque barre',
    z([Mus.TRAPEZES, 0.9], [Mus.QUADRICEPS, 0.7], [Mus.FESSIERS, 0.7], [Mus.LOMBAIRES, 0.7], [Mus.ISCHIOS, 0.5], [Mus.EPAULES, 0.5])),
  e('thruster', z([Mus.QUADRICEPS, 0.9], [Mus.EPAULES, 0.9], [Mus.FESSIERS, 0.6], [Mus.TRICEPS, 0.5], [Mus.ABDOS, 0.3])),
  e('burpee', z([Mus.QUADRICEPS, 0.7], [Mus.PECTORAUX, 0.5], [Mus.TRICEPS, 0.4], [Mus.EPAULES, 0.4], [Mus.ABDOS, 0.4], [Mus.MOLLETS, 0.3])),
  e('battle rope | corde ondulatoire', z([Mus.EPAULES, 1], [Mus.ABDOS, 0.5], [Mus.AVANTBRAS, 0.5], [Mus.DORSAUX, 0.3])),
  e('rameur | ergometre | rowing machine cardio | concept 2',
    z([Mus.DORSAUX, 0.7], [Mus.QUADRICEPS, 0.7], [Mus.TRAPEZES, 0.5], [Mus.BICEPS, 0.4], [Mus.LOMBAIRES, 0.4])),
  e('box jump | saut boite | squat jump | saut vertical | pliometrie',
    z([Mus.QUADRICEPS, 1], [Mus.FESSIERS, 0.7], [Mus.MOLLETS, 0.6])),
  e('traineau | sled | pousse traineau | prowler', z([Mus.QUADRICEPS, 1], [Mus.FESSIERS, 0.7], [Mus.MOLLETS, 0.5])),
  e('corde monte | monte corde | rope climb | grimper corde',
    z([Mus.DORSAUX, 1], [Mus.BICEPS, 0.7], [Mus.AVANTBRAS, 0.9], [Mus.ABDOS, 0.4])),
  e('rampe | rampes militaire | bear crawl | marche ours',
    z([Mus.ABDOS, 1], [Mus.EPAULES, 0.6], [Mus.QUADRICEPS, 0.4], [Mus.TRICEPS, 0.3]))
];

/* ---------------------------------------------------------------- repli catalogue */

/** Le groupe du catalogue web (catalog.js) ramené à des zones. */
function zonesOfGroupName(groupName) {
  const n = musNorm(groupName);
  const out = {};
  const hit = (zone, ...keys) => { if (keys.some(k => n.includes(k))) out[zone] = 1; };
  hit(Mus.TRAPEZES, 'trapez');
  hit(Mus.EPAULES, 'epaul', 'deltoid');
  hit(Mus.EPAULES_AR, 'epaul', 'deltoid', 'arriere epaule');
  hit(Mus.PECTORAUX, 'pector', 'poitrine');
  hit(Mus.AVANTBRAS, 'avant bra');
  hit(Mus.ABDOS, 'abdo', 'gainage', 'ceinture');
  hit(Mus.LOMBAIRES, 'lombaire');
  hit(Mus.QUADRICEPS, 'quadri', 'cuisse');
  hit(Mus.MOLLETS, 'mollet');
  hit(Mus.ISCHIOS, 'ischio');
  hit(Mus.FESSIERS, 'fessier', 'glute');
  hit(Mus.DORSAUX, 'dorsaux', ' do ', 'grand dorsal');
  hit(Mus.BICEPS, 'bicep');
  hit(Mus.TRICEPS, 'tricep');
  return out;
}

let catalogCache = null;
/** Nom d'exercice normalisé → nom de groupe (catalog.js, GROUPES[].nom). */
async function catalogGroups() {
  if (catalogCache) return catalogCache;
  const { GROUPES } = await import('./catalog.js');
  const out = {};
  GROUPES.forEach(g => {
    (g.exercices || []).forEach(nom => {
      const k = musNorm(nom);
      if (!(k in out)) out[k] = g.nom;
    });
  });
  catalogCache = out;
  return out;
}

function exactHit(name, variant) { return variant.every(v => name.includes(` ${v} `)); }
function fuzzyHit(words, variant) {
  return variant.every(v => words.some(w => lev(w, v, tol(v)) <= tol(v)));
}

/** Les muscles travaillés par un exercice, ou null si personne ne le reconnaît. */
export async function musclesOf(rawName) {
  if (!rawName || !rawName.trim()) return null;
  const n = musNorm(rawName);
  const words = n.trim().split(' ').filter(Boolean);

  let best = null, bestScore = 0;
  for (const entry of LEXICON) {
    for (const v of entry.variants) {
      const raw = v.reduce((t, w) => t + w.length, 0) * 100 + v.length;
      let score = 0;
      if (exactHit(n, v)) score = raw;
      else if (words.length && fuzzyHit(words, v)) score = Math.floor(raw * 85 / 100);
      if (score > bestScore) { bestScore = score; best = entry; }
    }
  }
  if (best) return best.zones;

  const cat = await catalogGroups();
  const g = cat[n];
  if (g) {
    const zones = zonesOfGroupName(g);
    if (Object.keys(zones).length) return zones;
  }
  return null;
}

/**
 * Charge musculaire d'une séance : séries pondérées par zone (coefficient au
 * carré — un assistant à moitié ne reçoit pas la moitié du crédit mais le
 * quart, sinon un pullover finit par allumer les pectoraux).
 */
export async function muscleLoadOf(session) {
  const zones = {};
  const unknown = [];
  for (const ex of session.exercises || []) {
    const sets = (ex.sets || []).filter(s => s.reps > 0).length;
    if (!sets) continue;
    const m = await musclesOf(ex.name);
    if (!m) { if (ex.name?.trim()) unknown.push(ex.name.trim()); continue; }
    for (const [zone, w] of Object.entries(m)) zones[zone] = (zones[zone] || 0) + sets * w * w;
  }
  return { zones, unknown, isEmpty: Object.keys(zones).length === 0 };
}
