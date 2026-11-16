// EditeurCiB : prépare le dossier « www » utilisé par Capacitor pour l'APK Android.
// L'application web reste à la racine du dépôt (c'est elle qui est publiée sur le web) ;
// ce script en fait une copie dans « www » et y ajoute les fichiers de Capacitor
// (enregistrer / partager un fichier, bouton Retour). Le site web n'est pas modifié.
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const www = join(racine, "www");

// Fichiers de l'application (même liste que le site web).
const FICHIERS = ["index.html", "manifest.webmanifest", "sw.js", "fonts", "img", "lib", "js"];

rmSync(www, { recursive: true, force: true });
mkdirSync(www);
for (const f of FICHIERS) {
  const source = join(racine, f);
  if (!existsSync(source)) throw new Error(`Fichier manquant : ${f}`);
  cpSync(source, join(www, f), { recursive: true });
}

// Bibliothèques Capacitor, copiées depuis node_modules (lancer « npm ci » avant).
const CAPACITOR = {
  "capacitor.js": "@capacitor/core/dist/capacitor.js",
  "synapse.js": "@capacitor/synapse/dist/synapse.js",
  "cap-app.js": "@capacitor/app/dist/plugin.js",
  "cap-filesystem.js": "@capacitor/filesystem/dist/plugin.js",
  "cap-share.js": "@capacitor/share/dist/plugin.js",
};
for (const [nom, chemin] of Object.entries(CAPACITOR)) {
  const source = join(racine, "node_modules", chemin);
  if (!existsSync(source)) throw new Error(`Composant introuvable : ${chemin}. Lancez « npm ci » d'abord.`);
  cpSync(source, join(www, "lib", nom));
}

// Charge ces bibliothèques avant le code de l'application, uniquement dans la copie Android.
const page = join(www, "index.html");
const html = readFileSync(page, "utf8");
const repere = '<script src="lib/jszip.min.js"></script>';
if (!html.includes(repere)) throw new Error("Repère introuvable dans index.html : " + repere);
const scripts = [
  '<script src="lib/capacitor.js"></script>',
  '<script src="lib/synapse.js"></script>',
  "<script>var synapse = window.outsystemsSynapse;</script>",
  '<script src="lib/cap-app.js"></script>',
  '<script src="lib/cap-filesystem.js"></script>',
  '<script src="lib/cap-share.js"></script>',
].join("\n");
writeFileSync(page, html.replace(repere, scripts + "\n" + repere));

console.log("Dossier www prêt pour Android.");
