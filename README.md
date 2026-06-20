# Trilium Inbox Saver (Firefox extension)

A page listing all your Firefox bookmarks/folders and your open tabs.
For bookmarks, click "Save to Inbox" or "Delete". For open tabs, click
"Save to Inbox" (saves the tab's current URL to Trilium, then closes the
tab) or "Close" (just closes the tab, no Trilium involved).

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

- Saving (bookmark or tab) creates a note as type **Web View**, matching
  the `webViewToolbarWidget.js` setup — if you've also installed that
  widget, saved items immediately get the Back/Forward/Save/Open-in-Browser
  toolbar when opened in Trilium. If ETAPI in your Trilium version
  rejects `type: "webView"` (some versions restrict which note types are
  creatable over the REST API), you'll see the failure in the on-page
  banner — let me know and I'll switch it back to a plain text note with a
  link, or check your version's ETAPI docs for the accepted type list.
- This now requests the **`tabs`** permission (in addition to `bookmarks`
  and `storage`) so it can list and close open tabs. Firefox will show
  this as an extra permission prompt on reinstall/update — it's only used
  to read tab title/URL and close tabs, nothing else.
- The "Open Tabs" list excludes the manager page itself, but if you have
  it open in two tabs/windows at once, each instance still shows up in
  the other's list — closing one from there will close that tab.
- The toolbar icon click always opens the bookmark manager (popup or full
  tab depending on your sidebar/browser_action setup) since the list can
  be long.
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