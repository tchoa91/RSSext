# RSSext - Feed Sentinel - Chrome Extension

## A Sovereign RSS Watch Utility

_**"Catch Your Bop, Leave The Mid!"**_

**RSSext** is a minimalist, privacy-first Chrome extension designed for those who want to stay informed without the anxiety of the "unread count." It is built as a high-fidelity signal transmitter: it notifies you of new content, lets you catch what matters, and allows everything else to evaporate.

**This is not a reader; it is a gateway.**

<p align="center">
<img src="./media/logo_rssext_v1-1.png" width="200" height="200" alt="RSSext Logo">
</p>

## 🚀 Key Features

- **Custom Pulse:** Fetches your sources at your own pace (default: every 30 minutes). You control the heartbeat of your signal.
- **Double-Tap Awareness:** Softly notifies you of new articles twice. If the first one didn't catch your eye, the second one might—after that, it's considered "Mid" and left behind.
- **Auto-Evaporation (TTL):** Retains unread and undiscarded items for a period you define (default: 30 days). Once the time is up, it's gone. No backlog, no guilt, just set & forget.
- **Flat Organization:** Manage your feeds through a clean, single-tier folder system. No nested complexity, just direct access.
- **Standard Compliant:** Full OPML 2.0 support for seamless import/export. Your subscriptions, your sovereignty.

## ✨ Core Philosophy

### 🛡️ Sovereign Ethics

RSSext is built on a "Zero-Captation" model. We believe in a clean flow between the Publisher and the Reader.

- **No Noise:** No algorithms, no "suggested content," no AI-curation. Just your feeds.
- **Total Privacy:** No tracking, no ads, no external servers, and no user IDs. Your data stays where it belongs: in your browser's IndexedDB.
- **Publisher Friendly:** We don't scrape content into a silo. We route you directly to the source, respecting creators' traffic and analytics.
- **Accessible:** Built with standards-compliant HTML/CSS (WCAG friendly) featuring a customizable HSL interface with in-tool zoom options. 17 languages.
- **Open-Source:** A few dozen KB of annotated, readable, and auditable code. No bloat, no obfuscation.

### 🍃 Tiny Footprint

Designed for performance-conscious users (ChromeOS, ARM architectures).

- **Ultra-Lightweight:** ~80KB zipped package. The background Service Worker uses around 55KB in memory.
- **Pure Vanilla JS:** Zero dependencies, zero frameworks. Just solid, standard-compliant code.
- **Resource Frugal:** Optimized polling that won't drain your battery or spike your CPU.

### 🧘 Soft Sentinel (Zen Awareness)

Experience guilt-free browsing. RSSext treats information as a signal, not a chore.

- **The 30-Second Rule:** New articles appear as temporary system notifications. If an entry doesn't capture your attention within 30 seconds, it simply fades away.
- **No "Inbox Anxiety":** There are no red badges or infinite lists to "clear." If you missed it, it wasn't a "Bop."
- **Soft Filtering:** A human-centric approach where your instinct does the sorting, aided by a discreet, reliable background guardian.

### 🎯 Set & Forget (Surgical Precision)

Quiet by default, powerful when needed.

- **Intelligent Detection:** Built-in heuristics and Regex-based parsing to find feeds where others fail.
- **Customizable TTL:** Control how long articles stay in your local buffer before auto-purging.
- **Power-User Ready:** OPML 2.0 Import/Export support and customizable scan intervals.

### 🛸 Back to the True Syndication Spirit

_RSSext is an anti-dogmatic tool. It doesn't try to think for you. It just watches the horizon and lets you know when something interesting appears._

**Made for the open web.**

## 🚨 Responsibility & Data usage

**Disclaimer:** By using this extension, you acknowledge that your device will perform network requests proportional to the number of sources you follow and the polling frequency you set.
- **Human Scale:** This tool is tailored for a human number of sources, don't overload it.
- **Sovereign Usage:** You are solely responsible for the URLs you monitor and the internet data usage incurred by these automated requests.

## 💬 FAQ (Frequently Asked Questions)

### What is RSS?

Imagine a web where you don't wait for an algorithm to decide what you should see. **RSS (Really Simple Syndication)** is the backbone of the open and decentralized web. It is a standard protocol that allows any website to broadcast its updates directly to its readers in a clean, machine-readable format.

Instead of "visiting" 50 sites to see if they've posted something new, or relying on a social media feed to "curate" your interest, you subscribe to a site's RSS feed. **RSSext** then monitors these signals for you. It’s the original "social feed," but without the noise, the ads, the tracking, or the black-box manipulation. It is direct-to-brain information delivery.

### What is OPML and why does it matter?

**OPML (Outline Processor Markup Language)** is the "Passport" of the open web. It allows you to move your list of subscriptions from one tool to another without being held hostage by a specific platform.

- **Importing:** Bring your history from legacy readers.
- **Exporting:** Keep a backup. Your data, your sovereignty.

### How do I add a source manually?

- **Automatic:** Click the RSSext icon while browsing a website with regular publications. Then click the **Second Big Button** (Add current).
- **Manual Entry:** Open the extension, click the **Second Big Button** (Add current), and you can edit all fields (Title, URL, Folder, etc.).
- **Pro Tip:** If you want an empty form, use "Add current" while on a system page (like the extension’s options page)

### How do I edit and delete my sources?

Switch to the "Sorted by Folder" list view in the main popup. From there, you can manage your subscriptions directly.

### How do I import a large OPML without a notification avalanche?

Turn global notifications off before importing. Clear the list after the import is complete, then turn notifications back on.

### What do you mean by "Human Scale"?

RSSext is designed for a curated selection of sources that a human brain can actually process. If you follow 500 high-frequency feeds, you will be flooded. The tool is a filter, not a vacuum cleaner. Respect your own bandwidth.

### Why only "Flat Folders"?

To keep the signal clear. Deeply nested hierarchies lead to digital hoarding. One level of organization is enough to segment your interests (e.g., Tech, News, Music) without adding administrative overhead to your reading.

## 🛠 How to Install and Use

### Chrome Web Store (recommended)

Link : https://chromewebstore.google.com/detail/jbipjphmipalepiakcjmdchcpdkajfja

### Github (only for advanced users, coders and other hackers)

1. **Download or Clone:** Download the extension files or clone this repository to your local machine.
2. **Open Chrome Extensions:** Open Google Chrome, type chrome://extensions in the address bar, and press Enter.
3. **Enable Developer Mode:** Ensure that "Developer mode" (usually a toggle switch in the top right corner) is enabled.
4. **Load Unpacked:** Click on the "Load unpacked" button.
5. **Select Extension Directory:** Navigate to the directory where you downloaded or cloned the extension files (the directory containing manifest.json) and select it.
6. **Add Sources and forget:** The RRSext extension icon should now appear in your Chrome toolbar. Click on it to start.

## 📂 Project Structure

- `_locales/`: i18n support.
- `assets/`: Extension icons (16, 32, 48, 128px).
- `options/`: Global settings page.
- `popup/`: Main UI and article list.
- `background.js`: The Sentinel Service Worker (polling, parsing, notifications).
- `db.js`: IndexedDB persistence layer.
- `common.css`: Shared HSL theme variables.
- `manifest.json`: Extension metadata and permissions.

## 🔑 Permissions Used

- `storage`: Save local preferences (HSL hue, scan intervals).
- `notifications`: Sentinel "Soft Alert" system.
- `alarms`: Periodic background scanning.
- `scripting` & `activeTab`: Automated feed discovery on current pages.
- `<all_urls>`: Required to fetch RSS/Atom XML data from any publisher (CORS).

## 🤝 Feedback

Please share your thoughts or report bugs in the Issues tab: https://github.com/tchoa91/rssext/issues

## ⚖️ Licence

This project is licensed under the **GPL-3.0.** You are encouraged to fork it, improve it, and share your modifications in the same spirit of freedom.
