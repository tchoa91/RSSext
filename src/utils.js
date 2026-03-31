/**
 * ============================================================================
 * RSSext - Fonctions Utilitaires (GPL-3.0)
 * ============================================================================
 * RÔLE :
 * Centralise les fonctions communes à travers l'extension (i18n, formatage, etc.).
 * ============================================================================
 */

/**
 * Fonction utilitaire pour l'i18n.
 * @param {string} key - Clé de traduction.
 * @returns {string}
 */
export const t = (key) => chrome.i18n.getMessage(key);

/**
 * Traduit l'interface utilisateur en parcourant les attributs data-i18n et data-i18n-title.
 */
export function translateUI() {
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
 * Ajoute la signature RSSext à l'URL.
 * @param {string} url - L'URL d'origine.
 * @returns {string} L'URL modifiée.
 */
export function addRef(url) {
  try {
    const urlObj = new URL(url);
    urlObj.searchParams.set("utm_source", "RSSext");
    return urlObj.toString();
  } catch (e) {
    return url;
  }
}

/**
 * Applique le facteur de zoom à la racine du document.
 * @param {string} level - 'small', 'medium', ou 'large'.
 */
export function applyZoom(level) {
  const zoomMap = {
    small: "100%",
    medium: "120%",
    large: "150%",
  };
  document.documentElement.style.fontSize = zoomMap[level] || "100%";
}

/**
 * Décode les entités HTML (numériques et nommées basiques).
 * @param {string} str - La chaîne à décoder.
 * @returns {string}
 */
export function decodeEntities(str) {
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

/**
 * Échappe les caractères HTML spéciaux pour prévenir les XSS.
 * @param {string} str - La chaîne à échapper.
 * @returns {string}
 */
export const escapeHtml = (str) => {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

/**
 * Formate un timestamp en durée relative courte (ex: "5 min", "2 h").
 * @param {number} timestamp - Le timestamp à formater.
 * @returns {string}
 */
export function formatTimeAgo(timestamp) {
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