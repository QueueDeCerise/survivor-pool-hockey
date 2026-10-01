# Survivor Pool Hockey : vraie application

Application web (PC et cellulaire) avec vrais comptes, base de données partagée et sécurité par ligne.
Stack: **Next.js** (interface) + **Supabase** (comptes et base PostgreSQL) + **Vercel** (hébergement). Les trois ont un forfait gratuit suffisant pour un pool.

## Ce qui est inclus

- Inscription réelle: prénom, nom, surnom (2 changements max), courriel privé, mot de passe. Confirmation par courriel, mot de passe oublié.
- Lecture et acceptation obligatoire des règlements (version + date enregistrées).
- Rondes chevauchantes, 10 $ par ronde, paiement Interac confirmé par le gestionnaire.
- Choix quotidien privé, modifiable jusqu'au premier match; choix tardif jusqu'à +30 min sans les joueurs qui ont déjà un point.
- Révélation +30 min après le premier match jusqu'à +90 min après le dernier, avec DOUBLON. Masqué ensuite jusqu'à la fin de la ronde.
- 3 vies, TARO TSUJIMOTO si aucun choix, perte de vie pour doublon ou aucun point. Classement, cagnotte, PATINAPU.
- Joueurs proposés bloqués jusqu'à validation.
- Gestion: participants et courriels privés, paiements, rondes, horaire NHL, liste des joueurs NHL (32 équipes), import des points NHL (fusillade exclue) avec corrections manuelles, calcul des vies, journal d'audit.
- Toutes les règles sensibles sont appliquées **dans la base de données** (pas seulement dans l'écran): impossible de tricher sur l'heure limite, de voir les choix des autres ou de se marquer payé.

## Mise en ligne (environ 30 minutes)

### 1. Supabase (base de données et comptes)
1. Crée un compte sur https://supabase.com puis **New project** (région: Canada Central).
2. Menu **SQL Editor** > **New query** > colle tout le contenu de `supabase/schema.sql` > **Run**.
3. Menu **Project Settings** > **API**: copie **Project URL** et la clé **anon public**.

### 2. GitHub (code)
1. Crée un compte sur https://github.com puis un nouveau dépôt privé `survivor-pool-hockey`.
2. **Add file** > **Upload files**: glisse tous les fichiers de ce dossier (pas le fichier zip) > **Commit**.

### 3. Vercel (hébergement)
1. Crée un compte sur https://vercel.com avec ton compte GitHub.
2. **Add New** > **Project** > importe `survivor-pool-hockey`.
3. Dans **Environment Variables**, ajoute:
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL de Supabase
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = clé anon public
4. **Deploy**. Tu obtiens une adresse du genre `https://survivor-pool-hockey.vercel.app`.

### 4. Relier Supabase à ton adresse
Supabase > **Authentication** > **URL Configuration**:
- **Site URL**: ton adresse Vercel
- **Redirect URLs**: ajoute `https://TON-ADRESSE.vercel.app/**`

### 5. Devenir gestionnaire
1. Ouvre ton adresse, clique **Créer mon profil** avec `mbeliveau@mbsf.ca`, confirme le courriel reçu.
2. Dans Supabase > SQL Editor, exécute:
   ```sql
   update public.profiles set is_admin = true
   where id = (select id from auth.users where email = 'mbeliveau@mbsf.ca');
   ```
3. Déconnecte-toi et reconnecte-toi: l'onglet **Gestion** apparaît.

### 6. Préparer le pool (onglet Gestion)
1. **Joueurs** > Mettre à jour depuis la NHL (charge tous les alignements).
2. **Horaire** > Importer 7 jours (répète pour les semaines suivantes).
3. **Rondes** > crée la ronde 1 avec sa date de début.
4. Partage l'adresse aux participants.

## Routine quotidienne du gestionnaire
1. Après les matchs: **Horaire** > « Dernier match terminé » (ferme la fenêtre de révélation 90 min plus tard).
2. **Points et vies** > Importer depuis la NHL > vérifier/corriger > Enregistrer les points > Calculer les vies.
3. Confirmer les paiements Interac reçus dans **Participants**.
4. Quand il reste un seul survivant: **Rondes** > statut « Terminée ».

## Important: courriels de confirmation
Le service de courriel intégré de Supabase est limité à quelques envois par heure. Avant d'inviter tout le monde, choisis une option:
- **Recommandé**: Supabase > Authentication > **SMTP Settings**, branche un service gratuit comme Resend ou Brevo.
- **Rapide**: Supabase > Authentication > Providers > Email > désactive **Confirm email** (les comptes sont actifs tout de suite).

## Réglages
`lib/config.js`: courriel Interac, lien Messenger, frais, version des règlements.
`lib/rules.js`: texte des règlements (change `RULES_VERSION` si tu modifies les règles: tout le monde devra les accepter à nouveau).

## Essai local (optionnel)
```bash
cp .env.example .env.local   # puis remplis les deux valeurs
npm install
npm run dev                  # http://localhost:3000
```
