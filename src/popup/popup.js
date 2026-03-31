/**
 * ============================================================================
 * RSSext - Interface Popup (GPL-3.0)
 * ============================================================================
 * RÔLE :
 * Gère l'affichage du buffer, l'ajout de sources et l'édition rapide.
 * ============================================================================
 */

import { DB } from "../db.js";
import { t, escapeHtml, formatTimeAgo, addRef, applyZoom, translateUI } from "../utils.js";

// Références DOM
const feedList = document.getElementById("feed-list");
const toggleViewBtn = document.getElementById("toggle-view");
const emptyState = document.getElementById("empty-state");
const addBtn = document.getElementById("add-current");
const dialog = document.getElementById("edit-dialog");
const editForm = dialog.querySelector("form");
const newFolderDialog = document.getElementById("new-folder-dialog");
const openSettingsBtn = document.getElementById("open-settings");

// SVG
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

const SVG_CHECK_ALL = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L7 17l-5-5"></path><path d="M22 10l-7.5 7.5L13 16"></path></svg>`;
const SVG_EXPAND = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>`;
const SVG_COLLAPSE = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>`;
const SVG_LIST = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>`;
const SVG_ALERT = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;

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
      applyZoom(result.zoom);
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
 * Affiche les articles du buffer (Vue Date ou Vue Dossier).
 * Gère l'état vide et les boutons d'action contextuels.
 */
async function renderApp() {
  const settings = await chrome.storage.local.get(["view_mode", "collapsed"]);
  const viewMode = settings.view_mode || "date";
  const collapsedState = settings.collapsed || {};

  const allItems = await DB.getItems();
  // On ne garde que ceux qui n'ont pas le flag 'hidden'
  const items = allItems.filter((item) => !item.hidden);
  const sources = await DB.getSources();

  // Pré-chargement des couleurs pour les dossiers
  // Optimisation : On résout les couleurs une seule fois ici pour garantir la cohérence
  // entre l'affichage des headers de dossiers et des tags dans les items individuels.
  const uniqueFolders = [...new Set(sources.map(s => s.folder || t("folder_general")))];
  const folderHues = {};
  for (const f of uniqueFolders) {
    if (f !== t("folder_general")) {
      folderHues[f] = await DB.getFolderHue(f);
    } else {
      folderHues[f] = null;
    }
  }

  // --- GESTION DES BOUTONS D'ACTION (Header) ---
  const listActions = document.getElementById("list-actions");
  listActions.innerHTML = "";

  if (viewMode === "folder" && sources.length > 0) {
    // Bouton Expand All
    const btnExpand = document.createElement("button");
    btnExpand.innerHTML = SVG_EXPAND;
    btnExpand.title = t("action_expand_all");
    btnExpand.onclick = () => {
      chrome.storage.local.set({ collapsed: {} });
      renderApp();
    };
    
    // Bouton Show Sources Only (Edit All)
    const btnSources = document.createElement("button");
    btnSources.innerHTML = SVG_LIST;
    btnSources.title = t("action_show_sources");
    btnSources.onclick = () => {
      const sourceCollapsed = {};
      // On replie toutes les sources, mais on laisse les dossiers ouverts (absents de la map)
      sources.forEach(s => sourceCollapsed[`source:${s.xmlUrl}`] = true);
      chrome.storage.local.set({ collapsed: sourceCollapsed });
      renderApp();
    };

    // Bouton Collapse All
    const btnCollapse = document.createElement("button");
    btnCollapse.innerHTML = SVG_COLLAPSE;
    btnCollapse.title = t("action_collapse_all");
    btnCollapse.onclick = () => {
      const allCollapsed = {};
      // On replie tous les dossiers et toutes les sources
      const folders = new Set();
      sources.forEach(s => folders.add(s.folder || t("folder_general")));
      folders.forEach(f => allCollapsed[`folder:${f}`] = true);
      sources.forEach(s => allCollapsed[`source:${s.xmlUrl}`] = true);
      
      chrome.storage.local.set({ collapsed: allCollapsed });
      renderApp();
    };

    listActions.appendChild(btnExpand);
    listActions.appendChild(btnSources);
    listActions.appendChild(btnCollapse);
  } else if (viewMode === "date" && items.length > 0) {
    // Bouton Dismiss All
    const btnDismiss = document.createElement("button");
    btnDismiss.innerHTML = SVG_CHECK_ALL;
    btnDismiss.title = t("action_dismiss_all");
    btnDismiss.onclick = async () => {
      if (confirm(t("ui_confirm_dismiss_all"))) {
        // Effet visuel "throttlé" (cascade)
        // Note : On synchronise le délai JS avec l'animation CSS (.item-row transition)
        // en ajoutant un petit délai progressif (60ms) par item pour l'effet "vague".
        const rows = Array.from(document.querySelectorAll(".item-row"));
        rows.forEach((row, index) => {
          setTimeout(() => row.classList.add("dismissing"), index * 60);
        });

        // On attend que la cascade totale + la durée de transition (300ms) soient finies
        await new Promise(resolve => setTimeout(resolve, (rows.length * 60) + 300));

        const promises = items.map(i => DB.hideItem(i.id));
        await Promise.all(promises);
        renderApp();
      }
    };
    listActions.appendChild(btnDismiss);
  }

  if (toggleViewBtn) {
    toggleViewBtn.innerHTML = viewMode === "folder" ? SVG_CAT : SVG_DATE;
    toggleViewBtn.title = viewMode === "folder" ? t("ui_switch_to_date") : t("ui_switch_to_folder");
  }

  const sourceMap = sources.reduce((acc, s) => {
    const folderName = s.folder || t("folder_general");
    acc[s.xmlUrl] = { 
      title: s.title, 
      folder: folderName,
      hue: folderHues[folderName]
    };
    return acc;
  }, {});

  // Mise à jour du badge
  chrome.action.setBadgeText({ text: items.length > 0 ? items.length.toString() : "" });

  // Condition d'affichage de l'état vide :
  // - Mode Date : Pas d'articles
  // - Mode Dossier : Pas de sources.
  const showEmptyState = (viewMode === "date" && items.length === 0) || (viewMode === "folder" && sources.length === 0);

  if (showEmptyState) {
    feedList.innerHTML = "";
    emptyState.classList.remove("hidden");

    if (sources.length === 0) {
      // On récupère les SVG directement depuis le DOM (header) pour ne pas les dupliquer en JS
      const iconAdd = addBtn.innerHTML;
      const iconSettings = openSettingsBtn.innerHTML;

      emptyState.innerHTML = `
        <div class="empty-state-content">
          <h2>${t("welcome_title")}</h2>
          <p>${t("welcome_add")}</p>
          <button id="btn-welcome-add" class="primary icon-gap">${iconAdd} ${t("btn_add")}</button>
          <p>${t("welcome_sources")}</p>
          <button id="btn-welcome-options" class="icon-gap">${iconSettings} ${t("btn_options")}</button>
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
      structure[f][s.xmlUrl] = { title: s.title, url: s.xmlUrl, items: [], error: s.error };
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

    feedList.innerHTML = sortedFolders.map((folder) => {
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
        const ariaExpanded = collapsedState[sourceId] ? "false" : "true";

        const errorHtml = data.error ? `<span class="icon-error" title="${escapeHtml(data.error)}">${SVG_ALERT}</span>` : "";

        return `
          <div class="source-group">
            <h4 class="collapsible-header source-header${isCollapsed}" data-toggle-id="${sourceId}">
              <button class="chevron-btn" aria-expanded="${ariaExpanded}">${SVG_CHEVRON}</button>
              <span>${escapeHtml(data.title)} (${sourceItems.length}) ${errorHtml}</span>
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
      const ariaExpanded = collapsedState[folderId] ? "false" : "true";
      const hue = folderHues[folder];
      const hueStyle = hue !== null ? `style="--hue: ${hue};"` : "";

      return `
        <div class="folder-group">
          <h3 class="collapsible-header folder-header${isCollapsed}" data-toggle-id="${folderId.replace(/"/g, "&quot;")}">
            <button class="chevron-btn" aria-expanded="${ariaExpanded}">${SVG_CHEVRON}</button>
            <span class="folder-tag" ${hueStyle}>${escapeHtml(folder)} (${folderCount})</span>
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
  // Performance : Un seul listener sur le conteneur plutôt que N listeners sur chaque bouton.
  feedList.onclick = async (e) => {
    // 1. Gestion des actions de Source (Edit / Delete)
    const actionBtn = e.target.closest("button[data-action='edit-source'], button[data-action='delete-source']");
    if (actionBtn) {
      // Subtilité : e.stopPropagation() est crucial ici.
      // Sans cela, le clic remonterait au parent (.collapsible-header)
      // et déclencherait involontairement la fermeture/ouverture du dossier.
      e.stopPropagation(); 
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
      const isCollapsed = header.classList.contains("collapsed");
      
      const chevron = header.querySelector(".chevron-btn");
      if (chevron) chevron.setAttribute("aria-expanded", !isCollapsed);

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
        // Subtilité critique : On doit marquer l'item comme "lu" (hide) AVANT d'ouvrir l'onglet.
        // Raison : Ouvrir un onglet actif provoque la fermeture immédiate de la Popup par Chrome,
        // ce qui tue instantanément ce processus JS. Tout code après tabs.create ne s'exécuterait pas.
        await DB.hideItem(id);
        const remaining = feedList.querySelectorAll(".item-row").length - 1;
        chrome.action.setBadgeText({ text: remaining > 0 ? remaining.toString() : "" });
        const background = e.ctrlKey || e.metaKey;
        chrome.tabs.create({ url: btn.href, active: !background });
      }

      // Animation de sortie
      row.classList.add("dismissing");

      // On attend la fin de l'animation CSS (300ms) avant de supprimer du DOM/DB
      setTimeout(async () => {
        if (action === "discard") await DB.hideItem(id);

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
      }, 300); // Correspond à la durée de transition CSS
    }
  };
}

/**
 * Génère le HTML d'une ligne d'article.
 * @param {Object} item - L'article à afficher.
 * @param {Object|null} sourceInfo - Infos de la source (pour l'affichage en mode Date).
 * @returns {string} HTML string.
 */
function renderItemHtml(item, sourceInfo = null) {
  const timeAgo = formatTimeAgo(item.timestamp);
  let metaContent = timeAgo;
  if (sourceInfo) {
    const hueStyle = (sourceInfo.hue !== null && sourceInfo.hue !== undefined) 
      ? `style="--hue: ${sourceInfo.hue};"` 
      : "";
    const folderHtml = `<span class="folder-tag" ${hueStyle}>${escapeHtml(sourceInfo.folder)}</span>`;
    metaContent = `${folderHtml} &bull; ${escapeHtml(sourceInfo.title)} &bull; ${timeAgo}`;
  }
  const metaHtml = `<div class="item-meta">${metaContent}</div>`;

  return `
    <div class="item-row" data-id="${item.id}">
      <div class="item-content">
        <a href="${escapeHtml(addRef(item.link))}" target="_blank" class="item-link no-margin-right" data-action="open">
          ${escapeHtml(item.title)}
        </a>
        ${metaHtml}
      </div>
      <button class="discard-btn" data-action="discard" title="${t("action_discard")}">×</button>
    </div>
  `;
}

/**
 * Détecte un flux RSS sur l'onglet actif et ouvre le formulaire d'ajout.
 * Utilise une injection de script puis une heuristique de repli.
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
    // On injecte un script car la Popup n'a pas accès direct au DOM de l'onglet actif (isolation).
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
    // On passe par le Background (message) pour faire les fetchs afin de contourner
    // les restrictions CORS (Cross-Origin Resource Sharing) strictes de la Popup.
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
 * Ouvre la modale d'édition/ajout de source.
 * @param {Object} source - L'objet source (xmlUrl, title, folder...).
 */
async function openEditOverlay(source) {
  document.getElementById("edit-name").value = source.title;
  const urlInput = document.getElementById("edit-url");
  if (urlInput) {
    urlInput.value = source.xmlUrl;
    urlInput.removeAttribute("required");
  }
  
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

/**
 * Gère la validation et la soumission du formulaire d'édition.
 * @param {Event} e - L'événement submit.
 */
async function handleDialogSubmit(e) {
  e.preventDefault();
  const action = e.submitter.value;
  const oldUrl = dialog.dataset.currentUrl;

  if (action !== "save") {
    dialog.close();
    return;
  }

  const urlInput = document.getElementById("edit-url");
  const newUrl = urlInput ? urlInput.value.trim() : oldUrl;

  if (!newUrl) {
    if (urlInput) {
      urlInput.setCustomValidity("URL required");
      urlInput.reportValidity();
      urlInput.addEventListener("input", () => urlInput.setCustomValidity(""), { once: true });
    }
    return;
  }

  const saveBtn = e.submitter;
  saveBtn.disabled = true;
  saveBtn.style.cursor = "wait";

  try {
    const check = await chrome.runtime.sendMessage({ action: "test_url", url: newUrl });
    if (!check || !check.valid) {
      if (urlInput) {
        urlInput.setCustomValidity("Invalid URL");
        urlInput.reportValidity();
        urlInput.addEventListener("input", () => urlInput.setCustomValidity(""), { once: true });
      }
      return;
    }
  } finally {
    saveBtn.disabled = false;
    saveBtn.style.cursor = "";
  }

  let folder = document.getElementById("edit-folder").value;
  if (folder === "__NEW__") folder = "";

  // Si c'est un nouveau dossier, on s'assure qu'il a une couleur
  if (folder) await DB.getFolderHue(folder);

  await DB.putSource({
    xmlUrl: newUrl,
    title: document.getElementById("edit-name").value,
    folder: folder,
    notify: document.getElementById("edit-notify").checked,
  });

  if (oldUrl && newUrl !== oldUrl) {
    await DB.deleteSource(oldUrl);
  }

  chrome.runtime.getBackgroundPage
    ? null
    : chrome.runtime.sendMessage({ action: "scan_now" });

  dialog.close();
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
