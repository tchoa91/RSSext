/**
 * RSSext - Logiciel de l'interface (GPL-3.0)
 * Gère l'affichage du buffer, l'ajout de sources et l'édition.
 */

import { DB } from "../db.js";

// Références DOM
const feedList = document.getElementById("feed-list");
const emptyState = document.getElementById("empty-state");
const addBtn = document.getElementById("add-current");
const dialog = document.getElementById("edit-dialog");
const editForm = dialog.querySelector("form");

document.getElementById("btn-export").onclick = exportOPML;
document.getElementById("btn-import").onclick = () =>
  document.getElementById("input-import").click();
document.getElementById("input-import").onchange = (e) =>
  importOPML(e.target.files[0]);

/**
 * INITIALISATION
 */
document.addEventListener("DOMContentLoaded", async () => {
  renderApp();

  // Écouteur pour ajouter l'onglet courant
  addBtn.addEventListener("click", detectAndAddFeed);

  // Gestion de la fermeture du dialog
  editForm.addEventListener("submit", handleDialogSubmit);
});

/**
 * REPRODUCTION DE L'INTERFACE
 * Affiche les articles du buffer regroupés par source/dossier.
 */
async function renderApp() {
  const allItems = await DB.getItems();
  // On ne garde que ceux qui n'ont pas le flag 'hidden'
  const items = allItems.filter((item) => !item.hidden);

  if (items.length === 0) {
    feedList.innerHTML = "";
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");

  // Tri par timestamp (plus récent en haut)
  items.sort((a, b) => b.timestamp - a.timestamp);

  feedList.innerHTML = items
    .map(
      (item) => `
    <div class="item-row" data-id="${item.id}">
      <a href="${item.link}" target="_blank" class="item-link" data-action="open">
        ${item.title}
      </a>
      <button class="discard-btn" data-action="discard" title="Discard">×</button>
    </div>
  `,
    )
    .join("");

  // Délégation d'événements pour le buffer
  feedList.onclick = async (e) => {
    const btn = e.target.closest("button, a");
    if (!btn) return;

    const row = btn.closest(".item-row");
    const id = row.dataset.id;
    const action = btn.dataset.action;

    if (action === "discard" || action === "open") {
      await DB.hideItem(id);
      row.remove();
      if (feedList.children.length === 0) renderApp();
    }
  };
}

/**
 * DÉTECTION DU FLUX (Onglet actif)
 * Injecte un micro-script pour trouver la balise <link> RSS/Atom.
 */
async function detectAndAddFeed() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  const urlObj = new URL(tab.url);
  const origin = urlObj.origin;
  let finalUrl = null;

  try {
    // ÉTAPE 1 : Détection par le code (le "Graal")
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const links = Array.from(
          document.querySelectorAll('link[rel="alternate"]'),
        );
        const rss = links.find(
          (l) =>
            (l.type.includes("rss") || l.type.includes("atom")) &&
            !l.title.includes("oEmbed"),
        );
        return rss ? rss.href : null;
      },
    });

    finalUrl = result;

    // ÉTAPE 2 : Si rien n'est trouvé, on lance la prédiction (ton snippet)
    if (!finalUrl) {
      const patterns = [
        `${origin}/feed/`,
        `${origin}/rss/`,
        `${origin}/rss.xml`,
      ];

      for (const url of patterns) {
        // Appelle le background script
        const check = await chrome.runtime.sendMessage({
          action: "test_url",
          url: url,
        });
        if (check && check.valid) {
          finalUrl = url;
          break; // Gagné, on s'arrête
        }
      }
    }

    // ÉTAPE 3 : Ouverture de l'overlay (avec l'URL trouvée ou l'origine par défaut)
    openEditOverlay({
      xmlUrl: finalUrl || origin,
      title: tab.title,
      folder: "General",
      notify: true,
    });
  } catch (err) {
    console.error("RSSext: Erreur de détection", err);
    // En cas d'erreur (page système Chrome), on ouvre quand même l'overlay vide
    openEditOverlay({
      xmlUrl: origin,
      title: "New Source",
      folder: "General",
      notify: true,
    });
  }
}

/**
 * GESTION DE L'OVERLAY (Dialog)
 */
function openEditOverlay(source) {
  document.getElementById("edit-name").value = source.title;
  document.getElementById("edit-folder").value = source.folder || "";
  document.getElementById("edit-notify").checked = source.notify;

  // On stocke l'URL dans le dataset du dialog pour le submit
  dialog.dataset.currentUrl = source.xmlUrl;
  dialog.showModal();
}

async function handleDialogSubmit(e) {
  const action = e.submitter.value;
  const xmlUrl = dialog.dataset.currentUrl;

  if (action === "save") {
    await DB.putSource({
      xmlUrl: xmlUrl,
      title: document.getElementById("edit-name").value,
      folder: document.getElementById("edit-folder").value || "General",
      notify: document.getElementById("edit-notify").checked,
    });
    // On peut forcer un scan immédiat ici si besoin
    chrome.runtime.getBackgroundPage
      ? null
      : chrome.runtime.sendMessage({ action: "scan_now" });
  }

  renderApp();
}

// Bouton supprimer dans l'overlay
document.getElementById("delete-source").onclick = async () => {
  if (confirm("Delete this source and all its items?")) {
    await DB.deleteSource(dialog.dataset.currentUrl);
    dialog.close();
    renderApp();
  }
};

async function exportOPML() {
  const sources = await DB.getSources();

  // Groupement par dossier pour la structure OPML
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
  const text = await file.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "application/xml");
  const outlines = doc.querySelectorAll("outline[xmlUrl]");

  for (const el of outlines) {
    // On cherche le nom du dossier (parent direct sans xmlUrl)
    const parent = el.parentElement.closest("outline:not([xmlUrl])");
    const folder = parent ? parent.getAttribute("text") : "Imported";

    await DB.putSource({
      xmlUrl: el.getAttribute("xmlUrl"),
      title: el.getAttribute("text") || el.getAttribute("title") || "No Title",
      folder: folder,
      notify: true,
    });
  }

  // Refresh de l'interface après import
  renderApp();
}
