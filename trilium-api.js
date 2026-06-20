// trilium-api.js
// Minimal wrapper around Trilium's ETAPI (https://github.com/zadam/trilium/wiki/ETAPI)

class TriliumClient {
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token;
  }

  async request(method, path, body) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: this.token
      },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Trilium API ${method} ${path} failed: ${res.status} ${text}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  async testConnection() {
    return this.request("GET", "/etapi/app-info");
  }

  async getNote(noteId) {
    return this.request("GET", `/etapi/notes/${noteId}`);
  }

  async createNote({ parentNoteId, title, type = "text", content = "", mime }) {
    return this.request("POST", "/etapi/create-note", {
      parentNoteId,
      title,
      type,
      content,
      mime
    });
  }

  async updateNoteTitle(noteId, title) {
    return this.request("PATCH", `/etapi/notes/${noteId}`, { title });
  }

  async deleteNote(noteId) {
    return this.request("DELETE", `/etapi/notes/${noteId}`);
  }

  async getChildNotes(parentNoteId) {
    // Use search to get direct children, ordered
    const result = await this.request(
      "GET",
      `/etapi/notes?search=${encodeURIComponent(`note.parents.noteId = "${parentNoteId}"`)}`
    );
    return result.results || [];
  }

  async createAttribute({ noteId, type, name, value, isInheritable = false }) {
    return this.request("POST", "/etapi/attributes", {
      noteId,
      type,
      name,
      value: value || "",
      isInheritable
    });
  }

  async getAttributesForNote(noteId) {
    const note = await this.getNote(noteId);
    return note.attributes || [];
  }

  async findNoteByLabel(labelName) {
    const result = await this.request(
      "GET",
      `/etapi/notes?search=${encodeURIComponent(`#${labelName}`)}`
    );
    return (result.results && result.results[0]) || null;
  }

  async findOrCreateRoot(rootTitle) {
    const search = await this.request(
      "GET",
      `/etapi/notes?search=${encodeURIComponent(`note.title = "${rootTitle}" AND note.parents.noteId = "root"`)}`
    );
    if (search.results && search.results.length > 0) {
      return search.results[0];
    }
    return this.createNote({
      parentNoteId: "root",
      title: rootTitle,
      type: "text",
      content: "Synced Firefox bookmarks root. Do not rename or move this note."
    });
  }
}

if (typeof module !== "undefined") {
  module.exports = { TriliumClient };
}
