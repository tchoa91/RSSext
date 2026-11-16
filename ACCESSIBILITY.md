# Accessibility in Small Tech: How RSSext Was Built Accessible in Two Weeks

**RSSext** is a personal, minimalist take on syndication: a single chronological stream to resynchronize, zero algorithms, and no anxiety-inducing unread counters. Built in **two weeks** in pure vanilla JavaScript (\~80 KB zipped), it demonstrates that shipping fast *small tech* does not require sacrificing accessibility or bloating the codebase.

Instead of adding accessibility patches after launch, RSSext relies on four native fundamentals baked in from line one:

---

## 1\. Native HTML5 Semantics & Zero-Script Modals (`popup.html`, `options.html`)

* **Structural Landmarks:** Both views use standard HTML5 landmarks (`<header>`, `<main>`, `<footer>`) and group related settings with `<fieldset>` and `<legend>` in `options.html`, giving screen reader users immediate structural navigation without custom ARIA roles.  
* **Explicit Control Associations:** Every `<input>` and `<select>` is wrapped inside a visible `<label>`, and purely decorative branding icons next to headings use empty `alt=""` attributes to stay silent.  
* **Native `<dialog>` Elements:** Source editing (`#edit-dialog`) and folder creation (`#new-folder-dialog`) use the native HTML `<dialog>` API (`showModal()` \+ `<form method="dialog">`). Focus trapping, `Escape` key dismissal, and `::backdrop` rendering are handled natively by the browser with zero third-party modal scripts.

---

## 2\. Progressive Disclosure & Keyboard Flow (`popup.js`)

* **Accessible Folder Accordions (`aria-expanded`):** In folder-sorted view, each folder and feed header embeds a native `<button class="chevron-btn">` that dynamically toggles `aria-expanded="true|false"` and persists collapse states in `chrome.storage.local`.  
* **Predictable Modal Keyboard Submission:** Explicit `Enter` key listeners on modal text fields (`#new-folder-name`, `#edit-name`, `#edit-url`) route directly to the primary `save` action rather than triggering accidental cancellation.  
* **Context-Safe Link Opening:** Clicking an article marks it hidden in IndexedDB (`await DB.hideItem(id)`) *before* calling `chrome.tabs.create()`, ensuring state is preserved even when opening a foreground tab immediately closes the browser popup.

---

## 3\. Calm Notification Pacing (`background.js`)

* **Throttled Alert Queue (`NotificationSystem`):** System notifications are queued and paced with an alternating **2.8 s / 3.0 s** interval (`processQueue`) and automatically cleared after **30 seconds**, preventing visual or speech-synthesizer avalanches when multiple feeds update at once.  
* **Direct Action Parity:** Native system notification buttons (*Open* and *Discard*) execute the exact same state transitions as the popup UI and broadcast `hide_item_ui` messages so an open popup stays synchronized in real time.

---

## 4\. Proportional Scaling, HSL Contrast & Localization (`common.css`, `utils.js`, `db.js`, `_locales/`)

* **3-Tier Built-In Zoom:** `applyZoom()` scales root typography (`100%`, `120%`, `150%`) across a layout built with relative `rem`/`em` units, while inline SVG icons (`width: 1em; height: 1em`) scale proportionally alongside text.  
* **Adaptive Themes & Distinct Folder Hues:** `common.css` honors system light/dark preferences (`prefers-color-scheme`), lets users tune the base interface hue (`--main-hue`), and assigns evenly spaced cyclic hues (`FOLDER_HUES` in `db.js`) to folder tags.  
* **Native 17-Language Support:** Every visible label and tooltip (`data-i18n`, `data-i18n-title`) is localized across 17 languages in `_locales/`.

&nbsp;