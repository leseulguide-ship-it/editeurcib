// Lot 2 : champs à remplir fiables (B3, B4, T5, A2).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { demarrer, modele, telecharger, pause } from "./outils.mjs";

let E;
before(async () => { E = await demarrer(); });
after(async () => { await E.fin(); });

test("B3 : le texte tapé juste après un champ ne rentre plus dans le champ", async () => {
  const p = await E.page();
  await modele(p, "Lettre de demande");
  const objet = p.locator("#page .champ", { hasText: "objet de la demande" });
  const bb = await objet.boundingBox();
  await p.mouse.click(bb.x + bb.width + 60, bb.y + bb.height / 2);
  await p.keyboard.type(" urgente");
  const html = await p.locator("#page p", { hasText: "Objet" }).innerHTML();
  assert.match(html, /<span class="champ"[^>]*>\[objet de la demande\]<\/span> urgente/);
  // Curseur placé à la main à la fin du texte du champ (cas du téléphone).
  await p.evaluate(() => {
    const c = [...document.querySelectorAll("#page .champ")].find(c => c.textContent === "[Organisme]");
    const r = document.createRange(); r.setStart(c.firstChild, c.firstChild.length); r.collapse(true);
    getSelection().removeAllRanges(); getSelection().addRange(r);
  });
  await p.keyboard.type(" du Littoral");
  const org = await p.evaluate(() => [...document.querySelectorAll("#page p")].find(p => p.textContent.includes("Organisme")).innerHTML);
  assert.match(org, /\[Organisme\]<\/span> du Littoral$/);
  // Le texte suivant continue au bon endroit.
  await p.keyboard.type("!");
  assert.match(await p.evaluate(() => [...document.querySelectorAll("#page p")].find(p => p.textContent.includes("Organisme")).textContent), /\[Organisme\] du Littoral!$/);
  await p.context().close();
});

test("B3 : remplacer un champ sélectionné garde un texte normal", async () => {
  const p = await E.page();
  await modele(p, "Lettre de demande");
  await p.keyboard.type("Jean MBARGA");
  const premier = await p.evaluate(() => document.querySelector("#page p").innerHTML);
  assert.equal(premier, "Jean MBARGA");
  await p.context().close();
});

test("B4 : le style du champ recopié par le clavier du téléphone est retiré", async () => {
  const p = await E.page();
  await modele(p, "Lettre de demande");
  // Ce que produisait Gboard en remplaçant [Prénom NOM].
  await p.evaluate(() => {
    const para = document.querySelector("#page p");
    para.innerHTML = '<font color="#5a4a12"><span style="background-color: rgb(252, 239, 196);">Jean</span></font>';
    document.querySelector("#page").dispatchEvent(new InputEvent("input", { inputType: "insertText", data: "n", bubbles: true }));
  });
  assert.equal(await p.evaluate(() => document.querySelector("#page p").innerHTML), "Jean");
  // Prévention : le champ n'a plus ni couleur de texte ni « background-color » que le navigateur pourrait recopier.
  const st = await p.evaluate(() => {
    const c = document.querySelector("#page .champ"), cs = getComputedStyle(c), pcs = getComputedStyle(c.parentElement);
    return { couleur: cs.color === pcs.color, fond: cs.backgroundColor };
  });
  assert.equal(st.couleur, true);
  assert.equal(st.fond, "rgba(0, 0, 0, 0)");
  await p.context().close();
});

test("T5 : pas de correcteur orthographique sur les champs (menu Android gênant)", async () => {
  const p = await E.page();
  await modele(p, "Attestation");
  const n = await p.evaluate(() => [...document.querySelectorAll("#page .champ")].filter(c => c.getAttribute("spellcheck") !== "false").length);
  assert.equal(n, 0);
  await p.context().close();
});

test("A2 : alerte avant export s’il reste des champs, avec accès direct au champ", async () => {
  const p = await E.page();
  await modele(p, "Lettre de demande");
  const total = await p.locator("#page .champ").count();
  await p.click("#b-docx");
  await p.waitForSelector(".voile .dlg-champs");
  assert.match(await p.locator(".boite.dlg h2").innerText(), new RegExp(`Il reste ${total} champs`));
  // Accès direct à un champ de la liste.
  await p.locator(".dlg-champ", { hasText: "[Organisme]" }).click();
  assert.equal(await p.locator(".voile:not(#apropos)").count(), 0);
  assert.equal(await p.evaluate(() => getSelection().toString()), "[Organisme]");
  await p.keyboard.type("Mairie de Douala 1er");
  // Exporter quand même : le fichier est bien produit.
  await p.click("#b-docx");
  assert.match(await p.locator(".boite.dlg h2").innerText(), new RegExp(`Il reste ${total - 1} champs`));
  const f = await telecharger(p, () => p.click('.dlg-boutons [data-valeur="continuer"]'));
  assert.match(f.nom, /\.docx$/);
  // Annuler : rien n'est exporté.
  await p.click("#b-docx");
  await p.keyboard.press("Escape");
  assert.equal(await p.locator(".voile:not(#apropos)").count(), 0);
  await p.context().close();
});

test("A2 : sans champ restant, l’export se fait directement", async () => {
  const p = await E.page();
  await modele(p, "Page vierge");
  await p.keyboard.type("Lettre sans champ");
  const f = await telecharger(p, () => p.click("#b-docx"));
  assert.match(f.nom, /\.docx$/);
  await p.context().close();
});
