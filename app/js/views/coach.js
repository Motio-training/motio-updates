/* ==========================================================================
   Coach IA (Moti) — même Edge Function `coach-chat` que l'app Android
   (CoachChat.kt) : {messages:[{role,content}], context: string} en entrée,
   {reply, workout?} en sortie. Le fil de discussion est purement local
   (localStorage), jamais stocké côté serveur, comme sur Android.

   Le contexte envoyé est plus modeste que côté natif (pas de programme actif
   ni de records ici : ces données ne vivent que dans le stockage local du
   téléphone) — le coach reste utile (séances récentes, profil) sans pouvoir
   parler du programme en cours.
   ========================================================================== */

import { h, render, esc, toast } from '../ui.js';
import { sb, currentUser } from '../supabase.js';
import { getProfile, sessionsOf } from '../api.js';
import { nouvelleSeance, MODE_LABELS } from '../model.js';
import { saveWorkout } from '../api.js';

const CLE = 'motio_coach_thread';
const FENETRE = 12;

function thread() {
  try { return JSON.parse(localStorage.getItem(CLE) || '[]'); }
  catch { return []; }
}
function persister(msgs) { localStorage.setItem(CLE, JSON.stringify(msgs)); }

function relDate(ms) {
  const jour = 86400000;
  const diff = Math.floor(Date.now() / jour) - Math.floor(ms / jour);
  if (diff === 0) return "aujourd'hui";
  if (diff === 1) return 'hier';
  return new Date(ms).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

async function construireContexte(moi) {
  const lignes = [];
  const now = new Date();
  lignes.push(`Date et heure actuelles : ${now.toLocaleDateString('fr-FR')} à ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`);
  try {
    const p = await getProfile(moi.id);
    lignes.push(`Prénom/pseudo : ${p?.display_name || p?.username || 'cet utilisateur'}`);
  } catch { /* pas bloquant */ }
  try {
    const seances = await sessionsOf(moi.id, { limit: 5 });
    if (seances.length) {
      lignes.push('Dernières séances réalisées :');
      seances.forEach(s => {
        const durMin = Math.round((s.duration_ms || 0) / 60000);
        lignes.push(`- ${s.workout_name || 'Séance'}, ${relDate(new Date(s.started_at).getTime())}, ${durMin} min`);
      });
    } else {
      lignes.push('Aucune séance enregistrée pour l’instant.');
    }
  } catch { /* pas bloquant */ }
  lignes.push('(Connecté depuis l’espace web : le programme actif et les records ne sont visibles que dans l’application.)');
  return lignes.join('\n');
}

export async function vueCoach() {
  const moi = await currentUser();
  let messages = thread();
  let envoi = false;

  /* CoachScreen.kt ~112-129 : flèche retour, avatar Moti, « MOTI »/« Ton
     coach IA », et « Recommencer » à droite (seulement s'il y a des
     messages) — tout sur une seule ligne, pas le triptyque eyebrow/h1/lede
     d'avant. */
  const el = h(`
    <section class="page coach">
      <div class="coach-tete">
        <a class="coach-retour" href="#/profil" aria-label="Retour">‹</a>
        <img class="coach-avatar" src="../assets/img/moti_avatar.jpg" alt="">
        <div class="coach-identite">
          <b>MOTI</b>
          <span>Ton coach IA</span>
        </div>
        <button class="lien-inline" data-recommencer type="button" hidden>Recommencer</button>
      </div>

      <ul class="coach-fil" data-fil></ul>

      <form class="coach-saisie" data-form>
        <input type="text" data-texte placeholder="Écris à ton coach…" autocomplete="off" maxlength="1000">
        <button class="btn" type="submit">↑</button>
      </form>
    </section>`);

  const fil = el.querySelector('[data-fil]');
  const form = el.querySelector('[data-form]');
  const champ = el.querySelector('[data-texte]');
  const btnRecommencer = el.querySelector('[data-recommencer]');

  /** Bulle « séance proposée » dorée (CoachBubble, CoachScreen.kt ~209-227) :
   *  compacte, avatar Moti + libellé, ouvre un aperçu au lieu d'afficher le
   *  détail directement dans le fil. */
  function ouvrirApercuSeance(workout) {
    const modale = h(`
      <div class="modale" role="dialog" aria-label="Séance proposée">
        <div class="modale-boite modale-boite-etroite">
          <div class="modale-tete" style="justify-content:center"><h2>${esc(workout.name)}</h2></div>
          <p class="ligne-meta">${workout.exercises.length} exercice${workout.exercises.length > 1 ? 's' : ''}</p>
          <ul class="liste" style="margin-top:1rem;text-align:left">
            ${workout.exercises.map(ex => `<li class="ligne"><span class="ligne-titre">${esc(ex.name)}</span></li>`).join('')}
          </ul>
          <div class="modale-pied" style="justify-content:center">
            <button class="lien-inline" data-fermer type="button">Fermer</button>
            <button class="btn" data-importer type="button">Importer dans mes séances</button>
          </div>
        </div>
      </div>`);
    const fermer = () => modale.remove();
    modale.addEventListener('click', (e) => { if (e.target === modale) fermer(); });
    modale.querySelector('[data-fermer]').onclick = fermer;
    modale.querySelector('[data-importer]').onclick = async (e) => {
      e.target.disabled = true;
      try {
        const seance = nouvelleSeance(workout.name, 'Coach IA');
        seance.exercises = workout.exercises.map(ex => ({
          name: ex.name, mode: 'MINUTEUR',
          plannedSets: Math.min(10, Math.max(1, ex.sets || 3)),
          targetReps: Math.min(30, Math.max(1, ex.reps || 8)),
          recupSec: Math.min(600, Math.max(15, ex.rest_sec || 90)),
          workSec: 20, restSec: 10, tabataSeries: 8, groupId: 0, sets: []
        }));
        await saveWorkout(moi.id, seance);
        toast('Séance importée.');
        e.target.textContent = 'Importée ✓';
      } catch (err) { toast(err.message); e.target.disabled = false; }
    };
    document.body.appendChild(modale);
  }

  function bulle(m) {
    const mine = m.role === 'user';
    const li = h(`<li class="coach-ligne ${mine ? 'mine' : ''}"></li>`);
    if (!mine) li.appendChild(h(`<img class="coach-bulle-avatar" src="../assets/img/moti_avatar.jpg" alt="">`));
    const b = h('<div class="coach-bulle"></div>');
    li.appendChild(b);
    b.appendChild(h(`<p>${esc(m.text).replace(/\n/g, '<br>')}</p>`));
    fil.appendChild(li);

    if (m.workout) {
      const pilule = h(`
        <li class="coach-ligne">
          <button type="button" class="coach-seance-pilule">
            <img src="../assets/img/moti_avatar.jpg" alt="">
            <span>Voir la séance proposée</span>
          </button>
        </li>`);
      pilule.querySelector('button').onclick = () => ouvrirApercuSeance(m.workout);
      fil.appendChild(pilule);
    }
  }

  function redessiner() {
    fil.replaceChildren();
    if (!messages.length) {
      fil.appendChild(h(`<li class="etat-mono coach-vide">Pose une question sur tes séances, ta récupération, ou demande-lui de te construire une séance.</li>`));
    } else {
      messages.forEach(bulle);
    }
    btnRecommencer.hidden = !messages.length;
    fil.scrollTop = fil.scrollHeight;
  }

  /** Confirmation avant d'effacer (CoachScreen.kt ~174-187) : le bouton dit
   *  « Recommencer », mais la confirmation dit « Effacer ». */
  btnRecommencer.onclick = () => {
    const modale = h(`
      <div class="modale" role="dialog" aria-label="Recommencer la conversation">
        <div class="modale-boite modale-boite-etroite">
          <div class="modale-tete" style="justify-content:center"><h2>Recommencer la conversation ?</h2></div>
          <p class="etat-mono">L'historique de cette discussion sera effacé.</p>
          <div class="modale-pied" style="justify-content:center;gap:1.2rem">
            <button class="lien-inline" data-annuler type="button">Annuler</button>
            <button class="lien-inline" data-effacer type="button" style="color:var(--accent2);font-weight:700">Effacer</button>
          </div>
        </div>
      </div>`);
    const fermer = () => modale.remove();
    modale.addEventListener('click', (e) => { if (e.target === modale) fermer(); });
    modale.querySelector('[data-annuler]').onclick = fermer;
    modale.querySelector('[data-effacer]').onclick = () => {
      fermer(); messages = []; persister(messages); redessiner();
    };
    document.body.appendChild(modale);
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const texte = champ.value.trim();
    if (!texte || envoi) return;
    envoi = true;
    champ.value = '';
    messages = [...messages, { role: 'user', text: texte, whenMs: Date.now() }];
    persister(messages); redessiner();

    const attente = h(`<li class="coach-ligne"><div class="coach-bulle coach-attente">…</div></li>`);
    fil.appendChild(attente); fil.scrollTop = fil.scrollHeight;

    try {
      const contexte = await construireContexte(moi);
      const history = messages.slice(-FENETRE).map(m => ({
        role: m.role === 'coach' ? 'assistant' : 'user', content: m.text
      }));
      const { data, error } = await sb.functions.invoke('coach-chat', {
        body: { messages: history, context: contexte }
      });
      if (error) throw error;
      if (!data?.reply) throw new Error('Réponse vide du coach.');
      messages = [...messages, { role: 'coach', text: data.reply, whenMs: Date.now(), workout: data.workout || null }];
      persister(messages);
    } catch (err) {
      toast(err.message || "Le coach n'a pas répondu.");
    } finally {
      envoi = false;
      redessiner();
    }
  };

  redessiner();
  render(el);
}
