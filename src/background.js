/**
 * ============================================================================
 * RSSext - Service Worker (GPL-3.0)
 * ============================================================================
 * RÔLE :
 * 1. Gestion du cycle de vie (Alarme de synchronisation).
 * 2. Scan des sources en arrière-plan via fetch + regex.
 * 3. Orchestration des notifications système.
 * 4. Nettoyage automatique du buffer (TTL).
 * ============================================================================
 */

import { DB } from "./db.js";

// Configuration par défaut (pourrait être déplacée dans chrome.storage plus tard)
const DEFAULT_INTERVAL = 30;
const DEFAULT_TTL = 30;

/**
 * INITIALISATION
 * Se déclenche à l'installation ou lors d'une mise à jour.
 */
chrome.runtime.onInstalled.addListener(() => {
  console.log("RSSext: Extension installed. Setting up alarm...");
  // Création de l'alarme principale pour le polling
  chrome.alarms.create("rss-scan-alarm", { periodInMinutes: DEFAULT_INTERVAL });
  // Premier scan immédiat
  performScan();
  updateBadge();
});

/**
 * ÉCOUTEUR D'ALARME
 * Réveille le worker pour lancer le processus de scan.
 */
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "rss-scan-alarm") {
    performScan();
  }
});

/**
 * LOGIQUE DE SCAN PRINCIPALE
 */
async function performScan() {
  try {
    // Récupération de la config
    const config = await chrome.storage.local.get(["ttl", "notify"]);
    const ttl = config.ttl || DEFAULT_TTL;

    // 1. Purge du buffer (TTL) avant de commencer
    await DB.purgeOldItems(ttl);

    // 2. Récupération des sources
    const sources = await DB.getSources();

    // 3. Scan asynchrone de chaque source
    for (const source of sources) {
      try {
        const response = await fetch(source.xmlUrl, { cache: "no-store" });
        const xmlText = await response.text();

        const freshItems = parseFeed(xmlText, source.xmlUrl);
        const existingItems = await DB.getItems();
        const existingIds = new Set(existingItems.map((i) => i.id));

        // Filtrage des nouveautés
        const newItems = freshItems.filter((item) => !existingIds.has(item.id));

        if (newItems.length > 0) {
          // Ajout en DB
          await DB.addItems(newItems);

          // Notification si l'option est activée pour cette source
          // ET si les notifications globales sont activées (défaut true)
          if (source.notify && (config.notify !== false)) {
            notifyUser(source, newItems);
          }
        }
      } catch (err) {
        console.error(`RSSext: Failed to fetch ${source.xmlUrl}`, err);
      }
    }
    await updateBadge();
  } catch (err) {
    console.error("RSSext: Scan process failed", err);
  }
}

/**
 * PARSER LIGHT (Regex)
 * Extrait Titre et URL sans utiliser le DOM.
 */
function parseFeed(xmlString, xmlUrl) {
  const items = [];
  const now = Date.now();
  const threshold = now - 30 * 24 * 60 * 60 * 1000; // Seuil de 30 jours

  const blocks = xmlString.match(/<(item|entry)[\s\S]*?<\/\1>/g) || [];

  for (const block of blocks) {
    // 1. Extraction de la date (pubDate pour RSS, updated/published pour Atom)
    const dateMatch = block.match(
      /<(pubDate|updated|published)[^>]*>([\s\S]*?)<\/\1>/,
    );
    const pubDate = dateMatch ? new Date(dateMatch[2]).getTime() : now;

    // 2. LE GARDE-BARRIÈRE : Si l'article est plus vieux que le buffer, on ignore
    if (pubDate < threshold) continue;

    // 3. Extraction Titre et Lien (le reste ne change pas)
    const titleMatch = block.match(
      /<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/,
    );
    const title = titleMatch ? titleMatch[1].trim() : "No Title";

    let link = "";
    const rssLinkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
    if (rssLinkMatch) {
      link = rssLinkMatch[1].trim();
    } else {
      const atomLinkMatch = block.match(/<link[^+]+href=["']([^"']+)["']/);
      link = atomLinkMatch ? atomLinkMatch[1] : "";
    }

    if (link) {
      const id = btoa(link).substring(0, 32);
      items.push({ id, xmlUrl, title, link, timestamp: pubDate }); // On stocke la vraie date !
    }
  }
  return items;
}

/**
 * NOTIFICATIONS SYSTÈME
 */
function notifyUser(source, newItems) {
  const itemCount = newItems.length;
  const title =
    itemCount === 1
      ? newItems[0].title
      : `${itemCount} new updates in ${source.title}`;
  const message =
    itemCount === 1 ? `From: ${source.title}` : `Latest: ${newItems[0].title}`;

  chrome.notifications.create(`rss-${source.xmlUrl}-${Date.now()}`, {
    type: "basic",
    iconUrl: "/assets/icon128.png",
    title: title,
    message: message,
    buttons: [
      { title: chrome.i18n.getMessage("action_open") || "Open" },
      { title: chrome.i18n.getMessage("action_discard") || "Discard" },
    ],
    priority: 2,
  });
}

/**
 * MISE À JOUR DU BADGE
 */
async function updateBadge() {
  const items = await DB.getItems();
  const count = items.filter((i) => !i.hidden).length;
  const text = count > 0 ? count.toString() : "";
  chrome.action.setBadgeText({ text });
}

/**
 * GESTION DES CLICS SUR NOTIFICATIONS
 */
chrome.notifications.onButtonClicked.addListener(async (notifId, btnIdx) => {
  // Logique simplifiée : ici on pourrait stocker l'URL dans l'ID de notif
  // Pour le proto : on ouvre la popup ou le dernier lien si c'est un bouton "Open"
  if (btnIdx === 0) {
    // Logique d'ouverture de l'onglet à implémenter selon ton buffer
  }
  chrome.notifications.clear(notifId);
});

/* AUTRES !!! */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "test_url") {
    // On utilise fetch depuis le Service Worker pour éviter les blocages CORS
    fetch(request.url, { method: "HEAD" })
      .then((response) => {
        // On considère l'URL valide si le serveur répond 200 OK
        sendResponse({ valid: response.ok });
      })
      .catch(() => sendResponse({ valid: false }));
    return true; // Obligatoire pour garder le canal ouvert (asynchrone)
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scan_now") {
    console.log("RSSext: Scan manuel déclenché après import.");
    performScan(); // Ta fonction qui boucle sur les sources et fetch le XML
  }

  if (request.action === "update_settings") {
    console.log("RSSext: Settings updated. Refreshing alarm...");
    chrome.storage.local.get(["interval"], (res) => {
      const interval = res.interval || DEFAULT_INTERVAL;
      chrome.alarms.create("rss-scan-alarm", { periodInMinutes: interval });
    });
    // On peut aussi lancer un scan immédiat pour appliquer le nouveau TTL
    performScan();
  }
});
