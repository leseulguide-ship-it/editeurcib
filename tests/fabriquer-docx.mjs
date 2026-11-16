// Fabrique un .docx de test au format produit par Word : en-tête, pied de page, image, alignements,
// couleurs, polices, listes à puces sur 2 niveaux, 2 listes numérotées, tableau avec cases fusionnées, saut de page.
import JSZip from "jszip";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RACINE } from "./outils.mjs";
export async function fabriquerDocx(chemin) {
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
const r = (t, o = {}) => `<w:r><w:rPr>${o.f ? `<w:rFonts w:ascii="${o.f}" w:hAnsi="${o.f}"/>` : ""}${o.b ? "<w:b/>" : ""}${o.i ? "<w:i/>" : ""}${o.u ? '<w:u w:val="single"/>' : ""}${o.c ? `<w:color w:val="${o.c}"/>` : ""}${o.s ? `<w:sz w:val="${o.s}"/>` : ""}</w:rPr><w:t xml:space="preserve">${t}</w:t></w:r>`;
const p = (runs, o = {}) => `<w:p><w:pPr>${o.st ? `<w:pStyle w:val="${o.st}"/>` : ""}${o.num ? `<w:numPr><w:ilvl w:val="${o.lvl || 0}"/><w:numId w:val="${o.num}"/></w:numPr>` : ""}${o.jc ? `<w:jc w:val="${o.jc}"/>` : ""}</w:pPr>${runs}</w:p>`;
const img = `<w:r><w:drawing><wp:inline><wp:extent cx="889000" cy="889000"/><wp:docPr id="1" name="Logo CiB"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="logo.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="889000" cy="889000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
const cell = (t, o = {}) => `<w:tc><w:tcPr>${o.span ? `<w:gridSpan w:val="${o.span}"/>` : ""}</w:tcPr>${p(r(t, { b: o.b }), { jc: o.jc })}</w:tc>`;
const corps = [
  p(img),
  p(r("ENTREPRISE CiB SARL", { b: 1, f: "Arial", s: 28, c: "E16326" })),
  p(r("Douala, le 16 novembre 2026"), { jc: "right" }),
  p(r("À l’attention de Monsieur le Directeur Général", { b: 1 }), { jc: "right" }),
  p(r("Objet : proposition de travaux de rénovation"), { st: "Titre1", jc: "center" }),
  p(r("Monsieur le Directeur Général,")),
  p(r("Nous avons l’honneur de vous soumettre notre proposition. Ce paragraphe est justifié et contient ") + r("un passage en rouge", { c: "FF0000" }) + r(", ") + r("un passage en italique", { i: 1 }) + r(" et ") + r("un passage souligné", { u: 1 }) + r(".") + `<w:r><w:br/></w:r>` + r("Ligne suivante après un retour à la ligne (Maj+Entrée)."), { jc: "both" }),
  p(r("Les travaux comprennent :")),
  p(r("Démolition des cloisons"), { num: 1 }),
  p(r("Pose de carrelage"), { num: 1 }),
  p(r("Carrelage 60x60 grès cérame"), { num: 1, lvl: 1 }),
  p(r("Plinthes assorties"), { num: 1, lvl: 1 }),
  p(r("Peinture intérieure"), { num: 1 }),
  p(r("Étapes du chantier :", { b: 1 })),
  p(r("Installation du chantier"), { num: 2 }), p(r("Gros œuvre"), { num: 2 }), p(r("Finitions"), { num: 2 }),
  p(r("Paiement :", { b: 1 })),
  p(r("Acompte de 40 %"), { num: 3 }), p(r("Solde à la réception"), { num: 3 }),
  `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="4000"/><w:gridCol w:w="2000"/><w:gridCol w:w="3000"/></w:tblGrid>` +
  `<w:tr>${cell("Désignation", { b: 1 })}${cell("Quantité", { b: 1 })}${cell("Montant (FCFA)", { b: 1 })}</w:tr>` +
  `<w:tr>${cell("Carrelage")}${cell("120 m²")}${cell("2 400 000", { jc: "right" })}</w:tr>` +
  `<w:tr>${cell("Peinture")}${cell("300 m²")}${cell("1 500 000", { jc: "right" })}</w:tr>` +
  `<w:tr>${cell("TOTAL", { span: 2, b: 1 })}${cell("3 900 000", { jc: "right", b: 1 })}</w:tr></w:tbl>`,
  p(r("Texte en Courier New taille 9.", { f: "Courier New", s: 18 })),
  p(`<w:r><w:br w:type="page"/></w:r>`),
  p(r("Page 2 : veuillez agréer, Monsieur le Directeur Général, l’expression de nos salutations distinguées."), { jc: "both" }),
  p(r("Le Gérant", { b: 1 }), { jc: "right" }),
].join("");
const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${corps}<w:sectPr><w:headerReference w:type="default" r:id="rIdH"/><w:footerReference w:type="default" r:id="rIdF"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
const niv = (i, fmt, txt) => `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${txt}"/><w:pPr><w:ind w:left="${720 * (i + 1)}" w:hanging="360"/></w:pPr></w:lvl>`;
const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${W}><w:abstractNum w:abstractNumId="0">${niv(0, "bullet", "•")}${niv(1, "bullet", "o")}</w:abstractNum><w:abstractNum w:abstractNumId="1">${niv(0, "decimal", "%1.")}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num><w:num w:numId="3"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num></w:numbering>`;
const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Titre1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style></w:styles>`;
const hf = (tag, t) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:${tag} ${W}>${p(r(t))}</w:${tag}>`;
const zip = new JSZip();
zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`);
zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdN" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rIdH" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdF" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/><Relationship Id="rIdImg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.png"/></Relationships>`);
zip.file("word/document.xml", document);
zip.file("word/styles.xml", styles);
zip.file("word/numbering.xml", numbering);
zip.file("word/header1.xml", hf("hdr", "CiB – Construction Intelligente des Bâtiments (en-tête)"));
zip.file("word/footer1.xml", hf("ftr", "BP 1234 Douala – Tél. 6 99 00 00 00 (pied de page)"));
zip.file("word/media/logo.png", readFileSync(join(RACINE, "img", "logo-cib.png")));
  writeFileSync(chemin, await zip.generateAsync({ type: "nodebuffer" }));
  return chemin;
}
