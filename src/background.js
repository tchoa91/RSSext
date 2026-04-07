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
import { decodeEntities, addRef, formatTimeAgo, t } from "./utils.js";

// Configuration 
const DEFAULT_INTERVAL = 30;
const DEFAULT_TTL = 30;
const SCAN_BATCH_SIZE = 5;

/**
 * INITIALISATION
 * Se déclenche à l'installation ou lors d'une mise à jour.
 */
chrome.runtime.onInstalled.addListener(async () => {
  const config = await chrome.storage.local.get(["interval"]);
  const interval = parseInt(config.interval, 10) || DEFAULT_INTERVAL;
  chrome.alarms.create("rss-scan-alarm", { periodInMinutes: interval });
  performScan();
});

/**
 * AU DÉMARRAGE DU NAVIGATEUR
 * Lance un scan immédiat pour rafraîchir les données.
 */
chrome.runtime.onStartup.addListener(() => {
  performScan();
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
    if (item) {
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
  // Vérification de la connectivité avant tout
  if (!navigator.onLine) {
    // console.log("RSSext: Appareil hors ligne, scan reporté.");
    return;
  }

  try {
    // Récupération de la config
    const config = await chrome.storage.local.get(["ttl", "notify"]);
    const ttl = parseInt(config.ttl, 10) || DEFAULT_TTL;

    // 1. Purge du buffer (TTL) avant de commencer
    await DB.purgeOldItems(ttl);
    await updateBadge();

    // 2. Récupération des sources et des items existants (une seule fois)
    const sources = await DB.getSources();
    const existingItems = await DB.getAllItems();
    const existingIds = new Set(existingItems.map((i) => i.id));

    // 3. Traitement par lots parallèles
    for (let i = 0; i < sources.length; i += SCAN_BATCH_SIZE) {
      const batch = sources.slice(i, i + SCAN_BATCH_SIZE);

      const batchPromises = batch.map((source) => {
        // Implémentation du Timeout de sécurité (10 secondes)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        return fetch(source.xmlUrl, { cache: "no-store", signal: controller.signal })
          .then((response) => {
            clearTimeout(timeoutId);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.text();
          })
          .catch((err) => {
            clearTimeout(timeoutId);
            // Si l'erreur est déclenchée par notre AbortController
            if (err.name === 'AbortError') {
              throw new Error("Timeout (10s)");
            }
            throw err;
          });
      });

      const results = await Promise.allSettled(batchPromises);

      // On traite les résultats du lot
      for (const [index, result] of results.entries()) {
        const source = batch[index];

        if (result.status === "fulfilled") {
          try {
            const xmlText = result.value;
            const freshItems = parseFeed(xmlText, source.xmlUrl, ttl);

            // Filtrage des nouveautés par rapport à ce qui est déjà en base OU déjà trouvé dans ce scan
            const newItems = freshItems.filter((item) => {
              if (!existingIds.has(item.id)) {
                existingIds.add(item.id); // On l'ajoute immédiatement pour bloquer les doublons suivants
                return true;
              }
              return false;
            });

            if (newItems.length > 0) {
              await DB.addItems(newItems);

              if (source.notify && config.notify !== false) {
                newItems.forEach((item) => {
                  NotificationSystem.enqueue(item, source, 1);
                });
              }
            }

            // Si la source avait une erreur précédemment, on la nettoie
            if (source.error) {
              delete source.error;
              await DB.putSource(source);
            }
          } catch (err) {
            console.warn(`RSSext: Failed to parse ${source.xmlUrl}`, err);
            source.error = err.message || "Parse error";
            await DB.putSource(source);
          }
        } else { // 'rejected'
          const err = result.reason;
          console.warn(`RSSext: Failed to fetch ${source.xmlUrl}`, err);
          source.error = err.message || "Unknown error";
          await DB.putSource(source);
        }
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
 * @param {string} xmlString - Le contenu XML brut.
 * @param {string} xmlUrl - L'URL de la source (pour le contexte).
 * @param {number} ttl - Durée de vie en jours.
 * @returns {Array} Liste des articles trouvés.
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

    // 2. Si l'article est plus vieux que le buffer, on ignore
    if (pubDate < threshold) continue;

    // 3. Extraction Titre et Lien
    const titleMatch = block.match(
      /<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/,
    );
    let title = titleMatch ? titleMatch[1].trim() : chrome.i18n.getMessage("item_no_title");
    title = decodeEntities(title);

    let link = "";
    const rssLinkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
    
    if (rssLinkMatch) {
      // Stratégie RSS 2.0 classique
      link = rssLinkMatch[1].trim();
    } else {
      // Stratégie Atom : on récupère toutes les balises <link> de l'entrée
      const atomLinks = block.match(/<link[^>]+>/ig) || [];
      
      for (const linkTag of atomLinks) {
        // Règle n°1 : On ignore strictement les liens qui pointent vers le flux lui-même
        if (/rel=["']self["']/i.test(linkTag)) {
          continue;
        }

        const hrefMatch = linkTag.match(/href=["']([^"']+)["']/i);
        if (hrefMatch) {
          link = hrefMatch[1];
          
          // Règle n°2 : Si on trouve un alternate explicite, c'est le vainqueur absolu.
          if (/rel=["']alternate["']/i.test(linkTag)) {
            break; 
          }
          // Note : S'il n'y a pas d'attribut 'rel', on stocke le href (Atom suppose que c'est l'alternate par défaut),
          // mais on laisse la boucle continuer au cas où un vrai alternate plus qualitatif se cache plus loin.
        }
      }
    }

    if (link) {
      link = decodeEntities(link);
      try {
        const urlObj = new URL(link);
        // On refuse tout ce qui n'est pas strictement du HTTP(S)
        if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
           continue; // On rejette ce lien empoisonné ou invalide
        }
        // Liste noire des paramètres de tracking les plus toxiques/courants
        const trackingParams = [
          "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", 
          "fbclid", // Facebook
          "gclid",  // Google Ads
          "igshid", // Instagram
          "si"      // YouTube Share ID (souvent ajouté récemment)
        ];
        trackingParams.forEach(param => urlObj.searchParams.delete(param));
        link = urlObj.toString();
      } catch (e) {
        // L'URL est malformée ou relative (ex: "/article/1").
        // On la laisse telle quelle plutôt que de crasher le parser entier.
      }

      // On encode l'URL pour générer l'ID
      const id = btoa(encodeURIComponent(link)).replace(/=/g, '');
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
   */
  enqueue(item, source, attempt = 1) {
    this.queue.push({ item, source, attempt });
    this.processQueue();
  },

  /**
   * Traite la file d'attente avec un throttling
   */
  processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;
    const { item, source, attempt } = this.queue.shift();

    DB.getItems().then((items) => {
      const dbItem = items.find((i) => i.id === item.id);
      if (dbItem) {
        this.show(item, source, attempt);
      }
    }).finally(() => {
      // 2. Définition et bascule du délai
      const currentDelay = this.useLongDelay ? 3000 : 2800;
      this.useLongDelay = !this.useLongDelay; // On inverse pour le prochain passage

      // 3. Application du délai calculé
      setTimeout(() => {
        this.isProcessing = false;
        this.processQueue();
      }, currentDelay);
    });
  },

  /**
   * Affiche la notification native.
   */
  show(item, source, attempt) {
    // Calcul de l'âge pour le contexte
    const age = formatTimeAgo(item.timestamp);
    const category = source.folder || t("folder_general");

    // ID unique pour la notif, mais on garde l'ID de l'item pour la logique
    // Format: "item_id:attempt:timestamp"
    // Le timestamp garantit une nouvelle notif visuelle à chaque fois (pas d'update)
    const notifId = `${item.id}:${attempt}:${Date.now()}`;

    chrome.notifications.create(notifId, {
      type: "basic",
      iconUrl: "/assets/icon128.png",
      title: item.title,
      message: source.title,
      contextMessage: `${category} • (${age})`,
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

  const items = await DB.getAllItems();
  const item = items.find((i) => i.id === itemId);
  
  if (item) {
    await DB.hideItem(itemId);
    updateBadge();
    chrome.runtime.sendMessage({ action: "hide_item_ui", itemId: itemId }).catch(() => {});
    chrome.tabs.create({ url: addRef(item.link) });
  }
  chrome.notifications.clear(notifId);
});

/**
 * GESTION DES BOUTONS (0: Open, 1: Discard)
 */
chrome.notifications.onButtonClicked.addListener(async (notifId, btnIdx) => {
  const [itemId] = notifId.split(":");
  NotificationSystem.handledIds.add(notifId); // Marqué comme traité
  chrome.notifications.clear(notifId);

  await DB.hideItem(itemId);
  updateBadge();
  chrome.runtime.sendMessage({ action: "hide_item_ui", itemId: itemId }).catch(() => {});

  if (btnIdx === 0) { // OPEN
    const items = await DB.getAllItems();
    const item = items.find((i) => i.id === itemId);
    if (item) {
      chrome.tabs.create({ url: addRef(item.link) });
    }
  }
});

/**
 * GESTION DE LA FERMETURE (Croix ou Timeout)
 */
chrome.notifications.onClosed.addListener((notifId, byUser) => {
  const [itemId, attemptStr] = notifId.split(":");
  const attempt = parseInt(attemptStr, 10);

  // Si fermé par l'utilisateur (la croix), on considère ça comme un "Vu/Ignoré" -> On cache
  if (byUser) {
    DB.hideItem(itemId).then(() => {
      updateBadge();
      chrome.runtime.sendMessage({ action: "hide_item_ui", itemId: itemId }).catch(() => {});
    });
    return;
  }

  // Si fermé par le système (Timeout) ET non traité (pas cliqué avant)
  if (!byUser && !NotificationSystem.handledIds.has(notifId)) {
    // Si c'était la première tentative, on programme le retry dans 15 min
    if (attempt === 1) {
      // console.log(`RSSext: Item ${itemId} ignored. Retrying in 15min.`);
      chrome.alarms.create(`retry:${itemId}`, { delayInMinutes: 15 });
    }
    // Si attempt === 2, on abandonne (supprimé de la queue visuelle, mais reste dans la DB non-caché)
  }

  // Nettoyage mémoire
  NotificationSystem.handledIds.delete(notifId);
});

/**
 * MISE À JOUR DU BADGE
 * Compte les items non cachés et met à jour l'icône.
 */
async function updateBadge() {
  const items = await DB.getItems();
  const count = items.length;
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

  if (request.action === "scan_now") {
    // console.log("RSSext: Scan manuel déclenché après import.");
    performScan(); 
  }

  if (request.action === "update_settings") {
    // console.log("RSSext: Settings updated. Refreshing alarm...");
    
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
