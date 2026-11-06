import { h, render, toast } from '../ui.js';
import { go } from '../router.js';
import { changerMotDePasse, erreurMdp, REGLE_MDP } from '../supabase.js';

/**
 * « Choisis un nouveau mot de passe » : l'écran où atterrit le lien du mail
 * « Mot de passe oublié ». La session ouverte par ce lien (main.js,
 * lireLienMail) autorise le changement ; sans session, la garde du routeur
 * renvoie sur la connexion avant même d'arriver ici.
 *
 * Un compte créé avec Google peut aussi s'en servir : il gagne alors une
 * seconde façon de se connecter, par e-mail et mot de passe.
 */
export function vueNouveauMdp() {
  const el = h(`
    <section class="page page-etroite">
      <h1>Nouveau mot de passe</h1>
      <p class="lede">Choisis le mot de passe de ton compte Motio
         (${REGLE_MDP}). Il servira sur le site comme
         dans l'application.</p>

      <label class="champ"><span>Nouveau mot de passe</span>
        <input type="password" data-mdp autocomplete="new-password"></label>

      <label class="champ"><span>Confirme le mot de passe</span>
        <input type="password" data-confirmation autocomplete="new-password"></label>

      <button class="btn btn-lg" data-valider>Enregistrer</button>
    </section>`);

  const valider = el.querySelector('[data-valider]');
  const envoyer = async () => {
    const mdp = el.querySelector('[data-mdp]').value;
    const confirmation = el.querySelector('[data-confirmation]').value;
    if (erreurMdp(mdp)) return toast(erreurMdp(mdp));
    if (mdp !== confirmation) return toast('Les deux mots de passe ne sont pas identiques.');
    valider.disabled = true;
    try {
      await changerMotDePasse(mdp);
      toast('Mot de passe enregistré. Tu peux aussi l\'utiliser dans l\'application.');
      go('/seances');
    } catch (err) {
      toast(err.message);
    } finally {
      valider.disabled = false;
    }
  };
  valider.onclick = envoyer;
  el.querySelector('[data-confirmation]').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') envoyer();
  });

  render(el);
}
