// trilium-api.js
// Minimal wrapper around Trilium's ETAPI (https://github.com/zadam/trilium/wiki/ETAPI)
// Trimmed to only the methods this extension actually uses.

class TriliumClient {
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl.replace(/\/+$/, "")
    this.token = token
  }

  async request(method, path, body) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: this.token
      },
      body: body ? JSON.stringify(body) : undefined
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new Error(`Trilium API ${method} ${path} failed: ${res.status} ${text}`)
    }
    if (res.status === 204) return null
    return res.json()
  }

  async testConnection() {
    return this.request("GET", "/etapi/app-info")
  }

  async createNote({ parentNoteId, title, type = "text", content = "", mime }) {
    return this.request("POST", "/etapi/create-note", {
      parentNoteId,
      title,
      type,
      content,
      mime
    })
  }

  async createAttribute({ noteId, type, name, value, isInheritable = false }) {
    return this.request("POST", "/etapi/attributes", {
      noteId,
      type,
      name,
      value: value || "",
      isInheritable
    })
  }

  async findNoteByLabel(labelName) {
    const result = await this.request(
      "GET",
      `/etapi/notes?search=${encodeURIComponent(`#${labelName}`)}`
    )
    return (result.results && result.results[0]) || null
  }
}

if (typeof module !== "undefined") {
  module.exports = { TriliumClient }
}
