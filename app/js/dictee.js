/* DICTÉE (v77) — un micro au bout des champs où l'on parle à Moti
   (modification du programme, objectif, séance à créer, discussion), comme
   sur l'appli (Dictee.kt).

   Reconnaissance vocale du navigateur (Chrome, Edge, Safari), en français.
   Le texte reconnu s'ajoute à ce qui est déjà écrit et reste dans le champ :
   on le relit avant d'envoyer. Navigateur sans reconnaissance (Firefox) :
   pas de micro, rien d'autre ne change. */

import { toast } from './ui.js';

const Reco = window.SpeechRecognition || window.webkitSpeechRecognition;

const ICONE = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none"
  stroke="currentColor" stroke-width="2" stroke-linecap="round">
  <rect x="8.5" y="2.5" width="7" height="12" rx="3.5" fill="currentColor"/>
  <path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3.5"/></svg>`;

let ecoute = null;

/** Ajoute le texte dicté à la suite de ce qui est déjà écrit. */
export function avecDictee(actuel, dicte) {
  return actuel.trim() ? actuel.replace(/\s+$/, '') + ' ' + dicte
                       : dicte.charAt(0).toUpperCase() + dicte.slice(1);
}

/** Pose le micro sur ce champ (textarea ou input). Sans effet si le
   navigateur ne sait pas dicter, si le champ manque ou s'il l'a déjà. */
export function ajouterMicro(champ) {
  if (!Reco || !champ || champ.dataset.micro) return;
  champ.dataset.micro = '1';
  const zone = document.createElement('span');
  zone.className = 'dictee ' + (champ.tagName === 'TEXTAREA' ? 'dictee-zone' : 'dictee-ligne');
  champ.parentNode.insertBefore(zone, champ);
  zone.appendChild(champ);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'micro';
  btn.title = 'Dicter';
  btn.setAttribute('aria-label', 'Dicter');
  btn.innerHTML = ICONE;
  btn.disabled = champ.disabled;
  zone.appendChild(btn);

  btn.addEventListener('click', () => {
    // Deuxième appui pendant l'écoute : on arrête, ce qui est entendu reste.
    if (ecoute) { ecoute.stop(); return; }
    if (champ.disabled) return;
    const r = new Reco();
    r.lang = 'fr-FR';
    r.interimResults = false;
    r.maxAlternatives = 1;
    const avant = champ.value;
    r.onresult = (e) => {
      const texte = Array.from(e.results).map(x => x[0].transcript).join(' ').trim();
      if (!texte) return;
      const max = champ.maxLength > 0 ? champ.maxLength : undefined;
      champ.value = avecDictee(avant, texte).slice(0, max);
      champ.dispatchEvent(new Event('input', { bubbles: true }));
      champ.focus();
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        toast('Micro refusé par le navigateur : autorise-le pour dicter.');
      } else if (e.error === 'network') {
        toast('La dictée a besoin du réseau.');
      }
    };
    r.onend = () => { ecoute = null; btn.classList.remove('ecoute'); };
    try {
      r.start();
      ecoute = r;
      btn.classList.add('ecoute');
    } catch {
      ecoute = null;
    }
  });
}
