# generateur_etiquettes

Application indépendante Next.js/Vercel utilisant la base Supabase DS_Sales de bertoolds.com.
L'interface principale du générateur reste en HTML/CSS/JavaScript dans `public/generateur-etiquettes/index.html`.

## Nouveautés de cette version

- Filtre 1 : **Secteur**, alimenté par `v_articles_etiquettes.secteur`.
- Filtre 2 : **Groupe**, filtré selon le secteur et alimenté par `familles.groupe` via la vue.
- Filtre 3 : **Articles**, sous forme de cases à cocher avec recherche.
- Option **Tous** pour le secteur, le groupe et la liste des articles.
- Ajout en lot des articles cochés à la file d'impression.
- Correspondances automatiques : Réf. DS, Réf. fournisseur, type/code-barres, famille, secteur, libellé et prix.
- Pictogramme automatique déterminé par `DS_code_barre.groupe_articles`.
- Maintien des formats Ghlin et Liège, de l'impression A4 et de la photo manuelle.

## Fichiers à créer ou remplacer

### À remplacer

- `app/api/articles/route.ts`
- `public/generateur-etiquettes/index.html`
- `.env.example`
- `README.md`

### À créer

- `supabase/01_update_view_articles_etiquettes.sql`
- `supabase/02_validation_view.sql`

## Installation Supabase

1. Les tables `ds_code_barre` et `correspondance` doivent déjà être créées et alimentées.
2. Dans Supabase > SQL Editor, exécutez :
   - `supabase/01_update_view_articles_etiquettes.sql`
   - puis `supabase/02_validation_view.sql`
3. Vérifiez que la colonne du groupe de la table `familles` s'appelle bien `groupe`.
   Si son nom diffère, modifiez `f.groupe` dans le premier script SQL.

## Variables d'environnement

Créez `.env.local` en local et les mêmes variables dans Vercel :

```env
SUPABASE_URL=https://votre-projet.supabase.co
SUPABASE_SECRET_KEY=votre_cle_serveur
ARTICLES_VIEW=v_articles_etiquettes
APP_PASSWORD=votre_mot_de_passe
SESSION_SECRET=une_chaine_aleatoire_d_au_moins_32_caracteres
```

La clé Supabase doit rester côté serveur et ne doit pas commencer par `NEXT_PUBLIC_`.

## Lancement local

```bash
npm install
npm run dev
```

Ouvrez ensuite `http://localhost:3000`.

## Déploiement Vercel

Déposez le projet dans un dépôt Git, importez-le dans Vercel, ajoutez les variables d'environnement puis redéployez.
Le dossier `.vercel` est généré automatiquement lors de la liaison avec Vercel et ne doit pas être copié manuellement.

## Limite actuelle

L'API charge au maximum 50 000 lignes de la vue et les garde en cache cinq minutes dans l'instance serveur. Cette méthode convient à la première version. Une fonction RPC Supabase paginée pourra être ajoutée plus tard si le volume augmente fortement.
