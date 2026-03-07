/**
 * RSSext - Logiciel de l'interface (GPL-3.0)
 * Gère l'affichage du buffer, l'ajout de sources et l'édition.
 */

import { DB } from "../db.js";

// Références DOM
const feedList = document.getElementById("feed-list");
const toggleViewBtn = document.getElementById("toggle-view");
const emptyState = document.getElementById("empty-state");
const addBtn = document.getElementById("add-current");
const dialog = document.getElementById("edit-dialog");
const editForm = dialog.querySelector("form");
const newFolderDialog = document.getElementById("new-folder-dialog");
const openSettingsBtn = document.getElementById("open-settings");

const SVG_CAT = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon icon-group-category">
  <line x1="4" y1="4" x2="20" y2="4"></line>
  <line x1="9" y1="7" x2="20" y2="7"></line>
  <line x1="9" y1="10" x2="20" y2="10"></line>
  <line x1="4" y1="13" x2="20" y2="13"></line>
  <line x1="9" y1="16" x2="20" y2="16"></line>
  <line x1="9" y1="19" x2="20" y2="19"></line>
</svg>`;

const SVG_DATE = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon icon-sort-date">
  <line x1="4" y1="4" x2="20" y2="4"></line>
  <line x1="4" y1="7" x2="18" y2="7"></line>
  <line x1="4" y1="10" x2="16" y2="10"></line>
  <line x1="4" y1="13" x2="14" y2="13"></line>
  <line x1="4" y1="16" x2="12" y2="16"></line>
  <line x1="4" y1="19" x2="10" y2="19"></line>
</svg>`;

const SVG_CHEVRON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-chevron"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

const SVG_EDIT = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
const SVG_TRASH = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

// Raccourci i18n
const t = (key) => chrome.i18n.getMessage(key);

/**
 * Traduit les éléments HTML ayant un attribut data-i18n
 */
function translateUI() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const msg = t(el.dataset.i18n);
    if (msg) el.textContent = msg;
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const msg = t(el.dataset.i18nTitle);
    if (msg) el.title = msg;
  });
}

/**
 * INITIALISATION
 */
document.addEventListener("DOMContentLoaded", async () => {
  // Application du thème sauvegardé au démarrage
  chrome.storage.local.get(["hue", "zoom"], (result) => {
    if (result.hue) {
      document.documentElement.style.setProperty("--main-hue", result.hue);
    }
    if (result.zoom) {
      const zoomMap = {
        small: "100%",
        medium: "120%",
        large: "150%"
      };
      document.documentElement.style.fontSize = zoomMap[result.zoom] || "100%";
    }
  });

  translateUI();
  renderApp();

  // Écouteur pour ajouter l'onglet courant
  addBtn.addEventListener("click", detectAndAddFeed);

  if (toggleViewBtn) {
    toggleViewBtn.addEventListener("click", async () => {
      const settings = await chrome.storage.local.get(["view_mode"]);
      const current = settings.view_mode || "date";
      await chrome.storage.local.set({ view_mode: current === "date" ? "folder" : "date" });
      renderApp();
    });
  }

  // Gestion de la fermeture du dialog
  editForm.addEventListener("submit", handleDialogSubmit);

  // Gestion de l'ajout de dossier
  const folderSelect = document.getElementById("edit-folder");
  folderSelect.addEventListener("change", (e) => {
    if (e.target.value === "__NEW__") {
      document.getElementById("new-folder-name").value = "";
      newFolderDialog.showModal();
    }
  });

  newFolderDialog.addEventListener("close", () => {
    if (folderSelect.value === "__NEW__") {
      folderSelect.value = ""; // Revert si annulé
    }
  });

  newFolderDialog.querySelector("form").addEventListener("submit", (e) => {
    if (e.submitter.value === "save") {
      const rawName = document.getElementById("new-folder-name").value;
      const name = rawName.trim(); // Parsing simple
      
      if (name) {
        // Ajout dynamique de l'option
        let opt = Array.from(folderSelect.options).find(o => o.value === name);
        if (!opt) {
          opt = document.createElement("option");
          opt.value = name;
          opt.textContent = name;
          folderSelect.insertBefore(opt, folderSelect.lastElementChild);
        }
        folderSelect.value = name;
      } else {
        folderSelect.value = "";
      }
    }
  });

  // Validation avec Entrée dans le champ texte (évite le Cancel par défaut)
  document.getElementById("new-folder-name").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      newFolderDialog.querySelector("button[value='save']").click();
    }
  });

  // Validation avec Entrée dans les champs texte du dialog principal
  ['edit-name', 'edit-url'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            dialog.querySelector("button[value='save']").click();
        }
    });
  });

  // --- GESTION DES PARAMÈTRES ---
  openSettingsBtn.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
});

/**
 * REPRODUCTION DE L'INTERFACE
 * Affiche les articles du buffer regroupés par source/dossier.
 */
async function renderApp() {
  const settings = await chrome.storage.local.get(["view_mode", "collapsed"]);
  const viewMode = settings.view_mode || "date";
  const collapsedState = settings.collapsed || {};

  if (toggleViewBtn) {
    toggleViewBtn.innerHTML = viewMode === "folder" ? SVG_CAT : SVG_DATE;
  }

  const allItems = await DB.getItems();
  // On ne garde que ceux qui n'ont pas le flag 'hidden'
  const items = allItems.filter((item) => !item.hidden);
  const sources = await DB.getSources();

  const sourceMap = sources.reduce((acc, s) => {
    acc[s.xmlUrl] = { title: s.title, folder: s.folder || t("folder_general") };
    return acc;
  }, {});

  // Mise à jour du badge
  chrome.action.setBadgeText({ text: items.length > 0 ? items.length.toString() : "" });

  // Condition d'affichage de l'état vide :
  // - Mode Date : Pas d'articles
  // - Mode Dossier : Pas de sources (car si on a des sources mais pas d'articles, on veut voir les sources)
  const showEmptyState = (viewMode === "date" && items.length === 0) || (viewMode === "folder" && sources.length === 0);

  if (showEmptyState) {
    feedList.innerHTML = "";
    emptyState.classList.remove("hidden");

    if (sources.length === 0) {
      // On récupère les SVG directement depuis le DOM (header) pour ne pas les dupliquer en JS
      const iconAdd = addBtn.innerHTML;
      const iconSettings = openSettingsBtn.innerHTML;

      emptyState.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 20px;">
          <h2 style="margin: 0;">${t("welcome_title")}</h2>
          <p style="margin: 0;">${t("welcome_add")}</p>
          <button id="btn-welcome-add" class="primary" style="gap: 5px;">${iconAdd} ${t("btn_add")}</button>
          <p style="margin: 0;">${t("welcome_sources")}</p>
          <button id="btn-welcome-options" style="gap: 5px;">${iconSettings} ${t("btn_options")}</button>
        </div>
      `;
      document.getElementById("btn-welcome-add").onclick = detectAndAddFeed;
      document.getElementById("btn-welcome-options").onclick = () => chrome.runtime.openOptionsPage();
    } else {
      emptyState.textContent = t("ui_no_items");
    }
    return;
  }

  emptyState.classList.add("hidden");

  if (viewMode === "folder") {
    // 1. Initialisation de la structure avec TOUTES les sources
    const structure = {};
    const urlToFolder = {}; // Map pour retrouver le dossier d'un item rapidement

    sources.forEach(s => {
      const f = s.folder || t("folder_general");
      if (!structure[f]) structure[f] = {};
      // On utilise l'URL comme clé unique
      structure[f][s.xmlUrl] = { title: s.title, url: s.xmlUrl, items: [] };
      urlToFolder[s.xmlUrl] = f;
    });

    // 2. Distribution des articles dans la structure
    items.forEach(item => {
      const f = urlToFolder[item.xmlUrl];
      // Si la source existe toujours (n'a pas été supprimée entre temps)
      if (f && structure[f][item.xmlUrl]) {
        structure[f][item.xmlUrl].items.push(item);
      }
    });

    const sortedFolders = Object.keys(structure).sort();

    feedList.innerHTML = sortedFolders.map(folder => {
      const sourcesInFolder = structure[folder];
      // Tri des sources par titre
      const sortedSourceUrls = Object.keys(sourcesInFolder).sort((a, b) => {
        return sourcesInFolder[a].title.localeCompare(sourcesInFolder[b].title);
      });

      let folderCount = 0;

      const sourcesHtml = sortedSourceUrls.map(url => {
        const data = sourcesInFolder[url];
        const sourceItems = data.items.sort((a, b) => b.timestamp - a.timestamp);
        folderCount += sourceItems.length;

        const sourceId = `source:${url}`;
        const isCollapsed = collapsedState[sourceId] ? " collapsed" : "";

        return `
          <div class="source-group">
            <h4 class="collapsible-header source-header${isCollapsed}" data-toggle-id="${sourceId}">
              ${SVG_CHEVRON}
              <span>${data.title} (${sourceItems.length})</span>
              <div class="source-actions">
                <button class="icon-btn" data-action="edit-source" data-url="${data.url}" title="${t("ui_edit")}">
                  ${SVG_EDIT}
                </button>
                <button class="icon-btn" data-action="delete-source" data-url="${data.url}" title="${t("ui_delete")}">
                  ${SVG_TRASH}
                </button>
              </div>
            </h4>
            <div class="group-content">
              ${sourceItems.map(i => renderItemHtml(i)).join("")}
            </div>
          </div>
        `;
      }).join("");

      const folderId = `folder:${folder}`;
      const isCollapsed = collapsedState[folderId] ? " collapsed" : "";

      return `
        <div class="folder-group">
          <h3 class="collapsible-header folder-header${isCollapsed}" data-toggle-id="${folderId.replace(/"/g, "&quot;")}">
            ${SVG_CHEVRON}
            <span>${folder} (${folderCount})</span>
          </h3>
          <div class="group-content">
            ${sourcesHtml}
          </div>
        </div>
      `;
    }).join("");
  } else {
    // Tri par timestamp (plus récent en haut)
    items.sort((a, b) => b.timestamp - a.timestamp);
    feedList.innerHTML = items.map(item => renderItemHtml(item, sourceMap[item.xmlUrl])).join("");
  }

  // Délégation d'événements pour le buffer
  feedList.onclick = async (e) => {
    // 1. Gestion des actions de Source (Edit / Delete)
    const actionBtn = e.target.closest("button[data-action='edit-source'], button[data-action='delete-source']");
    if (actionBtn) {
      e.stopPropagation(); // Empêche le repli du dossier
      const url = actionBtn.dataset.url;
      
      if (actionBtn.dataset.action === "edit-source") {
        const sources = await DB.getSources();
        const source = sources.find(s => s.xmlUrl === url);
        if (source) openEditOverlay(source);
      } else {
        if (confirm(t("ui_confirm_delete"))) {
          await DB.deleteSource(url);
          renderApp();
        }
      }
      return;
    }

    const header = e.target.closest(".collapsible-header");
    if (header) {
      header.classList.toggle("collapsed");
      const toggleId = header.dataset.toggleId;
      if (toggleId) {
        const s = await chrome.storage.local.get(["collapsed"]);
        const c = s.collapsed || {};
        if (header.classList.contains("collapsed")) {
          c[toggleId] = true;
        } else {
          delete c[toggleId];
        }
        chrome.storage.local.set({ collapsed: c });
      }
      return;
    }

    const btn = e.target.closest("button, a");
    if (!btn) return;

    const row = btn.closest(".item-row");
    const id = row.dataset.id;
    const action = btn.dataset.action;

    if (action === "discard" || action === "open") {
      if (action === "open") {
        e.preventDefault();
      }

      await DB.hideItem(id);

      const sourceGroup = row.closest(".source-group");
      const folderGroup = row.closest(".folder-group");
      
      row.remove();

      if (sourceGroup && sourceGroup.querySelectorAll(".item-row").length === 0) {
        sourceGroup.remove();
      }

      if (folderGroup && folderGroup.querySelectorAll(".item-row").length === 0) {
        folderGroup.remove();
      }

      const remaining = feedList.querySelectorAll(".item-row").length;
      chrome.action.setBadgeText({ text: remaining > 0 ? remaining.toString() : "" });

      if (remaining === 0) {
        renderApp();
      } else {
        // Mise à jour dynamique des compteurs dans les titres (Vue Dossier)
        if (sourceGroup && sourceGroup.isConnected) {
          const span = sourceGroup.querySelector("h4 span");
          if (span) span.textContent = span.textContent.replace(/\(\d+\)$/, `(${sourceGroup.querySelectorAll(".item-row").length})`);
        }
        if (folderGroup && folderGroup.isConnected) {
          const span = folderGroup.querySelector("h3 span");
          if (span) span.textContent = span.textContent.replace(/\(\d+\)$/, `(${folderGroup.querySelectorAll(".item-row").length})`);
        }
      }

      if (action === "open") {
        const background = e.ctrlKey || e.metaKey;
        chrome.tabs.create({ url: btn.href, active: !background });
      }
    }
  };
}

function formatTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  let interval = Math.floor(seconds / 2592000);
  if (interval >= 1) return interval + " mois";
  interval = Math.floor(seconds / 86400);
  if (interval >= 1) return interval + " j";
  interval = Math.floor(seconds / 3600);
  if (interval >= 1) return interval + " h";
  interval = Math.floor(seconds / 60);
  return (interval > 0 ? interval : 1) + " min";
}

function renderItemHtml(item, sourceInfo = null) {
  const timeAgo = formatTimeAgo(item.timestamp);
  let metaContent = timeAgo;
  if (sourceInfo) {
    metaContent = `${sourceInfo.folder} &bull; ${sourceInfo.title} &bull; ${timeAgo}`;
  }
  const metaHtml = `<div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 2px;">${metaContent}</div>`;

  return `
    <div class="item-row" data-id="${item.id}">
      <div style="flex: 1; min-width: 0; margin-right: 10px;">
        <a href="${item.link}" target="_blank" class="item-link" data-action="open" style="margin-right: 0;">
          ${item.title}
        </a>
        ${metaHtml}
      </div>
      <button class="discard-btn" data-action="discard" title="Discard">×</button>
    </div>
  `;
}

/**
 * DÉTECTION DU FLUX (Onglet actif)
 * Injecte un micro-script pour trouver la balise <link> RSS/Atom.
 */
async function detectAndAddFeed() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  let origin = "";
  let finalUrl = null;

  try {
    if (!tab.url) throw new Error("Invalid URL");

    const urlObj = new URL(tab.url);
    origin = urlObj.origin;

    if (!urlObj.protocol.startsWith("http")) throw new Error("System page");

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
      folder: "",
      notify: true,
    });
  } catch (err) {
    if (err.message !== "System page" && err.message !== "Invalid URL") {
      console.error("RSSext: Erreur de détection", err);
    }
    // En cas d'erreur (page système Chrome), on ouvre quand même l'overlay vide
    openEditOverlay({
      xmlUrl: origin || "",
      title: tab.title || t("source_new_title"),
      folder: "",
      notify: true,
    });
  }
}

/**
 * GESTION DE L'OVERLAY (Dialog)
 */
async function openEditOverlay(source) {
  document.getElementById("edit-name").value = source.title;
  const urlInput = document.getElementById("edit-url");
  if (urlInput) urlInput.value = source.xmlUrl;
  
  // Population du Select Dossier
  const select = document.getElementById("edit-folder");
  select.innerHTML = "";
  
  const optGen = document.createElement("option");
  optGen.value = "";
  optGen.textContent = t("folder_general");
  select.appendChild(optGen);

  const sources = await DB.getSources();
  const folders = new Set(sources.map(s => s.folder).filter(f => f));
  Array.from(folders).sort().forEach(f => {
    const opt = document.createElement("option");
    opt.value = f;
    opt.textContent = f;
    select.appendChild(opt);
  });

  const optNew = document.createElement("option");
  optNew.value = "__NEW__";
  optNew.textContent = `[ ${t("ui_add_folder_option")} ]`;
  select.appendChild(optNew);

  select.value = source.folder || "";
  document.getElementById("edit-notify").checked = source.notify;

  // On stocke l'URL dans le dataset du dialog pour le submit
  dialog.dataset.currentUrl = source.xmlUrl;
  dialog.showModal();
}

async function handleDialogSubmit(e) {
  const action = e.submitter.value;
  const oldUrl = dialog.dataset.currentUrl;

  if (action === "save") {
    const urlInput = document.getElementById("edit-url");
    const newUrl = urlInput ? urlInput.value.trim() : oldUrl;
    if (!newUrl) return;

    let folder = document.getElementById("edit-folder").value;
    if (folder === "__NEW__") folder = "";

    await DB.putSource({
      xmlUrl: newUrl,
      title: document.getElementById("edit-name").value,
      folder: folder,
      notify: document.getElementById("edit-notify").checked,
    });

    // Si l'URL a changé, on supprime l'ancienne source pour éviter les doublons
    if (oldUrl && newUrl !== oldUrl) {
      await DB.deleteSource(oldUrl);
    }

    // On peut forcer un scan immédiat ici si besoin
    chrome.runtime.getBackgroundPage
      ? null
      : chrome.runtime.sendMessage({ action: "scan_now" });
  }

  renderApp();
}

// Bouton supprimer dans l'overlay
document.getElementById("delete-source").onclick = async () => {
  if (confirm(t("ui_confirm_delete_full"))) {
    await DB.deleteSource(dialog.dataset.currentUrl);
    dialog.close();
    renderApp();
  }
};
