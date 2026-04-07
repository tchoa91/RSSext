/**
 * ============================================================================
 * RSSext - Page d'Options (GPL-3.0)
 * ============================================================================
 * RÔLE :
 * Gère la configuration globale, l'import/export OPML et la personnalisation
 * de l'interface (Thème, Zoom).
 * ============================================================================
 */
import { DB } from "../db.js";
import { t, applyZoom, translateUI } from "../utils.js";

document.addEventListener("DOMContentLoaded", () => {
  translateUI();

  const manifest = chrome.runtime.getManifest();
  document.getElementById("version-display").textContent = `v${manifest.version}`;

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

/**
 * Sauvegarde une préférence individuelle et notifie le background.
 * @param {string} key - Clé de la préférence.
 * @param {any} value - Valeur à stocker.
 */
function saveSingleSetting(key, value) {
  chrome.storage.local.set({ [key]: value }, () => {
    if (key === "interval" || key === "ttl" || key === "notify") {
      chrome.runtime.sendMessage({ action: "update_settings" });
    }
  });
}

/**
 * Génère et déclenche le téléchargement d'un fichier OPML 2.0.
 */
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

  // Ajout d'un commentaire discret pour identifier la source de l'export
  opml.appendChild(doc.createComment(" exported by RSSext "));

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

/**
 * Lit et importe un fichier OPML (XML) pour ajouter des sources.
 * @param {File} file - Le fichier sélectionné par l'utilisateur.
 */
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

      // 3. Recherche du dossier (Catégorie)
      let folder = "";

      // Tentative A : L'attribut plat (très courant dans les exports générés à la volée)
      const flatCategory = el.getAttribute("category");
      if (flatCategory) {
        // Certains séparent les sous-dossiers par des virgules ou des slashs, on prend le premier
        folder = flatCategory.split(",")[0].split("/")[0].trim();
      } 
      // Tentative B : La hiérarchie standard OPML
      else {
        let currentParent = el.parentElement;
        let topFolderEl = null;

        // La vérification currentParent.tagName sécurise contre les noeuds document/texte inattendus
        while (currentParent && currentParent.tagName && currentParent.tagName.toLowerCase() === "outline") {
          topFolderEl = currentParent;
          currentParent = currentParent.parentElement;
        }

        if (topFolderEl) {
          folder = topFolderEl.getAttribute("text") || topFolderEl.getAttribute("title") || "";
          folder = folder.trim();
        }
      }

      const title = el.getAttribute("text") || el.getAttribute("title") || url;

      // 4. Attribution d'une couleur au dossier (si ce n'est pas la catégorie générale)
      if (folder) await DB.getFolderHue(folder);

      // 5. Sauvegarde en base
      await DB.putSource({
        xmlUrl: url,
        title: title,
        folder: folder,
        notify: true, // Activé par défaut à l'import
      });
      count++;
    }

    // 6. Relance du worker pour récupérer immédiatement les nouveaux articles
    chrome.runtime.sendMessage({ action: "scan_now" });
    
  } catch (err) {
    console.error("Erreur d'import OPML :", err);
    alert(t("error_opml_import"));
  }
}

/**
 * Supprime intégralement la base de données (Sources et Articles).
 */
async function deleteBase() {
  if (confirm(t("ui_confirm_clear_db"))) {
    await DB.clearAll();
    // On notifie le background pour qu'il mette à jour le badge (0)
    chrome.runtime.sendMessage({ action: "scan_now" });
  }
}
