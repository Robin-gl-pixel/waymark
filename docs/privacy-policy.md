# Politique de confidentialité — Mappies

**Dernière mise à jour :** 2026-07-01
**Contact :** hesserobin1234@gmail.com

## En bref

Mappies est un carnet de lieux personnel. On ne vend rien, on ne track pas, on ne partage tes données avec personne.

- **Tu contrôles tes données** : tu peux tout supprimer depuis Réglages → *Supprimer mon compte*.
- **Aucune publicité, aucun tracker tiers.**
- **Aucune vente ni partage** de tes données avec des tiers commerciaux.

---

## 1. Qui nous sommes

Mappies est développé par Robin Hesse, développeur indépendant basé en France. Contact : hesserobin1234@gmail.com.

## 2. Données collectées

### 2.1 Données de compte (via Sign in with Apple)

Quand tu te connectes avec ton Apple ID :
- **Adresse email** (souvent une adresse relais anonymisée fournie par Apple)
- **Prénom + nom** (uniquement si tu choisis de les partager lors de la première connexion)
- **Identifiant utilisateur unique** (fourni par Firebase Authentication)

Ces données sont stockées sur Google Firebase Authentication (voir §5).

### 2.2 Contenu que tu ajoutes

Pour chaque lieu que tu enregistres depuis un screenshot :
- L'image du screenshot elle-même
- Les informations extraites (nom du lieu, ville, adresse, catégorie, description, auteur Instagram si visible)
- Les coordonnées géographiques (latitude/longitude) obtenues auprès de Mapbox
- Tes notes personnelles éventuelles

Ces données sont stockées sur Firebase Firestore + Firebase Storage, dans un espace réservé à ton compte (personne d'autre n'y a accès, y compris nous — voir §6 sur l'accès administrateur).

### 2.3 Données NON collectées

- Aucune donnée de localisation en arrière-plan
- Aucune donnée de contact
- Aucun tracker publicitaire
- Aucune donnée d'usage analytics tiers en V1 (à modifier si PostHog est ajouté en V1.1)
- Aucune donnée biométrique

## 3. Comment tes données sont utilisées

Uniquement pour faire fonctionner Mappies :
- Afficher tes lieux sur ta carte et ta liste
- Extraire automatiquement les informations depuis tes screenshots (via Claude vision, voir §5)
- Géocoder les adresses (via Mapbox, voir §5)

**Nous n'utilisons PAS tes données pour :**
- Entraîner des modèles d'IA
- De la publicité
- Des recommandations à d'autres utilisateurs
- Une revente à des tiers

## 4. Traitement des screenshots par Claude (Anthropic)

Quand tu ajoutes un screenshot :
1. L'image est envoyée à l'API Claude d'Anthropic pour extraction textuelle
2. Anthropic reçoit uniquement le screenshot, sans autre donnée personnelle
3. Selon les conditions Anthropic API activées côté serveur : **rétention zéro, aucun entraînement modèle sur nos requêtes** (dashboard Anthropic org "no-retention" à vérifier au submit)

Après traitement, l'image est stockée sur Firebase Storage sous ton propre espace utilisateur (personne d'autre n'y a accès).

## 5. Sous-traitants (tiers)

Pour faire fonctionner Mappies, nous utilisons ces services :

| Service | Rôle | Localisation |
|---|---|---|
| **Google Firebase** (Auth, Firestore, Storage, Cloud Functions) | Stockage + authentification | europe-west1 (Belgique) |
| **Anthropic Claude API** | Extraction visuelle des screenshots | États-Unis (Anthropic) |
| **Mapbox Geocoding** | Récupération des coordonnées géographiques | Serveurs US (Mapbox) |
| **Apple Sign in with Apple** | Authentification | Serveurs Apple mondiaux |

Aucun de ces sous-traitants n'a accès à tes données à des fins qui leur seraient propres (marketing, analyse cross-user, etc.).

## 6. Où sont stockées tes données

- **Firestore + Storage** : Belgique (europe-west1). Google est responsable de la sécurité physique.
- **Anthropic** : les images sont transmises aux serveurs US mais **ne sont pas conservées** au-delà du traitement (config no-retention activée).

Aucun humain (y compris nous, développeur solo) n'accède à tes données personnellement. L'accès admin Firebase existe techniquement pour la maintenance mais nous ne le sollicitons jamais sur des documents utilisateurs.

## 7. Combien de temps tes données sont conservées

- Tant que ton compte existe : tes données sont conservées.
- Si tu supprimes ton compte via Réglages → *Supprimer mon compte* : **toutes tes données** (lieux, screenshots, identifiants) sont **définitivement supprimées** de Firebase dans les minutes qui suivent, sans backup conservé.
- Compte inactif >24 mois : nous nous réservons le droit de supprimer automatiquement le compte après notification par email.

## 8. Tes droits (RGPD)

Étant basé en France, Mappies respecte le RGPD. Tu as le droit :
- **D'accès** : demander une copie de toutes tes données (contact email ci-dessus)
- **De rectification** : modifier tes données directement dans l'app
- **D'effacement** : bouton *Supprimer mon compte* dans Réglages, effet immédiat
- **De portabilité** : demander un export JSON (contact email)
- **D'opposition** : arrêter d'utiliser l'app à tout moment
- **De réclamation** : auprès de la CNIL (https://www.cnil.fr)

## 9. Sécurité

- Toutes les communications entre l'app et nos serveurs sont chiffrées (HTTPS/TLS 1.3)
- L'authentification passe par Sign in with Apple (0 mot de passe manipulé côté Mappies)
- Les règles Firebase Firestore et Storage isolent strictement les données par utilisateur (`request.auth.uid == userId`)

## 10. Enfants

Mappies n'est pas conçu pour les moins de 13 ans. Nous ne collectons pas sciemment de données auprès d'enfants.

## 11. Modifications de cette politique

Cette politique peut évoluer. En cas de changement matériel, nous notifions par email les utilisateurs actifs 14 jours avant l'entrée en vigueur.

## 12. Contact

Toute question, demande RGPD ou signalement :
**hesserobin1234@gmail.com**
