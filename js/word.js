/* EditeurCiB : ouverture et export des fichiers Word (.docx), nettoyage du texte collé depuis Word.
   - exporter(element)  → Blob .docx (gras, italique, souligné, barré, couleurs, surlignage, polices, tailles,
     alignements, retraits, listes à plusieurs niveaux, tableaux avec cases fusionnées, sauts de page, images).
   - importer(ArrayBuffer) → { html, avertissements } : lecture directe du format Word ; si le fichier est
     inhabituel, repli sur la bibliothèque mammoth (moins fidèle).
   - nettoyerCollage(html) → html propre (styles « Mso », balises Office, listes Word…). */
(function(){
"use strict";

/* ====================================================================== */
/* Outils communs                                                          */
/* ====================================================================== */
const NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const EMU_PX = 9525;                 // 1 pixel (96 ppp) = 9525 EMU
const LARGEUR_TEXTE_TW = 9070;       // largeur du texte sur A4 avec 2,5 cm de marges (twips)
const LARGEUR_TEXTE_PX = 605;
// Caractères interdits dans un fichier XML (Word déclare le fichier corrompu s'il en trouve).
const INTERDITS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
const esc = s => String(s).replace(INTERDITS, "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

function hexa(c){
  if(!c) return null;
  c = String(c).trim().toLowerCase();
  if(c === "transparent" || c === "auto" || c === "inherit" || c === "initial") return null;
  let m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
  if(m){ if(m[4] !== undefined && +m[4] === 0) return null; return [m[1],m[2],m[3]].map(n=>(+n).toString(16).padStart(2,"0")).join("").toUpperCase(); }
  m = c.match(/^#?([0-9a-f]{6})$/); if(m) return m[1].toUpperCase();
  m = c.match(/^#([0-9a-f]{3})$/); if(m) return m[1].split("").map(x=>x+x).join("").toUpperCase();
  const noms = {black:"000000",white:"FFFFFF",red:"FF0000",green:"008000",blue:"0000FF",yellow:"FFFF00",gray:"808080",grey:"808080",orange:"FFA500",purple:"800080",navy:"000080",maroon:"800000",teal:"008080",silver:"C0C0C0",lime:"00FF00",aqua:"00FFFF",fuchsia:"FF00FF",olive:"808000"};
  return noms[c] || null;
}
function demiPoints(fs){
  if(!fs) return null;
  const mots = {"xx-small":9,"x-small":10,"small":13,"medium":16,"large":18,"x-large":24,"xx-large":32,"xxx-large":48};
  let m = String(fs).match(/([\d.]+)pt/); if(m) return Math.round(+m[1]*2);
  m = String(fs).match(/([\d.]+)px/); if(m) return Math.round(+m[1]*0.75*2);
  if(mots[fs]) return Math.round(mots[fs]*0.75*2);
  return null;
}
const premierePolice = f => String(f||"").split(",")[0].replace(/['"]/g,"").trim();
function px(v){ const m = String(v||"").match(/^([\d.]+)(px|pt|cm|mm|in)?$/); if(!m) return null; const n = +m[1]; return ({pt:n*96/72, cm:n*96/2.54, mm:n*96/25.4, in:n*96}[m[2]] || n); }

/* ====================================================================== */
/* EXPORT : page de l'éditeur → .docx                                      */
/* ====================================================================== */
function exporter(racine){
  const ctx = { images: [], listes: [], idDessin: 1 };
  const corps = blocs(racine, [], ctx, {}).join("") || "<w:p/>";
  return assembler(corps, ctx);
}

// Propriétés de texte héritées d'un élément vers ses enfants.
function proprietes(el, p){
  const q = Object.assign({}, p);
  const t = el.tagName, st = el.style;
  if(t==="B"||t==="STRONG"||t==="TH") q.b = true;
  if(t==="I"||t==="EM"||t==="CITE") q.i = true;
  if(t==="U"||t==="INS") q.u = true;
  if(t==="S"||t==="STRIKE"||t==="DEL") q.s = true;
  if(t==="SUP") q.va = "superscript";
  if(t==="SUB") q.va = "subscript";
  if(t==="MARK") q.fond = "FFFF00";
  if(st){
    if(st.fontWeight==="bold" || st.fontWeight==="bolder" || +st.fontWeight>=600) q.b = true;
    if(st.fontWeight==="normal" || st.fontWeight==="400") q.b = false;
    if(st.fontStyle==="italic") q.i = true;
    if(st.fontStyle==="normal") q.i = false;
    const deco = (st.textDecorationLine||st.textDecoration||"");
    if(deco.includes("underline")) q.u = true;
    if(deco.includes("line-through")) q.s = true;
    const c = hexa(st.color); if(c) q.c = c;
    const f = hexa(st.backgroundColor); if(f && f !== "FFFFFF") q.fond = f;
    const s = demiPoints(st.fontSize); if(s) q.sz = s;
    if(st.fontFamily) q.f = premierePolice(st.fontFamily);
    if(st.verticalAlign==="super") q.va = "superscript";
    if(st.verticalAlign==="sub") q.va = "subscript";
    if(st.textTransform==="uppercase") q.maj = true;
  }
  if(t==="FONT"){
    if(el.getAttribute("face")) q.f = premierePolice(el.getAttribute("face"));
    const c = hexa(el.getAttribute("color")); if(c) q.c = c;
    const tailles = {1:16,2:20,3:24,4:28,5:36,6:48,7:72}; const sz = el.getAttribute("size"); if(sz && tailles[sz]) q.sz = tailles[sz];
  }
  return q;
}
function rpr(p){
  let x = "";
  if(p.f) x += `<w:rFonts w:ascii="${esc(p.f)}" w:hAnsi="${esc(p.f)}" w:cs="${esc(p.f)}"/>`;
  if(p.b) x += "<w:b/><w:bCs/>";
  if(p.i) x += "<w:i/><w:iCs/>";
  if(p.maj) x += "<w:caps/>";
  if(p.s) x += "<w:strike/>";
  if(p.c) x += `<w:color w:val="${p.c}"/>`;
  if(p.sz) x += `<w:sz w:val="${p.sz}"/><w:szCs w:val="${p.sz}"/>`;
  if(p.u) x += `<w:u w:val="single"/>`;
  if(p.fond) x += `<w:shd w:val="clear" w:color="auto" w:fill="${p.fond}"/>`;
  if(p.va) x += `<w:vertAlign w:val="${p.va}"/>`;
  return x ? `<w:rPr>${x}</w:rPr>` : "";
}
// Texte → morceaux Word (tabulations et retours à la ligne compris).
function run(t, p){
  t = t.replace(INTERDITS, c => c === "\u000B" || c === "\u000C" ? "\n" : "");
  const r = rpr(p);
  let x = "";
  t.split(/(\t|\n)/).forEach(part=>{
    if(part === "\t") x += `<w:r>${r}<w:tab/></w:r>`;
    else if(part === "\n") x += `<w:r>${r}<w:br/></w:r>`;
    else if(part) x += `<w:r>${r}<w:t xml:space="preserve">${esc(part)}</w:t></w:r>`;
  });
  return x;
}
function blanc(el){ // l'élément garde-t-il les espaces tels quels ?
  for(let n = el; n && n.nodeType === 1; n = n.parentElement){
    const ws = n.style && n.style.whiteSpace; if(ws) return /pre/.test(ws);
    if(n.classList && n.classList.contains("tab")) return true;
    if(n.tagName === "PRE") return true;
  }
  return false;
}
function runs(node, p, out, ctx){
  node.childNodes.forEach(n=>{
    if(n.nodeType===3){
      let t = n.data;
      if(!blanc(n.parentElement)) t = t.replace(/[ \t\r\n]+/g," ");
      t = t.replace(/ /g," ").replace(/​/g,"");
      if(t) out.push(run(t, p));
    } else if(n.nodeType===1){
      const tag = n.tagName;
      if(tag==="BR") out.push("<w:r><w:br/></w:r>");
      else if(tag==="IMG") out.push(image(n, ctx));
      else if(tag==="UL"||tag==="OL"||tag==="TABLE") {} // traités à part (blocs)
      else if(tag==="SCRIPT"||tag==="STYLE") {}
      else runs(n, proprietes(n, p), out, ctx);
    }
  });
  return out;
}
function jc(el){
  const a = (el.style && el.style.textAlign) || (el.getAttribute && el.getAttribute("align")) || "";
  return {center:"center",right:"right",end:"right",justify:"both",left:"left",start:"left"}[a.toLowerCase()] || null;
}
function para(el, opts, ctx){
  opts = opts || {};
  let ppr = "";
  if(opts.style) ppr += `<w:pStyle w:val="${opts.style}"/>`;
  if(opts.num) ppr += `<w:numPr><w:ilvl w:val="${opts.niveau||0}"/><w:numId w:val="${opts.num}"/></w:numPr>`;
  const retrait = el.style && px(el.style.marginLeft || el.style.paddingLeft);
  if(retrait && !opts.num) ppr += `<w:ind w:left="${Math.round(retrait*15)}"/>`;
  const j = jc(el) || opts.jc; if(j) ppr += `<w:jc w:val="${j}"/>`;
  const contenu = runs(el, proprietes(el, opts.props || {}), [], ctx).join("");
  return `<w:p>${ppr?`<w:pPr>${ppr}</w:pPr>`:""}${contenu}</w:p>`;
}
const BLOCS = /^(P|DIV|H1|H2|H3|H4|H5|H6|UL|OL|TABLE|BLOCKQUOTE|LI|PRE|HR|SECTION|ARTICLE|HEADER|FOOTER|ADDRESS|FIGURE)$/;
function blocs(parent, out, ctx, props){
  let enLigne = null;
  const vider = () => {
    if(enLigne){ if(enLigne.textContent.trim() || enLigne.querySelector("img,br")) out.push(para(enLigne, {props, jc: jc(parent)}, ctx)); enLigne = null; }
  };
  parent.childNodes.forEach(n=>{
    if(n.nodeType===1 && BLOCS.test(n.tagName)){
      vider();
      const t = n.tagName;
      if(/^H[1-6]$/.test(t)) out.push(para(n, {style:"Heading"+Math.min(3,+t[1]), props}, ctx));
      else if(t==="UL"||t==="OL") liste(n, out, ctx, props);
      else if(t==="TABLE") out.push(tableau(n, ctx));
      else if(t==="HR"){
        if(n.classList.contains("saut-page")) out.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
        else out.push('<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/></w:pBdr></w:pPr></w:p>');
      }
      else if([...n.children].some(c=>BLOCS.test(c.tagName))) blocs(n, out, ctx, proprietes(n, props));
      else out.push(para(n, {props}, ctx));
    } else {
      if(n.nodeType===3 && !n.data.trim() && !enLigne) return;
      if(n.nodeType!==1 && n.nodeType!==3) return;
      if(!enLigne) enLigne = document.createElement("p");
      enLigne.appendChild(n.cloneNode(true));
    }
  });
  vider();
  return out;
}

/* Listes : chaque liste a sa propre numérotation (B8) et les sous-listes deviennent des niveaux (B7). */
function liste(racine, out, ctx, props){
  const niveaux = [];   // format de chaque niveau pour cette liste
  const id = ctx.listes.length + 1;
  ctx.listes.push(niveaux);
  const debut = +racine.getAttribute("start") || 1;
  (function parcourir(l, niv){
    if(!niveaux[niv]) niveaux[niv] = { ordonnee: l.tagName === "OL", type: l.getAttribute("type") || "", debut: niv === 0 ? debut : (+l.getAttribute("start") || 1) };
    [...l.children].forEach(li=>{
      if(li.tagName !== "LI"){ if(li.tagName==="UL"||li.tagName==="OL") parcourir(li, niv+1); return; }
      // Contenu du point sans les sous-listes, puis les sous-listes au niveau suivant.
      const copie = li.cloneNode(true);
      copie.querySelectorAll(":scope > ul, :scope > ol").forEach(x=>x.remove());
      const sousTableaux = [...copie.querySelectorAll(":scope > table")]; sousTableaux.forEach(x=>x.remove());
      // Paragraphes à l'intérieur du point : réunis avec des retours à la ligne.
      const ps = [...copie.querySelectorAll(":scope > p, :scope > div")];
      ps.forEach((p, i)=>{ if(i < ps.length - 1) p.appendChild(document.createElement("br")); p.replaceWith(...p.childNodes); });
      out.push(para(copie, { style:"ListParagraph", num:id, niveau:Math.min(niv,8), props, jc: jc(li) }, ctx));
      sousTableaux.forEach(tb=>out.push(tableau(tb, ctx)));
      [...li.children].forEach(c=>{ if(c.tagName==="UL"||c.tagName==="OL") parcourir(c, niv+1); });
    });
  })(racine, 0);
}
function niveauxXml(niveaux){
  const puces = ["•","o","▪"];
  let x = "";
  for(let i=0;i<9;i++){
    const n = niveaux[i] || niveaux[niveaux.length-1] || {ordonnee:false};
    let fmt, txt, police = "";
    if(n.ordonnee){
      fmt = {a:"lowerLetter",A:"upperLetter",i:"lowerRoman",I:"upperRoman"}[n.type] || "decimal";
      txt = `%${i+1}.`;
    } else {
      fmt = "bullet"; txt = puces[i%3];
      if(txt === "o") police = '<w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/></w:rPr>';
    }
    x += `<w:lvl w:ilvl="${i}"><w:start w:val="${n.debut||1}"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${esc(txt)}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720*(i+1)}" w:hanging="360"/></w:pPr>${police}</w:lvl>`;
  }
  return x;
}

/* Tableaux : cases fusionnées horizontalement (gridSpan) et verticalement (vMerge) (B2). */
function tableau(t, ctx){
  const lignes = [...t.rows];
  // Grille d'occupation des cases.
  const grille = [];
  lignes.forEach((l, i)=>{
    grille[i] = grille[i] || [];
    let col = 0;
    [...l.cells].forEach(c=>{
      while(grille[i][col]) col++;
      const cs = Math.max(1, +c.colSpan || 1), rs = Math.max(1, Math.min(+c.rowSpan || 1, lignes.length - i));
      for(let r=0;r<rs;r++){
        grille[i+r] = grille[i+r] || [];
        for(let k=0;k<cs;k++) grille[i+r][col+k] = { cellule:c, ligne:i, col, cs, rs, debut: r===0 && k===0, suite: r>0 && k===0 };
      }
      col += cs;
    });
  });
  const nbCol = Math.max(1, ...grille.map(l=>l.length));
  // Largeur des colonnes : mesurée à l'écran si possible, sinon parts égales.
  const mesures = [];
  for(let c=0;c<nbCol;c++){
    for(const l of grille){ const g = l[c]; if(g && g.cs === 1 && g.cellule.offsetWidth){ mesures[c] = g.cellule.offsetWidth; break; } }
  }
  const connues = mesures.filter(Boolean), moyenne = connues.length ? connues.reduce((a,b)=>a+b,0)/connues.length : 1;
  const brutes = Array.from({length:nbCol}, (_,c)=>mesures[c] || moyenne);
  const somme = brutes.reduce((a,b)=>a+b,0);
  const largeurs = brutes.map(w=>Math.max(200, Math.round(w/somme*LARGEUR_TEXTE_TW)));
  const sansBordure = t.classList.contains("sans-bordure") || t.getAttribute("border") === "0";
  const trait = sansBordure ? 'w:val="nil"' : 'w:val="single" w:sz="4" w:space="0" w:color="808080"';
  const bords = ["top","left","bottom","right","insideH","insideV"].map(b=>`<w:${b} ${trait}/>`).join("");
  let x = `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${bords}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="108" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${largeurs.map(w=>`<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>`;
  grille.forEach((l, i)=>{
    x += "<w:tr>";
    if(lignes[i] && lignes[i].parentElement && lignes[i].parentElement.tagName === "THEAD") x = x.replace(/<w:tr>$/, "<w:tr><w:trPr><w:tblHeader/></w:trPr>");
    for(let c=0;c<nbCol;){
      const g = l[c];
      if(!g){ x += `<w:tc><w:tcPr><w:tcW w:w="${largeurs[c]}" w:type="dxa"/></w:tcPr><w:p/></w:tc>`; c++; continue; }
      const largeur = largeurs.slice(c, c+g.cs).reduce((a,b)=>a+b,0);
      let tcpr = `<w:tcW w:w="${largeur}" w:type="dxa"/>`;
      if(g.cs > 1) tcpr += `<w:gridSpan w:val="${g.cs}"/>`;
      if(g.rs > 1) tcpr += g.suite ? `<w:vMerge/>` : `<w:vMerge w:val="restart"/>`;
      const cel = g.cellule;
      const fond = hexa(cel.style && cel.style.backgroundColor); if(fond) tcpr += `<w:shd w:val="clear" w:color="auto" w:fill="${fond}"/>`;
      const va = cel.style && cel.style.verticalAlign; if(va === "middle" || va === "bottom") tcpr += `<w:vAlign w:val="${va==="middle"?"center":"bottom"}"/>`;
      let contenu = "<w:p/>";
      if(!g.suite){
        const ps = blocs(cel, [], ctx, proprietes(cel, {}));
        if(ps.length){ contenu = ps.join(""); if(/<\/w:tbl>$/.test(contenu)) contenu += "<w:p/>"; }
        const j = jc(cel); if(j) contenu = contenu.replace(/<w:p>(?!<w:pPr>)/g, `<w:p><w:pPr><w:jc w:val="${j}"/></w:pPr>`);
      }
      x += `<w:tc><w:tcPr>${tcpr}</w:tcPr>${contenu}</w:tc>`;
      c += g.cs;
    }
    x += "</w:tr>";
  });
  return x + "</w:tbl>";
}

/* Images (photos, logos, signatures) */
function image(img, ctx){
  const src = img.getAttribute("src") || "";
  const m = src.match(/^data:image\/(png|jpe?g|gif|bmp);base64,(.+)$/i);
  if(!m) return "";
  const ext = m[1].toLowerCase() === "jpg" ? "jpeg" : m[1].toLowerCase();
  const n = ctx.images.length + 1;
  ctx.images.push({ nom: `image${n}.${ext}`, ext, base64: m[2] });
  // Taille : celle choisie dans le document, sinon la taille réelle, limitée à la largeur du texte.
  const nat = { w: img.naturalWidth || 0, h: img.naturalHeight || 0 };
  let w = px(img.style.width) || +img.getAttribute("width") || img.width || nat.w || 200;
  let h = px(img.style.height) || +img.getAttribute("height") || (nat.w ? w * nat.h / nat.w : img.height) || w;
  if(img.style.height === "auto" || (!img.style.height && !img.getAttribute("height") && nat.w)) h = w * nat.h / nat.w;
  if(w > LARGEUR_TEXTE_PX){ h = h * LARGEUR_TEXTE_PX / w; w = LARGEUR_TEXTE_PX; }
  const cx = Math.round(w*EMU_PX), cy = Math.round(h*EMU_PX), id = ctx.idDessin++;
  const nom = esc(img.getAttribute("alt") || `Image ${n}`);
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="${nom}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="image${n}.${ext}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg${n}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

function assembler(corps, ctx){
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const document_ = `${xml}<w:document ${NS}><w:body>${corps}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const titreStyle = (id,nom,sz) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${nom}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="${+id.slice(-1)-1}"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr></w:style>`;
  const styles = `${xml}<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${titreStyle("Heading1","heading 1",36)}${titreStyle("Heading2","heading 2",30)}${titreStyle("Heading3","heading 3",26)}<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="40"/><w:contextualSpacing/></w:pPr></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`;
  let numbering = `${xml}<w:numbering ${W}>`;
  ctx.listes.forEach((niv, i)=>{ numbering += `<w:abstractNum w:abstractNumId="${i}"><w:multiLevelType w:val="hybridMultilevel"/>${niveauxXml(niv)}</w:abstractNum>`; });
  ctx.listes.forEach((niv, i)=>{ numbering += `<w:num w:numId="${i+1}"><w:abstractNumId w:val="${i}"/></w:num>`; });
  numbering += `</w:numbering>`;
  const types = `${xml}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/><Default Extension="bmp" ContentType="image/bmp"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
  const rels = `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
  const docRels = `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${ctx.images.map((im,i)=>`<Relationship Id="rIdImg${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${im.nom}"/>`).join("")}</Relationships>`;
  const zip = new JSZip();
  zip.file("[Content_Types].xml", types);
  zip.file("_rels/.rels", rels);
  zip.file("word/document.xml", document_);
  zip.file("docProps/app.xml", `${xml}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>EditeurCiB</Application><Company>CiB</Company></Properties>`);
  zip.file("word/styles.xml", styles);
  zip.file("word/numbering.xml", numbering);
  zip.file("word/_rels/document.xml.rels", docRels);
  ctx.images.forEach(im=>zip.file("word/media/" + im.nom, im.base64, {base64:true}));
  return zip.generateAsync({type:"blob", mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
}

/* ====================================================================== */
/* IMPORT : .docx → page de l'éditeur                                      */
/* ====================================================================== */
const enfants = (el, nom) => el ? [...el.childNodes].filter(n=>n.nodeType===1 && (!nom || n.localName===nom)) : [];
const enfant = (el, nom) => enfants(el, nom)[0] || null;
const attr = (el, nom) => el ? (el.getAttributeNS(NS_W, nom) ?? el.getAttribute("w:"+nom)) : null;
const echap = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const MIME = {png:"image/png", jpg:"image/jpeg", jpeg:"image/jpeg", gif:"image/gif", bmp:"image/bmp", webp:"image/webp", svg:"image/svg+xml"};
const SURLIGNAGE = {yellow:"#FFFF00",green:"#00FF00",cyan:"#00FFFF",magenta:"#FF00FF",blue:"#0000FF",red:"#FF0000",darkBlue:"#000080",darkCyan:"#008080",darkGreen:"#008000",darkMagenta:"#800080",darkRed:"#800000",darkYellow:"#808000",darkGray:"#808080",lightGray:"#C0C0C0",black:"#000000"};

async function importer(buffer){
  const zip = await JSZip.loadAsync(buffer);
  try{ return await lireDocx(zip); }
  catch(e){
    if(!window.mammoth) throw e;
    const res = await mammoth.convertToHtml({arrayBuffer: buffer}, {styleMap:["u => u"]});
    return { html: res.value || "<p><br></p>", avertissements: ["Ce fichier a été ouvert en mode simplifié : la mise en page (alignements, couleurs, polices) n’a pas pu être reprise."] };
  }
}

async function lireXml(zip, chemin){
  const f = zip.file(chemin); if(!f) return null;
  const d = new DOMParser().parseFromString(await f.async("string"), "application/xml");
  if(d.getElementsByTagName("parsererror").length) throw new Error("XML illisible : " + chemin);
  return d;
}
async function lireRels(zip, chemin){
  const d = await lireXml(zip, chemin); const r = {};
  if(d) [...d.getElementsByTagName("Relationship")].forEach(x=>{ r[x.getAttribute("Id")] = { cible: x.getAttribute("Target"), type: x.getAttribute("Type")||"", externe: x.getAttribute("TargetMode")==="External" }; });
  return r;
}

async function lireDocx(zip){
  const doc = await lireXml(zip, "word/document.xml");
  if(!doc) throw new Error("document.xml absent");
  const avert = new Set();
  const rels = await lireRels(zip, "word/_rels/document.xml.rels");

  /* Styles (avec héritage « basedOn ») */
  const stylesXml = await lireXml(zip, "word/styles.xml");
  const styles = {};
  let defRpr = null, defPpr = null, styleParDefaut = null, tableParDefaut = null;
  if(stylesXml){
    const dd = stylesXml.getElementsByTagNameNS(NS_W, "docDefaults")[0];
    if(dd){ defRpr = dd.getElementsByTagNameNS(NS_W, "rPr")[0] || null; defPpr = dd.getElementsByTagNameNS(NS_W, "pPr")[0] || null; }
    [...stylesXml.getElementsByTagNameNS(NS_W, "style")].forEach(s=>{
      const id = attr(s, "styleId");
      styles[id] = { type: attr(s,"type"), nom: (attr(enfant(s,"name"),"val")||"").toLowerCase(), base: attr(enfant(s,"basedOn"),"val"), ppr: enfant(s,"pPr"), rpr: enfant(s,"rPr"), tblpr: enfant(s,"tblPr") };
      if(attr(s,"default") === "1" || attr(s,"default") === "true"){ if(attr(s,"type")==="paragraph") styleParDefaut = id; if(attr(s,"type")==="table") tableParDefaut = id; }
    });
  }
  const chaine = id => { const out = []; const vus = new Set(); while(id && styles[id] && !vus.has(id)){ vus.add(id); out.unshift(styles[id]); id = styles[id].base; } return out; };

  /* Numérotation (listes) */
  const numXml = await lireXml(zip, "word/numbering.xml");
  const abstraits = {}, nums = {};
  if(numXml){
    [...numXml.getElementsByTagNameNS(NS_W, "abstractNum")].forEach(a=>{
      const niv = {};
      enfants(a, "lvl").forEach(l=>{ niv[attr(l,"ilvl")] = { fmt: attr(enfant(l,"numFmt"),"val") || "decimal", debut: +attr(enfant(l,"start"),"val") || 1 }; });
      abstraits[attr(a,"abstractNumId")] = niv;
    });
    [...numXml.getElementsByTagNameNS(NS_W, "num")].forEach(n=>{
      const debuts = {};
      enfants(n, "lvlOverride").forEach(o=>{ const so = enfant(o,"startOverride"); if(so) debuts[attr(o,"ilvl")] = +attr(so,"val"); });
      nums[attr(n,"numId")] = { abs: attr(enfant(n,"abstractNumId"),"val"), debuts };
    });
  }
  const niveauListe = (numId, ilvl) => {
    const n = nums[numId]; if(!n) return null;
    const l = (abstraits[n.abs]||{})[ilvl] || {fmt:"bullet"};
    if(l.fmt === "none") return null;
    return { ordonnee: l.fmt !== "bullet", type: {lowerLetter:"a",upperLetter:"A",lowerRoman:"i",upperRoman:"I"}[l.fmt] || "", debut: n.debuts[ilvl] || l.debut || 1 };
  };

  /* Images */
  const medias = {};
  async function imageDe(rid, rel){
    const r = rel[rid]; if(!r || r.externe) return null;
    const chemin = r.cible.startsWith("/") ? r.cible.slice(1) : "word/" + r.cible.replace(/^\.\//,"");
    if(medias[chemin] !== undefined) return medias[chemin];
    const ext = (chemin.split(".").pop()||"").toLowerCase();
    const f = zip.file(chemin);
    if(!f || !MIME[ext]){ if(f) avert.add("Une ou plusieurs images au format Windows (EMF/WMF) ne peuvent pas être affichées."); medias[chemin] = null; return null; }
    medias[chemin] = "data:" + MIME[ext] + ";base64," + await f.async("base64");
    return medias[chemin];
  }

  /* Propriétés de paragraphe et de texte (style + direct) */
  function propsTexte(rprs){
    const p = {};
    rprs.forEach(r=>{
      if(!r) return;
      enfants(r).forEach(e=>{
        const v = attr(e, "val"), oui = v === null || !/^(0|false|off|none)$/.test(v);
        switch(e.localName){
          case "b": p.b = oui; break;
          case "i": p.i = oui; break;
          case "u": p.u = oui && v !== "none"; break;
          case "strike": case "dstrike": p.s = oui; break;
          case "caps": p.maj = oui; break;
          case "vanish": p.cache = oui; break;
          case "color": if(v && v !== "auto") p.c = "#" + v; break;
          case "sz": if(v) p.sz = +v / 2; break;
          case "rFonts": { const f = attr(e,"ascii") || attr(e,"hAnsi"); if(f) p.f = f; break; }
          case "highlight": if(SURLIGNAGE[v]) p.fond = SURLIGNAGE[v]; break;
          case "shd": { const f = attr(e,"fill"); if(f && f !== "auto" && f.toUpperCase() !== "FFFFFF") p.fond = "#" + f; break; }
          case "vertAlign": p.va = v; break;
        }
      });
    });
    return p;
  }
  const rprsStyle = id => chaine(id).map(s=>s.rpr);
  const pprsStyle = id => chaine(id).map(s=>s.ppr);
  const baseTexte = propsTexte([defRpr, ...rprsStyle(styleParDefaut)]);

  function styleCss(p, base){
    const css = [];
    if(p.c && p.c.toUpperCase() !== "#000000") css.push("color:" + p.c);
    if(p.fond) css.push("background-color:" + p.fond);
    if(p.sz && p.sz !== base.sz) css.push("font-size:" + p.sz + "pt");
    if(p.f && p.f !== base.f) css.push("font-family:" + (/\s/.test(p.f) ? "'" + p.f.replace(/'/g,"") + "'" : p.f));
    return css.join(";");
  }
  function enrober(texte, p, base){
    if(!texte) return "";
    let h = texte;
    if(p.va === "superscript") h = `<sup>${h}</sup>`; else if(p.va === "subscript") h = `<sub>${h}</sub>`;
    if(p.s) h = `<s>${h}</s>`;
    if(p.u) h = `<u>${h}</u>`;
    if(p.i) h = `<i>${h}</i>`;
    if(p.b) h = `<b>${h}</b>`;
    const css = styleCss(p, base);
    if(css) h = `<span style="${css}">${h}</span>`;
    return h;
  }

  /* Lecture d'un paragraphe → { html, saut, liste, titre, align } */
  async function paragraphe(p, rel, opts){
    const ppr = enfant(p, "pPr");
    const idStyle = attr(enfant(ppr,"pStyle"),"val") || styleParDefaut;
    const st = styles[idStyle];
    const pprs = [defPpr, ...pprsStyle(idStyle), ppr];
    let align = null, retrait = 0, numPr = null, sautAvant = false, niveauPlan = null;
    pprs.forEach(x=>{
      if(!x) return;
      const j = enfant(x,"jc"); if(j) align = attr(j,"val");
      const ind = enfant(x,"ind"); if(ind){ const l = attr(ind,"left") ?? attr(ind,"start"); if(l !== null) retrait = +l || 0; }
      const np = enfant(x,"numPr"); if(np) numPr = np;
      const pb = enfant(x,"pageBreakBefore"); if(pb && attr(pb,"val") !== "0" && attr(pb,"val") !== "false") sautAvant = true;
      const ol = enfant(x,"outlineLvl"); if(ol) niveauPlan = +attr(ol,"val");
    });
    // Titre ?
    let titre = 0;
    const nom = st ? st.nom : "";
    let m = nom.match(/^(heading|titre)\s*(\d)$/);
    if(m) titre = Math.min(3, +m[2]);
    else if(nom === "title" || nom === "titre") titre = 1;
    else if(niveauPlan !== null && niveauPlan < 3 && idStyle !== styleParDefaut) titre = niveauPlan + 1;
    // Liste ?
    let liste = null;
    if(numPr){
      const numId = attr(enfant(numPr,"numId"),"val"), ilvl = +(attr(enfant(numPr,"ilvl"),"val") || 0);
      const n = numId && numId !== "0" ? niveauListe(numId, ilvl) : null;
      if(n) liste = Object.assign({ numId, niveau: ilvl }, n);
    }
    const baseP = Object.assign({}, baseTexte, propsTexte(rprsStyle(idStyle)));
    if(titre){ delete baseP.b; delete baseP.sz; }
    const morceaux = [];   // chaque élément : chaîne HTML ou {saut:true}
    const zones = [];      // paragraphes des zones de texte
    let champ = 0, resultat = true;
    async function lireRuns(conteneur){
      for(const e of enfants(conteneur)){
        switch(e.localName){
          case "r": await lireRun(e); break;
          case "hyperlink": case "smartTag": case "ins": case "customXml": case "fldSimple": case "moveTo": await lireRuns(e); break;
          case "sdt": await lireRuns(enfant(e,"sdtContent")); break;
          case "del": case "moveFrom": avert.add("Les modifications suivies ont été acceptées."); break;
          case "oMath": case "oMathPara": avert.add("Les équations ne peuvent pas être affichées."); break;
        }
      }
    }
    async function lireRun(r){
      const props = Object.assign({}, baseP, propsTexte([...rprsStyle(attr(enfant(enfant(r,"rPr"),"rStyle"),"val")), enfant(r,"rPr")]));
      if(props.cache) return;
      for(const e of enfants(r)){
        switch(e.localName){
          case "fldChar": {
            const t = attr(e,"fldCharType");
            if(t === "begin"){ champ++; resultat = false; } else if(t === "separate"){ resultat = true; } else if(t === "end"){ champ = Math.max(0, champ-1); resultat = true; }
            break;
          }
          case "instrText": break;
          case "t": if(champ && !resultat) break; { let t = e.textContent; if(props.maj) t = t.toUpperCase(); morceaux.push(enrober(echap(t), props, baseP)); } break;
          case "tab": case "ptab": morceaux.push('<span class="tab">\t</span>'); break;
          case "br": case "cr": if(attr(e,"type") === "page") morceaux.push({saut:true}); else if(attr(e,"type") !== "column") morceaux.push("<br>"); break;
          case "noBreakHyphen": morceaux.push("-"); break;
          case "sym": { const c = attr(e,"char"); if(c){ const code = parseInt(c,16); if(code < 0xF000) morceaux.push(String.fromCharCode(code)); } break; }
          case "footnoteReference": case "endnoteReference": { const id = attr(e,"id"); notes.push(id); morceaux.push(`<sup>${notes.length}</sup>`); avert.add("Les notes de bas de page ont été placées à la fin du texte."); break; }
          case "drawing": case "pict": case "object": await dessin(e); break;
          case "AlternateContent": { const ch = enfant(e,"Choice") || enfant(e,"Fallback"); if(ch) for(const x of enfants(ch)) if(/^(drawing|pict)$/.test(x.localName)) await dessin(x); break; }
        }
      }
    }
    async function dessin(e){
      // Zones de texte : leur contenu est repris après le paragraphe.
      const txbx = e.getElementsByTagNameNS(NS_W, "txbxContent");
      if(txbx.length){ avert.add("Les zones de texte ont été placées dans le texte, à la suite."); for(const t of txbx) zones.push(t); }
      if(e.getElementsByTagNameNS("*","anchor").length) avert.add("Les images flottantes ont été placées dans le texte.");
      if([...e.getElementsByTagNameNS("*","graphicData")].some(g=>/chart|diagram/.test(g.getAttribute("uri")||""))) avert.add("Les graphiques et schémas SmartArt ne peuvent pas être affichés.");
      // Images du dessin (plusieurs si c'est un groupe), sauf celles des zones de texte (reprises plus loin).
      const dansZone = b => { for(let n = b.parentNode; n && n !== e; n = n.parentNode) if(n.localName === "txbxContent") return true; return false; };
      const blips = [...e.getElementsByTagNameNS("*","blip"), ...e.getElementsByTagNameNS("*","imagedata")].filter(b=>!dansZone(b));
      const seul = blips.length === 1;
      for(const b of blips){
        const rid = b.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships","embed") || b.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships","id") || b.getAttribute("r:embed") || b.getAttribute("r:id");
        const src = rid ? await imageDe(rid, rel) : null;
        if(!src) continue;
        // Taille : celle de l'image elle-même (a:ext), sinon celle du dessin (wp:extent).
        let pic = b; while(pic && pic !== e && pic.localName !== "pic") pic = pic.parentNode;
        const ext = (pic && pic !== e && pic.getElementsByTagNameNS("*","ext")[0]) || (seul && e.getElementsByTagNameNS("*","extent")[0]);
        let largeur = ext ? Math.round(+ext.getAttribute("cx") / EMU_PX) : 0;
        if(!largeur){ const sh = b.parentNode && b.parentNode.getAttribute && b.parentNode.getAttribute("style"); const mm = sh && sh.match(/width:([\d.]+)(pt|px)/); if(mm) largeur = Math.round(+mm[1] * (mm[2]==="pt" ? 96/72 : 1)); }
        morceaux.push(`<img src="${src}" alt=""${largeur ? ` style="width:${largeur}px"` : ""}>`);
      }
    }
    await lireRuns(p);
    const css = [];
    const a = {center:"center",right:"right",end:"right",both:"justify",distribute:"justify"}[align];
    if(a) css.push("text-align:" + a);
    if(retrait > 0 && !liste) css.push("margin-left:" + Math.round(retrait/15) + "px");
    // Découpe aux sauts de page.
    const parts = [[]];
    morceaux.forEach(x=>{ if(typeof x === "object") parts.push([]); else parts[parts.length-1].push(x); });
    const balise = titre ? "h" + titre : "p";
    const res = [];
    if(sautAvant && !opts.dansTableau) res.push({saut:true});
    parts.forEach((pt, i)=>{
      if(i > 0 && !opts.dansTableau) res.push({saut:true});
      const contenu = pt.join("");
      if(i > 0 && !contenu) return;
      res.push({ html: contenu || "<br>", balise, css: css.join(";"), liste });
    });
    for(const z of zones) res.push(...await blocsDe(z, rel, opts));
    return res;
  }

  /* Tableau */
  async function tableau(tbl, rel){
    const tblPr = enfant(tbl, "tblPr");
    const idSt = attr(enfant(tblPr,"tblStyle"),"val") || tableParDefaut;
    // Bordures : directes, sinon celles du style du tableau.
    const aDesBords = b => b && enfants(b).some(x=>!/^(nil|none)$/.test(attr(x,"val")||"nil"));
    let bords = enfant(tblPr,"tblBorders");
    if(!bords) for(const s of chaine(idSt).reverse()){ if(s.tblpr && enfant(s.tblpr,"tblBorders")){ bords = enfant(s.tblpr,"tblBorders"); break; } }
    let avecBords = aDesBords(bords);
    // Bordures définies case par case
    if(!avecBords) avecBords = [...tbl.getElementsByTagNameNS(NS_W,"tcBorders")].some(aDesBords);
    const lignes = enfants(tbl, "tr");
    // Repère les fusions verticales : position de grille de chaque case.
    const grille = lignes.map(tr=>{
      let col = 0; const cases = [];
      enfants(tr, "tc").forEach(tc=>{
        const tcPr = enfant(tc,"tcPr");
        const span = +attr(enfant(tcPr,"gridSpan"),"val") || 1;
        const vm = enfant(tcPr,"vMerge");
        cases.push({ tc, col, span, vm: vm ? (attr(vm,"val") === "restart" ? "debut" : "suite") : null });
        col += span;
      });
      return cases;
    });
    let h = `<table${avecBords ? "" : ' class="sans-bordure"'}><tbody>`;
    for(let i=0;i<lignes.length;i++){
      h += "<tr>";
      for(const c of grille[i]){
        if(c.vm === "suite") continue;
        let rs = 1;
        if(c.vm === "debut") for(let k=i+1;k<lignes.length;k++){ const s = grille[k].find(x=>x.col===c.col); if(s && s.vm === "suite") rs++; else break; }
        const tcPr = enfant(c.tc,"tcPr");
        const css = [];
        const shd = enfant(tcPr,"shd"); const fill = shd && attr(shd,"fill"); if(fill && fill !== "auto" && fill.toUpperCase() !== "FFFFFF") css.push("background-color:#" + fill);
        const va = attr(enfant(tcPr,"vAlign"),"val"); if(va === "center") css.push("vertical-align:middle"); else if(va === "bottom") css.push("vertical-align:bottom");
        const contenu = rendre(await blocsDe(c.tc, rel, {dansTableau:true}));
        h += `<td${c.span>1?` colspan="${c.span}"`:""}${rs>1?` rowspan="${rs}"`:""}${css.length?` style="${css.join(";")}"`:""}>${contenu || "<br>"}</td>`;
      }
      h += "</tr>";
    }
    return h + "</tbody></table>";
  }

  /* Suite de blocs (corps, case de tableau, en-tête…) */
  async function blocsDe(conteneur, rel, opts){
    const out = [];
    for(const e of enfants(conteneur)){
      if(e.localName === "p") out.push(...await paragraphe(e, rel, opts||{}));
      else if(e.localName === "tbl") out.push({ brut: await tableau(e, rel) });
      else if(e.localName === "sdt") out.push(...await blocsDe(enfant(e,"sdtContent"), rel, opts));
      else if(e.localName === "customXml") out.push(...await blocsDe(e, rel, opts));
    }
    return out;
  }

  /* Assemblage HTML, avec regroupement des listes */
  function rendre(items){
    let h = "", num = null;
    const pile = [];   // listes ouvertes ; le dernier point de chaque liste reste ouvert
    const fermerNiveau = () => { h += "</li></" + pile.pop() + ">"; };
    for(const it of items){
      if(it.liste){
        const l = it.liste, balise = l.ordonnee ? "ol" : "ul", niv = Math.min(l.niveau, 8);
        if(pile.length && num !== l.numId) while(pile.length) fermerNiveau();
        num = l.numId;
        while(pile.length > niv + 1) fermerNiveau();
        if(pile.length === niv + 1){ if(pile[niv] !== balise) fermerNiveau(); else h += "</li>"; }
        while(pile.length < niv + 1){
          const ici = pile.length === niv, b = ici ? balise : "ul";
          const typ = ici && l.type ? ` type="${l.type}"` : "";
          const deb = ici && l.ordonnee && l.debut > 1 ? ` start="${l.debut}"` : "";
          h += `<${b}${typ}${deb}>`; pile.push(b);
          if(pile.length < niv + 1) h += "<li>";
        }
        h += `<li${it.css ? ` style="${it.css}"` : ""}>${it.html === "<br>" ? "" : it.html}`;
        continue;
      }
      while(pile.length) fermerNiveau(); num = null;
      if(it.saut) h += '<hr class="saut-page">';
      else if(it.brut) h += it.brut;
      else h += `<${it.balise}${it.css ? ` style="${it.css}"` : ""}>${it.html}</${it.balise}>`;
    }
    while(pile.length) fermerNiveau();
    return h;
  }

  const notes = [];
  const body = doc.getElementsByTagNameNS(NS_W, "body")[0];
  const sects = doc.getElementsByTagNameNS(NS_W, "sectPr");
  const sect = enfant(body, "sectPr") || sects[sects.length-1];
  if(sects.length > 1) avert.add("Les différentes sections (changements d’orientation, de marges…) ont été réunies.");
  if(sect){
    const cols = enfant(sect,"cols"); if(cols && +attr(cols,"num") > 1) avert.add("Le texte sur plusieurs colonnes a été mis sur une seule colonne.");
    const pg = enfant(sect,"pgSz"); if(pg && attr(pg,"orient") === "landscape") avert.add("La page était à l’horizontale (paysage) : elle est affichée à la verticale.");
  }
  if(zip.file("word/comments.xml")) avert.add("Les commentaires ne sont pas repris.");

  // En-tête et pied de page : placés au début et à la fin du texte pour ne rien perdre.
  async function partie(type){
    if(!sect) return [];
    const refs = enfants(sect, type + "Reference");
    const ref = refs.find(r=>attr(r,"type") === "default") || refs.find(r=>attr(r,"type") === "first") || refs[0];
    if(!ref) return [];
    const rid = ref.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships","id") || ref.getAttribute("r:id");
    const r = rels[rid]; if(!r) return [];
    const chemin = "word/" + r.cible.replace(/^\.\//,"");
    const x = await lireXml(zip, chemin); if(!x) return [];
    const relPartie = await lireRels(zip, chemin.replace(/word\/(.*)$/, "word/_rels/$1.rels"));
    const items = await blocsDe(x.documentElement, relPartie, {});
    const utile = items.some(it=>it.brut || (it.html && it.html.replace(/<br>|<[^>]+>|\s/g,"") ) || (it.html && /<img/.test(it.html)));
    return utile ? items : [];
  }
  const entete = await partie("header"), pied = await partie("footer");
  if(entete.length || pied.length) avert.add("L’en-tête et le pied de page ont été placés au début et à la fin du texte.");

  const corps = await blocsDe(body, rels, {});
  let html = rendre(entete) + rendre(corps) + rendre(pied);

  // Notes de bas de page, à la fin.
  if(notes.length){
    const fx = await lireXml(zip, "word/footnotes.xml"), ex = await lireXml(zip, "word/endnotes.xml");
    let h = '<p><b>Notes</b></p>';
    for(let i=0;i<notes.length;i++){
      const n = [...((fx && fx.getElementsByTagNameNS(NS_W,"footnote")) || []), ...((ex && ex.getElementsByTagNameNS(NS_W,"endnote")) || [])].find(x=>attr(x,"id") === notes[i]);
      const t = n ? n.textContent.trim() : "";
      h += `<p><sup>${i+1}</sup> ${echap(t)}</p>`;
    }
    html += h;
  }
  if(!html.replace(/<[^>]+>/g,"").trim() && !/<img|<table/.test(html)) html = "<p><br></p>";
  return { html, avertissements: [...avert] };
}

/* ====================================================================== */
/* COLLAGE depuis Word, une page web… (A10)                                */
/* ====================================================================== */
const GARDER = { B:"b", STRONG:"b", I:"i", EM:"i", U:"u", S:"s", STRIKE:"s", DEL:"s", SUP:"sup", SUB:"sub", P:"p", H1:"h1", H2:"h2", H3:"h3", H4:"h3", H5:"h3", H6:"h3", UL:"ul", OL:"ol", LI:"li", TABLE:"table", TBODY:"tbody", THEAD:"tbody", TFOOT:"tbody", TR:"tr", TD:"td", TH:"td", BR:"br", IMG:"img", SPAN:"span", FONT:"span", DIV:"p", BLOCKQUOTE:"p", PRE:"p", HR:"hr" };
const SUPPRIMER = /^(SCRIPT|STYLE|META|LINK|TITLE|HEAD|XML|OBJECT|EMBED|IFRAME|svg|SVG|NOSCRIPT|TEMPLATE|BUTTON|INPUT|SELECT|TEXTAREA|FORM)$/;
function stylePropre(el, tag){
  const st = el.style, out = [];
  if(!st) return "";
  const fw = st.fontWeight; if(fw === "bold" || +fw >= 600) out.push("font-weight:bold");
  if(st.fontStyle === "italic") out.push("font-style:italic");
  const deco = st.textDecorationLine || st.textDecoration || "";
  if(/underline/.test(deco)) out.push("text-decoration:underline"); else if(/line-through/.test(deco)) out.push("text-decoration:line-through");
  const c = hexa(st.color); if(c && c !== "000000") out.push("color:#" + c);
  const f = hexa(st.backgroundColor || st.background); if(f && f !== "FFFFFF") out.push("background-color:#" + f);
  const sz = demiPoints(st.fontSize); if(sz && sz !== 24) out.push("font-size:" + (sz/2) + "pt");
  const police = premierePolice(st.fontFamily); if(police && !/^(inherit|initial)$/.test(police)) out.push("font-family:" + (/\s/.test(police) ? "'" + police + "'" : police));
  if(/^(p|h1|h2|h3|li|td)$/.test(tag)){ const a = st.textAlign; if(/^(center|right|justify)$/.test(a)) out.push("text-align:" + a); }
  if(tag === "td"){ const va = st.verticalAlign; if(/^(middle|bottom)$/.test(va)) out.push("vertical-align:" + va); }
  if(tag === "img"){ const w = px(st.width); if(w) out.push("width:" + Math.round(w) + "px"); }
  return out.join(";");
}
function nettoyerCollage(html){
  // Commentaires conditionnels d'Office et balises « o:p », « w:… », « v:… ».
  html = String(html).replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, "").replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?(o|w|v|m|st1):[^>]*>/gi, "");
  const d = new DOMParser().parseFromString(html, "text/html");
  // Listes de Word : paragraphes « MsoListParagraph » avec « mso-list » → vraies listes.
  [...d.body.querySelectorAll("p")].forEach(p=>{
    const s = p.getAttribute("style") || "";
    const m = s.match(/mso-list:\s*l(\d+)\s+level(\d+)/i);
    if(!m) return;
    const marque = p.querySelector('[style*="mso-list:Ignore"], [style*="mso-list: Ignore"]');
    const txt = marque ? marque.textContent.trim() : "";
    if(marque) marque.remove();
    p.dataset.liste = m[1]; p.dataset.niveau = m[2];
    p.dataset.ordonnee = /^[\dA-Za-z]{1,3}[.)]$/.test(txt) ? "1" : "";
  });
  [...d.body.querySelectorAll("p[data-liste]")].forEach(p=>{
    if(!p.isConnected || p.closest("li")) return;
    // Regroupe les paragraphes de liste qui se suivent.
    const groupe = [p]; let n = p.nextElementSibling;
    while(n && n.tagName === "P" && n.dataset.liste !== undefined){ groupe.push(n); n = n.nextElementSibling; }
    const racine = d.createElement(p.dataset.ordonnee ? "ol" : "ul");
    p.before(racine);
    const pile = [{ niveau: 1, el: racine }];
    groupe.forEach(x=>{
      const niv = +x.dataset.niveau || 1;
      while(pile.length > 1 && pile[pile.length-1].niveau > niv) pile.pop();
      if(niv > pile[pile.length-1].niveau){
        const parent = pile[pile.length-1].el.lastElementChild || pile[pile.length-1].el.appendChild(d.createElement("li"));
        const sous = d.createElement(x.dataset.ordonnee ? "ol" : "ul"); parent.appendChild(sous);
        pile.push({ niveau: niv, el: sous });
      }
      const li = d.createElement("li"); li.append(...x.childNodes); pile[pile.length-1].el.appendChild(li); x.remove();
    });
  });
  function copier(n, cible){
    n.childNodes.forEach(c=>{
      if(c.nodeType === 3){ cible.appendChild(d.createTextNode(c.data.replace(/[\r\n]+/g," "))); return; }
      if(c.nodeType !== 1) return;
      const T = c.tagName.toUpperCase();
      if(SUPPRIMER.test(T)) return;
      const tag = GARDER[T];
      if(!tag){ copier(c, cible); return; }   // balise inconnue (a, section…) : on garde le contenu
      if(tag === "img"){
        const src = c.getAttribute("src") || "";
        if(!/^data:image\/(png|jpe?g|gif|bmp|webp);base64,/i.test(src)) return; // images de fichiers locaux ou d'Internet : ignorées
        const im = d.createElement("img"); im.setAttribute("src", src);
        const w = stylePropre(c, "img") || (c.getAttribute("width") ? "width:" + parseInt(c.getAttribute("width")) + "px" : "");
        if(w) im.setAttribute("style", w);
        cible.appendChild(im); return;
      }
      const el = d.createElement(tag);
      const st = stylePropre(c, tag);
      if(st) el.setAttribute("style", st);
      if(T === "FONT"){
        const extra = [];
        const col = hexa(c.getAttribute("color")); if(col && col !== "000000") extra.push("color:#" + col);
        const face = c.getAttribute("face"); if(face) extra.push("font-family:" + premierePolice(face));
        if(extra.length) el.setAttribute("style", [st, ...extra].filter(Boolean).join(";"));
      }
      if(tag === "td"){ ["colspan","rowspan"].forEach(a=>{ const v = +c.getAttribute(a); if(v > 1) el.setAttribute(a, v); }); if(T === "TH") el.setAttribute("style", [st, "font-weight:bold"].filter(Boolean).join(";")); }
      if(tag === "ol"){ const s = +c.getAttribute("start"); if(s > 1) el.setAttribute("start", s); const t = c.getAttribute("type"); if(t && /^[aAiI1]$/.test(t)) el.setAttribute("type", t); }
      if(tag === "table" && (c.getAttribute("border") === "0" || /border:\s*none/i.test(c.getAttribute("style")||"")) && !c.querySelector("td[style*='border'],th[style*='border']")) el.className = "sans-bordure";
      copier(c, el);
      // Paragraphe Word vide : « &nbsp; » → ligne vide.
      if(tag === "p" && !el.textContent.replace(/ /g,"").trim() && !el.querySelector("img,br")) el.innerHTML = "<br>";
      if(tag === "span" && !el.getAttribute("style")){ cible.append(...el.childNodes); return; }
      cible.appendChild(el);
    });
  }
  const sortie = d.createElement("div");
  copier(d.body, sortie);
  // Un « div » contenant des blocs ne doit pas devenir un paragraphe contenant des paragraphes.
  sortie.querySelectorAll("p p, p ul, p ol, p table, p h1, p h2, p h3").forEach(x=>{ const p = x.closest("p"); if(p && p !== x && p.parentNode){ p.replaceWith(...p.childNodes); } });
  return sortie.innerHTML;
}

window.CiBWord = { exporter, importer, nettoyerCollage };
})();
