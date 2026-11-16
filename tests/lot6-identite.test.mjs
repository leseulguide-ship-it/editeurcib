// Lot 6 : identité CiB (A3 coordonnées et en-tête, A5 modèles, A6 images, A9 gestion des documents).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { demarrer, modele, telecharger, choisirFichier, attendrePret, ouvrirDocument, pause, RACINE } from "./outils.mjs";

let E;
before(async () => { E = await demarrer(); });
after(async () => { await E.fin(); });
const LOGO = join(RACINE, "img", "logo-cib.png");

async function remplirCoordonnees(p) {
  await p.click("#b-coord");
  await p.waitForSelector(".form-coord");
  const val = { nom: "Jean MBARGA", fonction: "Gérant", entreprise: "BATIR PLUS SARL", adresse: "BP 1234, Akwa", ville: "Douala", tel: "6 99 00 00 00", email: "contact@batirplus.cm", mentions: "RC/DLA/2020/B/123" };
  for (const [k, v] of Object.entries(val)) await p.fill(`.form-coord input[data-cle="${k}"]`, v);
  await p.click('.form-coord button:has-text("Logo CiB")');
  await p.waitForFunction(() => document.querySelector(".form-coord .img-champ img").src.startsWith("data:image/png"));
  // Signature scannée
  const [fc] = await Promise.all([p.waitForEvent("filechooser"), p.locator(".form-coord label", { hasText: "Signature" }).locator("button", { hasText: "Choisir" }).click()]);
  await fc.setFiles(LOGO);
  await p.waitForFunction(() => document.querySelectorAll(".form-coord .img-champ img:not(.hidden)").length === 2);
  await p.click('.dlg-boutons [data-valeur="ok"]');
}

test("A5 : les 7 nouveaux modèles existent et s’ouvrent", async () => {
  const p = await E.page();
  for (const nom of ["Devis", "Facture", "Mise en demeure", "PV de réception des travaux", "Ordre de service", "Attestation de bonne exécution", "Relance de paiement"]) {
    await p.locator(".modele", { has: p.locator("b", { hasText: new RegExp("^" + nom + "$") }) }).click();
    await p.waitForSelector("#editeur:not(.hidden)");
    assert.ok((await p.locator("#page").innerText()).length > 200, nom);
    assert.ok(await p.locator("#page .champ").count() > 3, nom + " : champs");
    await p.click("#vers-accueil"); await p.waitForSelector("#accueil:not(.hidden)");
  }
  await p.context().close();
});

test("A5 : devis avec montants, TVA et totaux calculés ; nouvelle ligne avec Tab ou le menu", async () => {
  const p = await E.page();
  await p.locator(".modele", { has: p.locator("b", { hasText: /^Devis$/ }) }).click();
  await p.evaluate(() => { const r = document.createRange(); const td = document.querySelectorAll('#page [data-calc="qte"]')[0]; r.selectNodeContents(td); getSelection().removeAllRanges(); getSelection().addRange(r); });
  await p.keyboard.type("12");
  await p.keyboard.press("Tab"); await p.keyboard.type("2 500");
  await p.keyboard.press("Tab"); await pause(400);
  const v = async c => (await p.locator(`#page [data-calc="${c}"]`).first().innerText()).trim();
  assert.equal(await v("montant"), "30 000");
  assert.equal(await v("ht"), "30 000");
  assert.equal(await v("tva"), "5 775");
  assert.equal(await v("ttc"), "35 775");
  // Tab dans la case Montant de la dernière ligne : ligne 4.
  await p.locator('#page [data-calc="montant"]').nth(2).click();
  await p.keyboard.press("Tab");
  assert.equal(await p.locator('#page [data-calc="qte"]').count(), 4);
  assert.equal((await p.locator('#page table[data-calcul] tr').nth(4).locator("td").first().innerText()).trim(), "4");
  // Menu : supprimer la ligne courante.
  await p.click("#b-menu");
  await p.click('#menu [data-clic="#b-ligne-moins"]');
  assert.equal(await p.locator('#page [data-calc="qte"]').count(), 3);
  // L'export Word garde le tableau et les totaux.
  await p.evaluate(() => document.querySelectorAll("#page .champ").forEach(c => c.replaceWith("x")));
  const f = await telecharger(p, () => p.click("#b-docx"));
  assert.match(f.nom, /\.docx$/);
  await p.context().close();
});

test("A3 : mes coordonnées remplissent les documents, avec papier à en-tête et signature", async () => {
  const p = await E.page();
  await remplirCoordonnees(p);
  await p.waitForFunction(() => /BATIR PLUS SARL/.test(document.querySelector("#coord-resume").textContent));
  await p.reload(); await attendrePret(p);
  assert.match(await p.locator("#coord-resume").innerText(), /BATIR PLUS SARL, Jean MBARGA/);
  await modele(p, "Lettre de demande");
  const h = await p.locator("#page").innerHTML();
  assert.match(h, /^<table class="sans-bordure entete">.*<img src="data:image\/png[^>]+alt="Logo"/);
  assert.match(h, /BATIR PLUS SARL/);
  assert.match(h, /Jean MBARGA, Gérant/);
  assert.match(h, /Fait à Douala, le/);
  assert.ok(!h.includes("[Prénom NOM]"), "le nom est rempli");
  assert.match(h, /<img src="data:image\/png[^"]*" alt="Signature"/);
  // Le destinataire reste à remplir.
  assert.ok(h.includes("[Nom ou fonction du destinataire]"));
  // Export : logo et signature deviennent des images Word.
  await p.evaluate(() => document.querySelectorAll("#page .champ").forEach(c => c.replaceWith("x")));
  const f = await telecharger(p, () => p.click("#b-docx"));
  const n = await p.evaluate(async b64 => Object.keys((await JSZip.loadAsync(b64, { base64: true })).files).filter(k => /^word\/media\/.+\.(png|jpeg)$/.test(k)).length, f.contenu.toString("base64"));
  assert.equal(n, 2);
  // La sauvegarde contient les coordonnées.
  await p.click("#vers-accueil");
  const s = await telecharger(p, () => p.click("#b-sauvegarder"));
  assert.equal(JSON.parse(s.contenu.toString("utf8")).reglages.coordonnees.entreprise, "BATIR PLUS SARL");
  await p.context().close();
});

test("A6 : insérer une image, la redimensionner, la supprimer", async () => {
  const p = await E.page();
  await modele(p, "Page vierge");
  await p.keyboard.type("Photo du chantier : ");
  const [fc] = await Promise.all([p.waitForEvent("filechooser"), p.click("#b-image")]);
  await fc.setFiles(LOGO);
  await p.waitForSelector("#page img");
  await p.click("#page img");
  await p.waitForSelector("#barre-image:not(.hidden)");
  await p.click('#barre-image [data-taille="120"]');
  assert.equal(await p.evaluate(() => document.querySelector("#page img").style.width), "120px");
  // La marque de sélection n'est pas enregistrée.
  await p.evaluate(() => window.EditeurCiB.sauver());
  const html = await p.evaluate(async () => { const d = window.EditeurCiB.depot(); const l = await d.liste(); return (await d.lire(l[0].id)).html; });
  assert.ok(!html.includes("choisie"));
  await p.click('#barre-image [data-action="suppr"]');
  assert.equal(await p.locator("#page img").count(), 0);
  await p.context().close();
});

test("A9 : rechercher, renommer, dupliquer et supprimer un document", async () => {
  const p = await E.page();
  await modele(p, "Page vierge"); await p.keyboard.type("Chantier de Bonapriso, dalle du deuxième étage");
  await p.click("#vers-accueil");
  await modele(p, "Page vierge"); await p.keyboard.type("Réunion de chantier");
  await p.click("#vers-accueil");
  await p.waitForFunction(() => document.querySelectorAll("#liste .ligne").length === 2);
  // Recherche dans le texte (sans accents).
  await p.fill("#recherche", "deuxieme etage");
  await p.waitForFunction(() => document.querySelectorAll("#liste .ligne").length === 1);
  await p.fill("#recherche", "");
  await p.waitForFunction(() => document.querySelectorAll("#liste .ligne").length === 2);
  // Renommer
  await p.locator("#liste .ligne .plus").nth(1).click();   // le plus ancien : « Chantier de Bonapriso »
  await p.click('.dlg-boutons [data-valeur="renommer"]');
  await p.fill(".boite.dlg input[type=text]", "Dalle Bonapriso");
  await p.keyboard.press("Enter");
  await p.waitForFunction(() => [...document.querySelectorAll("#liste .nom")].some(n => n.textContent === "Dalle Bonapriso"));
  // Dupliquer
  await p.locator("#liste .ligne", { hasText: "Dalle Bonapriso" }).locator(".plus").click();
  await p.click('.dlg-boutons [data-valeur="dupliquer"]');
  await p.waitForFunction(() => document.querySelectorAll("#liste .ligne").length === 3);
  await ouvrirDocument(p, "Dalle Bonapriso (copie)");
  assert.match(await p.locator("#page").innerText(), /deuxième étage/);
  await p.click("#vers-accueil");
  // Supprimer : confirmation demandée, « Annuler » ne supprime rien.
  await p.locator("#liste .ligne", { hasText: "(copie)" }).locator(".plus").click();
  await p.click('.dlg-boutons [data-valeur="supprimer"]');
  await p.click('.dlg-boutons button:has-text("Annuler")');
  assert.equal(await p.locator("#liste .ligne").count(), 3);
  await p.locator("#liste .ligne", { hasText: "(copie)" }).locator(".plus").click();
  await p.click('.dlg-boutons [data-valeur="supprimer"]');
  await p.click('.dlg-boutons .danger');
  await p.waitForFunction(() => document.querySelectorAll("#liste .ligne").length === 2);
  await p.context().close();
});
