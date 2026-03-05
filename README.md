# RSSext

**RSSext** n'est pas un lecteur RSS. C'est un **scanner de flux éphémère** conçu pour ceux qui consomment l'information à la source, sans intermédiaire et sans rétention inutile.

L'extension surveille vos sources, vous notifie des nouveaux titres et vous fournit un lien direct vers le domaine d'origine. Une fois cliqué ou ignoré, l'article est éjecté. Pas d'archivage, pas de distraction, juste le flux.

<img src="./docs/logo_rssext_v1-1.png" width="400" height="400">

## 🎯 Philosophie & Principes

- **Anti-Captivité** : Contrairement aux lecteurs "modernes" qui aspirent le contenu pour vous garder captif, RSSext respecte le webmaster original en vous renvoyant sur son site.
- **Minimalisme Radical** : Développé en **Vanilla JS** pur. Pas de frameworks, pas de bibliothèques tierces, pas de `node_modules`.
- **Volatilité (Buffer Circulaire)** : Les données sont stockées localement dans `indexedDB` avec un délai d'expiration (TTL) de 30 jours par défaut.
- **Accessibilité Native** : Pas de Drag & Drop complexe. Utilisation des éléments HTML5 natifs (balise `<dialog>`) pour une gestion propre du focus et du clavier.
- **Design Raisonné** : Interface basée sur un système de couleurs **HSL** (Hue, Saturation, Lightness) assurant un contraste optimal et un mode sombre/clair automatique.

## ✨ Fonctionnalités

- **Scan en tâche de fond** : Service Worker (Manifest V3) utilisant `chrome.alarms` pour un polling respectueux des ressources.
- **Notifications Systèmes** : Alertes avec boutons d'action (Ouvrir / Discard) pour agir sans ouvrir l'extension.
- **Organisation par Dossiers** : Classement simple via un overlay d'édition.
- **Import/Export OPML** : Compatibilité totale avec le standard d'échange de flux.
- **Open Source & Libre** : Distribué sous licence **GPL-3.0**.

## 🛠 Installation (Mode Développeur)

1.  Téléchargez ou clonez ce dépôt.
2.  Ouvrez Chrome/Chromium et accédez à `chrome://extensions/`.
3.  Activez le **Mode développeur** (interrupteur en haut à droite).
4.  Cliquez sur **Charger l'extension décompressée** et sélectionnez le dossier racine du projet.

## 🏗 Détails Techniques

- **Moteur de parsing** : Les flux XML (RSS/Atom) sont traités via des expressions régulières (Regex) directement dans le Service Worker, évitant ainsi le besoin d'un DOM ou d'un `DOMParser`.
- **Stockage** :
  - `chrome.storage.local` pour les préférences et la configuration des dossiers.
  - `indexedDB` pour le buffer des articles (clé primaire basée sur le hash URL/Titre).
- **UI** : CSS custom properties utilisant une variable `--main-hue` pour piloter l'intégralité de la charte graphique.
- **i18n** : Support multilingue via le système natif `_locales`.

## ⚖️ Licence

Ce projet est sous licence **GPL-3.0**. Vous êtes encouragé à le forker, à l'améliorer et à partager vos modifications dans le même esprit de liberté.

---

_Projet conçu pour être léger, rapide et fidèle à l'esprit originel de la syndication de contenu._
