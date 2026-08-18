/* ==========================================================================
   Trophées — portage exact de computeStatsFrom (Profile.kt) : six familles,
   trois paliers chacune, dix-huit étoiles au total. Mêmes seuils, mêmes
   libellés, et depuis 2026-08-18 les MÊMES IMAGES : les drawables de
   l'application ont été copiés dans assets/img/trophees/. L'émoji de repli a
   disparu — comparés côte à côte sur le même téléphone, les deux écrans de
   trophées ne se ressemblaient pas du tout.

   Comme côté natif (Trophy.iconRes), l'image dépend du palier atteint : une
   famille change de dessin à chaque étoile gagnée.
   ========================================================================== */

const IMG = 'assets/img/trophees/';

function weekIndex(ms) {
  const days = Math.floor(ms / 86400000);
  return Math.floor((days + 3) / 7);
}
function monthIndex(ms) {
  const d = new Date(ms);
  return d.getFullYear() * 12 + d.getMonth();
}

/** fmtQty (Profile.kt) : 100000 devient "100 000". */
export function fmtQty(v) {
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** @param {string[]} icones les 3 images de la famille, une par palier. */
function famille(title, unit, icones, levels, descs, value) {
  const stars = levels.filter(l => value >= l).length;
  const complete = stars >= levels.length;
  const target = levels[Math.min(stars, levels.length - 1)];
  const ratio = complete ? 1 : Math.max(0, Math.min(1, value / target));
  const progress = complete ? '' : `${fmtQty(Math.min(value, target))} / ${fmtQty(target)} ${unit}`;
  return {
    title, unit, levels, descs, value, stars,
    // iconRes (Profile.kt) : l'image du dernier palier atteint, celle du 1er
    // palier tant que rien n'est gagné.
    icon: IMG + icones[Math.max(0, Math.min(stars - 1, icones.length - 1))],
    unlocked: stars > 0, complete,
    desc: descs[Math.min(stars, descs.length - 1)],
    ratio, progress
  };
}

/** entries : [{startedAtMs, volumeKg, durationMs}]. Même calcul que computeStatsFrom. */
export function computeStatsFrom(entries) {
  const now = Date.now();
  const nowWeek = weekIndex(now), nowMonth = monthIndex(now);

  const totalTonnage = Math.floor(entries.reduce((t, e) => t + e.volumeKg, 0));
  const weekTonnage = Math.floor(entries.filter(e => weekIndex(e.startedAtMs) === nowWeek)
    .reduce((t, e) => t + e.volumeKg, 0));
  const monthTonnage = Math.floor(entries.filter(e => monthIndex(e.startedAtMs) === nowMonth)
    .reduce((t, e) => t + e.volumeKg, 0));
  const totalSessions = entries.length;
  const totalHours = Math.floor(entries.reduce((t, e) => t + e.durationMs, 0) / 3600000);

  const parSemaine = {};
  entries.forEach(e => { const w = weekIndex(e.startedAtMs); parSemaine[w] = (parSemaine[w] || 0) + 1; });
  const maxWeek = Math.max(0, ...Object.values(parSemaine));

  const parMois = {};
  entries.forEach(e => { const m = monthIndex(e.startedAtMs); parMois[m] = (parMois[m] || 0) + 1; });
  const maxMonth = Math.max(0, ...Object.values(parMois));

  const semaines = [...new Set(entries.map(e => weekIndex(e.startedAtMs)))].sort((a, b) => a - b);
  let maxStreak = 0, cur = 0, prev = null;
  for (const w of semaines) {
    cur = (prev != null && w === prev + 1) ? cur + 1 : 1;
    if (cur > maxStreak) maxStreak = cur;
    prev = w;
  }

  /* Mêmes familles, mêmes seuils et MÊMES IMAGES que Profile.kt. */
  const trophies = [
    famille('Assiduité', 'séances',
      ['ic_troph_premiere.png', 'ic_troph_25_seances.png', 'ic_troph_100_seances.png'],
      [1, 25, 100],
      ['Terminer sa 1re séance', '25 séances au total', '100 séances au total'], totalSessions),
    famille('Semaine chargée', '/sem',
      ['ic_troph_semaine_chargee.png', 'ic_troph_semaine_intense.png', 'ic_troph_semaine_parfaite.png'],
      [3, 5, 7],
      ['3 séances dans une semaine', '5 séances dans une semaine', '7 séances dans une semaine'], maxWeek),
    famille('Régularité', 'sem.',
      ['ic_troph_regulier.png', 'ic_troph_assidu.png', 'ic_troph_machine.png'],
      [2, 4, 8],
      ["2 semaines d'affilée", "4 semaines d'affilée", "8 semaines d'affilée"], maxStreak),
    famille('Gros mois', '/mois',
      ['ic_troph_mois_complet.png', 'ic_troph_mois_complet.png', 'ic_troph_mois_complet.png'],
      [12, 16, 20],
      ['12 séances dans un mois', '16 séances dans un mois', '20 séances dans un mois'], maxMonth),
    famille('Tonnage', 'kg',
      ['ic_troph_1_tonne.png', 'ic_troph_10_tonnes.png', 'ic_troph_100_tonnes.png'],
      [1000, 10000, 100000],
      ['1 tonne déplacée au total', '10 tonnes déplacées au total', '100 tonnes déplacées au total'], totalTonnage),
    famille('Temps de fer', 'h',
      ['ic_troph_10_heures.png', 'ic_troph_50_heures.png', 'ic_troph_50_heures.png'],
      [10, 50, 100],
      ['10 h de séance cumulées', '50 h de séance cumulées', '100 h de séance cumulées'], totalHours)
  ];

  return { weekTonnage, monthTonnage, totalTonnage, totalSessions, totalHours, trophies };
}
