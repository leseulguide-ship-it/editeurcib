// Lot 3 : export et ouverture Word fiables (B2, B5, B7, B8, B9, B10, A4, A10).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { demarrer, modele, telecharger, choisirFichier, SORTIES } from "./outils.mjs";
import { fabriquerDocx } from "./fabriquer-docx.mjs";

let E, PROPOSITION;
before(async () => { E = await demarrer(); mkdirSync(join(SORTIES, "source"), { recursive: true }); PROPOSITION = await fabriquerDocx(join(SORTIES, "source", "Proposition-test.docx")); });
after(async () => { await E.fin(); });

// Ouvre le .docx dans le navigateur : vérifie que chaque partie XML est bien formée et renvoie leur contenu.
async function inspecter(p, octets) {
  return p.evaluate(async b64 => {
    const zip = await JSZip.loadAsync(b64, { base64: true });
    const parties = {}, erreurs = [];
    for (const nom of Object.keys(zip.files)) {
      if (zip.files[nom].dir) continue;
      if (/\.(xml|rels)$/.test(nom)) {
        const t = await zip.file(nom).async("string");
        if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(t)) erreurs.push(nom + " : caractère interdit");
        const d = new DOMParser().parseFromString(t, "application/xml");
        if (d.getElementsByTagName("parsererror").length) erreurs.push(nom + " : XML mal formé");
        parties[nom] = t;
      } else parties[nom] = "(binaire)";
    }
    return { parties, erreurs };
  }, octets.toString("base64"));
}
async function exporterHtml(p, html) {
  await modele(p, "Page vierge");
  await p.evaluate(h => { document.querySelector("#page").innerHTML = h; }, html);
  const f = await telecharger(p, () => p.click("#b-docx"));
  return inspecter(p, f.contenu);
}
const LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==";

test("export : mise en forme, cases fusionnées, listes, sauts de page, images, caractères spéciaux", async () => {
  const p = await E.page();
  const { parties, erreurs } = await exporterHtml(p, `
    <p style="text-align:center"><b>Gras</b> <i>italique</i> <u>souligné</u> <s>barré</s> <span style="color:rgb(225, 99, 38);font-size:16pt;font-family:Arial, Arimo, sans-serif">orange Arial 16</span></p>
    <p style="text-align:justify">Texte justifié avec un caractère de contrôle \u000b ici et \u0001 là.</p>
    <ul><li>Point A<ul><li>Sous-point A1</li></ul></li><li>Point B</li></ul>
    <ol><li>Un</li><li>Deux</li></ol><p>Entre deux listes</p><ol><li>Premier</li></ol>
    <table><tbody><tr><td>Désignation</td><td>Quantité</td><td>Montant</td></tr>
      <tr><td rowspan="2">Carrelage</td><td>120</td><td>2 400 000</td></tr><tr><td>10</td><td>200 000</td></tr>
      <tr><td colspan="2"><b>TOTAL</b></td><td>2 600 000</td></tr></tbody></table>
    <hr class="saut-page"><p>Page 2 <img src="${LOGO}" style="width:120px"></p>`);
  assert.deepEqual(erreurs, []);
  const d = parties["word/document.xml"];
  // Mise en forme
  for (const x of ['<w:jc w:val="center"/>', '<w:jc w:val="both"/>', "<w:b/>", "<w:i/>", '<w:u w:val="single"/>', "<w:strike/>", '<w:color w:val="E16326"/>', '<w:sz w:val="32"/>', 'w:ascii="Arial"'])
    assert.ok(d.includes(x), "absent : " + x);
  // B9 : le caractère \u000b devient un retour à la ligne, \u0001 disparaît
  assert.match(d, /contrôle <\/w:t><\/w:r><w:r><w:br\/><\/w:r>/);
  // B7 : la sous-liste est un paragraphe de niveau 1 séparé
  assert.match(d, /<w:ilvl w:val="1"\/><w:numId w:val="1"\/><\/w:numPr><\/w:pPr><w:r><w:t xml:space="preserve">Sous-point A1/);
  assert.ok(!/Point A[^<]*Sous-point/.test(d), "la sous-liste ne doit pas être collée au point A");
  // B8 : les deux listes numérotées ont des numérotations différentes (2 et 3)
  assert.match(d, /numId w:val="2"\/><\/w:numPr><\/w:pPr><w:r><w:t xml:space="preserve">Un/);
  assert.match(d, /numId w:val="3"\/><\/w:numPr><\/w:pPr><w:r><w:t xml:space="preserve">Premier/);
  assert.equal((parties["word/numbering.xml"].match(/<w:num w:numId/g) || []).length, 3);
  // B2 : cases fusionnées
  assert.match(d, /<w:gridSpan w:val="2"\/><\/w:tcPr><w:p><w:r><w:rPr><w:b\/><w:bCs\/><\/w:rPr><w:t xml:space="preserve">TOTAL/);
  assert.ok(d.includes('<w:vMerge w:val="restart"/>') && d.includes("<w:vMerge/>"));
  const ligneTotal = d.split("<w:tr>").find(l => l.includes("TOTAL"));
  assert.equal((ligneTotal.match(/<w:tc>/g) || []).length, 2, "la ligne TOTAL a 2 cases (2 fusionnées + 1)");
  // Saut de page et image
  assert.ok(d.includes('<w:br w:type="page"/>'));
  assert.ok(parties["word/media/image1.png"]);
  assert.match(parties["word/_rels/document.xml.rels"], /Target="media\/image1.png"/);
  assert.match(d, /<wp:extent cx="1143000" cy="1143000"\/>/);
  await p.context().close();
});

test("ouverture d’un Word complet : mise en page conservée et message A4", async () => {
  const p = await E.page();
  await choisirFichier(p, "#b-ouvrir", PROPOSITION);
  await p.waitForSelector(".boite.dlg");
  const msg = await p.locator(".boite.dlg").innerText();
  assert.match(msg, /simplifié/);
  assert.match(msg, /en-tête et le pied de page/);
  assert.match(msg, /fichier d’origine n’est pas modifié/);
  await p.click(".dlg-boutons .primary");
  const h = await p.locator("#page").innerHTML();
  assert.match(h, /^<p>CiB – Construction Intelligente des Bâtiments \(en-tête\)<\/p>/);
  assert.match(h, /<img src="data:image\/png;base64,[^"]+" alt="" style="width:93px">/);
  assert.match(h, /<p style="text-align:right">Douala, le 16 novembre 2026<\/p>/);
  assert.match(h, /<h1 style="text-align:center">Objet : proposition de travaux de rénovation<\/h1>/);
  assert.match(h, /<span style="color:#FF0000">un passage en rouge<\/span>/);
  assert.match(h, /<u>un passage souligné<\/u>/);
  assert.match(h, /<p style="text-align:justify">Nous avons/);
  assert.match(h, /<span style="color:#E16326;font-size:14pt;font-family:Arial"><b>ENTREPRISE CiB SARL<\/b><\/span>/);
  assert.match(h, /<ul><li>Démolition des cloisons<\/li><li>Pose de carrelage<ul><li>Carrelage 60x60 grès cérame<\/li><li>Plinthes assorties<\/li><\/ul><\/li><li>Peinture intérieure<\/li><\/ul>/);
  assert.equal((h.match(/<ol>/g) || []).length, 2);
  assert.match(h, /<td colspan="2"><p><b>TOTAL<\/b><\/p><\/td>/);
  assert.match(h, /<hr class="saut-page">/);
  assert.match(h, /BP 1234 Douala – Tél\. 6 99 00 00 00 \(pied de page\)<\/p>$/);
  // Et l'export du document ouvert garde les cases fusionnées, les 3 listes et l'image.
  await p.evaluate(() => document.querySelectorAll("#page .champ").forEach(c => c.remove()));
  const f = await telecharger(p, () => p.click("#b-docx"));
  const { parties, erreurs } = await inspecter(p, f.contenu);
  assert.deepEqual(erreurs, []);
  assert.ok(parties["word/document.xml"].includes('<w:gridSpan w:val="2"/>'));
  assert.ok(parties["word/media/image1.png"]);
  assert.equal((parties["word/numbering.xml"].match(/<w:num w:numId/g) || []).length, 3);
  await p.context().close();
});

test("A10 : texte collé depuis Word nettoyé (styles Mso, o:p, listes Word)", async () => {
  const p = await E.page();
  await modele(p, "Page vierge");
  const word = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><style>p.MsoNormal{margin:0}</style></head><body>
    <!--[if gte mso 9]><xml><w:WordDocument></w:WordDocument></xml><![endif]-->
    <p class=MsoNormal style='margin-bottom:0cm;line-height:normal'><b><span style='font-size:14.0pt;mso-bidi-font-size:11pt;color:#C00000'>Titre rouge<o:p></o:p></span></b></p>
    <p class=MsoListParagraphCxSpFirst style='text-indent:-18.0pt;mso-list:l0 level1 lfo1'><span style='font-family:Symbol;mso-list:Ignore'>·<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp; </span></span>Premier point<o:p></o:p></p>
    <p class=MsoListParagraphCxSpLast style='text-indent:-18.0pt;mso-list:l0 level1 lfo1'><span style='font-family:Symbol;mso-list:Ignore'>·<span>&nbsp;</span></span>Second point<o:p></o:p></p>
    <p class=MsoNormal style='text-align:center'>Centré<o:p></o:p></p></body></html>`;
  await p.evaluate(html => {
    const dt = new DataTransfer(); dt.setData("text/html", html); dt.setData("text/plain", "Titre rouge");
    document.querySelector("#page").dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, word);
  const h = await p.locator("#page").innerHTML();
  assert.ok(!/Mso|o:p|mso-|<xml|WordDocument|Symbol/i.test(h), h);
  assert.match(h, /Titre rouge/);
  assert.match(h, /color:#C00000|color: rgb\(192, 0, 0\)/);
  assert.match(h, /<ul><li>Premier point<\/li><li>Second point<\/li><\/ul>/);
  assert.match(h, /text-align:\s?center[^>]*>Centré/);
  await p.context().close();
});

test("B10 : le tableau inséré reçoit le curseur, Tab passe d’une case à l’autre sans toucher aux champs", async () => {
  const p = await E.page();
  await modele(p, "Lettre de demande");
  await p.keyboard.type("Jean MBARGA");
  await p.locator("#page p").nth(1).click();
  await p.keyboard.press("End");
  await p.click("#b-tableau");
  await p.keyboard.type("A1"); await p.keyboard.press("Tab"); await p.keyboard.type("B1");
  await p.keyboard.press("Shift+Tab"); await p.keyboard.type("x");
  const cases = await p.locator("#page table td").allInnerTexts();
  assert.equal(cases[0], "x");
  assert.equal(cases[1], "B1");
  // Le champ du destinataire est intact.
  assert.equal(await p.locator("#page .champ", { hasText: "Nom ou fonction du destinataire" }).count(), 1);
  // Tab dans la dernière case ajoute une ligne.
  await p.locator("#page table td").last().click();
  await p.keyboard.press("Tab");
  assert.equal(await p.locator("#page table tr").count(), 4);
  await p.context().close();
});

test("ouverture des vrais fichiers Word sans erreur (catalogue avec images, statuts, contrat)", async (t) => {
  const { existsSync } = await import("node:fs");
  const dossier = process.env.DOCS_REELS;
  if (!dossier || !existsSync(dossier)) { t.skip("documents réels non fournis (variable DOCS_REELS)"); return; }
  const p = await E.page();
  for (const nom of ["reel-catalogue.docx", "reel-statuts.docx", "reel-contrat.docx"]) {
    await p.click("#vers-accueil").catch(() => {});
    await choisirFichier(p, "#b-ouvrir", join(dossier, nom));
    await p.waitForSelector("#editeur:not(.hidden)");
    const dlg = p.locator(".boite.dlg .primary"); if (await dlg.count()) await dlg.click();
    // Le catalogue ne contient que des images (22) ; les autres surtout du texte.
    const n = (await p.locator("#page").innerText()).length, img = await p.locator("#page img").count();
    assert.ok(n > 500 || img >= 20, nom + " : contenu incomplet (" + n + " caractères, " + img + " images)");
    const f = await telecharger(p, async () => { await p.click("#b-docx"); const c = p.locator('.dlg-boutons [data-valeur="continuer"]'); if (await c.count()) await c.click(); });
    const { erreurs } = await inspecter(p, f.contenu);
    assert.deepEqual(erreurs, [], nom);
  }
  await p.context().close();
});
