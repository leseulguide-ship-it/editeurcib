# EditeurCiB : contexte pour Claude Code

Réponds toujours en français, simplement : l'utilisateur (Pascal, CiB) n'est pas développeur.

## Le projet
EditeurCiB est le traitement de texte de CiB (modèles de courriers et de documents de chantier, suggestions de mots, ouverture et export Word .docx, impression / PDF, « Mes coordonnées » et papier à en-tête). Créé par Mathias Pascal Ikeng.

Règles à toujours respecter :
- **Tout en français** : interface, messages, commentaires du code, documentation, workflows.
- **Marque CiB** : logo et couleurs CiB (orange `#E16326`, bleu `#007296`), nom « EditeurCiB » et mention « Créé par Mathias Pascal Ikeng ».
- **Hors ligne** : aucune ressource ne doit venir d'Internet (pas de CDN, pas de polices Google, pas d'appel réseau). Bibliothèques dans `lib/`, polices dans `fonts/`. Tout nouveau fichier de l'application doit être ajouté à la liste `FICHIERS` de `sw.js` (et changer `VERSION` pour forcer la mise à jour du cache).
- **Téléphone** : l'interface doit rester utilisable sur un écran de téléphone (tactile, petite largeur) et dans l'APK Android.
- **Ne jamais perdre de travail** : documents enregistrés un par un (IndexedDB, fichiers natifs sous Android), alerte rouge si un enregistrement échoue.
- **Tests** : chaque bug corrigé a un test dans `tests/`. Lancer `npm test` (pilote Microsoft Edge avec playwright-core) ; tout doit être vert avant d'envoyer.

## Organisation
- Racine du dépôt = l'application web : `index.html` (interface : HTML, CSS et l'essentiel du code), `js/` (`stockage.js` : enregistrement des documents et sauvegarde ; `word.js` : ouverture/export .docx et nettoyage du collage ; `modeles.js` : modèles de documents ; `formats.js` : lecture des .odt, .doc et .txt), `sw.js` (cache hors ligne), `manifest.webmanifest` (installation), `img/` (logo `logo-cib.png`, icônes), `fonts/`, `lib/` (`jszip`, `mammoth` en secours).
- `.github/workflows/web.yml` : publie le site sur GitHub Pages à chaque envoi sur `main` (copie seulement `index.html`, `manifest.webmanifest`, `sw.js`, `fonts/`, `img/`, `lib/`, `js/`). Si un fichier ou dossier de l'application est ajouté à la racine, l'ajouter aussi dans ce workflow, dans `scripts/preparer-android.mjs` et dans `FICHIERS` de `sw.js`.
- `tests/` : tests automatiques par lot (`lotN-*.test.mjs`), outils communs (`outils.mjs`), fichier Word d'essai fabriqué (`fabriquer-docx.mjs`). Les sorties vont dans `tests/sorties/` (ignoré par Git). Le test des vrais documents de Pascal ne tourne que si la variable `DOCS_REELS` désigne un dossier de copies (jamais les originaux).
- `AVANCEMENT.md` : journal des travaux de finalisation (plan, lots faits, reste à faire).
- Android (Capacitor 8, appId `com.cib.editeurcib`), même méthode que le projet pdf_cib :
  - `scripts/preparer-android.mjs` (`npm run preparer`) copie l'application dans `www/` (ignoré par Git) et y ajoute les scripts Capacitor (App, Filesystem, Share). Le site web, lui, ne charge pas Capacitor : dans le code, `window.Capacitor` signifie « version Android ».
  - `npm run sync` = préparer + `npx cap sync android`.
  - `android/` : pas de permission INTERNET (volontaire). Seule permission : écrire dans Documents, et seulement pour Android 9 et 10 (`maxSdkVersion="29"`, comme pdf_cib). Export : « Enregistrer dans le téléphone » (Documents/EditeurCiB) ou « Envoyer » (menu Partager). Filtres « Ouvrir avec » / « Partager vers » pour .docx, .doc, .odt et .txt (et `<queries>` pour voir les autres applications de documents). Icônes CiB dans `res/mipmap-*` et écrans de démarrage `res/drawable*/splash.png`, faits à partir de `img/icon-512.png` et `img/icon-maskable-512.png`.
  - Module natif `android/app/src/main/java/com/cib/editeurcib/CibNatifPlugin.java` (enregistré dans `MainActivity.java`) : `imprimer` (impression Android A4, « Enregistrer au format PDF »), l'événement `fichierRecu` (document ouvert ou partagé avec EditeurCiB, ou texte partagé), `ouvrirReglagesDefaut` et `etatParDefaut` (écran « application par défaut »).
  - Version web installée : `file_handlers` dans `manifest.webmanifest` + `launchQueue` dans la page (« Ouvrir avec » sous Windows). Côté page : `Capacitor.registerPlugin("CibNatif")`.
  - Essais dans l'émulateur : après `npm run sync`, passer `webContentsDebuggingEnabled` à `true` dans `android/app/src/main/assets/capacitor.config.json` (fichier régénéré, ignoré par Git) pour inspecter la page ; `npm run sync` le remet à `false`.
  - Signature lue dans `android/keystore.properties` (modèle : `keystore.properties.exemple`) ou dans les variables `CIB_KEYSTORE_PATH`, `CIB_KEYSTORE_PASSWORD`, `CIB_KEY_ALIAS`, `CIB_KEY_PASSWORD`.
- `.github/workflows/construire-apk.yml` : construit `EditeurCiB.apk` signé. Lancement manuel (onglet Actions) ou automatique quand un tag `v*` est envoyé (ex. `v1.0.0`) : l'APK est alors publié dans la page « Releases ». Il faut les 4 secrets du dépôt `CIB_KEYSTORE_BASE64`, `CIB_KEYSTORE_PASSWORD`, `CIB_KEY_ALIAS`, `CIB_KEY_PASSWORD` (mêmes valeurs que pour pdf_cib).

## Environnement de l'utilisateur (Windows)
- Android Studio, SDK dans `%LOCALAPPDATA%\Android\Sdk`, émulateur `Medium_Phone`. Java 21 : `C:\Program Files\Eclipse Adoptium\jdk-21.0.13.9-hotspot` (Gradle 8.14.3 ne supporte pas le Java 25 d'Android Studio ; ne pas changer la version de Gradle).
- Clé de signature : `C:\cib\cle-android\cle-cib.jks`, alias `cib`. NE JAMAIS afficher, écrire dans un fichier suivi par Git, ni envoyer le mot de passe de la clé ou le fichier `.jks`.
- Git : remote `origin` = `https://leseulguide-ship-it@github.com/leseulguide-ship-it/editeurcib.git`. `core.fileMode=false` en local ; `android/gradlew` doit rester en 100755 dans Git. Ne rien envoyer sur GitHub (push, tag) sans l'accord explicite de Pascal.
