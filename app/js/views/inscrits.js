/* ==========================================================================
   RÉGLAGES › ADMINISTRATION › INSCRITS (admins seulement).

   La liste des comptes Motio, et l'accès à Moti ouvert ou fermé compte par
   compte. Portage d'Inscrits.kt (C:\chrono). Tout passe par deux fonctions
   serveur, `admin_inscrits` et `admin_acces_ia`, qui refusent un compte absent
   de app_admins : cacher l'entrée du menu n'est qu'un confort, la sécurité est
   côté base.
   ========================================================================== */

import { h, render, esc, toast } from '../ui.js';
import { estAdmin, inscrits, changerAccesIA } from '../api.js';

const FILTRES = { tous: 'Tous', avec: 'Avec Moti', sans: 'Sans Moti' };

const jour = (iso) => iso
  ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
  : '';

/** « aujourd'hui », « hier », « il y a 5 j », sinon la date. */
function depuis(iso) {
  if (!iso) return 'jamais connecté';
  const j = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (j <= 0) return "vu aujourd'hui";
  if (j === 1) return 'vu hier';
  if (j < 30) return `vu il y a ${j} j`;
  return `vu le ${jour(iso)}`;
}

export async function vueReglagesInscrits() {
  const el = h(`
    <section class="page page-etroite">
      <p class="eyebrow"><a class="lien-inline" href="#/reglages">‹ Réglages</a></p>
      <h1>Inscrits</h1>
      <p class="etat-mono" data-resume>Chargement…</p>

      <label class="champ" style="margin-top:1rem"><span>Chercher</span>
        <input type="search" data-cherche placeholder="Pseudo, nom ou adresse"></label>
      <div class="puces" data-filtres>
        ${Object.entries(FILTRES).map(([k, v]) =>
          `<button class="puce${k === 'tous' ? ' puce-active' : ''}" data-filtre="${k}" type="button">${v}</button>`).join('')}
      </div>

      <ul class="liste" data-liste style="margin-top:0"></ul>
    </section>`);
  render(el);

  if (!(await estAdmin())) {
    el.querySelector('[data-resume]').textContent = 'Cet écran est réservé aux administrateurs.';
    el.querySelector('[data-cherche]').closest('.champ').hidden = true;
    el.querySelector('[data-filtres]').hidden = true;
    return;
  }

  let liste = [];
  let filtre = 'tous';
  const zone = el.querySelector('[data-liste]');
  const cherche = el.querySelector('[data-cherche]');

  const dessiner = () => {
    const q = cherche.value.trim().toLowerCase();
    const avec = liste.filter(u => u.ia).length;
    el.querySelector('[data-resume]').textContent =
      `${liste.length} inscrit${liste.length > 1 ? 's' : ''} · ${avec} avec Moti`;

    const visibles = liste.filter(u =>
      (filtre === 'tous' || (filtre === 'avec') === !!u.ia) &&
      (!q || [u.username, u.display_name, u.email].some(s => (s || '').toLowerCase().includes(q))));

    if (!visibles.length) {
      zone.replaceChildren(h(`<p class="etat-mono">Personne ne correspond.</p>`));
      return;
    }
    zone.replaceChildren(...visibles.map(fiche));
  };

  const fiche = (u) => {
    const etatIA = u.ia
      ? (u.ia_jusqua ? `Moti jusqu'au ${jour(u.ia_jusqua)}` : 'Moti sans date de fin')
      : (u.ia_statut === 'offert' && u.ia_jusqua ? `Moti expiré le ${jour(u.ia_jusqua)}` : 'Pas de Moti');
    const li = h(`
      <li class="ligne">
        <div class="ligne-tete">
          <span class="ligne-titre">@${esc(u.username || 'sans pseudo')}${u.admin ? ' <span class="badge-ia">ADMIN</span>' : ''}</span>
          <span class="badge-ia${u.ia ? ' on' : ''}">${u.ia ? '✦ MOTI' : 'SANS MOTI'}</span>
        </div>
        ${u.display_name && u.display_name !== u.username ? `<p class="ligne-corps" style="margin-top:.15rem">${esc(u.display_name)}</p>` : ''}
        <p class="ligne-meta" style="margin-top:.35rem">${esc(u.email || '')}</p>
        <p class="ligne-meta">Inscrit le ${esc(jour(u.inscrit))} · ${u.via === 'google' ? 'Google' : 'e-mail'}${u.confirme ? '' : ' (non confirmé)'} · ${esc(depuis(u.derniere_connexion))}</p>
        <p class="ligne-meta">${esc(etatIA)} · ${u.ia_30j} appel${u.ia_30j > 1 ? 's' : ''} à Moti sur 30 j</p>
        <div style="display:flex;gap:.5rem;margin-top:.65rem;flex-wrap:wrap">
          <button class="btn btn-sm${u.ia ? ' btn-ghost' : ''}" data-ouvrir type="button">${u.ia ? 'Changer la date' : 'Ouvrir Moti'}</button>
          ${u.ia ? '<button class="btn btn-sm btn-ghost" data-fermer type="button">Fermer Moti</button>' : ''}
        </div>
      </li>`);
    li.querySelector('[data-ouvrir]').onclick = () => choisirDuree(u, async (jusqua) => {
      try {
        const r = await changerAccesIA(u.id, true, jusqua);
        Object.assign(u, { ia: r.ia, ia_statut: 'offert', ia_jusqua: r.ia_jusqua });
        toast(`Moti ouvert pour @${u.username}.`);
        dessiner();
      } catch (err) { toast(err?.message || "Ça n'a pas fonctionné."); }
    });
    const btnFermer = li.querySelector('[data-fermer]');
    btnFermer?.addEventListener('click', async () => {
      if (!confirm(`Fermer l'accès à Moti pour @${u.username} ?`)) return;
      btnFermer.disabled = true;
      try {
        await changerAccesIA(u.id, false);
        Object.assign(u, { ia: false, ia_statut: 'aucun', ia_jusqua: null });
        toast(`Moti fermé pour @${u.username}.`);
        dessiner();
      } catch (err) { toast(err?.message || "Ça n'a pas fonctionné."); btnFermer.disabled = false; }
    });
    return li;
  };

  cherche.addEventListener('input', dessiner);
  el.querySelectorAll('[data-filtre]').forEach(b => {
    b.onclick = () => {
      filtre = b.dataset.filtre;
      el.querySelectorAll('[data-filtre]').forEach(x => x.classList.toggle('puce-active', x === b));
      dessiner();
    };
  });

  try {
    liste = await inscrits();
    dessiner();
  } catch (err) {
    el.querySelector('[data-resume]').textContent = err?.message || 'Lecture impossible.';
  }
}

/** Fenêtre « Ouvrir Moti » : sans fin, 1 mois, 3 mois ou jusqu'à une date. */
function choisirDuree(u, valider) {
  const demain = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const modale = h(`
    <div class="modale" role="dialog" aria-label="Ouvrir Moti">
      <div class="modale-boite modale-boite-etroite" style="text-align:left">
        <div class="modale-tete"><h2>Moti pour @${esc(u.username || '')}</h2></div>
        <div class="modale-corps">
          <p class="etat-mono" style="margin-bottom:.8rem">Jusqu'à quand ?</p>
          <div class="puces">
            <button class="puce puce-active" data-duree="0" type="button">Sans fin</button>
            <button class="puce" data-duree="1" type="button">1 mois</button>
            <button class="puce" data-duree="3" type="button">3 mois</button>
            <button class="puce" data-duree="date" type="button">Jusqu'au…</button>
          </div>
          <label class="champ" data-champ-date hidden><span>Date de fin</span>
            <input type="date" data-date min="${demain}" value="${demain}"></label>
        </div>
        <div class="modale-pied" style="justify-content:flex-end;gap:1.2rem">
          <button class="lien-inline" data-annuler type="button">Annuler</button>
          <button class="btn" data-valider type="button">Ouvrir Moti</button>
        </div>
      </div>
    </div>`);
  let duree = '0';
  const champDate = modale.querySelector('[data-champ-date]');
  modale.querySelectorAll('[data-duree]').forEach(b => {
    b.onclick = () => {
      duree = b.dataset.duree;
      modale.querySelectorAll('[data-duree]').forEach(x => x.classList.toggle('puce-active', x === b));
      champDate.hidden = duree !== 'date';
    };
  });
  const fermer = () => modale.remove();
  modale.addEventListener('click', (e) => { if (e.target === modale) fermer(); });
  modale.querySelector('[data-annuler]').onclick = fermer;
  modale.querySelector('[data-valider]').onclick = () => {
    let jusqua = null;
    if (duree === '1' || duree === '3') {
      const d = new Date();
      d.setMonth(d.getMonth() + Number(duree));
      jusqua = d.toISOString();
    } else if (duree === 'date') {
      const v = modale.querySelector('[data-date]').value;
      if (!v) return toast('Choisis une date.');
      jusqua = new Date(`${v}T23:59:59`).toISOString();   // fin de journée, heure locale
      if (new Date(jusqua) <= new Date()) return toast('La date de fin doit être dans le futur.');
    }
    fermer();
    valider(jusqua);
  };
  document.body.appendChild(modale);
}
