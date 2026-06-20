// options.js

const els = {
  baseUrl: document.getElementById("baseUrl"),
  token: document.getElementById("token"),
  inboxNoteId: document.getElementById("inboxNoteId"),
  status: document.getElementById("status")
};

function showStatus(message, ok) {
  els.status.textContent = message;
  els.status.className = ok ? "ok" : "err";
}

async function load() {
  const { config } = await browser.storage.local.get("config");
  const c = config || {};
  els.baseUrl.value = c.baseUrl || "http://localhost:37840";
  els.token.value = c.token || "";
  els.inboxNoteId.value = c.inboxNoteId || "";
}

async function save() {
  const config = {
    baseUrl: els.baseUrl.value.trim() || "http://localhost:37840",
    token: els.token.value.trim(),
    inboxNoteId: els.inboxNoteId.value.trim()
  };
  await browser.storage.local.set({ config });
  showStatus("Settings saved.", true);
}

async function testConnection() {
  try {
    const client = new TriliumClient(els.baseUrl.value.trim(), els.token.value.trim());
    const info = await client.testConnection();
    showStatus(`Connected to Trilium ${info.appVersion || ""}.`, true);
  } catch (err) {
    showStatus(`Connection failed: ${err.message}`, false);
  }
}

async function autoDetect() {
  try {
    const client = new TriliumClient(els.baseUrl.value.trim(), els.token.value.trim());
    const note = await client.findNoteByLabel("inbox");
    if (note) {
      els.inboxNoteId.value = note.noteId;
      showStatus(`Found inbox note: "${note.title}".`, true);
    } else {
      showStatus("No note with #inbox label found. Paste the note ID manually.", false);
    }
  } catch (err) {
    showStatus(`Auto-detect failed: ${err.message}`, false);
  }
}

document.getElementById("save").addEventListener("click", save);
document.getElementById("testConn").addEventListener("click", testConnection);
document.getElementById("autoDetect").addEventListener("click", autoDetect);

load();
