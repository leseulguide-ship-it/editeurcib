// Vérification finale : le site construit comme sur GitHub Pages fonctionne, y compris sans connexion.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, rmSync, mkdirSync, cpSync, existsSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { RACINE, SORTIES, serveur, telecharger, attendrePret } from "./outils.mjs";

const SITE = join(SORTIES, "_site");
let srv, nav;
before(async () => {
  // Même copie que l'étape « Rassembler les fichiers du site » de .github/workflows/web.yml.
  const yml = readFileSync(join(RACINE, ".github/workflows/web.yml"), "utf8");
  const liste = yml.match(/cp -r (.+) _site\//)[1].trim().split(/\s+/);
  rmSync(SITE, { recursive: true, force: true }); mkdirSync(SITE, { recursive: true });
  for (const f of liste) cpSync(join(RACINE, f), join(SITE, f), { recursive: true });
  srv = await serveur(SITE);
  nav = await chromium.launch({ channel: process.env.NAVIGATEUR || "msedge" });
});
after(async () => { await nav.close(); srv.fermer(); });

test("tous les fichiers du cache hors ligne et de la page sont publiés", () => {
  const sw = readFileSync(join(SITE, "sw.js"), "utf8");
  const fichiers = JSON.parse(sw.match(/const FICHIERS = (\[.*?\]);/s)[1]);
  const manquants = fichiers.filter(f => f !== "./" && !existsSync(join(SITE, f)));
  assert.deepEqual(manquants, []);
  const html = readFileSync(join(SITE, "index.html"), "utf8");
  const refs = [...html.matchAll(/(?:src|href)="([^"#:]+)"/g)].map(m => m[1]).filter(r => !r.startsWith("data") && !r.includes("${"));
  assert.deepEqual(refs.filter(r => !existsSync(join(SITE, r))), []);
  // Chaque fichier JS de la page est mis en cache.
  assert.deepEqual(refs.filter(r => /\.js$/.test(r) && !fichiers.includes(r)), []);
  // La copie Android contient les mêmes dossiers.
  const prep = readFileSync(join(RACINE, "scripts/preparer-android.mjs"), "utf8");
  const listeAndroid = JSON.parse(prep.match(/const FICHIERS = (\[.*?\]);/)[1]);
  const yml = readFileSync(join(RACINE, ".github/workflows/web.yml"), "utf8");
  assert.deepEqual(listeAndroid.sort(), yml.match(/cp -r (.+) _site\//)[1].trim().split(/\s+/).sort());
});

test("hors connexion : l’application s’ouvre, écrit une lettre et exporte en Word", async () => {
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true, locale: "fr-FR" });
  const p = await ctx.newPage();
  await p.goto(srv.url); await attendrePret(p);
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.reload(); await attendrePret(p);         // la page est maintenant contrôlée par le cache
  await ctx.setOffline(true);
  await p.reload(); await attendrePret(p);
  await p.locator(".modele", { hasText: "Page vierge" }).first().click();
  await p.keyboard.type("Lettre écrite sans connexion");
  const f = await telecharger(p, () => p.click("#b-docx"));
  assert.match(f.nom, /\.docx$/);
  const fontes = await p.evaluate(async () => (await Promise.all([document.fonts.load("12pt Tinos"), document.fonts.load("15px Figtree")])).every(f => f.length > 0));
  assert.equal(fontes, true);
  await ctx.close();
});
