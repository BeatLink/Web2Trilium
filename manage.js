// manage.js

let config = null
let client = null
let sectionState = {}
let profileList = []

const treeEl = document.getElementById("tree")
const tabsTreeEl = document.getElementById("tabsTree")
const searchEl = document.getElementById("search")
const bannerEl = document.getElementById("banner")
const profileSelectEl = document.getElementById("profileSelect")
const selectionBarEl = document.getElementById("selectionBar")
const selectionCountEl = document.getElementById("selectionCount")
const selSaveBtn = document.getElementById("selSave")
const selDeleteBtn = document.getElementById("selDelete")
const selClearBtn = document.getElementById("selClear")

function showBanner(message, level) {
  bannerEl.textContent = message
  bannerEl.className = level || ""
}

function clearBanner() {
  bannerEl.textContent = ""
  bannerEl.className = ""
}

async function loadConfig() {
  const state = await loadProfiles()
  profileList = state.profiles
  config = state.profiles.find((p) => p.id === state.activeProfileId) || {}
  client = config.token && config.baseUrl
    ? new TriliumClient(config.baseUrl, config.token)
    : null
  renderProfileSelect(state.activeProfileId)
}

function renderProfileSelect(activeProfileId) {
  profileSelectEl.innerHTML = ""
  profileList.forEach((p) => {
    const opt = document.createElement("option")
    opt.value = p.id
    opt.textContent = p.name
    profileSelectEl.appendChild(opt)
  })
  profileSelectEl.value = activeProfileId
  // A lone profile is just noise in the header.
  profileSelectEl.style.display = profileList.length > 1 ? "" : "none"
}

// Warns when the active profile isn't fully configured. Returns true if setup
// is incomplete.
function checkSetup() {
  if (!config.token || !config.inboxNoteId) {
    showBanner(
      `Heads up: finish setup for profile "${config.name || "?"}" in Settings ` +
      `(ETAPI token + Inbox note ID) before saving bookmarks.`,
      "warn"
    )
    return true
  }
  clearBanner()
  return false
}

async function loadSectionState() {
  const { sectionState: s } = await browser.storage.local.get("sectionState")
  sectionState = s || {}
}

function saveSectionState() {
  browser.storage.local.set({ sectionState })
}

function setupSection(headingId, treeEl, key) {
  const heading = document.getElementById(headingId)
  if (sectionState[key] === true) {
    heading.classList.add("collapsed")
    treeEl.style.display = "none"
  }
  heading.addEventListener("click", () => {
    const nowCollapsed = heading.classList.toggle("collapsed")
    treeEl.style.display = nowCollapsed ? "none" : ""
    if (nowCollapsed) {
      sectionState[key] = true
    } else {
      delete sectionState[key]
    }
    saveSectionState()
  })
}

function createSvgFavicon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.setAttribute("class", "favicon")
  svg.setAttribute("viewBox", "0 0 16 16")
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle")
  circle.setAttribute("cx", "8")
  circle.setAttribute("cy", "8")
  circle.setAttribute("r", "6")
  circle.setAttribute("fill", "#bbb")
  svg.appendChild(circle)
  return svg
}

// ---------------------------------------------------------------------------
// Multi-select
//
// Bookmarks and tabs are selected independently — a batch operation only makes
// sense within one kind, and "Delete" means different things to each. Selecting
// in one section therefore clears the other. Selection is keyed by node/tab id
// and rebuilt against the DOM after every re-render, so ids that vanished
// (moved-away bookmarks, closed tabs) drop out on their own.
// ---------------------------------------------------------------------------

// "bookmarks" | "tabs" — which section the current selection belongs to.
let selectionKind = null
const selectedIds = new Set()

// Last row clicked in each section, for shift-click ranges.
const anchorId = { bookmarks: null, tabs: null }

function sectionRoot(kind) {
  return kind === "tabs" ? tabsTreeEl : treeEl
}

// Rows in visual order, skipping anything the filter has hidden — shift-click
// should span what you can see, not what's behind a search.
function visibleRows(kind) {
  return Array.from(sectionRoot(kind).querySelectorAll(".bookmark-row")).filter(
    (r) => r.offsetParent !== null
  )
}

function clearSelection() {
  selectedIds.clear()
  selectionKind = null
  syncSelectionUI()
}

// Tab ids are numbers and bookmark ids are strings, but every lookup goes
// through row.dataset.id, which the DOM always hands back as a string. Ids are
// normalized here so a Set built from tab ids can still be queried by dataset.
function toggleSelected(kind, id, on) {
  if (selectionKind !== kind) {
    selectedIds.clear()
    selectionKind = kind
  }
  if (on) selectedIds.add(String(id))
  else selectedIds.delete(String(id))
  if (selectedIds.size === 0) selectionKind = null
  syncSelectionUI()
}

// Shift-click: select every row between the anchor and the clicked row,
// inclusive, without disturbing selections outside that span.
function selectRange(kind, id) {
  const rows = visibleRows(kind)
  const from = rows.findIndex((r) => r.dataset.id === String(anchorId[kind]))
  const to = rows.findIndex((r) => r.dataset.id === String(id))
  if (from === -1 || to === -1) return toggleSelected(kind, id, true)

  if (selectionKind !== kind) {
    selectedIds.clear()
    selectionKind = kind
  }
  const [lo, hi] = from < to ? [from, to] : [to, from]
  for (let i = lo; i <= hi; i++) selectedIds.add(rows[i].dataset.id)
  syncSelectionUI()
}

// Single source of truth for checkbox state, row highlighting and the toolbar.
// Called after selection changes and after every re-render.
function syncSelectionUI() {
  for (const kind of ["bookmarks", "tabs"]) {
    sectionRoot(kind).querySelectorAll(".bookmark-row").forEach((row) => {
      const on = selectionKind === kind && selectedIds.has(row.dataset.id)
      row.classList.toggle("selected", on)
      row.setAttribute("aria-selected", on ? "true" : "false")
      const cb = row.querySelector(".row-check")
      if (cb) cb.checked = on
    })
  }

  const n = selectedIds.size
  if (n === 0) {
    selectionBarEl.classList.remove("visible")
    return
  }
  selectionBarEl.classList.add("visible")
  const noun = selectionKind === "tabs" ? "tab" : "bookmark"
  selectionCountEl.textContent = `${n} ${noun}${n === 1 ? "" : "s"} selected`
  selSaveBtn.textContent = `Save ${n} to Inbox`
  selDeleteBtn.textContent = selectionKind === "tabs" ? `Close ${n}` : `Delete ${n}`
  selSaveBtn.disabled = false
  selDeleteBtn.disabled = false
}

// Drops ids whose rows are gone (deleted, saved, or filtered out of existence
// by a re-render) so counts never overstate what a batch action would touch.
function reconcileSelection() {
  if (!selectionKind) return syncSelectionUI()
  const present = new Set(
    Array.from(sectionRoot(selectionKind).querySelectorAll(".bookmark-row")).map(
      (r) => r.dataset.id
    )
  )
  for (const id of Array.from(selectedIds)) {
    if (!present.has(id)) selectedIds.delete(id)
  }
  if (selectedIds.size === 0) selectionKind = null
  syncSelectionUI()
}

// The checkbox that fronts every row. Clicks here never bubble to the row's
// open-this-link handler.
//
// The checkbox is deliberately not a tab stop: rows themselves are focusable
// (see the keyboard section below), so leaving it in the tab order would mean
// two stops per row and Tab would take dozens of presses to cross a tree.
function makeRowCheckbox(kind, id) {
  const cb = document.createElement("input")
  cb.type = "checkbox"
  cb.className = "row-check"
  cb.tabIndex = -1
  cb.title = "Select (shift-click to select a range)"
  cb.addEventListener("click", (e) => {
    e.stopPropagation()
    if (e.shiftKey && anchorId[kind] !== null) {
      selectRange(kind, id)
    } else {
      toggleSelected(kind, id, cb.checked)
    }
    anchorId[kind] = String(id)
    focusedId[kind] = String(id)
  })
  return cb
}

// ---------------------------------------------------------------------------
// Keyboard selection
//
// Each section is a roving-tabindex listbox: one row holds tabindex="0" and
// the arrow keys move it, so Tab reaches the list in a single press and then
// the arrows walk it. Mirrors the shortcuts of a file manager —
//
//   ↑ / ↓         move focus
//   Shift+↑/↓     extend the selection while moving
//   Space         toggle the focused row
//   Shift+Click   or Shift+Space — select through to the anchor
//   Ctrl+A        select every visible row in the section
//   Enter         open the focused bookmark / switch to the focused tab
//   Escape        clear the selection
//
// Focus is tracked by id rather than by element so it survives the re-render
// that follows every mutation.
// ---------------------------------------------------------------------------

const focusedId = { bookmarks: null, tabs: null }

function rowElement(kind, id) {
  return sectionRoot(kind).querySelector(
    `.bookmark-row[data-id="${CSS.escape(String(id))}"]`
  )
}

// Applies the roving tabindex: the focused row is the section's only tab stop,
// falling back to the first row so a section is always reachable.
function syncRovingTabindex(kind) {
  const rows = visibleRows(kind)
  if (rows.length === 0) return
  let target = rows.find((r) => r.dataset.id === focusedId[kind]) || rows[0]
  rows.forEach((r) => {
    r.tabIndex = r === target ? 0 : -1
  })
}

function focusRow(kind, id, { scroll = true } = {}) {
  focusedId[kind] = String(id)
  syncRovingTabindex(kind)
  const el = rowElement(kind, id)
  if (!el) return
  el.focus({ preventScroll: true })
  if (scroll) el.scrollIntoView({ block: "nearest" })
}

// Moves focus within the section and returns the row landed on, or null when
// the section is empty. `to` is a row delta, or the string "first"/"last".
function moveFocus(kind, to, { extend = false } = {}) {
  const rows = visibleRows(kind)
  if (rows.length === 0) return null

  const current = rows.findIndex((r) => r.dataset.id === focusedId[kind])
  let next
  if (to === "first") next = 0
  else if (to === "last") next = rows.length - 1
  // With no focus yet, ↓ starts at the top and ↑ at the bottom.
  else if (current === -1) next = to > 0 ? 0 : rows.length - 1
  else next = Math.min(rows.length - 1, Math.max(0, current + to))

  const id = rows[next].dataset.id
  if (extend) {
    // Shift+arrow grows a run from wherever the anchor was dropped, matching
    // the behaviour of shift-clicking that same row.
    if (anchorId[kind] === null) anchorId[kind] = focusedId[kind] || id
    selectRange(kind, id)
  }
  focusRow(kind, id)
  return rows[next]
}

function selectAllVisible(kind) {
  const rows = visibleRows(kind)
  if (rows.length === 0) return
  selectedIds.clear()
  selectionKind = kind
  rows.forEach((r) => selectedIds.add(r.dataset.id))
  syncSelectionUI()
}

// Opens whatever the focused row points at: a bookmark in a new tab, or the
// tab itself.
function activateRow(kind, id) {
  const row = rowElement(kind, id)
  if (!row) return
  // Reuses the row's own click handler so there's one definition of "open".
  const link = row.querySelector(".bm-link")
  if (link) link.click()
}

// One handler per section. Bound to the tree container so it keeps working
// across re-renders, which replace every row element.
function installKeyboardNav(kind) {
  sectionRoot(kind).addEventListener("keydown", (e) => {
    const row = e.target.closest?.(".bookmark-row")
    if (!row) return
    const id = row.dataset.id

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        moveFocus(kind, 1, { extend: e.shiftKey })
        break
      case "ArrowUp":
        e.preventDefault()
        moveFocus(kind, -1, { extend: e.shiftKey })
        break
      case "Home":
        e.preventDefault()
        moveFocus(kind, "first", { extend: e.shiftKey })
        break
      case "End":
        e.preventDefault()
        moveFocus(kind, "last", { extend: e.shiftKey })
        break
      case " ":
      case "Spacebar":
        e.preventDefault()
        if (e.shiftKey && anchorId[kind] !== null) {
          selectRange(kind, id)
        } else {
          toggleSelected(kind, id, !selectedIds.has(id))
          anchorId[kind] = id
        }
        break
      case "Enter":
        e.preventDefault()
        activateRow(kind, id)
        break
      case "a":
      case "A":
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault()
          selectAllVisible(kind)
        }
        break
      default:
        return
    }
  })

  // Clicking or tabbing into a row makes it the section's tab stop, so focus
  // resumes from there rather than jumping back to the top.
  sectionRoot(kind).addEventListener("focusin", (e) => {
    const row = e.target.closest?.(".bookmark-row")
    if (!row) return
    focusedId[kind] = row.dataset.id
    syncRovingTabindex(kind)
  })
}

// The ids to act on when a batch button is pressed, in the order they appear
// on screen.
function selectedNodeIds() {
  if (!selectionKind) return []
  return Array.from(sectionRoot(selectionKind).querySelectorAll(".bookmark-row"))
    .map((r) => r.dataset.id)
    .filter((id) => selectedIds.has(id))
}

// ---------------------------------------------------------------------------
// Drag & drop reordering
//
// Bookmark rows and folder headers are drag sources. Dropping onto the top or
// bottom half of a row places the dragged node before or after it; dropping
// onto a folder header files it inside that folder. Moves go straight to
// browser.bookmarks.move(), then the tree is re-rendered so indices stay
// truthful.
// ---------------------------------------------------------------------------

// The node currently being dragged. Set on dragstart because dataTransfer
// contents aren't readable during dragover, which is where we need to know
// whether a drop is legal.
let dragNode = null

// Ids being dragged, in tree order. Usually just [dragNode.id]; when the drag
// starts on a selected bookmark row, the whole selection travels together.
let dragIds = []

// Bookmark ids of everything currently selected, in on-screen order — the set
// a drag starting on a selected row should carry.
function selectedBookmarkIds() {
  return selectionKind === "bookmarks" ? selectedNodeIds() : []
}

function makeDraggable(el, node) {
  el.draggable = true

  el.addEventListener("dragstart", (e) => {
    e.stopPropagation()
    dragNode = node

    const selected = selectedBookmarkIds()
    dragIds = selected.includes(node.id) ? selected : [node.id]
    dragIds.forEach((id) => {
      const row = treeEl.querySelector(`.bookmark-row[data-id="${CSS.escape(id)}"]`)
      if (row) row.classList.add("dragging")
    })
    el.classList.add("dragging")

    e.dataTransfer.effectAllowed = "move"
    // Also publish the URL so the bookmark can be dragged out to other apps.
    if (node.url) {
      e.dataTransfer.setData("text/uri-list", node.url)
      e.dataTransfer.setData("text/plain", node.url)
    } else {
      e.dataTransfer.setData("text/plain", node.title || "")
    }
  })

  el.addEventListener("dragend", () => {
    dragNode = null
    dragIds = []
    document.querySelectorAll(".dragging").forEach((r) => r.classList.remove("dragging"))
    clearDropMarkers()
  })
}

function clearDropMarkers() {
  document
    .querySelectorAll(".drop-before, .drop-after, .drop-into")
    .forEach((el) => el.classList.remove("drop-before", "drop-after", "drop-into"))
}

// True when `node` is `ancestorId` itself or sits somewhere beneath it.
// Dropping a folder into its own subtree would detach it from the tree, and
// browser.bookmarks.move() rejects it, so we refuse the drop up front.
async function isSelfOrDescendant(ancestorId, nodeId) {
  if (ancestorId === nodeId) return true
  let current = nodeId
  // Walk up from the drop target; cheaper than walking the whole subtree down.
  while (current) {
    const [n] = await browser.bookmarks.get(current)
    if (!n || !n.parentId) return false
    if (n.parentId === ancestorId) return true
    current = n.parentId
  }
  return false
}

// Rejects drags that have no source (e.g. a link dragged in from a web page)
// and folder-into-itself moves. Synchronous so it can gate dragover.
function canDrop(targetNode) {
  if (!dragNode) return false
  // A row that's part of the dragged set can't also be the thing it lands on.
  if (dragIds.includes(targetNode.id)) return false
  return true
}

// Drop onto a bookmark row: place the dragged node before or after it,
// depending on which half of the row the cursor is over.
function makeReorderTarget(row, node) {
  row.addEventListener("dragover", (e) => {
    if (!canDrop(node)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = "move"
    const rect = row.getBoundingClientRect()
    const after = e.clientY > rect.top + rect.height / 2
    clearDropMarkers()
    row.classList.add(after ? "drop-after" : "drop-before")
  })

  row.addEventListener("dragleave", (e) => {
    if (e.target === row) row.classList.remove("drop-before", "drop-after")
  })

  row.addEventListener("drop", async (e) => {
    if (!canDrop(node)) return
    e.preventDefault()
    e.stopPropagation()
    const rect = row.getBoundingClientRect()
    const after = e.clientY > rect.top + rect.height / 2
    clearDropMarkers()
    // dragend clears dragIds before these awaits settle, so snapshot it.
    await moveRelativeTo(dragIds.slice(), node, after)
  })
}

// Drop onto a folder header: file the dragged node inside that folder, at the
// end of its existing children.
function makeFolderDropTarget(header, childrenEl, node) {
  header.addEventListener("dragover", (e) => {
    if (!canDrop(node)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = "move"
    clearDropMarkers()
    header.classList.add("drop-into")
  })

  header.addEventListener("dragleave", (e) => {
    if (e.target === header) header.classList.remove("drop-into")
  })

  header.addEventListener("drop", async (e) => {
    if (!canDrop(node)) return
    e.preventDefault()
    e.stopPropagation()
    clearDropMarkers()

    // dragend fires before these awaits settle and clears dragIds, so hold a
    // local reference.
    const moving = dragIds.slice()
    for (const id of moving) {
      if (await isSelfOrDescendant(id, node.id)) {
        showBanner("Can't move a folder inside itself.", "err")
        return
      }
    }
    await applyMoves(moving.map((id) => [id, { parentId: node.id }]))

    // A folder you just dropped into should show what landed in it.
    header.classList.remove("collapsed")
    childrenEl.classList.remove("collapsed")
    delete sectionState[`f_${node.id}`]
    saveSectionState()
  })
}

// Drop onto a folder's body (the gap below its rows): append to that folder.
// Row and header handlers stopPropagation, so this only fires for drops that
// missed both.
function makeContainerDropTarget(childrenEl, node) {
  childrenEl.addEventListener("dragover", (e) => {
    if (!canDrop(node)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
  })

  childrenEl.addEventListener("drop", async (e) => {
    if (!canDrop(node)) return
    e.preventDefault()
    e.stopPropagation()
    clearDropMarkers()
    const moving = dragIds.slice()
    for (const id of moving) {
      if (await isSelfOrDescendant(id, node.id)) {
        showBanner("Can't move a folder inside itself.", "err")
        return
      }
    }
    await applyMoves(moving.map((id) => [id, { parentId: node.id }]))
  })
}

// Moves `ids` to sit immediately before or after `target` among its siblings,
// preserving their relative order.
async function moveRelativeTo(ids, target, after) {
  const [fresh] = await browser.bookmarks.get(target.id)
  if (!fresh) return

  for (const id of ids) {
    if (await isSelfOrDescendant(id, fresh.parentId)) {
      showBanner("Can't move a folder inside itself.", "err")
      return
    }
  }

  const dragged = []
  for (const id of ids) {
    const [n] = await browser.bookmarks.get(id)
    if (n) dragged.push(n)
  }

  let index = fresh.index + (after ? 1 : 0)

  // Within one folder, removing a dragged node shifts every later sibling down
  // by one, so a downward move needs its target index decremented — once per
  // node that sat above the target.
  const above = dragged.filter(
    (n) => n.parentId === fresh.parentId && n.index < fresh.index
  ).length
  index -= above

  // Each successive node lands one slot further down, so the block keeps the
  // order it had on screen.
  await applyMoves(
    dragged.map((n, i) => [n.id, { parentId: fresh.parentId, index: index + i }])
  )
}

// Applies [id, destination] pairs in order. Sequential, not parallel: each move
// renumbers the siblings the next one is aimed at.
async function applyMoves(moves) {
  clearBanner()
  const failed = []
  for (const [id, destination] of moves) {
    try {
      await browser.bookmarks.move(id, destination)
    } catch (err) {
      failed.push(err.message)
    }
  }
  if (failed.length) {
    showBanner(
      moves.length === 1
        ? `Couldn't move bookmark: ${failed[0]}`
        : `Couldn't move ${failed.length} of ${moves.length} bookmarks: ${failed[0]}`,
      "err"
    )
  }
  // Indices are now stale everywhere; a re-render is simpler than patching.
  await refreshAll()
}

function makeBookmarkRow(node) {
  const row = document.createElement("div")
  row.className = "bookmark-row"
  row.dataset.id = node.id
  // Focusable so the arrow keys can rove between rows; syncRovingTabindex()
  // promotes exactly one row per section to a real tab stop.
  row.tabIndex = -1
  row.setAttribute("role", "option")
  makeDraggable(row, node)
  makeReorderTarget(row, node)
  row.appendChild(makeRowCheckbox("bookmarks", node.id))

  const link = document.createElement("div")
  link.className = "bm-link"
  link.title = node.url
  link.addEventListener("click", () => browser.tabs.create({ url: node.url }))

  const text = document.createElement("div")
  text.className = "bm-text"
  const titleEl = document.createElement("div")
  titleEl.className = "bm-title"
  titleEl.textContent = node.title || node.url
  const urlEl = document.createElement("div")
  urlEl.className = "bm-url"
  urlEl.textContent = node.url
  text.appendChild(titleEl)
  text.appendChild(urlEl)

  link.appendChild(createSvgFavicon())
  link.appendChild(text)

  const actions = document.createElement("div")
  actions.className = "bm-actions"

  const saveBtn = document.createElement("button")
  saveBtn.className = "save-btn"
  saveBtn.textContent = "Save to Inbox"
  saveBtn.addEventListener("click", () => saveBookmarkAndRemove(node, saveBtn, deleteBtn, row))

  const deleteBtn = document.createElement("button")
  deleteBtn.className = "delete-btn"
  deleteBtn.textContent = "Delete"
  deleteBtn.title = "Delete this bookmark from Firefox without saving it to Trilium"
  deleteBtn.addEventListener("click", () => deleteBookmarkOnly(node, deleteBtn, saveBtn, row))

  actions.appendChild(saveBtn)
  actions.appendChild(deleteBtn)

  row.appendChild(link)
  row.appendChild(actions)
  return row
}

function makeTabRow(tab) {
  const row = document.createElement("div")
  row.className = "bookmark-row"
  row.dataset.id = tab.id
  row.tabIndex = -1
  row.setAttribute("role", "option")
  row.appendChild(makeRowCheckbox("tabs", tab.id))

  const link = document.createElement("div")
  link.className = "bm-link"
  link.title = tab.url
  link.addEventListener("click", () => browser.tabs.update(tab.id, { active: true }))

  const text = document.createElement("div")
  text.className = "bm-text"
  const titleEl = document.createElement("div")
  titleEl.className = "bm-title"
  titleEl.textContent = tab.title || tab.url
  const urlEl = document.createElement("div")
  urlEl.className = "bm-url"
  urlEl.textContent = tab.url
  text.appendChild(titleEl)
  text.appendChild(urlEl)

  link.appendChild(createSvgFavicon())
  link.appendChild(text)

  const actions = document.createElement("div")
  actions.className = "bm-actions"

  const saveBtn = document.createElement("button")
  saveBtn.className = "save-btn"
  saveBtn.textContent = "Save to Inbox"
  saveBtn.addEventListener("click", () => saveTabAndClose(tab, saveBtn, closeBtn, row))

  const closeBtn = document.createElement("button")
  closeBtn.className = "delete-btn"
  closeBtn.textContent = "Close"
  closeBtn.title = "Close this tab without saving it to Trilium"
  closeBtn.addEventListener("click", () => closeTabOnly(tab, closeBtn, saveBtn, row))

  actions.appendChild(saveBtn)
  actions.appendChild(closeBtn)

  row.appendChild(link)
  row.appendChild(actions)
  return row
}

function makeFolderNode(node) {
  const wrap = document.createElement("div")
  wrap.className = "folder"

  const header = document.createElement("div")
  header.className = "folder-header"
  const twisty = document.createElement("span")
  twisty.className = "twisty"
  twisty.textContent = "▾"
  const folderTitle = document.createElement("span")
  folderTitle.className = "folder-title"
  folderTitle.textContent = node.title || "(unnamed)"
  header.appendChild(twisty)
  header.appendChild(folderTitle)

  // Folder-level actions, mirroring a bookmark row's. Roots (Bookmarks Toolbar,
  // Bookmarks Menu, Other Bookmarks) can't be removed by the bookmarks API, so
  // offering to save or delete them would only produce an error.
  const isRoot = !node.parentId || node.parentId === "root________"
  if (!isRoot) {
    const folderActions = document.createElement("div")
    folderActions.className = "bm-actions folder-actions"

    const saveBtn = document.createElement("button")
    saveBtn.className = "save-btn"
    saveBtn.textContent = "Save folder"
    saveBtn.title =
      "Create a note for this folder in Trilium, with its bookmarks as child notes"

    const deleteBtn = document.createElement("button")
    deleteBtn.className = "delete-btn"
    deleteBtn.textContent = "Delete"
    deleteBtn.title = "Delete this folder and everything in it, without saving to Trilium"

    // The header itself toggles collapse; without this a click on either button
    // would also fold the folder shut.
    saveBtn.addEventListener("click", (e) => {
      e.stopPropagation()
      saveFolderAndRemove(node, saveBtn, deleteBtn)
    })
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation()
      deleteFolderOnly(node, deleteBtn, saveBtn)
    })

    // The header is a drag source; without this the buttons inside it start a
    // folder drag instead of registering a press.
    folderActions.draggable = true
    folderActions.addEventListener("dragstart", (e) => {
      e.preventDefault()
      e.stopPropagation()
    })

    folderActions.appendChild(saveBtn)
    folderActions.appendChild(deleteBtn)
    header.appendChild(folderActions)
  }

  const childrenEl = document.createElement("div")
  childrenEl.className = "folder-children"
  childrenEl.dataset.parentId = node.id

  makeDraggable(header, node)
  makeFolderDropTarget(header, childrenEl, node)
  makeContainerDropTarget(childrenEl, node)

  const fKey = `f_${node.id}`
  if (sectionState[fKey] === true) {
    header.classList.add("collapsed")
    childrenEl.classList.add("collapsed")
  }

  header.addEventListener("click", () => {
    header.classList.toggle("collapsed")
    childrenEl.classList.toggle("collapsed")
    if (header.classList.contains("collapsed")) {
      sectionState[fKey] = true
    } else {
      delete sectionState[fKey]
    }
    saveSectionState()
  })

  wrap.appendChild(header)
  wrap.appendChild(childrenEl);

  (node.children || []).forEach((child) => {
    const childEl = renderNode(child)
    if (childEl) childrenEl.appendChild(childEl)
  })

  // Empty folders are still rendered — otherwise they'd be invisible and you
  // could never drag anything into them. applyFilter() hides them during a
  // search, and they're marked so the layout can slim them down.
  if (childrenEl.children.length === 0) wrap.classList.add("folder-empty")
  return wrap
}

function renderNode(node) {
  if (node.type === "separator") return null
  if (node.url) return makeBookmarkRow(node)
  if (node.children) return makeFolderNode(node)
  return null
}


async function renderTree() {
  treeEl.innerHTML = ""
  const tree = await browser.bookmarks.getTree()
  const roots = tree[0].children || []

  let any = false
  for (const root of roots) {
    const el = renderNode(root)
    if (el) {
      treeEl.appendChild(el)
      any = true
    }
  }
  if (!any) {
    treeEl.innerHTML = `<div class="empty-state">No bookmarks found.</div>`
  }
}

async function renderTabs() {
  tabsTreeEl.innerHTML = ""
  const ownUrl = browser.runtime.getURL("manage.html")
  const tabs = await browser.tabs.query({})
  const visibleTabs = tabs.filter((t) =>
    (t.url?.startsWith("http://") || t.url?.startsWith("https://")) && t.url !== ownUrl
  )

  if (visibleTabs.length === 0) {
    tabsTreeEl.innerHTML = `<div class="empty-state">No open tabs.</div>`
    return
  }

  visibleTabs.forEach((tab) => {
    tabsTreeEl.appendChild(makeTabRow(tab))
  })
}

function applyFilter() {
  const q = searchEl.value.trim().toLowerCase()
  const rows = treeEl.querySelectorAll(".bookmark-row")
  const folders = treeEl.querySelectorAll(".folder")
  const tabRows = tabsTreeEl.querySelectorAll(".bookmark-row")

  if (!q) {
    rows.forEach((r) => (r.style.display = ""))
    folders.forEach((f) => (f.style.display = ""))
    tabRows.forEach((r) => (r.style.display = ""))
    return
  }

  // An empty folder can't match a query, so keep it out of search results even
  // though it's shown when browsing.

  const matches = (r) => {
    const title = r.querySelector(".bm-title").textContent.toLowerCase()
    const url = r.querySelector(".bm-url").textContent.toLowerCase()
    return title.includes(q) || url.includes(q)
  }

  rows.forEach((r) => (r.style.display = matches(r) ? "" : "none"))
  tabRows.forEach((r) => (r.style.display = matches(r) ? "" : "none"))

  // Hide folders with no visible bookmark rows
  folders.forEach((folder) => {
    const visibleRow = Array.from(folder.querySelectorAll(".bookmark-row")).some(
      (r) => r.style.display !== "none"
    )
    folder.style.display = visibleRow ? "" : "none"
    if (visibleRow) {
      const header = folder.querySelector(".folder-header")
      const children = folder.querySelector(".folder-children")
      header.classList.remove("collapsed")
      children.classList.remove("collapsed")
    }
  })
}

// Creates a Web View note under Trilium's Inbox for the given title/url.
// Throws on failure (config missing, request failure, etc). Shared by both
// the bookmark-saving and tab-saving flows.
async function saveUrlToInboxNote(title, url) {
  if (!config.inboxNoteId) {
    throw new Error("Set your Trilium Inbox note ID in Settings first.")
  }
  return saveUrlToNote(config.inboxNoteId, title, url)
}

// Creates the Web View note under an arbitrary parent. Folder saves point this
// at the note standing in for the folder rather than at the Inbox.
async function saveUrlToNote(parentNoteId, title, url) {
  if (!config.token || !config.baseUrl) {
    throw new Error("Set up your Trilium server URL and ETAPI token in Settings first.")
  }

  const note = await client.createNote({
    parentNoteId,
    title: title || url,
    type: "webView",
    content: "",
  })
  const noteId = note.note.noteId
  await client.createAttribute({ noteId, type: "label", name: "webViewSrc", value: url })
  await client.createAttribute({ noteId, type: "label", name: "url", value: url })
  return noteId
}

// ---------------------------------------------------------------------------
// Folders
//
// A bookmark folder becomes a plain text note in Trilium, and everything under
// it is recreated beneath that note — bookmarks as the same webView notes a
// single save produces, subfolders as further text notes. The Firefox hierarchy
// is mirrored rather than flattened, so a folder tree arrives intact.
//
// Nothing is removed from Firefox until the whole subtree has been written, so
// a failure halfway through leaves the original bookmarks untouched and the
// operation can simply be retried.
// ---------------------------------------------------------------------------

// Creates `node`'s subtree under the Trilium note `parentNoteId`. Returns the
// number of bookmarks written. Throws on the first failure — the caller treats
// a partial write as a failed save and leaves Firefox alone.
async function saveFolderSubtree(node, parentNoteId, onProgress) {
  const note = await client.createNote({
    parentNoteId,
    title: node.title || "(unnamed folder)",
    type: "text",
    content: "",
  })
  const folderNoteId = note.note.noteId

  let saved = 0
  for (const child of node.children || []) {
    if (child.type === "separator") continue
    if (child.url) {
      await saveUrlToNote(folderNoteId, child.title, child.url)
      saved++
      if (onProgress) onProgress(saved)
    } else if (child.children) {
      saved += await saveFolderSubtree(child, folderNoteId, (n) => {
        if (onProgress) onProgress(saved + n)
      })
    }
  }
  return saved
}

// Counts the bookmarks in a subtree, for confirmation prompts and progress.
function countBookmarks(node) {
  let n = 0
  for (const child of node.children || []) {
    if (child.url) n++
    else if (child.children) n += countBookmarks(child)
  }
  return n
}

async function saveFolderAndRemove(node, btn, siblingBtn) {
  clearBanner()

  if (!config.token || !config.baseUrl || !config.inboxNoteId) {
    showBanner("Finish Trilium setup in Settings before saving folders.", "err")
    return
  }

  const total = countBookmarks(node)
  const label = node.title || "(unnamed folder)"
  if (total === 0) {
    showBanner(`"${label}" has no bookmarks in it.`, "warn")
    return
  }

  const ok = window.confirm(
    `Save "${label}" and its ${total} bookmark${total === 1 ? "" : "s"} to Trilium, ` +
    `then remove the folder from Firefox?`
  )
  if (!ok) return

  btn.disabled = true
  siblingBtn.disabled = true
  btn.classList.remove("fail")
  btn.textContent = "Saving…"
  batchRunning = true

  try {
    await saveFolderSubtree(node, config.inboxNoteId, (n) => {
      btn.textContent = `Saving ${n}/${total}…`
    })
  } catch (err) {
    batchRunning = false
    btn.disabled = false
    siblingBtn.disabled = false
    btn.textContent = "Retry"
    btn.classList.add("fail")
    // Nothing was removed from Firefox, so a retry is safe — though it will
    // create a second copy of whatever did land in Trilium.
    showBanner(
      `Failed to save "${label}": ${err.message}. Nothing was removed from Firefox.`,
      "err"
    )
    return
  }

  try {
    await browser.bookmarks.removeTree(node.id)
  } catch (err) {
    showBanner(`Saved to Trilium, but couldn't remove the folder: ${err.message}`, "warn")
  }

  batchRunning = false
  await refreshAll()
  showBanner(`Saved "${label}" (${total} bookmark${total === 1 ? "" : "s"}) to Trilium.`, "ok")
}

async function deleteFolderOnly(node, btn, siblingBtn) {
  clearBanner()

  const total = countBookmarks(node)
  const label = node.title || "(unnamed folder)"
  const ok = window.confirm(
    `Delete the folder "${label}" and everything in it ` +
    `(${total} bookmark${total === 1 ? "" : "s"}) from Firefox without saving to Trilium?` +
    `\n\nThis can't be undone from this page.`
  )
  if (!ok) return

  btn.disabled = true
  siblingBtn.disabled = true
  btn.textContent = "Deleting…"

  try {
    await browser.bookmarks.removeTree(node.id)
  } catch (err) {
    btn.disabled = false
    siblingBtn.disabled = false
    btn.textContent = "Delete"
    showBanner(`Failed to delete "${label}": ${err.message}`, "err")
    return
  }
  await refreshAll()
}

async function saveBookmarkAndRemove(node, btn, siblingBtn, row) {
  clearBanner()

  btn.disabled = true
  siblingBtn.disabled = true
  btn.classList.remove("fail")
  btn.textContent = "Saving…"

  try {
    await saveUrlToInboxNote(node.title, node.url)
  } catch (err) {
    btn.disabled = false
    siblingBtn.disabled = false
    btn.textContent = "Retry"
    btn.classList.add("fail")
    showBanner(`Failed to save "${node.title || node.url}": ${err.message}`, "err")
    return
  }

  try {
    await browser.bookmarks.remove(node.id)
  } catch (err) {
    showBanner(`Saved to Trilium, but couldn't remove the bookmark: ${err.message}`, "warn")
  }

  btn.textContent = "Saved ✓"
  btn.classList.add("done")
  row.style.opacity = "0.5"
  setTimeout(() => {
    row.remove()
    pruneEmptyFolders()
  }, 500)
}

async function deleteBookmarkOnly(node, btn, siblingBtn, row) {
  clearBanner()

  const ok = window.confirm(
    `Delete "${node.title || node.url}" from Firefox without saving it to Trilium?\n\nThis can't be undone from this page.`
  )
  if (!ok) return

  btn.disabled = true
  siblingBtn.disabled = true
  btn.textContent = "Deleting…"

  try {
    await browser.bookmarks.remove(node.id)
    row.style.opacity = "0.5"
    setTimeout(() => {
      row.remove()
      pruneEmptyFolders()
    }, 300)
  } catch (err) {
    btn.disabled = false
    siblingBtn.disabled = false
    btn.textContent = "Delete"
    showBanner(`Failed to delete "${node.title || node.url}": ${err.message}`, "err")
  }
}

async function saveTabAndClose(tab, btn, siblingBtn, row) {
  clearBanner()

  btn.disabled = true
  siblingBtn.disabled = true
  btn.classList.remove("fail")
  btn.textContent = "Saving…"

  try {
    await saveUrlToInboxNote(tab.title, tab.url)
  } catch (err) {
    btn.disabled = false
    siblingBtn.disabled = false
    btn.textContent = "Retry"
    btn.classList.add("fail")
    showBanner(`Failed to save "${tab.title || tab.url}": ${err.message}`, "err")
    return
  }

  try {
    await browser.tabs.remove(tab.id)
  } catch (err) {
    showBanner(`Saved to Trilium, but couldn't close the tab: ${err.message}`, "warn")
  }

  btn.textContent = "Saved ✓"
  btn.classList.add("done")
  row.style.opacity = "0.5"
  setTimeout(() => row.remove(), 500)
}

async function closeTabOnly(tab, btn, siblingBtn, row) {
  clearBanner()

  btn.disabled = true
  siblingBtn.disabled = true
  btn.textContent = "Closing…"

  try {
    await browser.tabs.remove(tab.id)
    row.style.opacity = "0.5"
    setTimeout(() => row.remove(), 300)
  } catch (err) {
    btn.disabled = false
    siblingBtn.disabled = false
    btn.textContent = "Close"
    showBanner(`Failed to close "${tab.title || tab.url}": ${err.message}`, "err")
  }
}

// ---------------------------------------------------------------------------
// Batch actions on the current selection
//
// Saves run one at a time rather than in parallel: Trilium's ETAPI is a single
// server and a burst of note creations from a fifty-bookmark selection is a
// worse neighbour than a short serial run. Each item is removed from Firefox
// only after its own save succeeds, so a mid-batch failure never loses a
// bookmark that never made it across.
// ---------------------------------------------------------------------------

// Resolves the selected ids back into the objects the save/remove calls need.
// Ids that no longer exist are dropped silently — the row is already gone.
async function resolveSelection() {
  const ids = selectedNodeIds()
  const items = []
  for (const id of ids) {
    try {
      if (selectionKind === "tabs") {
        const tab = await browser.tabs.get(Number(id))
        if (tab) items.push({ id, title: tab.title, url: tab.url })
      } else {
        const [n] = await browser.bookmarks.get(id)
        if (n && n.url) items.push({ id, title: n.title, url: n.url })
      }
    } catch {
      // Gone since the page rendered; nothing to do.
    }
  }
  return items
}

// Set while a batch runs. The bookmark/tab events it generates would otherwise
// re-render the tree out from under the loop; both batch functions refresh once
// at the end instead.
let batchRunning = false

function setBatchButtonsDisabled(disabled) {
  batchRunning = disabled
  selSaveBtn.disabled = disabled
  selDeleteBtn.disabled = disabled
  selClearBtn.disabled = disabled
}

async function removeSelectedItem(kind, id) {
  if (kind === "tabs") await browser.tabs.remove(Number(id))
  else await browser.bookmarks.remove(id)
}

async function saveSelection() {
  clearBanner()
  const kind = selectionKind
  const items = await resolveSelection()
  if (items.length === 0) return clearSelection()

  setBatchButtonsDisabled(true)
  let saved = 0
  const failures = []

  for (const item of items) {
    selectionCountEl.textContent = `Saving ${saved + 1} of ${items.length}…`
    try {
      await saveUrlToInboxNote(item.title, item.url)
    } catch (err) {
      failures.push(`${item.title || item.url}: ${err.message}`)
      continue
    }
    saved++
    try {
      await removeSelectedItem(kind, item.id)
    } catch {
      // Saved to Trilium but still present locally; the reported count below
      // stays honest either way.
    }
    selectedIds.delete(item.id)
  }

  setBatchButtonsDisabled(false)
  await refreshAll()

  if (failures.length) {
    showBanner(
      `Saved ${saved} of ${items.length}. ${failures.length} failed — ${failures[0]}`,
      "err"
    )
  } else {
    showBanner(`Saved ${saved} ${saved === 1 ? "item" : "items"} to Trilium.`, "ok")
  }
}

async function deleteSelection() {
  clearBanner()
  const kind = selectionKind
  const items = await resolveSelection()
  if (items.length === 0) return clearSelection()

  if (kind === "bookmarks") {
    const ok = window.confirm(
      `Delete ${items.length} bookmark${items.length === 1 ? "" : "s"} from Firefox ` +
      `without saving to Trilium?\n\nThis can't be undone from this page.`
    )
    if (!ok) return
  }

  setBatchButtonsDisabled(true)
  let done = 0
  const failures = []
  for (const item of items) {
    try {
      await removeSelectedItem(kind, item.id)
      done++
      selectedIds.delete(item.id)
    } catch (err) {
      failures.push(err.message)
    }
  }

  setBatchButtonsDisabled(false)
  await refreshAll()

  if (failures.length) {
    showBanner(
      `${kind === "tabs" ? "Closed" : "Deleted"} ${done} of ${items.length}. ` +
      `${failures.length} failed — ${failures[0]}`,
      "err"
    )
  }
}

selSaveBtn.addEventListener("click", saveSelection)
selDeleteBtn.addEventListener("click", deleteSelection)
selClearBtn.addEventListener("click", clearSelection)

// Escape drops the selection — the usual way out of a selection mode.
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && selectedIds.size > 0) clearSelection()
})

// Folders emptied by saving/deleting their last bookmark stay in the tree as
// drop targets, but get marked so they render compactly.
function pruneEmptyFolders() {
  treeEl.querySelectorAll(".folder").forEach((folder) => {
    const childrenEl = folder.querySelector(".folder-children")
    if (childrenEl) {
      folder.classList.toggle("folder-empty", childrenEl.children.length === 0)
    }
  })
}

// ---------------------------------------------------------------------------
// Refresh
//
// Re-renders both trees and restores the derived UI (filter, selection) that
// the fresh DOM has lost. Everything that mutates bookmarks or tabs goes
// through here rather than calling renderTree/renderTabs directly.
// ---------------------------------------------------------------------------

// A re-render replaces every row, so the scroll offset would otherwise snap
// back to the top — jarring after a drop halfway down a long tree. Folder and
// section expansion survive on their own via sectionState.
function currentScroller() {
  // The panel scrolls the document in the sidebar and the body element in a
  // tab, depending on layout; whichever has the offset is the one to restore.
  return document.scrollingElement || document.documentElement
}

async function refreshAll() {
  const scroller = currentScroller()
  const top = scroller.scrollTop
  const left = scroller.scrollLeft

  await renderTree()
  await renderTabs()
  applyFilter()
  reconcileSelection()
  // Rows were all replaced; re-establish the single tab stop per section.
  syncRovingTabindex("bookmarks")
  syncRovingTabindex("tabs")

  // Restore after layout settles; a tree that got shorter clamps the offset to
  // the new maximum on its own.
  scroller.scrollTop = top
  scroller.scrollLeft = left
}

document.getElementById("refresh").addEventListener("click", async () => {
  await loadConfig()
  checkSetup()
  await refreshAll()
})

// ---------------------------------------------------------------------------
// Live updates
//
// Bookmarks changed in the Firefox library, and tabs opened or closed anywhere,
// should show up here without a manual refresh. Events arrive in bursts (moving
// a bookmark fires onMoved plus onChanged; restoring a window fires onCreated
// per tab), so they're coalesced into one re-render on a short timer.
//
// A re-render mid-drag would pull the rows out from under the pointer, and one
// mid-batch would fight the loop that's causing the events, so both suppress it
// and refresh once they finish.
// ---------------------------------------------------------------------------

let refreshTimer = null

function scheduleRefresh() {
  if (dragNode || batchRunning) return
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(async () => {
    refreshTimer = null
    if (dragNode || batchRunning) return
    await refreshAll()
  }, 250)
}

// Ignore tab events for pages we never list (about:, the panel itself) so
// background noise doesn't cause pointless re-renders.
function isListableTabUrl(url) {
  if (!url) return false
  if (url === browser.runtime.getURL("manage.html")) return false
  return url.startsWith("http://") || url.startsWith("https://")
}

browser.bookmarks.onCreated.addListener(scheduleRefresh)
browser.bookmarks.onRemoved.addListener(scheduleRefresh)
browser.bookmarks.onChanged.addListener(scheduleRefresh)
browser.bookmarks.onMoved.addListener(scheduleRefresh)

browser.tabs.onCreated.addListener((tab) => {
  // A brand-new tab often has no URL yet; onUpdated will follow with one.
  if (!tab.url || isListableTabUrl(tab.url)) scheduleRefresh()
})
browser.tabs.onRemoved.addListener(scheduleRefresh)
browser.tabs.onAttached.addListener(scheduleRefresh)
browser.tabs.onDetached.addListener(scheduleRefresh)
browser.tabs.onMoved.addListener(scheduleRefresh)

// Only title/URL changes affect what's rendered; audible, favicon and loading
// churn would otherwise re-render on every page load.
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.title === undefined && changeInfo.url === undefined) return
  if (isListableTabUrl(tab.url)) scheduleRefresh()
})

// Keep the panel in sync when profiles are edited in the Settings tab, or when
// another open panel switches profile.
// Set while this panel is writing its own profile change, so the storage
// listener below doesn't clobber the confirmation banner we just showed.
let selfWrite = false

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || selfWrite) return
  if (!changes.profiles && !changes.activeProfileId) return
  loadConfig().then(checkSetup)
})

profileSelectEl.addEventListener("change", async () => {
  selfWrite = true
  try {
    await setActiveProfile(profileSelectEl.value)
    await loadConfig()
    if (!checkSetup()) {
      showBanner(`Saving to profile "${config.name}".`, "ok")
    }
  } finally {
    selfWrite = false
  }
})

document.getElementById("openOptions").addEventListener("click", () => {
  browser.runtime.openOptionsPage()
})

function isInSidebar() {
  const sidebarViews = browser.extension.getViews({ type: "sidebar" })
  return sidebarViews.includes(window)
}

const toggleBtn = document.getElementById("toggleSidebar")
toggleBtn.textContent = isInSidebar() ? "Open in Tab" : "Open in Sidebar"
toggleBtn.addEventListener("click", async () => {
  if (isInSidebar()) {
    await browser.tabs.create({ url: browser.runtime.getURL("manage.html") })
  } else {
    await browser.sidebarAction.open()
  }
})

// Filtering hides rows, which can strand the tab stop on something invisible.
searchEl.addEventListener("input", () => {
  applyFilter()
  syncRovingTabindex("bookmarks")
  syncRovingTabindex("tabs")
});

(async function init() {
  await loadConfig()
  await loadSectionState()
  setupSection("tabsSection", tabsTreeEl, "tabs")
  setupSection("bookmarksSection", treeEl, "bookmarks")
  installKeyboardNav("bookmarks")
  installKeyboardNav("tabs")
  checkSetup()
  await refreshAll()
})()