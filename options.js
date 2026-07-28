// options.js

const els = {
  profileSelect: document.getElementById("profileSelect"),
  deleteProfile: document.getElementById("deleteProfile"),
  baseUrl: document.getElementById("baseUrl"),
  token: document.getElementById("token"),
  inboxNoteId: document.getElementById("inboxNoteId"),
  status: document.getElementById("status")
}

let profiles = []
let activeProfileId = null

function showStatus(message, ok) {
  els.status.textContent = message
  els.status.className = ok ? "ok" : "err"
}

function currentProfile() {
  return profiles.find((p) => p.id === activeProfileId)
}

function renderProfileList() {
  els.profileSelect.innerHTML = ""
  profiles.forEach((p) => {
    const opt = document.createElement("option")
    opt.value = p.id
    opt.textContent = p.name
    els.profileSelect.appendChild(opt)
  })
  els.profileSelect.value = activeProfileId
  els.deleteProfile.disabled = profiles.length <= 1
}

function renderFields() {
  const p = currentProfile()
  els.baseUrl.value = p.baseUrl
  els.token.value = p.token
  els.inboxNoteId.value = p.inboxNoteId
}

// Pull the form values back into the in-memory profile without persisting, so
// switching profiles doesn't silently discard edits made to the current one.
function captureFields() {
  const p = currentProfile()
  if (!p) return
  p.baseUrl = els.baseUrl.value.trim() || "http://localhost:37840"
  p.token = els.token.value.trim()
  p.inboxNoteId = els.inboxNoteId.value.trim()
}

async function load() {
  const state = await loadProfiles()
  profiles = state.profiles
  activeProfileId = state.activeProfileId
  renderProfileList()
  renderFields()
}

async function save() {
  captureFields()
  await saveProfiles(profiles, activeProfileId)
  renderProfileList()
  showStatus(`Settings saved for profile "${currentProfile().name}".`, true)
}

async function switchProfile() {
  captureFields()
  const previous = profiles.slice()
  activeProfileId = els.profileSelect.value
  // Persist so unsaved edits to the profile we're leaving aren't lost.
  await saveProfiles(previous, activeProfileId)
  renderFields()
  showStatus(`Switched to profile "${currentProfile().name}".`, true)
}

async function newProfile() {
  const name = window.prompt("Name for the new profile:", `Profile ${profiles.length + 1}`)
  if (name === null) return
  const trimmed = name.trim()
  if (!trimmed) {
    showStatus("Profile name can't be empty.", false)
    return
  }

  captureFields()
  const profile = makeProfile(trimmed)
  profiles.push(profile)
  activeProfileId = profile.id
  await saveProfiles(profiles, activeProfileId)
  renderProfileList()
  renderFields()
  showStatus(`Created profile "${trimmed}".`, true)
}

async function renameProfile() {
  const p = currentProfile()
  const name = window.prompt("Rename profile:", p.name)
  if (name === null) return
  const trimmed = name.trim()
  if (!trimmed) {
    showStatus("Profile name can't be empty.", false)
    return
  }

  captureFields()
  p.name = trimmed
  await saveProfiles(profiles, activeProfileId)
  renderProfileList()
  showStatus(`Renamed profile to "${trimmed}".`, true)
}

async function deleteProfile() {
  if (profiles.length <= 1) {
    showStatus("You need at least one profile.", false)
    return
  }

  const p = currentProfile()
  if (!window.confirm(`Delete profile "${p.name}"?\n\nIts server URL, token, and inbox note ID will be removed.`)) {
    return
  }

  profiles = profiles.filter((x) => x.id !== p.id)
  activeProfileId = profiles[0].id
  await saveProfiles(profiles, activeProfileId)
  renderProfileList()
  renderFields()
  showStatus(`Deleted profile "${p.name}".`, true)
}

async function testConnection() {
  try {
    const client = new TriliumClient(els.baseUrl.value.trim(), els.token.value.trim())
    const info = await client.testConnection()
    showStatus(`Connected to Trilium ${info.appVersion || ""}.`, true)
  } catch (err) {
    showStatus(`Connection failed: ${err.message}`, false)
  }
}

async function autoDetect() {
  try {
    const client = new TriliumClient(els.baseUrl.value.trim(), els.token.value.trim())
    const note = await client.findNoteByLabel("inbox")
    if (note) {
      els.inboxNoteId.value = note.noteId
      showStatus(`Found inbox note: "${note.title}". Click Save to keep it.`, true)
    } else {
      showStatus("No note with #inbox label found. Paste the note ID manually.", false)
    }
  } catch (err) {
    showStatus(`Auto-detect failed: ${err.message}`, false)
  }
}

els.profileSelect.addEventListener("change", switchProfile)
document.getElementById("newProfile").addEventListener("click", newProfile)
document.getElementById("renameProfile").addEventListener("click", renameProfile)
els.deleteProfile.addEventListener("click", deleteProfile)
document.getElementById("save").addEventListener("click", save)
document.getElementById("testConn").addEventListener("click", testConnection)
document.getElementById("autoDetect").addEventListener("click", autoDetect)

load()
