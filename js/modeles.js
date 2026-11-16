/* EditeurCiB : modèles de documents.
   CiBModeles(o) renvoie la liste des modèles. o fournit :
   - champ(texte, cle) : champ à remplir ; « cle » relie le champ à « Mes coordonnées »
     (nom, fonction, entreprise, adresse, ville, tel, email, mentions, signature) ;
   - droite(html), dateFr() ;
   - avecEntete() : vrai si le papier à en-tête est ajouté (le bloc expéditeur est alors inutile). */
window.CiBModeles = function(o){
"use strict";
const { champ, droite, dateFr } = o;
const p = h => `<p>${h}</p>`, j = h => `<p style="text-align:justify">${h}</p>`, vide = "<p><br></p>";
const centre = h => `<p style="text-align:center">${h}</p>`;

/* Blocs communs */
const particulier = () => o.avecEntete() ? "" :
  p(champ("Prénom NOM","nom")) + p(champ("Adresse","adresse")) + p(champ("Ville","ville")) + p(`${champ("Téléphone","tel")} – ${champ("adresse e-mail","email")}`) + vide;
const entreprise = () => o.avecEntete() ? "" :
  p(`<b>${champ("Nom de l’entreprise","entreprise")}</b>`) + p(`${champ("Adresse","adresse")} – ${champ("Ville","ville")}`) +
  p(`Tél. ${champ("Téléphone","tel")} – ${champ("adresse e-mail","email")}`) + p(champ("RCCM, NIU","mentions")) + vide;
const destinataire = () => droite(champ("Nom ou fonction du destinataire")) + droite(champ("Organisme")) + droite(champ("Adresse du destinataire")) + droite(champ("Ville du destinataire")) + vide;
const lieuDate = () => droite(`Fait à ${champ("Ville","ville")}, le ${dateFr()}`) + vide;
const signature = () => vide + droite(champ("Prénom NOM","nom")) + droite(champ("Signature","signature"));
const signatureFonction = () => vide + droite(`Le ${champ("fonction du signataire","fonction")}`) + droite(champ("Prénom NOM","nom")) + droite(champ("Signature et cachet","signature"));
const salutations = "Je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.";

/* Tableau de prix avec calcul automatique (devis, facture) */
const tableauPrix = () => {
  const ligne = n => `<tr><td style="text-align:center">${n}</td><td>${champ("désignation")}</td><td style="text-align:center">${champ("u")}</td><td data-calc="qte" style="text-align:right">0</td><td data-calc="pu" style="text-align:right">0</td><td data-calc="montant" contenteditable="false" style="text-align:right">0</td></tr>`;
  const total = (libelle, cle, gras) => `<tr><td colspan="5" style="text-align:right">${gras ? "<b>" + libelle + "</b>" : libelle}</td><td data-calc="${cle}" contenteditable="false" style="text-align:right">${gras ? "<b>0</b>" : "0"}</td></tr>`;
  return `<table data-calcul="prix"><tbody>` +
    `<tr><td style="width:7%;text-align:center"><b>N°</b></td><td style="width:38%"><b>Désignation</b></td><td style="width:9%;text-align:center"><b>Unité</b></td><td style="width:12%;text-align:right"><b>Quantité</b></td><td style="width:16%;text-align:right"><b>Prix unitaire</b></td><td style="width:18%;text-align:right"><b>Montant</b></td></tr>` +
    ligne(1) + ligne(2) + ligne(3) +
    total("Total hors taxes (HT)", "ht") + total("TVA (19,25 %)", "tva") + total("Total toutes taxes comprises (TTC)", "ttc", true) +
    `</tbody></table>` + p(`<i>Montants en francs CFA.</i>`);
};
const client = () => p(`<b>Client :</b> ${champ("nom du client")}`) + p(`Adresse : ${champ("adresse du client")} – Tél. : ${champ("téléphone du client")}`);
const cases = liste => `<ul>${liste.map(x=>`<li>☐ ${x}</li>`).join("")}</ul>`;
const signatures3 = (a, b, c) => `<table class="sans-bordure"><tbody><tr>${[a,b,c].map(x=>`<td style="text-align:center"><b>${x}</b><br>(nom, signature et cachet)<br><br><br></td>`).join("")}</tr></tbody></table>`;

return [
  { id:"vierge", nom:"Page vierge", desc:"Commencez de zéro.", titre:"Document sans titre", html:()=>vide },

  { id:"devis", aide:true, nom:"Devis", desc:"Chiffrer des travaux ou une prestation, avec totaux calculés.", titre:"Devis",
    html:()=> entreprise() + `<h1 style="text-align:center">DEVIS N° ${champ("numéro")}</h1>` + lieuDate() + client() +
      p(`<b>Objet :</b> ${champ("objet des travaux ou de la prestation")}`) + p(`<b>Lieu des travaux :</b> ${champ("adresse du chantier")}`) + vide +
      tableauPrix() +
      j(`Arrêté le présent devis à la somme de ${champ("montant TTC en lettres")} francs CFA toutes taxes comprises.`) +
      p(`<b>Conditions :</b> devis valable ${champ("30")} jours ; acompte de ${champ("40")} % à la commande, solde ${champ("à la réception des travaux")} ; délai d’exécution : ${champ("délai")}.`) +
      signatureFonction() + vide + p(`<b>Bon pour accord du client</b> (date, signature et mention « lu et approuvé ») :`) },

  { id:"facture", aide:true, nom:"Facture", desc:"Facturer des travaux ou une prestation, avec totaux calculés.", titre:"Facture",
    html:()=> entreprise() + `<h1 style="text-align:center">FACTURE N° ${champ("numéro")}</h1>` + lieuDate() + client() +
      p(`<b>Objet :</b> ${champ("objet de la facture")}`) + p(`<b>Référence :</b> devis ou bon de commande n° ${champ("numéro")} du ${champ("date")}`) + vide +
      tableauPrix() +
      j(`Arrêtée la présente facture à la somme de ${champ("montant TTC en lettres")} francs CFA toutes taxes comprises.`) +
      p(`<b>Paiement :</b> ${champ("virement, chèque ou espèces")} au plus tard le ${champ("date d’échéance")}.`) +
      p(`<b>Coordonnées bancaires :</b> ${champ("banque, numéro de compte")}`) + signatureFonction() },

  { id:"demande", nom:"Lettre de demande", desc:"Solliciter un document, une autorisation, un service.", titre:"Lettre de demande",
    html:()=> particulier() + destinataire() + lieuDate() +
      p(`<b>Objet : demande de ${champ("objet de la demande")}</b>`) + vide + p("Madame, Monsieur,") +
      j(`J’ai l’honneur de solliciter de votre haute bienveillance ${champ("décrivez précisément votre demande")}.`) +
      j(`En effet, ${champ("exposez le contexte et les raisons de votre demande")}.`) +
      j(`Vous trouverez ci-joint les pièces justificatives nécessaires. Je reste à votre disposition pour tout renseignement complémentaire.`) +
      j(`Dans l’attente d’une suite favorable, je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.`) + signature() },

  { id:"reclamation", nom:"Lettre de réclamation", desc:"Contester une facture, signaler un problème.", titre:"Lettre de réclamation",
    html:()=> particulier() + destinataire() + lieuDate() +
      p(`<b>Objet : réclamation concernant ${champ("objet de la réclamation")}</b>`) + p(`Référence : ${champ("numéro de dossier, de facture ou de client")}`) + vide + p("Madame, Monsieur,") +
      j(`Le ${champ("date")}, ${champ("décrivez les faits : achat, service, incident")}.`) +
      j(`Or, ${champ("expliquez le problème constaté")}. Cette situation me cause un préjudice, car ${champ("conséquences pour vous")}.`) +
      j(`Je vous demande donc de bien vouloir ${champ("ce que vous attendez : remboursement, réparation, correction")}. Sans réponse de votre part dans un délai de ${champ("quinze")} jours, je me verrai contraint(e) d’engager les démarches nécessaires.`) +
      j(salutations) + signature() },

  { id:"attestation", nom:"Attestation sur l’honneur", desc:"Certifier une situation ou un fait.", titre:"Attestation sur l’honneur",
    html:()=> vide + `<h1 style="text-align:center">Attestation sur l’honneur</h1>` + vide +
      j(`Je soussigné(e) ${champ("Prénom NOM","nom")}, né(e) le ${champ("date de naissance")} à ${champ("lieu de naissance")}, demeurant à ${champ("adresse","adresse")}, titulaire de la pièce d’identité n° ${champ("numéro")},`) +
      j(`atteste sur l’honneur que ${champ("énoncez le fait que vous certifiez")}.`) + vide +
      j(`Je suis informé(e) que toute fausse déclaration m’expose à des poursuites.`) +
      j(`Fait pour servir et valoir ce que de droit.`) + vide + lieuDate() + signature() },

  { id:"relance", nom:"Relance de paiement", desc:"Rappeler poliment une facture impayée.", titre:"Relance de paiement",
    html:()=> entreprise() + destinataire() + lieuDate() +
      p(`<b>Objet : relance – facture n° ${champ("numéro")} du ${champ("date de la facture")}</b>`) + p(`Référence client : ${champ("référence")}`) + vide + p("Madame, Monsieur,") +
      j(`Sauf erreur ou omission de notre part, nous constatons que la facture n° ${champ("numéro")} du ${champ("date de la facture")}, d’un montant de ${champ("montant")} francs CFA TTC, relative à ${champ("objet de la facture")}, demeure impayée à ce jour, alors que son échéance était fixée au ${champ("date d’échéance")}.`) +
      j(`Nous vous remercions de bien vouloir procéder à son règlement dans les meilleurs délais, par ${champ("mode de paiement")}. Vous trouverez ci-joint une copie de cette facture.`) +
      j(`Si votre paiement a été effectué entre-temps, nous vous prions de ne pas tenir compte de ce courrier.`) +
      j(`Dans l’attente de votre règlement, nous vous prions d’agréer, Madame, Monsieur, l’expression de nos salutations distinguées.`) + signatureFonction() },

  { id:"demeure", nom:"Mise en demeure", desc:"Exiger l’exécution d’une obligation avant d’agir en justice.", titre:"Mise en demeure",
    html:()=> entreprise() + destinataire() + lieuDate() +
      p(`<b>Lettre recommandée avec accusé de réception</b>`) + p(`<b>Objet : mise en demeure de ${champ("payer, achever les travaux, livrer…")}</b>`) + vide + p("Madame, Monsieur,") +
      j(`Par ${champ("contrat, devis ou bon de commande")} du ${champ("date")}, vous vous êtes engagé(e) à ${champ("décrivez l’obligation : payer la somme de…, réaliser…")}.`) +
      j(`À ce jour, ${champ("décrivez le manquement constaté")}, et ce malgré ${champ("nos relances du … / nos appels")}.`) +
      j(`Par la présente, nous vous mettons en demeure de ${champ("ce que vous exigez précisément")} dans un délai de ${champ("huit")} jours à compter de la réception de ce courrier.`) +
      j(`À défaut, nous nous verrons contraints de saisir la juridiction compétente afin d’obtenir ${champ("l’exécution forcée, le paiement, des dommages et intérêts")}, sans autre avis de notre part. Les frais engagés resteront à votre charge.`) +
      j(`Veuillez agréer, Madame, Monsieur, l’expression de nos salutations distinguées.`) + signatureFonction() },

  { id:"reception", nom:"PV de réception des travaux", desc:"Constater la fin des travaux, avec ou sans réserves.", titre:"Procès-verbal de réception des travaux",
    html:()=> `<h1 style="text-align:center">PROCÈS-VERBAL DE RÉCEPTION DES TRAVAUX</h1>` + centre(`Marché / contrat n° ${champ("numéro")} du ${champ("date")}`) + vide +
      p(`<b>Objet des travaux :</b> ${champ("nature des travaux")}`) + p(`<b>Lieu :</b> ${champ("adresse du chantier")}`) +
      p(`<b>Maître d’ouvrage :</b> ${champ("nom du maître d’ouvrage")}`) + p(`<b>Entreprise :</b> ${champ("Nom de l’entreprise","entreprise")}`) +
      p(`<b>Maître d’œuvre / bureau de contrôle :</b> ${champ("nom")}`) + vide +
      j(`Le ${champ("date de la visite")}, les parties soussignées se sont réunies sur le chantier pour procéder, de manière contradictoire, aux opérations de réception des travaux désignés ci-dessus.`) +
      j(`Après visite des ouvrages, il est constaté que (cochez la case correspondante) :`) +
      cases([`les travaux sont reçus <b>sans réserve</b> ;`, `les travaux sont reçus <b>avec les réserves</b> listées ci-dessous, à lever avant le ${champ("date")} ;`, `la réception est <b>refusée</b> pour les motifs suivants : ${champ("motifs")}.`]) +
      `<table><tbody><tr><td style="width:8%;text-align:center"><b>N°</b></td><td style="width:62%"><b>Réserve constatée</b></td><td style="width:30%"><b>Délai de levée</b></td></tr>` +
      [1,2,3].map(n=>`<tr><td style="text-align:center">${n}</td><td><br></td><td><br></td></tr>`).join("") + `</tbody></table>` +
      j(`La date d’effet de la réception, point de départ des garanties, est fixée au ${champ("date")}.`) +
      j(`Fait en ${champ("trois")} exemplaires originaux, à ${champ("Ville","ville")}, le ${dateFr()}.`) + vide +
      signatures3("Le maître d’ouvrage", "L’entreprise", "Le maître d’œuvre") },

  { id:"ordre", nom:"Ordre de service", desc:"Ordonner le démarrage, l’arrêt ou la reprise des travaux.", titre:"Ordre de service",
    html:()=> `<h1 style="text-align:center">ORDRE DE SERVICE N° ${champ("numéro")}</h1>` + vide +
      p(`<b>Marché / contrat n° :</b> ${champ("numéro")} du ${champ("date")}`) + p(`<b>Objet du marché :</b> ${champ("objet")}`) +
      p(`<b>Maître d’ouvrage :</b> ${champ("nom du maître d’ouvrage")}`) + p(`<b>Titulaire :</b> ${champ("nom de l’entreprise")}`) + vide +
      p(`<b>Nature de l’ordre</b> (cochez la case correspondante) :`) +
      cases(["démarrage des travaux", "arrêt des travaux", "reprise des travaux", "travaux supplémentaires ou modificatifs", `autre : ${champ("précisez")}`]) +
      j(`Il est prescrit à l’entreprise ${champ("nom de l’entreprise")} de ${champ("décrivez précisément ce qui est ordonné")} à compter du ${champ("date")}.`) +
      p(`<b>Délai d’exécution :</b> ${champ("délai")}`) + p(`<b>Incidence financière :</b> ${champ("aucune / montant en francs CFA")}`) + vide +
      lieuDate() + droite(`<b>Le maître d’ouvrage</b>`) + droite(champ("Prénom NOM, signature et cachet")) + vide +
      p(`<b>Reçu notification le</b> ${champ("date")}`) + p(`L’entreprise (nom, signature et cachet) :`) },

  { id:"bonne-execution", nom:"Attestation de bonne exécution", desc:"Attester que des travaux ont été bien réalisés.", titre:"Attestation de bonne exécution",
    html:()=> vide + `<h1 style="text-align:center">ATTESTATION DE BONNE EXÉCUTION</h1>` + vide +
      j(`Je soussigné(e) ${champ("Prénom NOM du signataire")}, ${champ("fonction")} de ${champ("organisme, maître d’ouvrage")}, atteste que l’entreprise ${champ("Nom de l’entreprise","entreprise")}, sise ${champ("adresse de l’entreprise","adresse")}, a réalisé pour notre compte les travaux suivants :`) +
      `<ul><li><b>Nature des travaux :</b> ${champ("nature des travaux")}</li><li><b>Lieu :</b> ${champ("lieu")}</li><li><b>Contrat / marché :</b> n° ${champ("numéro")} du ${champ("date")}</li><li><b>Montant :</b> ${champ("montant")} francs CFA TTC</li><li><b>Période d’exécution :</b> du ${champ("date de début")} au ${champ("date de fin")}</li></ul>` +
      j(`Ces travaux ont été exécutés conformément aux règles de l’art et aux prescriptions du contrat, dans les délais convenus, à notre entière satisfaction.`) +
      j(`La présente attestation est délivrée pour servir et valoir ce que de droit.`) + vide +
      droite(`Fait à ${champ("Ville")}, le ${dateFr()}`) + vide + droite(`<b>Le ${champ("fonction du signataire")}</b>`) + droite(champ("Prénom NOM, signature et cachet")) },

  { id:"motivation", nom:"Lettre de motivation", desc:"Accompagner une candidature à un emploi ou un stage.", titre:"Lettre de motivation",
    html:()=> particulier() + destinataire() + lieuDate() +
      p(`<b>Objet : candidature au poste de ${champ("intitulé du poste")}</b>`) + vide + p("Madame, Monsieur,") +
      j(`Votre annonce parue ${champ("où et quand")} a retenu toute mon attention. ${champ("Ce qui vous attire dans l’entreprise")}.`) +
      j(`Titulaire d’un ${champ("diplôme")}, j’ai acquis une expérience en ${champ("domaine")} au cours de ${champ("expériences principales")}. J’y ai développé ${champ("compétences clés")}.`) +
      j(`Rejoindre votre équipe me permettrait de ${champ("ce que vous apporterez")}.`) +
      j(`Je me tiens à votre disposition pour un entretien à votre convenance. Je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.`) + signature() },

  { id:"conge", nom:"Demande de congé", desc:"Demander un congé ou une permission d’absence.", titre:"Demande de congé",
    html:()=> particulier() + destinataire() + lieuDate() +
      p(`<b>Objet : demande de ${champ("congé annuel / permission d’absence")}</b>`) + vide + p("Madame, Monsieur,") +
      j(`J’ai l’honneur de solliciter un ${champ("type de congé")} du ${champ("date de début")} au ${champ("date de fin")} inclus, soit ${champ("nombre")} jours.`) +
      j(`Cette demande est motivée par ${champ("motif")}. J’ai pris soin d’organiser la continuité de mes tâches avec ${champ("collègue")}.`) +
      j(`Je vous remercie par avance de l’attention que vous porterez à ma demande et vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations respectueuses.`) + signature() },

  { id:"explication", nom:"Demande d’explication", desc:"Demander par écrit des explications sur des faits.", titre:"Demande d’explication",
    html:()=> (o.avecEntete() ? "" : p(champ("Nom de l’organisme","entreprise")) + p(champ("Service")) + vide) + droite(`À ${champ("Prénom NOM, fonction")}`) + vide + lieuDate() +
      p(`<b>Objet : demande d’explication</b>`) + vide + p(`${champ("Madame / Monsieur")},`) +
      j(`Il m’a été rapporté que le ${champ("date")}, ${champ("décrivez les faits de manière précise et neutre")}.`) +
      j(`Ces faits constituent ${champ("manquement constaté")}. Je vous demande de bien vouloir me fournir, par écrit et dans un délai de ${champ("48 heures")}, toutes les explications utiles sur ces faits.`) +
      j(`Veuillez agréer, ${champ("Madame / Monsieur")}, l’expression de mes salutations distinguées.`) + signatureFonction() }
];
};
