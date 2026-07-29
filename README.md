# Web2Trilium (Firefox extension)

A page listing all your Firefox bookmarks/folders and your open tabs.
For bookmarks, click "Save to Inbox" or "Delete". For open tabs, click
"Save to Inbox" (saves the tab's URL to Trilium, then closes the tab)
or "Close" (just closes the tab, no Trilium involved).

No background sync, no two-way logic — just a one-way "move" action,
triggered manually per bookmark or tab.

## Installation

Install from [addons.mozilla.org](https://addons.mozilla.org) (search for **Web2Trilium**),
or load it temporarily for development:

1. Go to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on…"
3. Select `manifest.json` from this folder

## Setup

1. **Get an ETAPI token in Trilium**: Options → ETAPI → "Create new ETAPI
   token". Copy it.
2. **Find your Inbox note ID**: in Trilium, right-click your Inbox note →
   "Copy note ID to clipboard". (Or use the "Auto-detect" button in the
   extension's Settings if your inbox note carries the `#inbox` label —
   Trilium sets this automatically if you've configured it as your default
   inbox under Options → Other.)
3. Click the toolbar icon to open Web2Trilium.
4. Click "Settings", enter:
   - Trilium server URL (default `http://localhost:37840` for Trilium Desktop)
   - ETAPI token
   - Inbox note ID
5. Click "Test connection", then "Save".
6. Browse or search your bookmarks and tabs, and click "Save to Inbox" on
   whichever ones you want moved over.

## Notes

- **Saving** creates a note of type **Web View** with the `webViewSrc` and
  `url` labels set. If you've installed the `webViewToolbarWidget.js` Trilium
  widget, saved items immediately get the Back/Forward/Save/Open-in-Browser
  toolbar when opened in Trilium.
- **Open Tabs** only shows `http://` and `https://` tabs — browser-internal
  pages (`about:blank`, `about:newtab`, etc.) are excluded.
- **The toolbar icon** focuses the existing Web2Trilium tab if one is already
  open; it only opens a new tab if none exists.
- **Drag and drop**: bookmarks and folders can be dragged within the tree.
  Drop onto the top or bottom half of a row to place an item before or after
  it, or onto a folder header to file it inside. Moves are written back to
  Firefox via `browser.bookmarks.move()`. Open tabs are not draggable.
- **Empty folders** stay in the list rather than disappearing, so they remain
  available as drop targets. They're hidden while a search filter is active.
- **Permissions**: `bookmarks`, `tabs`, `storage`, and localhost access.
  The `tabs` permission is used only to read tab title/URL and close tabs.

## Publishing

Releases are published automatically via GitHub Actions when a GitHub release
is created. The workflow builds the extension with `web-ext`, submits it to
AMO for listed review, and attaches the zip to the GitHub release.

Required repository secrets:

| Secret | Description |
|--------|-------------|
| `AMO_JWT_ISSUER` | AMO API key (from addons.mozilla.org/developers/addon/api/key/) |
| `AMO_JWT_SECRET` | AMO API secret (same page) |

## Files

- `manifest.json` — extension manifest (Manifest V2, Firefox)
- `background.js` — handles toolbar icon click
- `trilium-api.js` — minimal ETAPI client
- `manage.html` / `manage.js` — bookmark and tab browser + save actions
- `options.html` / `options.js` — settings UI
- `.github/workflows/publish.yml` — release automation
