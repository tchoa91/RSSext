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
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "rss-scan-alarm") {
    performScan();
  } else if (alarm.name.startsWith("retry:")) {
    // Gestion du retry notification (après 15 min)
    const itemId = alarm.name.split(":")[1];

    // Vérification des préférences globales au moment du retry
    const config = await chrome.storage.local.get(["notify"]);
    if (config.notify === false) return;

    const items = await DB.getItems();
    const item = items.find((i) => i.id === itemId);
    // On ne relance que si l'item existe encore et n'est pas caché
    if (item && !item.hidden) {
      // On doit retrouver la source pour l'affichage
      const sources = await DB.getSources();
      const source = sources.find((s) => s.xmlUrl === item.xmlUrl);
      if (source) {
        // Vérification que la source est toujours notifiable
        if (source.notify) {
          NotificationSystem.enqueue(item, source, 2); // Tentative 2
        }
      }
    }
  }
  }
);

/**
 * LOGIQUE DE SCAN PRINCIPALE
 */
async function performScan() {
  try {
    // Récupération de la config
    const config = await chrome.storage.local.get(["ttl", "notify"]);
    const ttl = parseInt(config.ttl, 10) || DEFAULT_TTL;

    // 1. Purge du buffer (TTL) avant de commencer
    await DB.purgeOldItems(ttl);

    // 2. Récupération des sources
    const sources = await DB.getSources();

    // 3. Scan asynchrone de chaque source
    for (const source of sources) {
      try {
        const response = await fetch(source.xmlUrl, { cache: "no-store" });
        const xmlText = await response.text();

        const freshItems = parseFeed(xmlText, source.xmlUrl, ttl);
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
            newItems.forEach(item => {
              NotificationSystem.enqueue(item, source, 1);
            });
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
function parseFeed(xmlString, xmlUrl, ttl = 30) {
  const items = [];
  const now = Date.now();
  const threshold = now - ttl * 24 * 60 * 60 * 1000;

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
    let title = titleMatch ? titleMatch[1].trim() : chrome.i18n.getMessage("item_no_title");
    title = decodeEntities(title);

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
 * SYSTÈME DE NOTIFICATIONS AVANCÉ
 * Gère la queue, le throttling, les interactions et le retry.
 */
const NotificationSystem = {
  queue: [],
  isProcessing: false,
  handledIds: new Set(), // IDs traités par l'utilisateur (clic/close) pour éviter le retry

  /**
   * Vide la file d'attente.
   */
  clear() {
    this.queue = [];
  },

  /**
   * Ajoute une notification à la file d'attente.
   * @param {Object} item - L'article
   * @param {Object} source - La source
   * @param {number} attempt - 1 (premier passage) ou 2 (retry 15min)
   */
  enqueue(item, source, attempt = 1) {
    this.queue.push({ item, source, attempt });
    this.processQueue();
  },

  /**
   * Traite la file d'attente avec un throttling (1 seconde).
   */
  processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;
    const { item, source, attempt } = this.queue.shift();

    // Vérification ultime : l'article est-il toujours valide (non caché) ?
    DB.getItems().then((items) => {
      const dbItem = items.find((i) => i.id === item.id);
      if (dbItem && !dbItem.hidden) {
        this.show(item, source, attempt);
      }
    }).finally(() => {
      // Throttling : on attend 2s avant de traiter le suivant
      setTimeout(() => {
        this.isProcessing = false;
        this.processQueue();
      }, 2000);
    });
  },

  /**
   * Affiche la notification native.
   */
  show(item, source, attempt) {
    // Calcul de l'âge pour le contexte
    const diff = Date.now() - item.timestamp;
    const minutes = Math.floor(diff / 60000);
    let age;
    if (minutes < 60) age = `${minutes} min`;
    else if (minutes < 1440) age = `${Math.floor(minutes / 60)} h`;
    else if (minutes < 43200) age = `${Math.floor(minutes / 1440)} d`;
    else age = `${Math.floor(minutes / 43200)} m`;

    const category = source.folder || "Général";

    // ID unique pour la notif, mais on garde l'ID de l'item pour la logique
    // Format: "item_id:attempt:timestamp"
    // Le timestamp garantit une nouvelle notif visuelle à chaque fois (pas d'update)
    const notifId = `${item.id}:${attempt}:${Date.now()}`;

    chrome.notifications.create(notifId, {
      type: "basic",
      iconUrl: "/assets/icon128.png",
      title: item.title,
      message: source.title,
      contextMessage: `${category} • ${age}`,
      buttons: [
        { title: chrome.i18n.getMessage("action_open") },
        { title: chrome.i18n.getMessage("action_discard") },
      ],
      priority: 2,
      requireInteraction: true, // On force l'affichage jusqu'au clear()
    });

    // Auto-clear après 30 secondes -> Déclenche onClosed
    setTimeout(() => {
      chrome.notifications.clear(notifId);
    }, 30000);
  },
};

/**
 * GESTION DES CLICS SUR NOTIFICATIONS (Corps)
 * Action : Ouvrir + Cacher
 */
chrome.notifications.onClicked.addListener(async (notifId) => {
  const [itemId] = notifId.split(":");
  NotificationSystem.handledIds.add(notifId); // Marqué comme traité

  const items = await DB.getItems();
  const item = items.find((i) => i.id === itemId);
  
  if (item) {
    chrome.tabs.create({ url: item.link });
    await DB.hideItem(itemId);
    updateBadge();
  }
  chrome.notifications.clear(notifId);
});

/**
 * GESTION DES BOUTONS (0: Open, 1: Discard)
 */
chrome.notifications.onButtonClicked.addListener(async (notifId, btnIdx) => {
  const [itemId] = notifId.split(":");
  NotificationSystem.handledIds.add(notifId); // Marqué comme traité

  if (btnIdx === 0) {
    // OPEN
    const items = await DB.getItems();
    const item = items.find((i) => i.id === itemId);
    if (item) chrome.tabs.create({ url: item.link });
  }
  
  // DANS TOUS LES CAS (Open ou Discard) -> On cache l'item
  await DB.hideItem(itemId);
  updateBadge();
  chrome.notifications.clear(notifId);
});

/**
 * GESTION DE LA FERMETURE (Croix ou Timeout)
 */
chrome.notifications.onClosed.addListener((notifId, byUser) => {
  const [itemId, attemptStr] = notifId.split(":");
  const attempt = parseInt(attemptStr, 10);

  // Si fermé par l'utilisateur (la croix), on considère ça comme un "Vu/Ignoré" -> On cache
  if (byUser) {
    DB.hideItem(itemId).then(updateBadge);
    return;
  }

  // Si fermé par le système (Timeout) ET non traité (pas cliqué avant)
  if (!byUser && !NotificationSystem.handledIds.has(notifId)) {
    // Si c'était la première tentative, on programme le retry dans 15 min
    if (attempt === 1) {
      console.log(`RSSext: Item ${itemId} ignored. Retrying in 15min.`);
      chrome.alarms.create(`retry:${itemId}`, { delayInMinutes: 15 });
    }
    // Si attempt === 2, on abandonne (supprimé de la queue visuelle, mais reste dans la DB non-caché)
  }

  // Nettoyage mémoire
  NotificationSystem.handledIds.delete(notifId);
});

/**
 * MISE À JOUR DU BADGE
 */
async function updateBadge() {
  const items = await DB.getItems();
  const count = items.filter((i) => !i.hidden).length;
  const text = count > 0 ? count.toString() : "";
  chrome.action.setBadgeText({ text });
}

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
    
    // Interruption immédiate des notifications en cours
    NotificationSystem.clear();

    chrome.storage.local.get(["interval"], (res) => {
      const interval = parseInt(res.interval, 10) || DEFAULT_INTERVAL;
      chrome.alarms.create("rss-scan-alarm", { periodInMinutes: interval });
    });
    // On peut aussi lancer un scan immédiat pour appliquer le nouveau TTL
    performScan();
  }
});

/**
 * Décode les entités HTML (numériques et nommées basiques)
 */
function decodeEntities(str) {
  if (!str) return "";
  return str.replace(/&([a-z0-9]+|#[0-9]{1,6}|#x[0-9a-f]{1,6});/ig, (match, entity) => {
    entity = entity.toLowerCase();
    if (entity.startsWith("#x")) {
      return String.fromCharCode(parseInt(entity.substr(2), 16));
    }
    if (entity.startsWith("#")) {
      return String.fromCharCode(parseInt(entity.substr(1), 10));
    }
    const named = {
      "amp": "&", "lt": "<", "gt": ">", "quot": "\"", "apos": "'"
    };
    return named[entity] || match;
  });
}
