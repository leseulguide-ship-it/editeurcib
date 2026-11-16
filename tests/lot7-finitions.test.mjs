// Lot 7 : finitions (B13 suggestions, B14 annuler, B15 code IA retiré, A7 repères de pages).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { demarrer, modele, pause } from "./outils.mjs";

let E;
before(async () => { E = await demarrer(); });
after(async () => { await E.fin(); });
const texte = p => p.evaluate(() => document.querySelector("#page").innerText.replace(/ /g, " ").trim());
const suggestions = p => p.locator("#popup .item .t").allInnerTexts();

test("B13 : pas d’espace avant la virgule après une suggestion ; espace insécable avant « ? »", async () => {
  const p = await E.page();
  await modele(p, "Page vierge");
  await p.keyboard.type("Merci pour votre attent");
  await p.waitForSelector("#popup:not(.hidden)");
  await p.keyboard.press("Tab");           // accepte « attention »
  await p.keyboard.type(", cordialement");
  const t1 = await texte(p);
  assert.match(t1, /votre attent\p{L}+, cordialement$/u);
  assert.ok(!/ ,/.test(t1), t1);
  await p.keyboard.type(" vous pouv");
  await p.waitForSelector("#popup:not(.hidden)");
  await p.keyboard.press("Tab");           // « pouvez »
  await p.keyboard.type("?");
  const h = await p.evaluate(() => document.querySelector("#page").textContent);
  assert.match(h, /pouvez \?$/);
  await p.context().close();
});

test("B13 : meilleur classement (« je souhaite » plutôt que « je souhaiter », « mes sincères »)", async () => {
  const p = await E.page();
  await modele(p, "Page vierge");
  await p.keyboard.type("Je souh");
  await p.waitForSelector("#popup:not(.hidden)");
  const s1 = await suggestions(p);
  assert.notEqual(s1[0], "souhaiter", JSON.stringify(s1));
  assert.ok(s1.includes("souhaite"), JSON.stringify(s1));
  await p.keyboard.press("Escape");
  await p.keyboard.type("e recevoir mes sinc");
  await p.waitForSelector("#popup:not(.hidden)");
  const s2 = await suggestions(p);
  assert.equal(s2[0], "sincères", JSON.stringify(s2));
  await p.context().close();
});

test("B14 : Ctrl+Z annule par mots (pas lettre par lettre), Ctrl+Y rétablit, un champ remplacé revient", async () => {
  const p = await E.page();
  await modele(p, "Lettre de demande");
  await p.keyboard.type("Jean MBARGA");
  await p.keyboard.press("Control+z");
  const premier = await p.evaluate(() => document.querySelector("#page p").textContent.replace(/ /g, " "));
  assert.ok(premier === "Jean " || premier === "Jean", "après 1 annulation : " + premier);
  await p.keyboard.press("Control+z");
  assert.equal(await p.evaluate(() => document.querySelector("#page p").innerHTML), '<span class="champ" spellcheck="false" data-cle="nom">[Prénom NOM]</span>');
  await p.keyboard.press("Control+y");
  await p.keyboard.press("Control+y");
  assert.equal(await p.evaluate(() => document.querySelector("#page p").textContent), "Jean MBARGA");
  // Les boutons de la barre d'outils font de même ; la mise en gras s'annule en une fois.
  await p.keyboard.press("Shift+Home");
  await p.click('.ob[data-cmd="bold"]');
  assert.match(await p.evaluate(() => document.querySelector("#page p").innerHTML), /<b>Jean MBARGA<\/b>/);
  await p.click('.ob[data-cmd="undo"]');
  assert.equal(await p.evaluate(() => document.querySelector("#page p").innerHTML), "Jean MBARGA");
  await p.click('.ob[data-cmd="redo"]');
  assert.match(await p.evaluate(() => document.querySelector("#page p").innerHTML), /<b>Jean MBARGA<\/b>/);
  await p.context().close();
});

test("B15 : plus de bouton ni de raccourci « IA » inutiles", async () => {
  const p = await E.page();
  await modele(p, "Page vierge");
  assert.equal(await p.locator("#b-ia").count(), 0);
  const html = await p.content();
  assert.ok(!/continuerIA|Continuer la phrase|suggestion IA/.test(html));
  await p.keyboard.type("Bonjour");
  await p.keyboard.press("Control+Space");
  assert.equal(await texte(p), "Bonjour");
  await p.context().close();
});

test("A7 : repères de fin de page A4, cohérents avec l’impression", async () => {
  const p = await E.page();
  await modele(p, "Page vierge");
  await p.evaluate(() => {
    const t = "Paragraphe de démonstration pour remplir la page et vérifier où tombent les fins de page à l’impression. ";
    document.querySelector("#page").innerHTML = Array.from({ length: 45 }, (_, i) => `<p>${i + 1}. ${t.repeat(3)}</p>`).join("") + '<hr class="saut-page"><p>Après le saut</p>';
    document.querySelector("#page").dispatchEvent(new Event("input"));
  });
  await pause(600);
  const pages = +(await p.evaluate(() => document.querySelector("#reperes").dataset.pages));
  const reperes = await p.locator("#reperes .repere span").allInnerTexts();
  assert.ok(reperes.length >= 2, JSON.stringify(reperes));
  assert.equal(reperes[0], "Page 2");
  const pdf = await p.pdf({ preferCSSPageSize: true });
  const pagesPdf = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  assert.equal(pages, pagesPdf, `repères : ${pages} pages, impression : ${pagesPdf} pages`);
  // Sur téléphone (page plus étroite), pas de repères.
  await p.setViewportSize({ width: 390, height: 800 }); await pause(600);
  assert.equal(await p.locator("#reperes .repere").count(), 0);
  await p.context().close();
});
