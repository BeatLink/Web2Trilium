// profiles.js
// Storage layer for connection profiles. A profile bundles the three things
// that vary between Trilium servers: base URL, ETAPI token, and inbox note ID.
//
// Storage shape:
//   profiles: [{ id, name, baseUrl, token, inboxNoteId }]
//   activeProfileId: string
//
// Older versions stored a single `config` object. loadProfiles() migrates that
// into a one-entry profile list on first run.

const DEFAULT_BASE_URL = "http://localhost:37840"

function newProfileId() {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function makeProfile(name, source) {
  const c = source || {}
  return {
    id: newProfileId(),
    name: name,
    baseUrl: c.baseUrl || DEFAULT_BASE_URL,
    token: c.token || "",
    inboxNoteId: c.inboxNoteId || ""
  }
}

// Returns { profiles, activeProfileId }. Always yields at least one profile.
async function loadProfiles() {
  const stored = await browser.storage.local.get(["profiles", "activeProfileId", "config"])

  let profiles = Array.isArray(stored.profiles) ? stored.profiles : null
  if (!profiles || profiles.length === 0) {
    profiles = [makeProfile("Default", stored.config)]
    await browser.storage.local.set({ profiles, activeProfileId: profiles[0].id })
    return { profiles, activeProfileId: profiles[0].id }
  }

  let activeProfileId = stored.activeProfileId
  if (!profiles.some((p) => p.id === activeProfileId)) {
    activeProfileId = profiles[0].id
    await browser.storage.local.set({ activeProfileId })
  }

  return { profiles, activeProfileId }
}

async function saveProfiles(profiles, activeProfileId) {
  const active = profiles.find((p) => p.id === activeProfileId) || profiles[0]
  await browser.storage.local.set({
    profiles,
    activeProfileId: active ? active.id : null,
    // Mirrored for backwards compatibility with anything still reading `config`.
    config: active
      ? { baseUrl: active.baseUrl, token: active.token, inboxNoteId: active.inboxNoteId }
      : {}
  })
}

async function setActiveProfile(activeProfileId) {
  const { profiles } = await loadProfiles()
  await saveProfiles(profiles, activeProfileId)
}

// Convenience for consumers that only need the currently selected profile.
async function loadActiveProfile() {
  const { profiles, activeProfileId } = await loadProfiles()
  return profiles.find((p) => p.id === activeProfileId) || profiles[0]
}
