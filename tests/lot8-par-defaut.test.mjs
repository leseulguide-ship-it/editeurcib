// Lot 8 : EditeurCiB application par défaut pour les documents (.docx, .doc, .odt, .txt).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { demarrer, choisirFichier, attendrePret, pause, RACINE, SORTIES } from "./outils.mjs";

let E;
before(async () => { E = await demarrer(); });
after(async () => { await E.fin(); });
const FICHIERS = join(RACINE, "tests", "fichiers");
const MIMES = ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword", "application/vnd.oasis.opendocument.text", "text/plain"];

async function fermerMessage(p) { const b = p.locator(".boite.dlg .primary"); if (await b.count()) await b.click(); }

test("ouvrir un .doc (Word 97-2003) : texte, tableau, saut de page, et message clair", async () => {
  const p = await E.page();
  await choisirFichier(p, "#b-ouvrir", join(FICHIERS, "Proposition-test.doc"));
  await p.waitForSelector(".boite.dlg");
  assert.match(await p.locator(".boite.dlg").innerText(), /Ancien format Word \(\.doc\)/);
  await fermerMessage(p);
  const h = await p.locator("#page").innerHTML();
  assert.match(h, /Nous avons l’honneur de vous soumettre notre proposition/);
  assert.match(h, /<tr><td>Carrelage<\/td><td>120 m²<\/td><td>2 400 000<\/td><\/tr>/);
  assert.match(h, /<tr><td>TOTAL<\/td><td>3 900 000<\/td><\/tr>/);
  assert.match(h, /<hr class="saut-page">/);
  assert.equal(await p.locator("#titre").inputValue(), "Proposition-test");
  await p.context().close();
});

test("ouvrir un .odt : mise en page, listes, tableau fusionné, image", async () => {
  const p = await E.page();
  await choisirFichier(p, "#b-ouvrir", join(FICHIERS, "Proposition-test.odt"));
  await p.waitForSelector("#editeur:not(.hidden)");
  await fermerMessage(p);
  const h = await p.locator("#page").innerHTML();
  assert.match(h, /^<p><img src="data:image\/png/);
  assert.match(h, /<p style="text-align:right">Douala, le 16 novembre 2026<\/p>/);
  assert.match(h, /<h1 style="text-align:center">Objet : proposition/);
  assert.match(h, /<span style="color:#FF0000">un passage en rouge<\/span>/);
  assert.match(h, /<li>Pose de carrelage<ul><li>Carrelage 60x60/);
  assert.match(h, /<ol><li>Acompte de 40 %<\/li><li>Solde à la réception<\/li><\/ol>/);
  assert.match(h, /<td colspan="2"><p><b>TOTAL<\/b><\/p><\/td>/);
  await p.context().close();
});

test("ouvrir un .txt d’un vieux Windows (accents en Windows-1252) et en UTF-8", async () => {
  const p = await E.page();
  const ancien = join(SORTIES, "Lettre-ancienne.txt");
  writeFileSync(ancien, Buffer.from("Lettre à Douala\r\nÉtat des lieux : réalisé.", "latin1"));
  await choisirFichier(p, "#b-ouvrir", ancien);
  await p.waitForSelector("#editeur:not(.hidden)");
  assert.deepEqual(await p.locator("#page p").allTextContents(), ["Lettre à Douala", "État des lieux : réalisé."]);
  await p.click("#vers-accueil");
  const utf8 = join(SORTIES, "Note.txt"); writeFileSync(utf8, "Réunion à Akwa – œuvre", "utf8");
  await choisirFichier(p, "#b-ouvrir", utf8);
  await p.waitForFunction(() => document.querySelector("#titre").value === "Note");
  assert.deepEqual(await p.locator("#page p").allTextContents(), ["Réunion à Akwa – œuvre"]);
  await p.context().close();
});

test("Android : « Ouvrir avec » et « Partager » déclarés pour .docx, .doc, .odt et .txt", () => {
  const m = readFileSync(join(RACINE, "android/app/src/main/AndroidManifest.xml"), "utf8");
  for (const action of ["android.intent.action.VIEW", "android.intent.action.SEND"]) {
    const filtre = m.split("<intent-filter>").find(f => f.includes(action));
    assert.ok(filtre, action);
    for (const t of MIMES) assert.ok(filtre.includes(`android:mimeType="${t}"`), action + " : " + t);
  }
  assert.ok(!m.includes("android.permission.INTERNET"));
});

test("ordinateur : le manifeste déclare les fichiers (« Ouvrir avec » sous Windows)", () => {
  const m = JSON.parse(readFileSync(join(RACINE, "manifest.webmanifest"), "utf8"));
  const accept = m.file_handlers[0].accept;
  assert.deepEqual(Object.values(accept).flat().sort(), [".doc", ".docx", ".odt", ".txt"]);
  for (const t of MIMES) assert.ok(accept[t], t);
  assert.equal(m.file_handlers[0].action, "./");
});

test("ordinateur : un fichier ouvert depuis Windows (launchQueue) s’ouvre dans EditeurCiB", async () => {
  const ctx = await E.contexte();
  await ctx.addInitScript(() => { Object.defineProperty(window, "launchQueue", { configurable: true, value: { setConsumer(f) { window.__consommateur = f; } } }); });
  const p = await E.page(ctx);
  await p.click('.modele:has-text("Page vierge")'); await p.keyboard.type("Travail en cours");
  const b64 = readFileSync(join(FICHIERS, "Proposition-test.odt")).toString("base64");
  await p.evaluate(async b64 => {
    const o = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const f = new File([o], "Proposition chantier.odt", { type: "application/vnd.oasis.opendocument.text" });
    await window.__consommateur({ files: [{ getFile: async () => f }] });
  }, b64);
  await p.waitForFunction(() => document.querySelector("#titre").value === "Proposition chantier");
  await fermerMessage(p);
  await p.click("#vers-accueil");
  await p.waitForFunction(() => document.querySelectorAll("#liste .ligne").length === 2);   // le travail en cours a été gardé
  await ctx.close();
});

// Simulation des modules Android.
function simulerAndroid() {
  window.__appels = []; window.__ecouteurs = {};
  window.Capacitor = {
    isNativePlatform: () => true,
    registerPlugin: () => ({
      imprimer: async () => {},
      addListener: (nom, f) => { window.__ecouteurs[nom] = f; return { remove() {} }; },
      ouvrirReglagesDefaut: async () => { window.__appels.push("reglages"); },
      etatParDefaut: async () => ({ docx: true, doc: false, odt: false, txt: false })
    }),
    Plugins: {}
  };
}

test("Android : écran « application par défaut » au premier lancement, puis dans « À propos »", async () => {
  const ctx = await E.contexte({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(simulerAndroid);
  const p = await E.page(ctx);
  await p.waitForSelector(".boite.dlg h2", { timeout: 5000 });
  const t = await p.locator(".boite.dlg").innerText();
  assert.match(t, /Faire d’EditeurCiB votre application par défaut/);
  assert.match(t, /« Toujours »/);
  assert.match(t, /Déjà ouverts directement par EditeurCiB : Word \(\.docx\)/);
  assert.match(t, /À régler : Word ancien \(\.doc\), OpenDocument \(\.odt\), Texte \(\.txt\)/);
  await p.click('.dlg-boutons [data-valeur="reglages"]');
  await p.waitForFunction(() => window.__appels.includes("reglages"));
  // Une seule fois : pas de nouvel affichage au lancement suivant.
  await p.reload(); await attendrePret(p); await pause(2000);
  assert.equal(await p.locator(".boite.dlg").count(), 0);
  // Toujours accessible dans « À propos ».
  await p.click("#b-apropos");
  await p.click("#b-defaut");
  await p.waitForSelector(".boite.dlg h2");
  assert.match(await p.locator(".boite.dlg h2").innerText(), /application par défaut/);
  await ctx.close();
});

test("Android : pas d’écran d’accueil si l’application s’ouvre pour lire un fichier ; texte partagé = nouveau document", async () => {
  const ctx = await E.contexte({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(simulerAndroid);
  const p = await E.page(ctx);
  await p.evaluate(() => window.__ecouteurs.fichierRecu({ texte: "Bonjour, voici les dimensions de la dalle : 6 m x 4 m." }));
  await p.waitForFunction(() => document.querySelector("#titre").value === "Texte partagé");
  assert.match(await p.locator("#page").innerText(), /dimensions de la dalle/);
  await pause(2000);
  assert.equal(await p.locator(".boite.dlg").count(), 0);
  await ctx.close();
});

test("site web (hors APK) : pas de bouton ni d’écran « application par défaut »", async () => {
  const p = await E.page();
  await pause(2000);
  assert.equal(await p.locator(".boite.dlg").count(), 0);
  assert.equal(await p.locator("#b-defaut").isVisible(), false);
  await p.context().close();
});

test("Android : EditeurCiB peut voir les autres applications de documents (sinon il se croirait toujours « par défaut »)", () => {
  const m = readFileSync(join(RACINE, "android/app/src/main/AndroidManifest.xml"), "utf8");
  const q = m.split("<queries>")[1].split("</queries>")[0];
  for (const t of MIMES) assert.ok(q.includes(`android:mimeType="${t}"`), t);
});

test("Android : le bouton Retour ferme la fenêtre ouverte sans quitter l’application", async () => {
  const ctx = await E.contexte({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(simulerAndroid);
  await ctx.addInitScript(() => { window.__sorties = 0; window.Capacitor.Plugins.App = { addListener: (nom, f) => { window["__app_" + nom] = f; }, exitApp: () => { window.__sorties++; } }; });
  const p = await E.page(ctx);
  await p.waitForSelector(".boite.dlg h2", { timeout: 5000 });
  await p.evaluate(() => window.__app_backButton());
  assert.equal(await p.locator(".boite.dlg").count(), 0);
  assert.equal(await p.evaluate(() => window.__sorties), 0);
  await ctx.close();
});
