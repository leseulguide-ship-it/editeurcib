// Lot 9 : nouvelles icônes (logo EditeurCiB pour l'application, icône des documents).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { readFileSync, statSync } from "node:fs";
import { demarrer, modele, RACINE } from "./outils.mjs";

let E;
before(async () => { E = await demarrer(); });
after(async () => { await E.fin(); });

// Lecture de l'en-tête PNG : largeur, hauteur, type de couleur (6 = avec transparence, 3 = palette).
function png(f) {
  const b = readFileSync(join(RACINE, f));
  assert.equal(b.toString("latin1", 1, 4), "PNG", f);
  const palette = b.includes(Buffer.from("PLTE")), trns = b.includes(Buffer.from("tRNS"));
  return { l: b.readUInt32BE(16), h: b.readUInt32BE(20), type: b[25], transparence: b[25] === 6 || b[25] === 4 || (palette && trns), poids: b.length };
}

test("icônes Android : toutes les densités, rondes et adaptatives", () => {
  const D = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(D)) {
    const r = `android/app/src/main/res/mipmap-${d}/`;
    for (const [f, t] of [["ic_launcher.png", 48], ["ic_launcher_round.png", 48], ["ic_launcher_foreground.png", 108]]) {
      const i = png(r + f);
      assert.deepEqual([i.l, i.h], [t * k, t * k], r + f);
      assert.ok(i.transparence, r + f + " : transparence");
    }
  }
  const x = readFileSync(join(RACINE, "android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml"), "utf8");
  assert.match(x, /<foreground android:drawable="@mipmap\/ic_launcher_foreground"\/>/);
  assert.ok(readFileSync(join(RACINE, "android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml"), "utf8").includes("ic_launcher_foreground"));
});

test("premier plan adaptatif : le logo reste dans la zone de sécurité (jamais coupé)", async () => {
  const p = await E.page();
  const r = await p.evaluate(async src => {
    const im = new Image(); im.src = src; await im.decode();
    const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const g = c.getContext("2d"); g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data; let max = 0;
    const m = c.width / 2;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 20) max = Math.max(max, Math.hypot(x + 0.5 - m, y + 0.5 - m));
    return max / c.width * 108;    // distance maximale au centre, en dp
  }, "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png");
  assert.ok(r <= 38, "le logo dépasse la zone de sécurité : " + r.toFixed(1) + " dp (maximum 38)");
  await p.context().close();
});

test("version web : icônes du manifeste, favicon, iPhone, gestion des fichiers", () => {
  const m = JSON.parse(readFileSync(join(RACINE, "manifest.webmanifest"), "utf8"));
  for (const ic of m.icons) { const i = png(ic.src); assert.equal(`${i.l}x${i.h}`, ic.sizes, ic.src); }
  assert.ok(m.icons.some(i => i.purpose === "maskable"));
  assert.ok(png("img/icon-512.png").transparence);
  assert.equal(png("img/apple-touch-icon.png").l, 180);
  assert.equal(png("img/favicon.png").l, 48);
  const fh = m.file_handlers[0].icons;
  assert.ok(fh.some(i => i.src === "img/document-256.png" && i.sizes === "256x256"));
  for (const i of fh) { const d = png(i.src); assert.equal(`${d.l}x${d.h}`, i.sizes); assert.ok(d.transparence); }
});

test("images légères et mises en cache hors ligne", () => {
  const sw = readFileSync(join(RACINE, "sw.js"), "utf8");
  for (const f of ["img/logo-editeurcib.png", "img/logo-editeurcib-petit.png", "img/document-editeurcib.png", "img/document-256.png", "img/icon-512.png", "img/favicon.png"]) {
    assert.ok(sw.includes(`"${f}"`), f + " absent du cache");
    assert.ok(statSync(join(RACINE, f)).size < 100 * 1024, f + " trop lourd");
  }
  assert.match(sw, /cache: "reload"/);
});

test("dans l’application : logo EditeurCiB, signature CiB, icône des documents", async () => {
  const p = await E.page();
  assert.equal(await p.getAttribute("#vers-accueil img", "src"), "img/logo-editeurcib-petit.png");
  assert.equal(await p.getAttribute(".marque > img", "src"), "img/logo-editeurcib.png");
  assert.equal(await p.locator(".marque .signature-cib img[src='img/logo-cib.png']").count(), 1);
  await modele(p, "Page vierge"); await p.keyboard.type("Essai"); await p.click("#vers-accueil");
  await p.waitForSelector("#liste .ligne .ico-doc");
  assert.equal(await p.getAttribute("#liste .ligne .ico-doc", "src"), "img/document-editeurcib.png");
  assert.ok(await p.evaluate(() => document.querySelector("#liste .ico-doc").naturalWidth) > 0, "image chargée");
  await p.click("#b-apropos");
  assert.equal(await p.getAttribute("#apropos .boite > img", "src"), "img/logo-editeurcib.png");
  assert.match(await p.locator("#apropos").innerText(), /EditeurCiB, une application CiB/);
  const toutes = await p.evaluate(() => [...document.images].filter(i => i.complete && i.naturalWidth === 0 && i.src).map(i => i.src));
  assert.deepEqual(toutes, []);
  await p.context().close();
});
