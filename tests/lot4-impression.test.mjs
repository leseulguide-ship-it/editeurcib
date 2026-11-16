// Lot 4 : imprimer / PDF (B6, A1).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { demarrer, modele, SORTIES } from "./outils.mjs";

let E;
before(async () => { E = await demarrer(); });
after(async () => { await E.fin(); });

const compterPages = pdf => (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;

test("B6 : à l’impression, seule la page est imprimée, en A4, sans boutons ni surlignage", async () => {
  const p = await E.page();
  await modele(p, "Lettre de demande");
  await p.emulateMedia({ media: "print" });
  const r = await p.evaluate(() => {
    const vis = s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== "none"; };
    const pg = getComputedStyle(document.querySelector("#page")), ch = getComputedStyle(document.querySelector("#page .champ"));
    return { entete: vis("header"), etat: vis("#etat"), page: vis("#page"), ombre: pg.boxShadow, marge: pg.paddingLeft, fond: ch.backgroundImage, bord: ch.borderBottomStyle };
  });
  assert.deepEqual(r, { entete: false, etat: false, page: true, ombre: "none", marge: "0px", fond: "none", bord: "none" });
  await p.emulateMedia({ media: "screen" });
  // Le PDF produit par le navigateur : A4, le saut de page donne bien 2 pages.
  await p.evaluate(() => { document.querySelector("#page").innerHTML = "<p>Page un</p><hr class='saut-page'><p>Page deux</p>"; });
  const pdf = await p.pdf({ preferCSSPageSize: true });
  writeFileSync(join(SORTIES, "impression.pdf"), pdf);
  assert.equal(compterPages(pdf), 2);
  assert.match(pdf.toString("latin1"), /\/MediaBox \[0 0 59[45]\.\d* 84[12]/);
  await p.context().close();
});

test("A1 : bouton « Imprimer / PDF » avec alerte des champs restants, et Ctrl+P", async () => {
  const p = await E.page();
  await p.evaluate(() => { window.__impr = 0; window.print = () => { window.__impr++; }; });
  await modele(p, "Attestation");
  assert.equal(await p.locator("#b-imprimer").isVisible(), true);
  await p.click("#b-imprimer");
  await p.waitForSelector(".boite.dlg");
  assert.match(await p.locator(".boite.dlg").innerText(), /Imprimer quand même/);
  await p.click('.dlg-boutons button:has-text("Annuler")');
  assert.equal(await p.evaluate(() => window.__impr), 0);
  await p.click("#b-imprimer");
  await p.click('.dlg-boutons [data-valeur="continuer"]');
  assert.equal(await p.evaluate(() => window.__impr), 1);
  // Sans champ restant : impression directe, aussi avec Ctrl+P.
  await p.evaluate(() => document.querySelectorAll("#page .champ").forEach(c => c.remove()));
  await p.locator("#page").click();
  await p.keyboard.press("Control+p");
  assert.equal(await p.evaluate(() => window.__impr), 2);
  await p.context().close();
});

test("A1 : dans l’APK Android, l’impression passe par le module natif", async () => {
  const ctx = await E.contexte();
  await ctx.addInitScript(() => {
    window.__natif = [];
    window.Capacitor = { isNativePlatform: () => true, registerPlugin: nom => ({ imprimer: async o => { window.__natif.push([nom, o.titre]); } }), Plugins: {} };
  });
  const p = await E.page(ctx);
  await p.evaluate(() => { window.print = () => { throw new Error("ne doit pas être appelé"); }; });
  await p.click('.modele:has-text("Page vierge")');
  await p.keyboard.type("Bonjour");
  await p.click("#b-imprimer");
  await p.waitForFunction(() => window.__natif.length === 1);
  assert.deepEqual(await p.evaluate(() => window.__natif[0]), ["CibNatif", "Document sans titre"]);
  await ctx.close();
});
