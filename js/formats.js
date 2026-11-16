/* EditeurCiB : lecture des autres formats de documents.
   - .odt (LibreOffice, OpenOffice, WPS) : texte, titres, gras/italique/souligné, couleurs, tailles,
     alignements, listes, tableaux (cases fusionnées), images, sauts de page.
   - .doc (ancien format Word 97-2003) : le texte seulement (paragraphes, tableaux simplifiés, sauts de page).
   - .txt : texte brut (UTF-8, ou Windows-1252 pour les vieux fichiers).
   Chaque fonction renvoie { html, avertissements }. */
(function(){
"use strict";
const echap = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

/* ====================================================================== */
/* .odt                                                                    */
/* ====================================================================== */
const NS = {
  text: "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
  table: "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
  style: "urn:oasis:names:tc:opendocument:xmlns:style:1.0",
  fo: "urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0",
  draw: "urn:oasis:names:tc:opendocument:xmlns:drawing:1.0",
  svg: "urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0",
  xlink: "http://www.w3.org/1999/xlink",
  office: "urn:oasis:names:tc:opendocument:xmlns:office:1.0"
};
const a = (el, ns, nom) => el ? el.getAttributeNS(NS[ns], nom) : null;
const enf = el => el ? [...el.childNodes].filter(n=>n.nodeType===1) : [];
function longueurPx(v){ const m = String(v||"").match(/^([\d.]+)(cm|mm|in|pt|px)$/); if(!m) return 0; const n = +m[1]; return Math.round({cm:n*96/2.54, mm:n*96/25.4, in:n*96, pt:n*96/72, px:n}[m[2]]); }
const MIME = {png:"image/png", jpg:"image/jpeg", jpeg:"image/jpeg", gif:"image/gif", bmp:"image/bmp", svg:"image/svg+xml", webp:"image/webp"};

async function lireOdt(zip){
  const lire = async chemin => { const f = zip.file(chemin); if(!f) return null; const d = new DOMParser().parseFromString(await f.async("string"), "application/xml"); if(d.getElementsByTagName("parsererror").length) throw new Error("XML illisible"); return d; };
  const contenu = await lire("content.xml");
  if(!contenu) throw new Error("content.xml absent");
  const stylesXml = await lire("styles.xml");
  const avert = new Set();

  /* Styles (communs et automatiques), avec héritage */
  const styles = {}, listes = {};
  [stylesXml, contenu].forEach(d=>{
    if(!d) return;
    [...d.getElementsByTagNameNS(NS.style, "style")].forEach(s=>{
      const p = {}, tp = s.getElementsByTagNameNS(NS.style, "text-properties")[0], pp = s.getElementsByTagNameNS(NS.style, "paragraph-properties")[0];
      if(tp){
        const fw = a(tp,"fo","font-weight"); if(fw) p.b = fw === "bold" || +fw >= 600;
        const fs = a(tp,"fo","font-style"); if(fs) p.i = fs === "italic";
        const u = a(tp,"style","text-underline-style"); if(u) p.u = u !== "none";
        const lt = a(tp,"style","text-line-through-style"); if(lt) p.s = lt !== "none";
        const c = a(tp,"fo","color"); if(c) p.c = c;
        const bg = a(tp,"fo","background-color"); if(bg && bg !== "transparent") p.fond = bg;
        const sz = a(tp,"fo","font-size"); if(sz && /pt$/.test(sz)) p.sz = parseFloat(sz);
        const f = a(tp,"style","font-name") || a(tp,"fo","font-family"); if(f) p.f = f.replace(/['"]/g,"");
        const va = a(tp,"style","text-position"); if(va && /^(super|sub)/.test(va)) p.va = va.startsWith("super") ? "sup" : "sub";
      }
      if(pp){
        const al = a(pp,"fo","text-align"); if(al) p.align = {start:"left",left:"left",end:"right",right:"right",center:"center",justify:"justify"}[al];
        if(a(pp,"fo","break-before") === "page") p.sautAvant = true;
        if(a(pp,"fo","break-after") === "page") p.sautApres = true;
        const ml = longueurPx(a(pp,"fo","margin-left")); if(ml) p.retrait = ml;
      }
      styles[a(s,"style","name")] = { parent: a(s,"style","parent-style-name"), p, titre: (a(s,"style","name")||"").match(/^Heading_20_(\d)$/) };
    });
    [...d.getElementsByTagNameNS(NS.text, "list-style")].forEach(l=>{
      const niv = {};
      enf(l).forEach(x=>{ niv[+a(x,"text","level") || 1] = x.localName === "list-level-style-number"; });
      listes[a(l,"style","name")] = niv;
    });
  });
  const props = nom => { const ch = []; const vus = new Set(); while(nom && styles[nom] && !vus.has(nom)){ vus.add(nom); ch.unshift(styles[nom].p); nom = styles[nom].parent; } return Object.assign({}, ...ch); };

  const base = props("Standard");
  function css(p, bloc){
    const c = [];
    if(p.c && p.c.toLowerCase() !== "#000000") c.push("color:" + p.c);
    if(p.fond) c.push("background-color:" + p.fond);
    if(p.sz && p.sz !== (base.sz || 12) && !bloc) c.push("font-size:" + p.sz + "pt");
    if(p.f && p.f !== base.f && !bloc) c.push("font-family:" + (/\s/.test(p.f) ? "'" + p.f + "'" : p.f));
    return c.join(";");
  }
  function enrober(h, p){
    if(!h) return "";
    if(p.va) h = `<${p.va}>${h}</${p.va}>`;
    if(p.s) h = `<s>${h}</s>`; if(p.u) h = `<u>${h}</u>`; if(p.i) h = `<i>${h}</i>`; if(p.b) h = `<b>${h}</b>`;
    const c = css(p); return c ? `<span style="${c}">${h}</span>` : h;
  }

  async function image(frame){
    const im = frame.getElementsByTagNameNS(NS.draw, "image")[0]; if(!im) return "";
    const href = a(im,"xlink","href") || ""; const f = zip.file(href.replace(/^\.\//,""));
    const ext = (href.split(".").pop()||"").toLowerCase();
    if(!f || !MIME[ext]){ avert.add("Certaines images n’ont pas pu être affichées."); return ""; }
    const w = longueurPx(a(frame,"svg","width"));
    return `<img src="data:${MIME[ext]};base64,${await f.async("base64")}" alt=""${w ? ` style="width:${w}px"` : ""}>`;
  }
  async function enLigne(el, p){
    let h = "";
    for(const n of el.childNodes){
      if(n.nodeType === 3){ h += enrober(echap(n.data), p); continue; }
      if(n.nodeType !== 1) continue;
      switch(n.localName){
        case "span": h += await enLigne(n, Object.assign({}, p, props(a(n,"text","style-name")))); break;
        case "a": case "meta": case "ruby-base": h += await enLigne(n, p); break;
        case "s": h += " ".repeat(+a(n,"text","c") || 1); break;
        case "tab": h += '<span class="tab">\t</span>'; break;
        case "line-break": h += "<br>"; break;
        case "frame": h += await image(n); break;
        case "note": avert.add("Les notes de bas de page n’ont pas été reprises."); break;
        case "tracked-changes": avert.add("Les modifications suivies ont été acceptées."); break;
        default: if(!/^(bookmark|bookmark-start|bookmark-end|soft-page-break|annotation|annotation-end|reference-mark.*|sequence-decls)$/.test(n.localName)) h += await enLigne(n, p);
      }
    }
    return h;
  }
  async function paragraphe(el, titre){
    const st = props(a(el,"text","style-name"));
    const niveau = titre ? Math.min(3, +a(el,"text","outline-level") || 1) : 0;
    const c = [];
    if(st.align && st.align !== "left") c.push("text-align:" + st.align);
    if(st.retrait) c.push("margin-left:" + st.retrait + "px");
    const p = Object.assign({}, st); delete p.align; if(niveau){ delete p.b; delete p.sz; }
    const contenu = await enLigne(el, p);
    const balise = niveau ? "h" + niveau : "p";
    return (st.sautAvant ? '<hr class="saut-page">' : "") + `<${balise}${c.length ? ` style="${c.join(";")}"` : ""}>${contenu || "<br>"}</${balise}>` + (st.sautApres ? '<hr class="saut-page">' : "");
  }
  async function liste(el, niveau, styleListe){
    styleListe = a(el,"text","style-name") || styleListe;
    const ordonnee = !!(listes[styleListe] || {})[niveau];
    let h = `<${ordonnee ? "ol" : "ul"}>`;
    for(const li of enf(el)){
      if(li.localName !== "list-item" && li.localName !== "list-header") continue;
      h += "<li>";
      let premier = true;
      for(const x of enf(li)){
        if(x.localName === "p" || x.localName === "h"){ h += (premier ? "" : "<br>") + await enLigne(x, props(a(x,"text","style-name"))); premier = false; }
        else if(x.localName === "list") h += await liste(x, niveau + 1, styleListe);
      }
      h += "</li>";
    }
    return h + `</${ordonnee ? "ol" : "ul"}>`;
  }
  async function tableau(el){
    let h = "<table><tbody>";
    const lignes = [];
    (function ramasser(x){ enf(x).forEach(y=>{ if(y.localName === "table-row") lignes.push(y); else if(/^table-(header-rows|rows|row-group)$/.test(y.localName)) ramasser(y); }); })(el);
    for(const tr of lignes){
      h += "<tr>";
      for(const td of enf(tr)){
        if(td.localName !== "table-cell") continue;   // « covered-table-cell » : case recouverte par une fusion
        const cs = +a(td,"table","number-columns-spanned") || 1, rs = +a(td,"table","number-rows-spanned") || 1;
        h += `<td${cs > 1 ? ` colspan="${cs}"` : ""}${rs > 1 ? ` rowspan="${rs}"` : ""}>${(await blocs(td)) || "<br>"}</td>`;
      }
      h += "</tr>";
    }
    return h + "</tbody></table>";
  }
  async function blocs(conteneur){
    let h = "";
    for(const x of enf(conteneur)){
      switch(x.localName){
        case "p": h += await paragraphe(x, false); break;
        case "h": h += await paragraphe(x, true); break;
        case "list": {
          const l = await liste(x, 1);
          // Liste qui continue la numérotation de la précédente : on les réunit.
          if((a(x,"text","continue-numbering") === "true" || a(x,"text","continue-list")) && /<\/(ol|ul)>$/.test(h) && h.slice(-5) === l.slice(-5)) h = h.slice(0, -5) + l.slice(4);
          else h += l;
          break;
        }
        case "table": h += await tableau(x); break;
        case "section": case "index-body": case "table-of-content": case "alphabetical-index": h += await blocs(x); break;
        case "frame": h += `<p>${await image(x)}</p>`; break;
      }
    }
    return h;
  }
  const corps = contenu.getElementsByTagNameNS(NS.office, "text")[0];
  if(!corps) throw new Error("document vide");
  let html = (await blocs(corps)).replace(/^(<hr class="saut-page">)+/, "");
  if(stylesXml && stylesXml.getElementsByTagNameNS(NS.style, "header").length) avert.add("L’en-tête et le pied de page ne sont pas repris.");
  if(!html.replace(/<[^>]+>/g,"").trim() && !/<img|<table/.test(html)) html = "<p><br></p>";
  return { html, avertissements: [...avert] };
}

/* ====================================================================== */
/* .doc (Word 97-2003) : lecture du texte                                  */
/* ====================================================================== */
// Fichier « composé » (Compound File Binary) : un petit système de fichiers dans le fichier.
function lireCFB(octets){
  const v = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  const sig = [0xD0,0xCF,0x11,0xE0,0xA1,0xB1,0x1A,0xE1];
  if(!sig.every((b,i)=>octets[i] === b)) throw new Error("pas un fichier Word 97-2003");
  const tailleSec = 1 << v.getUint16(30, true), tailleMini = 1 << v.getUint16(32, true);
  const nbFat = v.getUint32(44, true), premierDir = v.getUint32(48, true), coupure = v.getUint32(56, true);
  const premierMiniFat = v.getUint32(60, true), premierDifat = v.getUint32(68, true);
  const debut = n => (n + 1) * tailleSec;
  // Table d'allocation (FAT) à partir du DIFAT.
  const difat = [];
  for(let i=0;i<109;i++){ const s = v.getUint32(76 + i*4, true); if(s < 0xFFFFFFFA) difat.push(s); }
  let d = premierDifat, garde = 0;
  while(d < 0xFFFFFFFA && garde++ < 10000){
    for(let i=0;i<tailleSec/4-1;i++){ const s = v.getUint32(debut(d) + i*4, true); if(s < 0xFFFFFFFA) difat.push(s); }
    d = v.getUint32(debut(d) + tailleSec - 4, true);
  }
  const fat = [];
  difat.slice(0, nbFat || difat.length).forEach(s=>{ for(let i=0;i<tailleSec/4;i++) fat.push(v.getUint32(debut(s) + i*4, true)); });
  const chaine = (premier, table) => { const out = []; let s = premier, g = 0; while(s < 0xFFFFFFFA && g++ < 1e6){ out.push(s); s = table[s]; } return out; };
  const lireChaine = premier => { const secs = chaine(premier, fat); const r = new Uint8Array(secs.length * tailleSec); secs.forEach((s,i)=>r.set(octets.subarray(debut(s), debut(s) + tailleSec), i*tailleSec)); return r; };
  // Répertoire
  const dir = lireChaine(premierDir), dv = new DataView(dir.buffer);
  const entrees = [];
  for(let o=0; o + 128 <= dir.length; o += 128){
    const lg = dv.getUint16(o + 64, true); if(!lg) { entrees.push(null); continue; }
    let nom = ""; for(let i=0;i<lg/2-1;i++) nom += String.fromCharCode(dv.getUint16(o + i*2, true));
    entrees.push({ nom, type: dir[o + 66], debut: dv.getUint32(o + 116, true), taille: dv.getUint32(o + 120, true) });
  }
  const racine = entrees[0];
  let mini = null, miniFat = null;
  return {
    flux(nom){
      const e = entrees.find(x=>x && x.nom === nom && x.type === 2); if(!e) return null;
      if(e.taille < coupure){
        if(!mini){ mini = lireChaine(racine.debut); miniFat = []; const mf = lireChaine(premierMiniFat); const mv = new DataView(mf.buffer); for(let i=0;i<mf.length/4;i++) miniFat.push(mv.getUint32(i*4, true)); }
        const secs = chaine(e.debut, miniFat), r = new Uint8Array(secs.length * tailleMini);
        secs.forEach((s,i)=>r.set(mini.subarray(s*tailleMini, (s+1)*tailleMini), i*tailleMini));
        return r.subarray(0, e.taille);
      }
      return lireChaine(e.debut).subarray(0, e.taille);
    }
  };
}
function texteDoc(buffer){
  const cfb = lireCFB(new Uint8Array(buffer));
  const wd = cfb.flux("WordDocument"); if(!wd) throw new Error("WordDocument absent");
  const v = new DataView(wd.buffer, wd.byteOffset, wd.byteLength);
  if(v.getUint16(0, true) !== 0xA5EC) throw new Error("format Word inconnu");
  const drapeaux = v.getUint16(10, true);
  if(drapeaux & 0x0100) throw new Error("protégé");
  const table = cfb.flux((drapeaux & 0x0200) ? "1Table" : "0Table"); if(!table) throw new Error("table absente");
  // FIB : nombre de caractères du texte principal (ccpText) et position de la table des morceaux (Clx).
  const csw = v.getUint16(32, true), cslw = v.getUint16(34 + csw*2, true);
  const debutLw = 34 + csw*2 + 2, ccpText = v.getInt32(debutLw + 12, true);
  const debutFcLcb = debutLw + cslw*4 + 2;
  const fcClx = v.getUint32(debutFcLcb + 66*4, true), lcbClx = v.getUint32(debutFcLcb + 66*4 + 4, true);
  const t = new DataView(table.buffer, table.byteOffset, table.byteLength);
  let o = fcClx;
  while(o < fcClx + lcbClx && table[o] === 0x01){ o += 3 + t.getUint16(o + 1, true); }
  if(table[o] !== 0x02) throw new Error("table des morceaux absente");
  const lcb = t.getUint32(o + 1, true); o += 5;
  const n = (lcb - 4) / 12;
  const cp = i => t.getUint32(o + i*4, true);
  const ansi = new TextDecoder("windows-1252"), utf16 = new TextDecoder("utf-16le");
  let texte = "";
  for(let i=0;i<n && texte.length < ccpText;i++){
    const debut = cp(i), fin = cp(i+1), pcd = o + (n+1)*4 + i*8;
    let fc = t.getUint32(pcd + 2, true);
    const compresse = !!(fc & 0x40000000); fc &= 0x3FFFFFFF;
    const nb = fin - debut;
    texte += compresse ? ansi.decode(wd.subarray(fc/2, fc/2 + nb)) : utf16.decode(wd.subarray(fc, fc + nb*2));
  }
  return texte.slice(0, ccpText);
}
function lireDoc(buffer){
  let t;
  try{ t = texteDoc(buffer); }
  catch(e){
    if(e.message === "protégé") throw new Error("Ce fichier Word est protégé par un mot de passe.");
    throw e;
  }
  // Champs Word : on garde le résultat affiché, pas le code.
  t = t.replace(/\u0013[^\u0013\u0014\u0015]*\u0014([^\u0015]*)\u0015/g, "$1").replace(/\u0013[^\u0015]*\u0015/g, "");
  t = t.replace(/[\u0001\u0008]/g, "").replace(/\u001e/g, "-").replace(/\u001f/g, "");
  // Découpe en morceaux terminés par une fin de paragraphe (\r) ou une marque de case de tableau (\u0007).
  const morceaux = []; let tampon = "";
  for(const ch of t){ if(ch === "\r" || ch === "\u0007"){ morceaux.push([tampon, ch]); tampon = ""; } else tampon += ch; }
  if(tampon) morceaux.push([tampon, ""]);
  const sortie = [];
  const para = x => x.split("\f").forEach((m, k)=>{ if(k > 0) sortie.push('<hr class="saut-page">'); sortie.push(`<p>${echap(m).replace(/\u000b/g, "<br>").replace(/\t/g, '<span class="tab">\t</span>') || "<br>"}</p>`); });
  let lignes = [], ligne = [], kase = [], nbCol = 0;
  const finTableau = () => {
    if(ligne.length) lignes.push(ligne);
    if(lignes.length) sortie.push("<table><tbody>" + lignes.map(l=>"<tr>" + l.map(c=>`<td>${echap(c).replace(/[\n\u000b]/g, "<br>") || "<br>"}</td>`).join("") + "</tr>").join("") + "</tbody></table>");
    lignes = []; ligne = []; kase = []; nbCol = 0;
  };
  for(let n = 0; n < morceaux.length; n++){
    const [txt, fin] = morceaux[n], suivant = morceaux[n+1];
    if(fin === "\u0007"){
      // Marque de fin de ligne : texte vide juste après la dernière case de la ligne.
      // (ou ligne plus courte, à cases fusionnées, juste avant la fin du tableau)
      if(!kase.length && txt === "" && ligne.length && (nbCol === 0 || ligne.length >= nbCol || !suivant || suivant[1] !== "\u0007")){ if(!nbCol) nbCol = ligne.length; lignes.push(ligne); ligne = []; continue; }
      kase.push(txt); ligne.push(kase.join("\n")); kase = []; continue;
    }
    if(ligne.length || kase.length){ kase.push(txt); continue; }   // paragraphe à l'intérieur d'une case
    finTableau(); para(txt);
  }
  finTableau();
  return { html: sortie.join("") || "<p><br></p>", avertissements: ["Ancien format Word (.doc) : seul le texte a été repris (pas les couleurs, polices, images). Pour garder la mise en page, enregistrez le fichier en .docx dans Word."] };
}

/* ====================================================================== */
/* .txt                                                                    */
/* ====================================================================== */
function decoderTexte(buffer){
  const o = new Uint8Array(buffer);
  if(o[0] === 0xFF && o[1] === 0xFE) return new TextDecoder("utf-16le").decode(o.subarray(2));
  if(o[0] === 0xFE && o[1] === 0xFF) return new TextDecoder("utf-16be").decode(o.subarray(2));
  try{ return new TextDecoder("utf-8", { fatal: true }).decode(o).replace(/^﻿/, ""); }
  catch(e){ return new TextDecoder("windows-1252").decode(o); }   // vieux fichiers Windows
}
function lireTxt(buffer){
  const t = decoderTexte(buffer);
  return { html: t.split(/\r\n|\r|\n/).map(l=>l ? `<p>${echap(l).replace(/\t/g, '<span class="tab">\t</span>')}</p>` : "<p><br></p>").join("") || "<p><br></p>", avertissements: [] };
}

/* Quel format ? (d'après le contenu, puis le nom) */
function formatDe(buffer, nom){
  const o = new Uint8Array(buffer.slice(0, 8));
  if(o[0] === 0x50 && o[1] === 0x4B) return "zip";                       // .docx ou .odt
  if(o[0] === 0xD0 && o[1] === 0xCF && o[2] === 0x11 && o[3] === 0xE0) return "doc";
  if(/\.html?$/i.test(nom || "")) return "html";
  return "txt";
}

window.CiBFormats = { lireOdt, lireDoc, lireTxt, decoderTexte, formatDe };
})();
