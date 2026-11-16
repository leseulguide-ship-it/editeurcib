// Lot 1 : ne jamais perdre de travail (B1, B11, enregistrement automatique, alerte, sauvegarde A8).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { demarrer, modele, telecharger, choisirFichier, attendrePret, pause, ouvrirDocument } from "./outils.mjs";

let E;
before(async () => { E = await demarrer(); });
after(async () => { await E.fin(); });

const texteDe = p => p.locator("#page").innerText();
const titres = p => p.locator("#liste .ligne .nom").allInnerTexts();

test("enregistrement automatique : le texte tapé est retrouvé après rechargement", async () => {
  const p = await E.page();
  await modele(p, "Page vierge");
  await p.keyboard.type("Bonjour Douala");
  await p.waitForFunction(() => document.querySelector("#enreg").textContent.includes("Enregistré"));
  await p.reload(); await attendrePret(p);
  assert.deepEqual(await titres(p), ["Document sans titre"]);
  await ouvrirDocument(p);
  assert.match(await texteDe(p), /Bonjour Douala/);
  await p.context().close();
});

test("B1 : de gros documents (images) ne bloquent plus l’enregistrement des autres", async () => {
  const p = await E.page();
  // Deux documents de ~6 Mo chacun (l’ancien localStorage saturait vers 5 Mo).
  await p.evaluate(async () => {
    const gros = "<p><img src='data:image/png;base64," + "A".repeat(6 * 1024 * 1024) + "'></p>";
    const d = window.EditeurCiB.depot();
    await d.ecrire({ id: "gros1", titre: "Catalogue 1", html: gros, maj: Date.now() - 2000 });
    await d.ecrire({ id: "gros2", titre: "Catalogue 2", html: gros, maj: Date.now() - 1000 });
  });
  await modele(p, "Page vierge");
  await p.keyboard.type("MODIFICATION IMPORTANTE");
  await p.waitForFunction(() => document.querySelector("#enreg").textContent.includes("Enregistré"));
  assert.equal(await p.locator("#alerte").isHidden(), true);
  await p.reload(); await attendrePret(p);
  const t = await titres(p);
  assert.equal(t.length, 3);
  await ouvrirDocument(p, "Document sans titre");
  assert.match(await texteDe(p), /MODIFICATION IMPORTANTE/);
  await p.context().close();
});

test("B11 : deux onglets sur des documents différents ne s’écrasent plus", async () => {
  const ctx = await E.contexte();
  const p1 = await E.page(ctx), p2 = await E.page(ctx);
  await modele(p2, "Lettre de réclamation"); await p2.keyboard.type("Onglet 2");
  await modele(p1, "Demande de congé"); await p1.keyboard.type("Onglet 1");
  await pause(1500);
  const p3 = await E.page(ctx);
  const t = (await titres(p3)).sort();
  assert.deepEqual(t, ["Demande de congé", "Lettre de réclamation"]);
  await ctx.close();
});

test("B11 : le même document modifié dans deux onglets donne une copie, rien n’est perdu", async () => {
  const ctx = await E.contexte();
  const p1 = await E.page(ctx);
  await modele(p1, "Page vierge"); await p1.keyboard.type("Version commune");
  await pause(1300);
  const p2 = await E.page(ctx);
  await ouvrirDocument(p2);
  await p2.keyboard.press("Control+End"); await p2.keyboard.type(" + onglet 2");
  await pause(1300);
  await p1.keyboard.type(" + onglet 1");
  await pause(1300);
  assert.match(await p1.locator("#alerte").innerText(), /autre onglet/);
  assert.match(await p1.locator("#titre").inputValue(), /\(copie\)/);
  const p3 = await E.page(ctx);
  assert.equal((await titres(p3)).length, 2);
  const contenus = await p3.evaluate(async () => {
    const d = window.EditeurCiB.depot();
    return Promise.all((await d.liste()).map(async m => (await d.lire(m.id)).html));
  });
  assert.ok(contenus.some(h => h.includes("onglet 1")));
  assert.ok(contenus.some(h => h.includes("onglet 2")));
  await ctx.close();
});

test("alerte très visible si l’enregistrement échoue, puis reprise", async () => {
  const p = await E.page();
  await modele(p, "Page vierge");
  await p.evaluate(() => {
    const d = window.EditeurCiB.depot();
    window.__ecrire = d.ecrire; d.ecrire = () => Promise.reject(new Error("QuotaExceededError"));
  });
  await p.keyboard.type("Texte précieux");
  await p.waitForSelector("#alerte:not(.hidden)");
  assert.match(await p.locator("#alerte").innerText(), /n’a pas pu être enregistré/);
  assert.match(await p.locator("#enreg").innerText(), /Non enregistré/);
  // On ne peut pas retourner à l’accueil (et perdre le texte) tant que ce n’est pas enregistré.
  await p.click("#vers-accueil"); await pause(300);
  assert.equal(await p.locator("#editeur").isVisible(), true);
  await p.evaluate(() => { const d = window.EditeurCiB.depot(); d.ecrire = window.__ecrire; });
  await p.click("#b-alerte-reessayer");
  await p.waitForSelector("#alerte.hidden", { state: "attached" });
  assert.match(await p.locator("#enreg").innerText(), /Enregistré/);
  await p.reload(); await attendrePret(p);
  await ouvrirDocument(p);
  assert.match(await texteDe(p), /Texte précieux/);
  await p.context().close();
});

test("les anciens documents (localStorage) sont repris, et la copie de secours est utilisée", async () => {
  const ctx = await E.contexte();
  const p = await ctx.newPage();
  await p.goto(E.srv.url);
  await p.evaluate(() => {
    localStorage.setItem("cib:docs", JSON.stringify({ d1: { titre: "Ancienne lettre", html: "<p>Texte ancien</p>", maj: 1000 } }));
    localStorage.setItem("cib:secours", JSON.stringify({ id: "d2", titre: "Dernière minute", html: "<p>Juste avant la fermeture</p>", maj: 2000 }));
  });
  await p.reload(); await attendrePret(p);
  assert.deepEqual((await titres(p)).sort(), ["Ancienne lettre", "Dernière minute"]);
  assert.equal(await p.evaluate(() => localStorage.getItem("cib:docs")), null);
  assert.equal(await p.evaluate(() => localStorage.getItem("cib:secours")), null);
  await ctx.close();
});

test("A8 : sauvegarder tous les documents dans un fichier puis les restaurer ailleurs", async () => {
  const p = await E.page();
  await modele(p, "Attestation"); await p.keyboard.type("Jean MBARGA");
  await p.click("#vers-accueil");
  await modele(p, "Page vierge"); await p.keyboard.type("Deuxième document");
  await p.click("#vers-accueil");
  const f = await telecharger(p, () => p.click("#b-sauvegarder"));
  assert.match(f.nom, /^Sauvegarde EditeurCiB .*\.json$/);
  const json = JSON.parse(f.contenu.toString("utf8"));
  assert.equal(json.application, "EditeurCiB");
  assert.equal(json.documents.length, 2);
  await p.context().close();

  const neuf = await E.page();
  assert.equal((await titres(neuf)).length, 0);
  await choisirFichier(neuf, "#b-restaurer", f.chemin);
  await neuf.waitForFunction(() => document.querySelectorAll("#liste .ligne").length === 2);
  assert.match(await neuf.locator("#toast").innerText(), /2 documents restaurés/);
  await choisirFichier(neuf, "#b-restaurer", f.chemin);
  await neuf.waitForFunction(() => /déjà à jour/.test(document.querySelector("#toast").textContent));
  assert.equal((await titres(neuf)).length, 2);
  await ouvrirDocument(neuf, "Attestation");
  assert.match(await texteDe(neuf), /Jean MBARGA/);
  await neuf.context().close();
});

test("version Android : documents enregistrés en fichiers natifs (simulation du module Filesystem)", async () => {
  const p = await E.page();
  const r = await p.evaluate(async () => {
    const fichiers = new Map();
    const FS = {
      async writeFile({ path, data }) { fichiers.set(path, data); },
      async readFile({ path }) { if (!fichiers.has(path)) throw new Error("absent"); return { data: fichiers.get(path) }; },
      async deleteFile({ path }) { if (!fichiers.delete(path)) throw new Error("absent"); },
      async rename({ from, to }) { fichiers.set(to, fichiers.get(from)); fichiers.delete(from); },
      async readdir({ path }) { return { files: [...fichiers.keys()].filter(k => k.startsWith(path + "/")).map(k => ({ name: k.slice(path.length + 1) })) }; }
    };
    const d = CiBStockage._depotAndroid(FS);
    await d.ecrire({ id: "a1", titre: "Devis", html: "<p>1</p>", maj: 1 });
    await d.ecrire({ id: "a1", titre: "Devis", html: "<p>2</p>", maj: 2 });
    await d.ecrire({ id: "a2", titre: "Facture", html: "<p>F</p>", maj: 3 });
    await d.supprimer("a2");
    // Coupure pendant un enregistrement : seul le fichier provisoire existe.
    fichiers.set("documents/a3.json.tmp", JSON.stringify({ id: "a3", titre: "Coupure", html: "<p>sauvé</p>", maj: 4 }));
    const d2 = CiBStockage._depotAndroid(FS);
    return { liste: (await d2.liste()).map(m => m.titre).sort(), a1: (await d2.lire("a1")).html, a3: (await d2.lire("a3")).html, tmp: [...fichiers.keys()].filter(k => k.endsWith(".tmp") && !k.includes("a3")).length };
  });
  assert.deepEqual(r.liste, ["Coupure", "Devis"]);
  assert.equal(r.a1, "<p>2</p>");
  assert.equal(r.a3, "<p>sauvé</p>");
  assert.equal(r.tmp, 0);
  await p.context().close();
});
