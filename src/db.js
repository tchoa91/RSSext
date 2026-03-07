/**
 * ============================================================================
 * RSSext - Module de Persistence (GPL-3.0)
 * ============================================================================
 * * PHILOSOPHIE :
 * Ce module gère le stockage local via IndexedDB. Contrairement aux lecteurs
 * classiques, RSSext traite les données comme volatiles.
 * - 'sources' : Conserve tes abonnements et préférences (dossiers, notifications).
 * - 'items'   : Agit comme un buffer circulaire éphémère pour les nouveaux titres.
 * * ARCHITECTURE :
 * Utilise des Promises pour une intégration fluide dans le Service Worker (async/await).
 * Aucun stockage de contenu (body/description), seulement des métadonnées de lien.
 * ============================================================================
 */

const DB_NAME = "RSSext_DB";
const DB_VERSION = 1;

export const DB = {
  /**
   * Initialise ou met à jour la structure de la base de données.
   * Définit les magasins d'objets (stores) et les index de recherche.
   * @returns {Promise<IDBDatabase>} Instance de la base de données.
   */
  async open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      // Gestion de la création ou de la montée de version du schéma
      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 1. Store 'sources' : Liste des flux RSS suivis
        // Clé primaire : xmlUrl (unique par définition)
        if (!db.objectStoreNames.contains("sources")) {
          const sourceStore = db.createObjectStore("sources", {
            keyPath: "xmlUrl",
          });
          // Index pour regrouper ou filtrer par dossier (UI popup)
          sourceStore.createIndex("folder", "folder", { unique: false });
        }

        // 2. Store 'items' : Buffer des articles non encore traités
        // Clé primaire : id (hash généré lors du scan)
        if (!db.objectStoreNames.contains("items")) {
          const itemStore = db.createObjectStore("items", { keyPath: "id" });
          // Index chronologique pour la purge automatique (TTL)
          itemStore.createIndex("timestamp", "timestamp", { unique: false });
          // Index par source pour permettre la suppression en cascade
          itemStore.createIndex("xmlUrl", "xmlUrl", { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  /**
   * --- GESTION DES SOURCES (FLUX) ---
   */

  /**
   * Récupère la totalité des sources enregistrées.
   * Utile pour la boucle de scan du Service Worker et l'affichage de la popup.
   * @returns {Promise<Array>} Liste des objets sources.
   */
  async getSources() {
    const db = await this.open();
    return new Promise((resolve) => {
      const transaction = db.transaction("sources", "readonly");
      const store = transaction.objectStore("sources");
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
    });
  },

  /**
   * Ajoute ou met à jour une source (upsert).
   * Utilisé lors de l'ajout via onglet, édition ou import OPML.
   * @param {Object} source - { xmlUrl, title, folder, notify: boolean }
   */
  async putSource(source) {
    const db = await this.open();
    return new Promise((resolve) => {
      const transaction = db.transaction("sources", "readwrite");
      transaction.objectStore("sources").put(source);
      transaction.oncomplete = () => resolve(true);
    });
  },

  /**
   * Supprime une source et nettoie immédiatement tous les articles associés.
   * Évite de laisser des articles orphelins dans le buffer.
   * @param {string} xmlUrl - L'URL unique du flux à supprimer.
   */
  async deleteSource(xmlUrl) {
    const db = await this.open();
    const transaction = db.transaction(["sources", "items"], "readwrite");

    // Suppression de la source
    transaction.objectStore("sources").delete(xmlUrl);

    // Recherche et suppression des articles liés via l'index 'xmlUrl'
    const itemStore = transaction.objectStore("items");
    const index = itemStore.index("xmlUrl");
    const request = index.openKeyCursor(IDBKeyRange.only(xmlUrl));

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        itemStore.delete(cursor.primaryKey);
        cursor.continue();
      }
    };

    return new Promise((resolve) => {
      transaction.oncomplete = () => resolve(true);
    });
  },

  /**
   * --- GESTION DU BUFFER (ARTICLES ÉPHÉMÈRES) ---
   */

  /**
   * Récupère tous les articles actuellement présents dans le buffer.
   * @returns {Promise<Array>} Liste des articles { id, title, link, ... }
   */
  async getItems() {
    const db = await this.open();
    return new Promise((resolve) => {
      const transaction = db.transaction("items", "readonly");
      const store = transaction.objectStore("items");
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
    });
  },

  /**
   * Insère de nouveaux articles dans le buffer suite à un scan.
   * Si l'ID (URL/Titre) existe déjà, 'put' ignore ou met à jour sans doublon.
   * @param {Array<Object>} items - Liste d'articles détectés.
   */
  async addItems(items) {
    const db = await this.open();
    const transaction = db.transaction("items", "readwrite");
    const store = transaction.objectStore("items");

    items.forEach((item) => store.put(item));
    return new Promise((resolve) => {
      transaction.oncomplete = () => resolve(true);
    });
  },

  /**
   * Désactive l'article pour qu'il ne soit plus affiché.
   * On garde l'entrée en DB pour que le scanner sache qu'il a déjà été traité.
   */
  async hideItem(id) {
    const db = await this.open();
    const transaction = db.transaction("items", "readwrite");
    const store = transaction.objectStore("items");

    const request = store.get(id);
    request.onsuccess = () => {
      const item = request.result;
      if (item) {
        item.hidden = true; // On marque comme caché
        store.put(item);
      }
    };
    return new Promise((resolve) => {
      transaction.oncomplete = () => resolve(true);
    });
  },

  /**
   * Purge automatique des données périmées (TTL).
   * Parcourt l'index 'timestamp' pour supprimer tout ce qui est plus vieux que X jours.
   * Assure que la base de données reste minuscule et performante.
   * @param {number} days - Nombre de jours de rétention maximum (défaut: 30).
   */
  async purgeOldItems(days = 30) {
    const db = await this.open();
    const threshold = Date.now() - days * 24 * 60 * 60 * 1000;
    const transaction = db.transaction("items", "readwrite");
    const store = transaction.objectStore("items");
    const index = store.index("timestamp");

    // On cible tout ce qui est inférieur au seuil de temps
    const range = IDBKeyRange.upperBound(threshold);

    const request = index.openCursor(range);
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        store.delete(cursor.primaryKey);
        cursor.continue(); // Continue vers l'élément suivant dans la plage
      }
    };

    return new Promise((resolve) => {
      transaction.oncomplete = () => resolve(true);
    });
  },

  /**
   * Vide intégralement les sources et les items.
   */
  async clearAll() {
    const db = await this.open();
    const transaction = db.transaction(["sources", "items"], "readwrite");
    transaction.objectStore("sources").clear();
    transaction.objectStore("items").clear();
    return new Promise((resolve) => {
      transaction.oncomplete = () => resolve(true);
    });
  },
};
