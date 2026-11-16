// Lot 5 : confort sur téléphone (T1, T2, T3, T4, T6, T7, T8, B12).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdirSync, readFileSync } from "node:fs";
import { demarrer, modele, telecharger, pause, SORTIES } from "./outils.mjs";
import { fabriquerDocx } from "./fabriquer-docx.mjs";

let E;
before(async () => { E = await demarrer(); });
after(async () => { await E.fin(); });

const TEL = { viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };

// Simulation des modules Android (Filesystem, Share, CibNatif) dans la page.
function simulerAndroid() {
  window.__fs = {}; window.__partages = []; window.__ecouteurs = {};
  window.Capacitor = {
    isNativePlatform: () => true,
    registerPlugin: () => ({ imprimer: async () => {}, addListener: (nom, f) => { window.__ecouteurs[nom] = f; return { remove() {} }; } }),
    Plugins: {
      Filesystem: {
        async writeFile({ path, data, directory }) { window.__fs[directory + ":" + path] = data; },
        async readFile({ path, directory }) { const k = directory + ":" + path; if (!(k in window.__fs)) throw new Error("absent"); return { data: window.__fs[k] }; },
        async deleteFile({ path, directory }) { delete window.__fs[directory + ":" + path]; },
        async rename({ from, to, directory }) { window.__fs[directory + ":" + to] = window.__fs[directory + ":" + from]; delete window.__fs[directory + ":" + from]; },
        async readdir({ path, directory }) { const p = directory + ":" + path + "/"; return { files: Object.keys(window.__fs).filter(k => k.startsWith(p)).map(k => ({ name: k.slice(p.length) })) }; },
        async stat({ path, directory }) { if (!((directory + ":" + path) in window.__fs)) throw new Error("absent"); return { type: "file" }; },
        async getUri({ path, directory }) { return { uri: "file:///" + directory + "/" + path }; }
      },
      Share: { async share(o) { window.__partages.push(o); } }
    }
  };
}

test("T4 : sur téléphone, tous les outils visibles tiennent dans l’écran ; « ⋯ » montre les autres", async () => {
  const p = await E.page(null, TEL);
  await modele(p, "Lettre de demande");
  const deborde = () => p.evaluate(() => [...document.querySelectorAll("header button, header select, header label, header input")]
    .filter(e => e.offsetParent && getComputedStyle(e).display !== "none").filter(e => e.getBoundingClientRect().right > innerWidth + 1).map(e => e.id || e.title || e.textContent));
  assert.deepEqual(await deborde(), []);
  assert.equal(await p.locator('.ob[data-cmd="bold"]').isVisible(), true);
  assert.equal(await p.locator('.ob[data-cmd="justifyCenter"]').isVisible(), false);
  await p.locator("#b-plus-outils").tap();
  assert.equal(await p.locator('.ob[data-cmd="justifyCenter"]').isVisible(), true);
  assert.equal(await p.locator("#b-tableau").isVisible(), true);
  assert.deepEqual(await deborde(), []);
  await p.context().close();
});

test("T8 : plus de bouton « Exporter .html » dans la barre ; il est dans le menu « ⋯ »", async () => {
  const p = await E.page();
  await modele(p, "Page vierge"); await p.keyboard.type("Texte");
  assert.equal(await p.locator("header .actions button:visible", { hasText: ".html" }).count(), 0);
  await p.click("#b-menu");
  const f = await telecharger(p, () => p.click('#menu [data-clic="#b-html"]'));
  assert.match(f.nom, /\.html$/);
  assert.match(f.contenu.toString("utf8"), /Texte/);
  await p.context().close();
});

test("T6 : sur téléphone, « Vos documents » est visible dès l’accueil", async () => {
  const p = await E.page(null, TEL);
  const haut = await p.evaluate(() => document.querySelector(".docs-titre").getBoundingClientRect().top);
  assert.ok(haut < 700, "« Vos documents » trop bas : " + haut);
  // Les modèles défilent sur une ligne.
  const lignes = await p.evaluate(() => new Set([...document.querySelectorAll(".modele")].map(m => Math.round(m.getBoundingClientRect().top))).size);
  assert.equal(lignes, 1);
  await p.context().close();
});

test("B12 : les vignettes des modèles restent visibles après un redimensionnement dans l’éditeur", async () => {
  const p = await E.page();
  await modele(p, "Page vierge");
  await p.setViewportSize({ width: 700, height: 600 }); await pause(200);
  await p.setViewportSize({ width: 1280, height: 860 }); await pause(200);
  await p.click("#vers-accueil"); await pause(300);
  const echelles = await p.evaluate(() => [...document.querySelectorAll(".mini-contenu")].map(c => +(c.style.transform.match(/scale\(([\d.]+)\)/) || [0, 0])[1]));
  assert.ok(echelles.length >= 7 && echelles.every(e => e > 0.1), JSON.stringify(echelles));
  await p.context().close();
});

test("T3 : clavier ouvert → en-tête et barre d’état masqués pour laisser la place au texte", async () => {
  const p = await E.page(null, TEL);
  await modele(p, "Lettre de demande");
  await p.locator("#page").focus();
  await p.setViewportSize({ width: 390, height: 430 }); await pause(500);
  assert.equal(await p.evaluate(() => document.body.classList.contains("clavier")), true);
  assert.equal(await p.locator(".top").isVisible(), false);
  assert.equal(await p.locator("#etat").isVisible(), false);
  await p.setViewportSize({ width: 390, height: 800 }); await pause(500);
  assert.equal(await p.locator(".top").isVisible(), true);
  await p.context().close();
});

test("T7 : sur téléphone, les suggestions forment une barre en bas, sans cacher le texte", async () => {
  const p = await E.page(null, TEL);
  await modele(p, "Page vierge");
  await p.keyboard.type("Je vous remer");
  await p.waitForSelector("#popup:not(.hidden)");
  const r = await p.evaluate(() => { const b = document.querySelector("#popup").getBoundingClientRect(); return { barre: document.querySelector("#popup").classList.contains("barre"), bas: Math.round(b.bottom), haut: visualViewport.height, gauche: b.left, largeur: b.width }; });
  assert.equal(r.barre, true);
  assert.ok(Math.abs(r.bas - r.haut) <= 2, JSON.stringify(r));
  assert.equal(r.gauche, 0);
  await p.locator("#popup .item").first().tap();
  assert.match(await p.locator("#page").innerText(), /remercie/);
  await p.context().close();
});

test("T1 : version Android, « Enregistrer dans le téléphone » écrit dans Documents/EditeurCiB (sans écraser)", async () => {
  const ctx = await E.contexte(TEL);
  await ctx.addInitScript(simulerAndroid);
  const p = await E.page(ctx);
  await modele(p, "Page vierge"); await p.keyboard.type("Lettre pour le chantier");
  await p.locator("#b-docx").tap();
  await p.locator('.dlg-boutons [data-valeur="enregistrer"]').tap();
  await p.waitForFunction(() => Object.keys(window.__fs).some(k => k.startsWith("DOCUMENTS:")));
  assert.match(await p.locator("#toast").innerText(), /Documents › EditeurCiB : Document sans titre\.docx/);
  await p.locator("#b-docx").tap();
  await p.locator('.dlg-boutons [data-valeur="enregistrer"]').tap();
  await p.waitForFunction(() => Object.keys(window.__fs).filter(k => k.startsWith("DOCUMENTS:")).length === 2);
  const cles = await p.evaluate(() => Object.keys(window.__fs).filter(k => k.startsWith("DOCUMENTS:")).sort());
  assert.deepEqual(cles, ["DOCUMENTS:EditeurCiB/Document sans titre (2).docx", "DOCUMENTS:EditeurCiB/Document sans titre.docx"]);
  // « Envoyer » passe toujours par le menu Partager d'Android.
  await p.locator("#b-docx").tap();
  await p.locator('.dlg-boutons [data-valeur="envoyer"]').tap();
  await p.waitForFunction(() => window.__partages.length === 1);
  // Les documents eux-mêmes sont enregistrés en fichiers natifs (DATA).
  assert.ok(await p.evaluate(() => Object.keys(window.__fs).some(k => /^DATA:documents\/.+\.json$/.test(k))));
  await ctx.close();
});

test("T2 : un .docx reçu d’une autre application (« Ouvrir avec ») s’ouvre dans EditeurCiB", async () => {
  mkdirSync(join(SORTIES, "source"), { recursive: true });
  const chemin = await fabriquerDocx(join(SORTIES, "source", "Recu-WhatsApp.docx"));
  const ctx = await E.contexte(TEL);
  await ctx.addInitScript(simulerAndroid);
  const p = await E.page(ctx);
  await modele(p, "Page vierge"); await p.keyboard.type("Travail en cours");
  await p.evaluate(b64 => window.__ecouteurs.fichierRecu({ nom: "Recu-WhatsApp.docx", donnees: b64 }), readFileSync(chemin).toString("base64"));
  await p.waitForFunction(() => document.querySelector("#titre").value === "Recu-WhatsApp");
  assert.match(await p.locator("#page").innerText(), /proposition de travaux/);
  await p.locator(".dlg-boutons .primary").tap();
  // Le document en cours a été enregistré avant.
  await p.click("#vers-accueil");
  await p.waitForFunction(() => document.querySelectorAll("#liste .ligne").length === 2);
  // Fichier illisible : message clair.
  await p.evaluate(() => window.__ecouteurs.fichierRecu({ erreur: "fichier trop volumineux" }));
  assert.match(await p.locator("#toast").innerText(), /trop volumineux/);
  await ctx.close();
});
