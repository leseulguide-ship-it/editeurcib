# Avancement : finalisation d'EditeurCiB avant publication

Branche de travail : `perfectionnement` (rien sur `main`, aucun tag, aucune version, aucun secret).
Base : l'audit (bugs B1 à B15, téléphone T1 à T8, améliorations A1 à A10).
Règle : chaque bug corrigé a un test automatique (`npm test`). Tous les tests doivent être verts avant de passer au lot suivant.
Après chaque lot : commit en français + envoi de la branche `perfectionnement` sur GitHub.

## Organisation technique choisie
- `index.html` : interface. Code séparé en fichiers dans `js/` : `stockage.js` (enregistrement des documents), `word.js` (ouverture et export Word), `modeles.js` (modèles de courriers).
- Tests automatiques dans `tests/` (Edge piloté par playwright-core), lancés par `npm test`.
- Android : petit module natif `CibNatif` (Java) pour imprimer / PDF ; ouverture « Ouvrir avec » et enregistrement direct comme dans pdf_cib.

## Plan (dans l'ordre)
| Lot | Contenu | État |
|---|---|---|
| 1 | Ne jamais perdre de travail : B1, B11, stockage IndexedDB (fichiers natifs sous Android), enregistrement automatique fiable, alerte visible, A8 sauvegarde/restauration | fait (8 tests) |
| 2 | Champs fiables : B3, B4, T5, A2 | fait (6 tests + émulateur) |
| 3 | Export Word fiable : B2, B7, B8, B9, B10, A10, A4 (+ meilleure ouverture des .docx) | fait (5 tests + Word) |
| 4 | Imprimer / PDF : B6, A1 | fait (3 tests + émulateur) |
| 5 | Téléphone : T1, T2, T3, T4, T6, T7, T8, B12 | fait (8 tests + émulateur) |
| 6 | Identité CiB : A3, A6, A5, A9 | fait (5 tests + Word) |
| 7 | Finitions : B13, B14, B15, A7 | en cours |
| Fin | Vérification complète ordinateur + émulateur, construction web et APK, rapport | à faire |

## Journal
- Lot 1 fait : `js/stockage.js` (IndexedDB / fichiers Android / mémoire), un enregistrement par document, reprise automatique des anciens documents localStorage, copie de secours à la fermeture, alerte rouge + nouvel essai toutes les 5 s, impossible de quitter l'éditeur tant que ce n'est pas enregistré, copie automatique si le même document est modifié dans 2 onglets, « Sauvegarder tout » / « Restaurer » (fichier .json). Tests : `tests/lot1-enregistrement.test.mjs`.
- Lot 2 fait : texte tapé avant/après un champ ressort du champ (curseur conservé), style recopié par le clavier retiré + champ stylé sans couleur ni « background-color », pas de correcteur sur les champs, nettoyage différé pendant la saisie du clavier Android, fenêtre « Il reste N champs à remplir » avant export (accès direct à chaque champ, « Exporter quand même », « Annuler »). Vérifié dans l'émulateur (saisie clavier dans et après un champ). Tests : `tests/lot2-champs.test.mjs`.
- Lot 3 fait : nouveau `js/word.js`. Export : gras/italique/souligné/barré, couleurs, surlignage, polices, tailles, alignements, retraits, listes à plusieurs niveaux avec numérotation propre à chaque liste, tableaux avec cases fusionnées (horizontal et vertical) et largeurs mesurées, sauts de page, images, caractères interdits retirés. Ouverture : lecture directe du Word (alignements, couleurs, polices, tailles, souligné, titres, listes, tableaux fusionnés, images à la bonne taille, sauts de page, en-tête/pied placés au début/fin, zones de texte, notes) avec repli sur mammoth ; message « a été simplifié » (A4). Collage Word nettoyé (A10). Tableau : curseur dans la 1re case, Tab/Maj+Tab entre cases, ligne ajoutée en fin (B10). Bouton « saut de page ». Vérifié : exports ouverts par Word (instance dédiée) → PDF fidèles. Tests : `tests/lot3-word.test.mjs` (le test des vrais documents de Pascal ne tourne que si `DOCS_REELS` désigne leur dossier de copies).
- Lot 4 fait : bouton « Imprimer / PDF » (et Ctrl+P) avec alerte des champs restants ; feuille d'impression A4 (marges 2,5 cm comme l'export Word), sans en-tête/boutons/barre d'état, champs non surlignés, sauts de page respectés. APK : module natif `CibNatifPlugin.java` (impression Android A4, « Enregistrer au format PDF »), vérifié dans l'émulateur. Tests : `tests/lot4-impression.test.mjs`.
- Lot 5 fait : export sur téléphone = choix « Enregistrer dans le téléphone » (APK : Documents/EditeurCiB, sans écraser, comme pdf_cib ; navigateur : téléchargement) ou « Envoyer (WhatsApp, e-mail…) » (T1). « Ouvrir avec EditeurCiB » et « Partager vers EditeurCiB » pour les .docx (filtres Android + `CibNatifPlugin`, démarrage à froid et à chaud) (T2). Clavier ouvert : en-tête et barre d'état masqués (T3). Barre d'outils téléphone sur une ligne + bouton « ⋯ » pour le reste (T4). Accueil téléphone : modèles sur une ligne qui défile, « Vos documents » visible tout de suite (T6). Suggestions en barre au-dessus du clavier (T7). « Exporter .html » rangé dans le menu « ⋯ » (T8). Vignettes recalculées avec ResizeObserver (B12). Manifest : permissions Documents seulement pour Android ≤ 10 (comme pdf_cib), toujours pas d'INTERNET. Vérifié dans l'émulateur : stockage natif (les anciens documents de l'audit ont été repris), fichier dans Documents/EditeurCiB, « Ouvrir avec » à froid et à chaud, clavier + barre de suggestions. Tests : `tests/lot5-telephone.test.mjs`.
- Lot 6 fait : « Mes coordonnées » (nom, fonction, entreprise, mentions RCCM/NIU, adresse, ville, téléphone, e-mail, logo — bouton « Logo CiB » —, signature scannée, case « papier à en-tête »), enregistrées sur l'appareil et dans la sauvegarde ; elles remplissent les champs reliés des nouveaux documents et ajoutent l'en-tête (logo + coordonnées) ; « Insérer mon papier à en-tête » dans le menu ⋯ (A3). Images : bouton image, collage d'image, réduction automatique, barre Petite/Moyenne/Grande/Pleine largeur/Supprimer (A6). Modèles déplacés dans `js/modeles.js` + 7 nouveaux : devis et facture (tableau avec montants, TVA 19,25 % et totaux calculés, cases calculées non modifiables), relance de paiement, mise en demeure, PV de réception des travaux, ordre de service, attestation de bonne exécution (A5). Lignes de tableau : ajout/suppression par le menu ⋯ (utile sur téléphone). Liste des documents : recherche dans le titre et le texte, menu ⋯ par document : ouvrir, renommer, dupliquer, supprimer avec confirmation (A9). Devis vérifié dans Word. Tests : `tests/lot6-identite.test.mjs`.
- Lot 7 commencé.

## Reste à faire / remarques
- Stockage natif Android : vérifié dans l'émulateur (lot 5).
- Mettre à jour CLAUDE.md (dossier `js/`, tests, module natif) à la fin.
