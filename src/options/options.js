/**
 * /home/tchoa/Dev/web/rssext/src/options/options.js
 */
import { DB } from "../db.js";

const t = (key) => chrome.i18n.getMessage(key);

function translateUI() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const msg = t(el.dataset.i18n);
    if (msg) el.textContent = msg;
  });
}

document.addEventListener("DOMContentLoaded", () => {
  translateUI();
  // 1. Chargement des paramètres
  const defaults = {
    interval: 30,
    ttl: 30,
    notify: true,
    hue: 210,
    zoom: "small"
  };

  chrome.storage.local.get(["interval", "ttl", "notify", "hue", "zoom"], (result) => {
    const settings = { ...defaults, ...result };
    
    document.getElementById("setting-interval").value = settings.interval;
    document.getElementById("setting-ttl").value = settings.ttl;
    document.getElementById("setting-notify").checked = settings.notify;
    document.getElementById("setting-hue").value = settings.hue;
    document.getElementById("hue-value").textContent = settings.hue;
    document.getElementById("setting-zoom").value = settings.zoom;

    // Appliquer le thème immédiatement à la page d'options
    document.documentElement.style.setProperty("--main-hue", settings.hue);
    applyZoom(settings.zoom);
  });

  // 2. Sauvegarde automatique
  const settingInputs = [
    { id: "setting-interval", key: "interval", type: "int" },
    { id: "setting-ttl", key: "ttl", type: "int" },
    { id: "setting-notify", key: "notify", type: "bool" },
    { id: "setting-hue", key: "hue", type: "value" },
    { id: "setting-zoom", key: "zoom", type: "value" }
  ];

  settingInputs.forEach(input => {
    const el = document.getElementById(input.id);
    el.addEventListener("change", (e) => {
      let value = e.target.value;
      if (input.type === "int") value = parseInt(value, 10);
      if (input.type === "bool") value = e.target.checked;
      
      saveSingleSetting(input.key, value);
      if (input.key === "zoom") applyZoom(value);
    });
  });

  // 3. Live preview du thème
  document.getElementById("setting-hue").addEventListener("input", (e) => {
    const val = e.target.value;
    document.documentElement.style.setProperty("--main-hue", val);
    document.getElementById("hue-value").textContent = val;
  });

  // 4. Import / Export OPML
  document.getElementById("btn-export-settings").onclick = exportOPML;
  document.getElementById("btn-import-settings").onclick = () => document.getElementById("input-import-settings").click();
  document.getElementById("input-import-settings").onchange = (e) => importOPML(e.target.files[0]);
  document.getElementById("btn-delete-base").onclick = deleteBase;
});

function saveSingleSetting(key, value) {
  chrome.storage.local.set({ [key]: value }, () => {
    if (key === "interval" || key === "ttl" || key === "notify") {
      chrome.runtime.sendMessage({ action: "update_settings" });
    }
  });
}

async function exportOPML() {
  const sources = await DB.getSources();
  const folders = sources.reduce((acc, src) => {
    const f = src.folder || t("folder_uncategorized");
    if (!acc[f]) acc[f] = [];
    acc[f].push(src);
    return acc;
  }, {});

  // 1. Création d'un document XML vierge
  const doc = document.implementation.createDocument(null, "opml", null);
  const opml = doc.documentElement;
  opml.setAttribute("version", "2.0");

  // 2. Construction du <head>
  const head = doc.createElement("head");
  const title = doc.createElement("title");
  title.textContent = t("opml_export_title");
  head.appendChild(title);
  opml.appendChild(head);

  // 3. Construction du <body>
  const body = doc.createElement("body");
  
  for (const [folderName, feeds] of Object.entries(folders)) {
    const folderOutline = doc.createElement("outline");
    folderOutline.setAttribute("text", folderName);
    // Optionnel mais recommandé en OPML pour les dossiers :
    // folderOutline.setAttribute("title", folderName);

    feeds.forEach((f) => {
      const feedOutline = doc.createElement("outline");
      feedOutline.setAttribute("type", "rss");
      feedOutline.setAttribute("text", f.title);
      feedOutline.setAttribute("xmlUrl", f.xmlUrl);
      folderOutline.appendChild(feedOutline);
    });

    body.appendChild(folderOutline);
  }
  opml.appendChild(body);

  // 4. Sérialisation propre
  const serializer = new XMLSerializer();
  // Le serializer n'inclut pas le prologue XML, il faut l'ajouter manuellement
  const xmlString = '<?xml version="1.0" encoding="UTF-8"?>\n' + serializer.serializeToString(doc);

  // Déclenchement du téléchargement (inchangé)
  const blob = new Blob([xmlString], { type: "text/xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rssext_export_${new Date().toISOString().slice(0, 10)}.opml`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importOPML(file) {
  if (!file) return;
  
  try {
    const text = await file.text();
    const parser = new DOMParser();
    
    // 1. Parsing strict en XML (adieu le mode HTML tolérant mais capricieux)
    const doc = parser.parseFromString(text, "text/xml");
    
    // Détection immédiate d'un XML invalide
    const parseError = doc.querySelector("parsererror");
    if (parseError) {
      throw new Error("Le fichier OPML n'est pas un document XML valide.");
    }
    
    // 2. On récupère tous les flux RSS. Le XML respectant la casse, xmlUrl suffit.
    const outlines = doc.querySelectorAll("outline[xmlUrl]");

    let count = 0;
    for (const el of outlines) {
      const url = el.getAttribute("xmlUrl");
      if (!url) continue;

      // 3. Recherche du dossier de 1er niveau (Top-level folder)
      let currentParent = el.parentElement;
      let topFolderEl = null;

      // On remonte l'arbre DOM tant que le parent est une balise <outline>.
      // Le dernier trouvé juste avant le <body> sera notre dossier racine.
      while (currentParent && currentParent.tagName.toLowerCase() === "outline") {
        topFolderEl = currentParent;
        currentParent = currentParent.parentElement;
      }

      // 4. Extraction du nom, ou chaîne vide pour retomber dans la catégorie "Général"
      const folder = topFolderEl 
        ? (topFolderEl.getAttribute("text") || topFolderEl.getAttribute("title") || "") 
        : "";

      const title = el.getAttribute("text") || el.getAttribute("title") || url;

      // 5. Attribution d'une couleur au dossier (si ce n'est pas la catégorie générale)
      if (folder) await DB.getFolderHue(folder);

      // 6. Sauvegarde en base
      await DB.putSource({
        xmlUrl: url,
        title: title,
        folder: folder,
        notify: true, // Activé par défaut à l'import
      });
      count++;
    }

    // 7. Relance du worker pour récupérer immédiatement les nouveaux articles
    chrome.runtime.sendMessage({ action: "scan_now" });
    
  } catch (err) {
    console.error("Erreur d'import OPML :", err);
    alert(t("error_opml_import"));
  }
}

async function deleteBase() {
  if (confirm(t("ui_confirm_clear_db"))) {
    await DB.clearAll();
    // On notifie le background pour qu'il mette à jour le badge (0)
    chrome.runtime.sendMessage({ action: "scan_now" });
  }
}

function applyZoom(level) {
  const zoomMap = {
    small: "100%",
    medium: "120%",
    large: "150%"
  };
  document.documentElement.style.fontSize = zoomMap[level] || "100%";
}
