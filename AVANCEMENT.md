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
| 5 | Téléphone : T1, T2, T3, T4, T6, T7, T8, B12 | en cours |
| 6 | Identité CiB : A3, A6, A5, A9 | à faire |
| 7 | Finitions : B13, B14, B15, A7 | à faire |
| Fin | Vérification complète ordinateur + émulateur, construction web et APK, rapport | à faire |

## Journal
- Lot 1 fait : `js/stockage.js` (IndexedDB / fichiers Android / mémoire), un enregistrement par document, reprise automatique des anciens documents localStorage, copie de secours à la fermeture, alerte rouge + nouvel essai toutes les 5 s, impossible de quitter l'éditeur tant que ce n'est pas enregistré, copie automatique si le même document est modifié dans 2 onglets, « Sauvegarder tout » / « Restaurer » (fichier .json). Tests : `tests/lot1-enregistrement.test.mjs`.
- Lot 2 fait : texte tapé avant/après un champ ressort du champ (curseur conservé), style recopié par le clavier retiré + champ stylé sans couleur ni « background-color », pas de correcteur sur les champs, nettoyage différé pendant la saisie du clavier Android, fenêtre « Il reste N champs à remplir » avant export (accès direct à chaque champ, « Exporter quand même », « Annuler »). Vérifié dans l'émulateur (saisie clavier dans et après un champ). Tests : `tests/lot2-champs.test.mjs`.
- Lot 3 fait : nouveau `js/word.js`. Export : gras/italique/souligné/barré, couleurs, surlignage, polices, tailles, alignements, retraits, listes à plusieurs niveaux avec numérotation propre à chaque liste, tableaux avec cases fusionnées (horizontal et vertical) et largeurs mesurées, sauts de page, images, caractères interdits retirés. Ouverture : lecture directe du Word (alignements, couleurs, polices, tailles, souligné, titres, listes, tableaux fusionnés, images à la bonne taille, sauts de page, en-tête/pied placés au début/fin, zones de texte, notes) avec repli sur mammoth ; message « a été simplifié » (A4). Collage Word nettoyé (A10). Tableau : curseur dans la 1re case, Tab/Maj+Tab entre cases, ligne ajoutée en fin (B10). Bouton « saut de page ». Vérifié : exports ouverts par Word (instance dédiée) → PDF fidèles. Tests : `tests/lot3-word.test.mjs` (le test des vrais documents de Pascal ne tourne que si `DOCS_REELS` désigne leur dossier de copies).
- Lot 4 fait : bouton « Imprimer / PDF » (et Ctrl+P) avec alerte des champs restants ; feuille d'impression A4 (marges 2,5 cm comme l'export Word), sans en-tête/boutons/barre d'état, champs non surlignés, sauts de page respectés. APK : module natif `CibNatifPlugin.java` (impression Android A4, « Enregistrer au format PDF »), vérifié dans l'émulateur. Tests : `tests/lot4-impression.test.mjs`.
- Lot 5 commencé.

## Reste à faire / remarques
- Stockage natif Android : testé par simulation ; à vérifier dans l'émulateur (vérification finale).
- Mettre à jour CLAUDE.md (dossier `js/`, tests, module natif) à la fin.
