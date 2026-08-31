import { h, render, toast } from '../ui.js';
import { signIn, signUp, signInWithGoogle, CLE_ERREUR_AUTH } from '../supabase.js';
import { CONFIG } from '../config.js';

export function vueConnexion() {
  let inscription = false;

  const el = h(`
    <section class="page page-etroite">
      <h1 data-titre>Se connecter</h1>
      <p class="lede">Ton compte Motio. Le fil, les abonnements et
         l'historique suivent.</p>

      <button class="btn btn-lg" data-google>Continuer avec Google</button>

      <div class="separateur"><span>ou</span></div>

      <label class="champ"><span>Adresse e-mail</span>
        <input type="email" data-email autocomplete="email"></label>

      <label class="champ"><span>Mot de passe</span>
        <input type="password" data-mdp autocomplete="current-password"></label>

      <label class="champ" data-champ-pseudo hidden><span>Pseudo</span>
        <input type="text" data-pseudo maxlength="24" autocomplete="username"></label>

      <button class="btn btn-lg" data-valider>Se connecter</button>

      <p class="fineprint">
        <button class="lien-inline" data-bascule>Créer un compte</button>
        · <a href="${CONFIG.DOWNLOAD_URL}" rel="noopener">Télécharger Motio</a>
      </p>
    </section>`);

  const titre = el.querySelector('[data-titre]');
  const valider = el.querySelector('[data-valider]');
  const bascule = el.querySelector('[data-bascule]');
  const champPseudo = el.querySelector('[data-champ-pseudo]');

  bascule.onclick = () => {
    inscription = !inscription;
    titre.textContent = inscription ? 'Créer un compte' : 'Se connecter';
    valider.textContent = inscription ? 'Créer le compte' : 'Se connecter';
    bascule.textContent = inscription ? "J'ai déjà un compte" : 'Créer un compte';
    champPseudo.hidden = !inscription;
    el.querySelector('[data-mdp]').autocomplete = inscription ? 'new-password' : 'current-password';
  };

  el.querySelector('[data-google]').onclick = async (e) => {
    const bouton = e.target;
    bouton.disabled = true;
    try {
      await signInWithGoogle();
      /* signInWithOAuth rend la main sans erreur puis quitte la page. S'il
         n'a pas quitté, la redirection a été retenue (bloqueur, fenêtre en
         arrière-plan) : rendre le bouton, sinon l'écran reste figé sur un
         bouton grisé et le clic suivant ne fait rien du tout. */
      setTimeout(() => { bouton.disabled = false; }, 4000);
    } catch (err) { toast(err.message); bouton.disabled = false; }
  };

  valider.onclick = async () => {
    const mail = el.querySelector('[data-email]').value.trim();
    const mdp = el.querySelector('[data-mdp]').value;
    const pseudo = el.querySelector('[data-pseudo]').value.trim();

    if (!mail || !mdp) return toast('Renseigne une adresse et un mot de passe.');
    if (inscription && pseudo.length < 3) return toast('Le pseudo fait 3 caractères minimum.');

    valider.disabled = true;
    try {
      if (inscription) {
        await signUp(mail, mdp, pseudo);
        toast('Compte créé. Ouvre le lien reçu par e-mail pour confirmer.');
      } else {
        await signIn(mail, mdp);
      }
    } catch (err) {
      toast(err.message);
    } finally {
      valider.disabled = false;
    }
  };

  render(el);

  /* Message laissé par main.js quand un retour d'OAuth a échoué. Il est lu une
     seule fois : le garder ferait réapparaître l'avertissement à chaque visite
     de l'écran. */
  try {
    const err = sessionStorage.getItem(CLE_ERREUR_AUTH);
    if (err) { sessionStorage.removeItem(CLE_ERREUR_AUTH); toast(err); }
  } catch { /* stockage refusé */ }
}
