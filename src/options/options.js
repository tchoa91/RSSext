/**
 * /home/tchoa/Dev/web/rssext/src/options/options.js
 */
import { DB } from "../db.js";

document.addEventListener("DOMContentLoaded", () => {
  // 1. Chargement des paramètres
  const defaults = {
    interval: 30,
    ttl: 30,
    notify: true,
    hue: 210
  };

  chrome.storage.sync.get(["interval", "ttl", "notify", "hue"], (result) => {
    const settings = { ...defaults, ...result };
    
    document.getElementById("setting-interval").value = settings.interval;
    document.getElementById("setting-ttl").value = settings.ttl;
    document.getElementById("setting-notify").checked = settings.notify;
    document.getElementById("setting-hue").value = settings.hue;
    document.getElementById("hue-value").textContent = settings.hue;

    // Appliquer le thème immédiatement à la page d'options
    document.documentElement.style.setProperty("--main-hue", settings.hue);
  });

  // 2. Sauvegarde automatique
  const settingInputs = [
    { id: "setting-interval", key: "interval", type: "int" },
    { id: "setting-ttl", key: "ttl", type: "int" },
    { id: "setting-notify", key: "notify", type: "bool" },
    { id: "setting-hue", key: "hue", type: "value" }
  ];

  settingInputs.forEach(input => {
    const el = document.getElementById(input.id);
    el.addEventListener("change", (e) => {
      let value = e.target.value;
      if (input.type === "int") value = parseInt(value, 10);
      if (input.type === "bool") value = e.target.checked;
      
      saveSingleSetting(input.key, value);
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
});

function saveSingleSetting(key, value) {
  chrome.storage.sync.set({ [key]: value }, () => {
    chrome.runtime.sendMessage({ action: "update_settings" });
  });
}

async function exportOPML() {
  const sources = await DB.getSources();
  const folders = sources.reduce((acc, src) => {
    const f = src.folder || "Uncategorized";
    if (!acc[f]) acc[f] = [];
    acc[f].push(src);
    return acc;
  }, {});

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n<head><title>RSSext Export</title></head>\n<body>`;

  for (const [folder, feeds] of Object.entries(folders)) {
    xml += `\n  <outline text="${folder.replace(/"/g, "&quot;")}">`;
    feeds.forEach((f) => {
      xml += `\n    <outline type="rss" text="${f.title.replace(/"/g, "&quot;")}" xmlUrl="${f.xmlUrl}" />`;
    });
    xml += `\n  </outline>`;
  }

  xml += `\n</body>\n</opml>`;

  const blob = new Blob([xml], { type: "text/xml" });
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
    const doc = parser.parseFromString(text, "text/html");
    
    const outlines = doc.querySelectorAll("outline[xmlUrl], outline[xmlURL]");
    
    let count = 0;
    for (const el of outlines) {
      const url = el.getAttribute("xmlUrl") || el.getAttribute("xmlURL");
      if (!url) continue;

      const folderEl = el.parentElement.closest("outline:not([xmlUrl]):not([xmlURL])");
      const folder = folderEl ? (folderEl.getAttribute("text") || folderEl.getAttribute("title")) : "Imported";
      const title = el.getAttribute("text") || el.getAttribute("title") || url;

      await DB.putSource({
        xmlUrl: url,
        title: title,
        folder: folder,
        notify: true,
      });
      count++;
    }

    alert(`${count} sources imported successfully.`);
    chrome.runtime.sendMessage({ action: "scan_now" });
  } catch (err) {
    console.error(err);
    alert("Error importing OPML file.");
  }
}
