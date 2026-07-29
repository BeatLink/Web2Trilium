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

function makeDraggable(el, node) {
  el.draggable = true

  el.addEventListener("dragstart", (e) => {
    e.stopPropagation()
    dragNode = node
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
    el.classList.remove("dragging")
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
  if (dragNode.id === targetNode.id) return false
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
    await moveRelativeTo(dragNode, node, after)
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

    // dragend fires before these awaits settle and clears dragNode, so hold a
    // local reference.
    const moving = dragNode
    if (await isSelfOrDescendant(moving.id, node.id)) {
      showBanner("Can't move a folder inside itself.", "err")
      return
    }
    await applyMove(moving.id, { parentId: node.id })

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
    const moving = dragNode
    if (await isSelfOrDescendant(moving.id, node.id)) {
      showBanner("Can't move a folder inside itself.", "err")
      return
    }
    await applyMove(moving.id, { parentId: node.id })
  })
}

// Moves `node` to sit immediately before or after `target` among its siblings.
async function moveRelativeTo(node, target, after) {
  const [fresh] = await browser.bookmarks.get(target.id)
  if (!fresh) return

  if (await isSelfOrDescendant(node.id, fresh.parentId)) {
    showBanner("Can't move a folder inside itself.", "err")
    return
  }

  const [dragged] = await browser.bookmarks.get(node.id)
  let index = fresh.index + (after ? 1 : 0)

  // Within one folder, removing the dragged node shifts every later sibling
  // down by one, so a downward move needs its target index decremented.
  if (dragged && dragged.parentId === fresh.parentId && dragged.index < fresh.index) {
    index -= 1
  }

  await applyMove(node.id, { parentId: fresh.parentId, index })
}

async function applyMove(id, destination) {
  clearBanner()
  try {
    await browser.bookmarks.move(id, destination)
  } catch (err) {
    showBanner(`Couldn't move bookmark: ${err.message}`, "err")
    return
  }
  // Indices are now stale everywhere; a re-render is simpler than patching.
  await renderTree()
  applyFilter()
}

function makeBookmarkRow(node) {
  const row = document.createElement("div")
  row.className = "bookmark-row"
  row.dataset.id = node.id
  makeDraggable(row, node)
  makeReorderTarget(row, node)

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
  folderTitle.textContent = node.title || "(unnamed)"
  header.appendChild(twisty)
  header.appendChild(folderTitle)

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
  if (!config.token || !config.baseUrl) {
    throw new Error("Set up your Trilium server URL and ETAPI token in Settings first.")
  }
  if (!config.inboxNoteId) {
    throw new Error("Set your Trilium Inbox note ID in Settings first.")
  }

  const note = await client.createNote({
    parentNoteId: config.inboxNoteId,
    title: title || url,
    type: "webView",
    content: "",
  })
  const noteId = note.note.noteId
  await client.createAttribute({ noteId, type: "label", name: "webViewSrc", value: url })
  await client.createAttribute({ noteId, type: "label", name: "url", value: url })
  return noteId
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

document.getElementById("refresh").addEventListener("click", async () => {
  await loadConfig()
  checkSetup()
  await renderTree()
  await renderTabs()
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

searchEl.addEventListener("input", applyFilter);

(async function init() {
  await loadConfig()
  await loadSectionState()
  setupSection("tabsSection", tabsTreeEl, "tabs")
  setupSection("bookmarksSection", treeEl, "bookmarks")
  checkSetup()
  await renderTree()
  await renderTabs()
})()