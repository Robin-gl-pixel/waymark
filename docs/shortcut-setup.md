# iOS Shortcut setup — "Ajouter à Mappies"

Ce guide décrit comment créer le Shortcut iOS qui permet de partager un screenshot depuis Photos ou Instagram directement vers Mappies, sans ouvrir l'app.

## Ce que fait le Shortcut

1. Reçoit une image (depuis Photos share sheet ou clipboard)
2. La convertit en base64
3. POST vers `https://europe-west1-mappies-app.cloudfunctions.net/extractFromShortcut`
4. Header : `Authorization: Bearer <TOKEN_PERSO>`
5. Affiche une notification iOS avec le nom du lieu extrait

## Créer le Shortcut

1. Ouvrir **Raccourcis.app** sur iOS 17+
2. Onglet **Mes raccourcis** → bouton `+` en haut à droite
3. Renommer en `Ajouter à Mappies`

### Actions à ajouter (dans l'ordre)

1. **Recevoir une entrée du partage** (activer le glisseur "Show in Share Sheet")
   - Types acceptés : Images uniquement
2. **Encoder en Base 64** (search "base64")
3. **Obtenir le contenu de l'URL**
   - Méthode : POST
   - URL : `https://europe-west1-mappies-app.cloudfunctions.net/extractFromShortcut`
   - Headers :
     - `Authorization`: `Bearer <COLLER_TON_TOKEN_ICI>`
     - `Content-Type`: `application/json`
   - Type de la requête : JSON
   - Corps de la requête :
     ```json
     {
       "imageBase64": "[Résultat encodé en Base 64]",
       "mediaType": "image/png"
     }
     ```
     Le champ `imageBase64` doit référencer la variable magique du résultat Base64 (touche longue → variables)
4. **Obtenir la valeur du dictionnaire pour la clé** : clé = `name` sur le contenu de l'URL
5. **Afficher la notification**
   - Titre : `Ajouté à Mappies`
   - Corps : `[valeur du dictionnaire]`

### Options du Shortcut (haut de l'éditeur)

- Ajouter à la feuille de partage : ✅ activé
- Types acceptés : Images
- Utiliser Face ID : ❌ désactivé (sinon friction inutile)

## Récupérer ton token

1. Ouvrir Mappies → onglet **Réglages** → section **Ajout rapide depuis Photos**
2. Le token perso s'affiche → bouton **Copier**
3. Le coller dans le champ `Authorization` du Shortcut à la place de `<COLLER_TON_TOKEN_ICI>`

Le token ressemble à `a3f2b1c8e4d5f6...` (64 caractères hex).

**En cas de fuite** : bouton **Régénérer** dans Réglages Mappies → l'ancien token est invalidé, tu mets le nouveau dans le Shortcut.

## Publication et partage (post-V1)

Une fois le Shortcut testé, l'ouvrir dans Raccourcis.app → bouton **Partager** → **Copier le lien iCloud**. Ce lien peut être mis dans `SettingsScreen.tsx` (constante `SHORTCUT_ICLOUD_URL`) pour que le bouton "Installer le Shortcut" fasse l'installation en 1 tap chez d'autres utilisateurs.

**Attention** : chaque utilisateur devra tout de même coller SON token perso après installation (le token n'est pas partagé, c'est ce qui identifie le compte).

## Test rapide

1. Depuis Photos, sélectionner un screenshot d'un post Instagram avec un lieu
2. Bouton Partager → **Ajouter à Mappies** dans la grille
3. Attendre la notification "Ajouté à Mappies : {nom du lieu}"
4. Ouvrir Mappies → le lieu doit être dans la liste et sur la carte

## Debugging

- **Notification n'apparaît pas** → l'API a renvoyé une erreur. Ouvrir le Shortcut → dernier run → voir la réponse HTTP.
- **`401 Invalid token`** → token expiré ou mal collé (attention aux espaces).
- **`422 Aucun lieu détecté`** → le screenshot ne contient pas de reco de lieu (Claude n'a rien trouvé).
- **`422 Adresse introuvable`** → Mapbox n'a pas géocodé le nom + ville. Ouvre Mappies pour ajouter le lieu manuellement.
