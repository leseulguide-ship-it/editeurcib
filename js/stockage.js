/* EditeurCiB : enregistrement des documents sur l’appareil.
   - Navigateur : base IndexedDB (beaucoup plus grande que l’ancien localStorage, limité à ~5 Mo).
   - Version Android : un fichier par document dans le dossier privé de l’application (Filesystem, DATA).
   - Si rien ne marche : mémoire seulement (l’interface prévient l’utilisateur).
   Chaque document est enregistré séparément : deux onglets ne s’écrasent plus l’un l’autre. */
(function(){
"use strict";

/* ---------- IndexedDB (navigateur) ---------- */
function depotIndexedDB(){
  return new Promise((ok, ko)=>{
    if(!window.indexedDB) return ko(new Error("IndexedDB absent"));
    let req;
    try{ req = indexedDB.open("editeurcib", 1); }catch(e){ return ko(e); }
    req.onupgradeneeded = ()=>{
      const db = req.result;
      if(!db.objectStoreNames.contains("docs")) db.createObjectStore("docs", {keyPath:"id"});
      if(!db.objectStoreNames.contains("reglages")) db.createObjectStore("reglages");
    };
    req.onerror = ()=>ko(req.error || new Error("IndexedDB refusé"));
    req.onblocked = ()=>ko(new Error("IndexedDB bloqué"));
    req.onsuccess = ()=>{
      const db = req.result;
      // Une autre version de l’application demande la base : on la libère proprement.
      db.onversionchange = ()=>db.close();
      const tx = (store, mode, action)=>new Promise((ok2, ko2)=>{
        let t;
        try{ t = db.transaction(store, mode); }catch(e){ return ko2(e); }
        let res;
        const r = action(t.objectStore(store));
        if(r) r.onsuccess = ()=>{ res = r.result; };
        t.oncomplete = ()=>ok2(res);
        t.onerror = ()=>ko2(t.error || (r && r.error) || new Error("Écriture refusée"));
        t.onabort = ()=>ko2(t.error || new Error("Écriture annulée (mémoire pleine ?)"));
      });
      ok({
        type: "indexeddb",
        liste: ()=>tx("docs","readonly", s=>s.getAll()).then(tous=>(tous||[]).map(meta)),
        lire: id=>tx("docs","readonly", s=>s.get(id)).then(d=>d||null),
        ecrire: doc=>tx("docs","readwrite", s=>s.put(doc)),
        supprimer: id=>tx("docs","readwrite", s=>s.delete(id)),
        reglage: (cle, defaut)=>tx("reglages","readonly", s=>s.get(cle)).then(v=>v===undefined ? defaut : v),
        regler: (cle, val)=>tx("reglages","readwrite", s=>s.put(val, cle))
      });
    };
  });
}

/* ---------- Fichiers natifs (version Android) ---------- */
function depotAndroid(FS){
  const DIR = "DATA";
  const nomFichier = id => "documents/" + String(id).replace(/[^\w-]/g,"_") + ".json";
  const nomReglage = cle => "reglages/" + String(cle).replace(/[^\w-]/g,"_") + ".json";
  async function lireJSON(path){
    try{ const r = await FS.readFile({path, directory:DIR, encoding:"utf8"}); return JSON.parse(r.data); }
    catch(e){ return undefined; }
  }
  // Écriture sûre : fichier provisoire puis renommage, pour ne jamais laisser un fichier à moitié écrit.
  async function ecrireJSON(path, val){
    const tmp = path + ".tmp";
    await FS.writeFile({path: tmp, directory:DIR, data: JSON.stringify(val), encoding:"utf8", recursive:true});
    try{ await FS.deleteFile({path, directory:DIR}); }catch(e){}
    await FS.rename({from: tmp, to: path, directory:DIR, toDirectory:DIR});
  }
  let cache = null; // métadonnées en mémoire après la première lecture
  return {
    type: "android",
    async liste(){
      if(cache) return [...cache.values()];
      cache = new Map();
      let fichiers = [];
      try{ fichiers = (await FS.readdir({path:"documents", directory:DIR})).files || []; }catch(e){ fichiers = []; }
      for(const f of fichiers){
        const nom = typeof f === "string" ? f : f.name;
        if(!/\.json(\.tmp)?$/.test(nom)) continue;
        const d = await lireJSON("documents/" + nom);
        if(d && d.id && (!cache.has(d.id) || cache.get(d.id).maj < d.maj)) cache.set(d.id, meta(d));
      }
      return [...cache.values()];
    },
    // Si l’application a été coupée pendant un renommage, le fichier provisoire fait foi.
    async lire(id){ const d = (await lireJSON(nomFichier(id))) || (await lireJSON(nomFichier(id) + ".tmp")); return d || null; },
    async ecrire(doc){ await ecrireJSON(nomFichier(doc.id), doc); if(cache) cache.set(doc.id, meta(doc)); },
    async supprimer(id){ try{ await FS.deleteFile({path:nomFichier(id), directory:DIR}); }catch(e){} if(cache) cache.delete(id); },
    async reglage(cle, defaut){ const v = await lireJSON(nomReglage(cle)); return v === undefined ? defaut : v; },
    regler: (cle, val)=>ecrireJSON(nomReglage(cle), val)
  };
}

/* ---------- Mémoire seulement (dernier recours) ---------- */
function depotMemoire(){
  const docs = new Map(), regl = new Map();
  return {
    type: "memoire",
    liste: async()=>[...docs.values()].map(meta),
    lire: async id=>docs.get(id) || null,
    ecrire: async doc=>{ docs.set(doc.id, JSON.parse(JSON.stringify(doc))); },
    supprimer: async id=>{ docs.delete(id); },
    reglage: async (cle, defaut)=>regl.has(cle) ? regl.get(cle) : defaut,
    regler: async (cle, val)=>{ regl.set(cle, val); }
  };
}

function meta(d){ return {id:d.id, titre:d.titre, maj:d.maj}; }

/* ---------- Ouverture et reprise des anciens documents ---------- */
async function ouvrir(){
  const P = window.Capacitor && window.Capacitor.Plugins;
  let depot = null;
  if(P && P.Filesystem){ depot = depotAndroid(P.Filesystem); }
  else {
    try{ depot = await depotIndexedDB(); }catch(e){ depot = depotMemoire(); }
    // Demande au navigateur de ne pas effacer ces données s’il manque de place.
    try{ if(navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(()=>{}); }catch(e){}
  }
  await reprendreAnciens(depot);
  return depot;
}

// Les anciennes versions gardaient tout dans localStorage (« cib:docs ») : on les transfère une fois.
async function reprendreAnciens(depot){
  let anciens = null;
  try{ const v = localStorage.getItem("cib:docs"); anciens = v ? JSON.parse(v) : null; }catch(e){ anciens = null; }
  if(anciens && typeof anciens === "object" && depot.type !== "memoire"){
    let tousOk = true;
    for(const id of Object.keys(anciens)){
      const a = anciens[id]; if(!a || typeof a.html !== "string") continue;
      try{
        const existant = await depot.lire(id);
        if(!existant || (existant.maj||0) < (a.maj||0)) await depot.ecrire({id, titre:a.titre||"Document sans titre", html:a.html, maj:a.maj||Date.now()});
      }catch(e){ tousOk = false; }
    }
    if(tousOk){ try{ localStorage.removeItem("cib:docs"); }catch(e){} }
  }
  // Copie de secours écrite au dernier moment avant la fermeture de la page.
  let secours = null;
  try{ const v = localStorage.getItem("cib:secours"); secours = v ? JSON.parse(v) : null; }catch(e){ secours = null; }
  if(secours && secours.id && typeof secours.html === "string" && depot.type !== "memoire"){
    try{
      const existant = await depot.lire(secours.id);
      if(!existant || (existant.maj||0) < (secours.maj||0)) await depot.ecrire(secours);
      localStorage.removeItem("cib:secours");
    }catch(e){}
  }
}

/* ---------- Fichier de sauvegarde (tous les documents) ---------- */
async function exporterTout(depot, reglages){
  const metas = await depot.liste();
  const documents = [];
  for(const m of metas){ const d = await depot.lire(m.id); if(d) documents.push({id:d.id, titre:d.titre, html:d.html, maj:d.maj}); }
  return JSON.stringify({application:"EditeurCiB", format:1, date:new Date().toISOString(), documents, reglages: reglages||{}});
}
// Ajoute les documents du fichier sans jamais écraser une version plus récente.
async function importerTout(depot, texte){
  let donnees;
  try{ donnees = JSON.parse(texte); }catch(e){ throw new Error("illisible"); }
  if(!donnees || donnees.application !== "EditeurCiB" || !Array.isArray(donnees.documents)) throw new Error("format");
  let ajoutes = 0, aJour = 0;
  for(const d of donnees.documents){
    if(!d || !d.id || typeof d.html !== "string") continue;
    const existant = await depot.lire(d.id);
    if(existant && (existant.maj||0) >= (d.maj||0)){ aJour++; continue; }
    await depot.ecrire({id:String(d.id), titre:String(d.titre||"Document sans titre"), html:d.html, maj:+d.maj||Date.now()});
    ajoutes++;
  }
  return {ajoutes, aJour, reglages: donnees.reglages || {}};
}

window.CiBStockage = { ouvrir, exporterTout, importerTout, _depotMemoire: depotMemoire, _depotAndroid: depotAndroid };
})();
