// manage.js

let config = null
let client = null

const treeEl = document.getElementById("tree")
const tabsTreeEl = document.getElementById("tabsTree")
const searchEl = document.getElementById("search")
const bannerEl = document.getElementById("banner")

function showBanner(message, level) {
  bannerEl.textContent = message
  bannerEl.className = level || ""
}

function clearBanner() {
  bannerEl.textContent = ""
  bannerEl.className = ""
}

async function loadConfig() {
  const { config: c } = await browser.storage.local.get("config")
  config = c || {}
  if (config.token && config.baseUrl) {
    client = new TriliumClient(config.baseUrl, config.token)
  }
}

function svgFavicon() {
  return `<svg class="favicon" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="#bbb"/></svg>`
}

function makeBookmarkRow(node) {
  const row = document.createElement("div")
  row.className = "bookmark-row"
  row.dataset.id = node.id

  const text = document.createElement("div")
  text.className = "bm-text"
  text.innerHTML = `
    <div class="bm-title">${escapeHtml(node.title || node.url)}</div>
    <div class="bm-url">${escapeHtml(node.url)}</div>
  `

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

  row.innerHTML = svgFavicon()
  row.appendChild(text)
  row.appendChild(actions)
  return row
}

function makeTabRow(tab) {
  const row = document.createElement("div")
  row.className = "bookmark-row"
  row.dataset.id = tab.id

  const text = document.createElement("div")
  text.className = "bm-text"
  text.innerHTML = `
    <div class="bm-title">${escapeHtml(tab.title || tab.url)}</div>
    <div class="bm-url">${escapeHtml(tab.url)}</div>
  `

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

  row.innerHTML = svgFavicon()
  row.appendChild(text)
  row.appendChild(actions)
  return row
}

function makeFolderNode(node) {
  const wrap = document.createElement("div")
  wrap.className = "folder"

  const header = document.createElement("div")
  header.className = "folder-header"
  header.innerHTML = `<span class="twisty">▾</span><span>${escapeHtml(node.title || "(unnamed)")}</span>`

  const childrenEl = document.createElement("div")
  childrenEl.className = "folder-children"

  header.addEventListener("click", () => {
    header.classList.toggle("collapsed")
    childrenEl.classList.toggle("collapsed")
  })

  wrap.appendChild(header)
  wrap.appendChild(childrenEl);

  (node.children || []).forEach((child) => {
    const childEl = renderNode(child)
    if (childEl) childrenEl.appendChild(childEl)
  })

  return childrenEl.children.length > 0 ? wrap : null
}

function renderNode(node) {
  if (node.type === "separator") return null
  if (node.url) return makeBookmarkRow(node)
  if (node.children) return makeFolderNode(node)
  return null
}

function escapeHtml(str) {
  const div = document.createElement("div")
  div.textContent = str || ""
  return div.innerHTML
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
  const visibleTabs = tabs.filter((t) => t.url && t.url !== ownUrl)

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
    content: ""
  })
  await client.createAttribute({
    noteId: note.note.noteId,
    type: "label",
    name: "webViewSrc",
    value: url
  })
  await client.createAttribute({
    noteId: note.note.noteId,
    type: "label",
    name: "url",
    value: url
  })
  return note.note.noteId
}

async function saveBookmarkAndRemove(node, btn, siblingBtn, row) {
  clearBanner()

  btn.disabled = true
  siblingBtn.disabled = true
  btn.classList.remove("fail")
  btn.textContent = "Saving…"

  try {
    await saveUrlToInboxNote(node.title, node.url)
    await browser.bookmarks.remove(node.id)

    btn.textContent = "Saved ✓"
    btn.classList.add("done")
    row.style.opacity = "0.5"
    setTimeout(() => {
      row.remove()
      pruneEmptyFolders()
    }, 500)
  } catch (err) {
    btn.disabled = false
    siblingBtn.disabled = false
    btn.textContent = "Retry"
    btn.classList.add("fail")
    showBanner(`Failed to save "${node.title || node.url}": ${err.message}`, "err")
  }
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
    await browser.tabs.remove(tab.id)

    btn.textContent = "Saved ✓"
    btn.classList.add("done")
    row.style.opacity = "0.5"
    setTimeout(() => row.remove(), 500)
  } catch (err) {
    btn.disabled = false
    siblingBtn.disabled = false
    btn.textContent = "Retry"
    btn.classList.add("fail")
    showBanner(`Failed to save "${tab.title || tab.url}": ${err.message}`, "err")
  }
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

function pruneEmptyFolders() {
  const folders = treeEl.querySelectorAll(".folder")
  folders.forEach((folder) => {
    const childrenEl = folder.querySelector(".folder-children")
    if (childrenEl && childrenEl.children.length === 0) {
      folder.remove()
    }
  })
}

document.getElementById("refresh").addEventListener("click", async () => {
  await loadConfig()
  await renderTree()
  await renderTabs()
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
  if (!config.token || !config.inboxNoteId) {
    showBanner(
      "Heads up: finish setup in Settings (ETAPI token + Inbox note ID) before saving bookmarks.",
      "warn"
    )
  }
  await renderTree()
  await renderTabs()
})()