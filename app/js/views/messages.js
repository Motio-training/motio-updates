/* ==========================================================================
   Messages 1-à-1 — même table `messages` que ChatScreens.kt. Pas de temps
   réel côté serveur : un sondage léger tourne tant que le fil reste ouvert
   (même idée que le fil d'activité et le canal de groupe).
   ========================================================================== */

import { h, render, loading, empty, failure, esc, toast, dateCourte } from '../ui.js';
import { conversations, messageThread, sendText, sendWorkoutMessage,
         markThreadRead, listWorkouts, usernamesFor } from '../api.js';
import { currentUser } from '../supabase.js';
import { encode as encoderSeance, decode as decoderSeance } from '../workout-share.js';
import { saveWorkout } from '../api.js';

export async function vueMessages() {
  render(loading('Chargement des messages'));
  const moi = await currentUser();

  let convs;
  try { convs = await conversations(moi.id); }
  catch (e) { return render(failure(e, "Les messages n'ont pas pu être chargés")); }

  if (!convs.length) {
    return render(empty('Aucun message',
      'Écris à un ami depuis son profil, ou cherche un pseudo dans Amis.',
      { href: '#/amis', label: 'Voir mes amis' }));
  }

  const el = h(`
    <section class="page">
      <p class="eyebrow">Social</p>
      <h1>Messages</h1>
      <ul class="liste" data-liste></ul>
    </section>`);

  const ul = el.querySelector('[data-liste]');
  for (const c of convs) {
    ul.appendChild(h(`
      <li class="ligne ligne-action">
        <a class="ligne-titre" href="#/messages/${esc(c.id)}">${esc(c.username)}
          ${c.unread ? `<span class="etiquette">${c.unread} non lu${c.unread > 1 ? 's' : ''}</span>` : ''}</a>
        <span class="ligne-meta">${esc(c.body)} · ${esc(dateCourte(c.at))}</span>
      </li>`));
  }
  render(el);
}

export async function vueMessageThread(params) {
  render(loading('Chargement de la conversation'));
  const moi = await currentUser();
  const friendId = params.id;

  let messages, noms;
  try {
    messages = await messageThread(moi.id, friendId);
    noms = await usernamesFor([friendId]);
  } catch (e) { return render(failure(e, "La conversation n'a pas pu être chargée")); }

  const aLire = messages.filter(m => m.recipient_id === moi.id && !m.read_at).map(m => m.id);
  if (aLire.length) markThreadRead(aLire);

  const el = h(`
    <section class="page msg-thread">
      <p class="eyebrow"><a class="lien-inline" href="#/amis">‹ Amis</a></p>
      <h1>${esc(noms[friendId] || 'Conversation')}</h1>

      <ul class="msg-fil" data-fil></ul>

      <div class="msg-actions">
        <button class="btn btn-sm btn-ghost" type="button" data-partager>Partager une séance</button>
      </div>
      <form class="coach-saisie" data-form>
        <input type="text" data-texte placeholder="Écrire un message…" autocomplete="off" maxlength="1000">
        <button class="btn" type="submit">Envoyer</button>
      </form>
    </section>`);

  const fil = el.querySelector('[data-fil]');
  const form = el.querySelector('[data-form]');
  const champ = el.querySelector('[data-texte]');

  function ligne(m) {
    const mine = m.sender_id === moi.id;
    const li = h(`<li class="coach-ligne ${mine ? 'mine' : ''}"><div class="coach-bulle"></div></li>`);
    const b = li.querySelector('.coach-bulle');
    if (m.workout_data) {
      const btn = h(`<button class="lien-inline" type="button">🏋 ${esc(m.workout_name || 'Séance')} — importer</button>`);
      btn.onclick = async () => {
        btn.disabled = true;
        const w = await decoderSeance(m.workout_data);
        if (!w) { toast('Séance illisible.'); btn.disabled = false; return; }
        try { await saveWorkout(moi.id, w); toast('Séance importée.'); btn.textContent = 'Importée ✓'; }
        catch (err) { toast(err.message); btn.disabled = false; }
      };
      b.appendChild(btn);
    } else {
      b.appendChild(h(`<p>${esc(m.body)}</p>`));
    }
    fil.appendChild(li);
  }

  function redessiner() {
    fil.replaceChildren();
    messages.forEach(ligne);
    fil.scrollTop = fil.scrollHeight;
  }

  el.querySelector('[data-partager]').onclick = async () => {
    let mine;
    try { mine = await listWorkouts(moi.id); }
    catch (err) { return toast(err.message); }
    if (!mine.length) return toast('Aucune séance à partager. Crée-en une dans Séances.');
    ouvrirChoixSeance(mine, async (w) => {
      try {
        const code = await encoderSeance(w.data);
        await sendWorkoutMessage(moi.id, friendId, w.name, code);
        messages = await messageThread(moi.id, friendId);
        redessiner();
      } catch (err) { toast(err.message); }
    });
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const texte = champ.value.trim();
    if (!texte) return;
    champ.value = '';
    try {
      await sendText(moi.id, friendId, texte);
      messages = await messageThread(moi.id, friendId);
      redessiner();
    } catch (err) { toast(err.message); }
  };

  redessiner();
  render(el);

  /* Sondage léger tant que l'écran reste ouvert — coupé au changement de vue. */
  const intervalle = setInterval(async () => {
    if (!document.body.contains(el)) { clearInterval(intervalle); return; }
    try {
      const fraiches = await messageThread(moi.id, friendId);
      if (fraiches.length !== messages.length) { messages = fraiches; redessiner(); }
    } catch { /* pas grave, on retentera au prochain passage */ }
  }, 8000);
}

function ouvrirChoixSeance(seances, choisir) {
  const modale = h(`
    <div class="modale" role="dialog" aria-label="Choisir une séance à partager">
      <div class="modale-boite">
        <div class="modale-tete">
          <h2>Partager une séance</h2>
          <button class="lien-inline" data-fermer>Fermer</button>
        </div>
        <div class="modale-corps" data-corps></div>
      </div>
    </div>`);
  const corps = modale.querySelector('[data-corps]');
  for (const w of seances) {
    const b = h(`<button class="ligne ligne-action" style="width:100%;text-align:left;background:none;border:1px solid var(--trait);cursor:pointer" type="button">
      <span class="ligne-titre">${esc(w.name)}</span></button>`);
    b.onclick = () => { choisir(w); modale.remove(); };
    corps.appendChild(b);
  }
  modale.querySelector('[data-fermer]').onclick = () => modale.remove();
  modale.addEventListener('click', (e) => { if (e.target === modale) modale.remove(); });
  document.body.appendChild(modale);
}
