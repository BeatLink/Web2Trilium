# Web2Trilium
A Firefox Extension that allows you to quickly save Webpages in bookmarks and open tabs to trilium

# Trilium Inbox Saver (Firefox extension)

A page listing all your Firefox bookmarks and folders. Click "Save to
Inbox" next to any bookmark and it:

1. Creates a **Web View** note for it under your Trilium Inbox note (via
   ETAPI), with the URL set as the `#webViewSrc` label (so opening the note
   later renders the live page inline, matching the
   `webViewToolbarWidget.js` setup) plus a `#url` label for searchability.
2. Deletes the bookmark from Firefox.

No background sync, no two-way logic — just a one-way "move" action,
triggered manually per bookmark.


## Setup

1. **Get an ETAPI token in Trilium**: Options → ETAPI → "Create new ETAPI
   token". Copy it.
2. **Find your Inbox note ID**: in Trilium, right-click your Inbox note →
   "Copy note ID to clipboard". (Or use the "Auto-detect" button in this
   extension's settings if your inbox note carries the `#inbox` label —
   Trilium sets this automatically if you've configured it as your
   default inbox under Options → Other.)
3. **Load the extension** in Firefox:
   - Go to `about:debugging#/runtime/this-firefox`
   - Click "Load Temporary Add-on…"
   - Select `manifest.json` from this folder
4. Click the toolbar icon → it opens the bookmark manager page directly.
5. Click "Settings" on that page (or via the toolbar icon's right-click →
   Manage Extension → Preferences), enter:
   - Trilium server URL (default `http://localhost:37840` for Trilium
     Desktop)
   - ETAPI token
   - Inbox note ID
6. Click "Test connection", then "Save".
7. Go back to the bookmark page, browse/search your bookmarks, click
   "Save to Inbox" on whichever ones you want moved over.

## Notes

- Saved notes are created as type **Web View**, matching the
  `webViewToolbarWidget.js` setup — if you've also installed that widget,
  saved bookmarks immediately get the Back/Forward/Save/Open-in-Browser
  toolbar when opened in Trilium. If ETAPI in your Trilium version
  rejects `type: "webView"` (some versions restrict which note types are
  creatable over the REST API), you'll see the failure in the on-page
  banner — let me know and I'll switch it back to a plain text note with a
  link, or check your version's ETAPI docs for the accepted type list.
- The toolbar icon click always opens a fresh tab with the bookmark
  manager (no popup) since the list can be long.
- Use the search box at the top to filter by title or URL — useful with
  large bookmark collections.
- Folders auto-collapse if empty after you've moved every bookmark out of
  them, but the empty Firefox folders themselves aren't deleted (only
  bookmarks are removed, not folder structure) — let me know if you'd
  rather folders get cleaned up too once empty.
- This only requires `bookmarks` and `storage` permissions plus localhost
  access — no `tabs` or browsing-history permissions needed.

## Files

- `manifest.json` — extension manifest (Manifest V2, for Firefox)
- `background.js` — opens the manager page when you click the toolbar icon
- `trilium-api.js` — minimal ETAPI client
- `manage.html` / `manage.js` — the bookmark browser + save action
- `options.html` / `options.js` — settings UI
