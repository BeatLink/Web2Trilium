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

function makeBookmarkRow(node) {
  const row = document.createElement("div")
  row.className = "bookmark-row"
  row.dataset.id = node.id

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

function pruneEmptyFolders() {
  const folders = [...treeEl.querySelectorAll(".folder")].reverse()
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