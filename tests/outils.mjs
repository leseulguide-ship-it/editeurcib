// Outils communs aux tests automatiques d'EditeurCiB.
// Les tests pilotent Microsoft Edge (installé sur Windows) avec playwright-core.
import { chromium } from "playwright-core";
import http from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SORTIES = join(RACINE, "tests", "sorties");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json", ".webmanifest": "application/manifest+json" };

export function serveur() {
  return new Promise(ok => {
    const srv = http.createServer(async (req, res) => {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (p.endsWith("/")) p += "index.html";
      try {
        const d = await readFile(join(RACINE, p));
        res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream", "cache-control": "no-store" });
        res.end(d);
      } catch { res.writeHead(404); res.end(); }
    }).listen(0, "127.0.0.1", () => ok({ url: `http://localhost:${srv.address().port}/`, fermer: () => srv.close() }));
  });
}

export async function demarrer() {
  await mkdir(SORTIES, { recursive: true });
  const srv = await serveur();
  const nav = await chromium.launch({ channel: process.env.NAVIGATEUR || "msedge" });
  return {
    srv, nav,
    // Contexte neuf = appareil neuf (stockage vide), sauf si on réutilise un contexte existant.
    async contexte(opts = {}) {
      return nav.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true, locale: "fr-FR", ...opts });
    },
    async page(ctx, opts = {}) {
      ctx = ctx || await this.contexte(opts);
      const p = await ctx.newPage();
      p.on("pageerror", e => { if (!/kaspersky|kis/i.test(String(e.stack || e))) console.error("Erreur dans la page :", e.message); });
      await p.goto(srv.url);
      await attendrePret(p);
      return p;
    },
    async fin() { await nav.close(); srv.fermer(); }
  };
}

export async function attendrePret(p) {
  await p.waitForFunction(() => document.documentElement.dataset.pret === "1");
}

export const modele = (p, nom) => p.locator(".modele", { hasText: nom }).first().click();

// Lance une action qui déclenche un téléchargement et renvoie le fichier obtenu.
export async function telecharger(p, action) {
  const [dl] = await Promise.all([p.waitForEvent("download"), action()]);
  const chemin = join(SORTIES, dl.suggestedFilename());
  await dl.saveAs(chemin);
  return { nom: dl.suggestedFilename(), chemin, contenu: await readFile(chemin) };
}

export async function choisirFichier(p, selecteurBouton, fichiers) {
  const [fc] = await Promise.all([p.waitForEvent("filechooser"), p.click(selecteurBouton)]);
  await fc.setFiles(fichiers);
}

export const pause = ms => new Promise(r => setTimeout(r, ms));

// Ouvre un document de la liste « Vos documents » et attend qu'il soit affiché.
export async function ouvrirDocument(p, nom) {
  const l = nom ? p.locator("#liste .nom", { hasText: nom }) : p.locator("#liste .nom");
  await l.first().click();
  await p.waitForSelector("#editeur:not(.hidden)");
}
