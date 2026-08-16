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

  const el = h(`
    <section class="page coach">
      <p class="eyebrow">Ton coach IA</p>
      <h1>Moti</h1>
      <p class="lede">Il connaît tes dernières séances et répond avec tes vrais chiffres.</p>

      <ul class="coach-fil" data-fil></ul>

      <form class="coach-saisie" data-form>
        <input type="text" data-texte placeholder="Écrire à Moti…" autocomplete="off" maxlength="1000">
        <button class="btn" type="submit">Envoyer</button>
      </form>
    </section>`);

  const fil = el.querySelector('[data-fil]');
  const form = el.querySelector('[data-form]');
  const champ = el.querySelector('[data-texte]');

  function bulle(m) {
    const mine = m.role === 'user';
    const li = h(`<li class="coach-ligne ${mine ? 'mine' : ''}"><div class="coach-bulle"></div></li>`);
    const b = li.querySelector('.coach-bulle');
    b.appendChild(h(`<p>${esc(m.text).replace(/\n/g, '<br>')}</p>`));
    if (m.workout) {
      const carte = h(`
        <div class="coach-seance">
          <p class="tag">Séance proposée</p>
          <p class="coach-seance-nom">${esc(m.workout.name)}</p>
          <p class="ligne-meta">${m.workout.exercises.length} exercices</p>
          <button class="btn btn-sm" type="button" data-importer>Importer dans mes séances</button>
        </div>`);
      carte.querySelector('[data-importer]').onclick = async (e) => {
        e.target.disabled = true;
        try {
          const seance = nouvelleSeance(m.workout.name, 'Coach IA');
          seance.exercises = m.workout.exercises.map(ex => ({
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
      b.appendChild(carte);
    }
    fil.appendChild(li);
  }

  function redessiner() {
    fil.replaceChildren();
    if (!messages.length) {
      fil.appendChild(h(`<li class="etat-mono coach-vide">Pose une question sur tes séances, ta récupération, ou demande-lui de te construire une séance.</li>`));
    } else {
      messages.forEach(bulle);
    }
    fil.scrollTop = fil.scrollHeight;
  }

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
