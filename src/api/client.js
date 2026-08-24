export class ApiError extends Error {
  constructor(status, message, body = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

function normalizeServerUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Server URL is required");
  }
  const url = new URL(value.trim());
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Server URL must use HTTP or HTTPS");
  }
  return url.toString().replace(/\/$/, "");
}

export class ApiClient {
  constructor(serverUrl, token = null) {
    this.serverUrl = normalizeServerUrl(serverUrl);
    this.token = token;
  }

  async request(path, options = {}) {
    const headers = new Headers(options.headers);
    headers.set("Accept", "application/json");
    if (this.token) {
      headers.set("Authorization", `Bearer ${this.token}`);
    }
    if (options.body !== undefined && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    let response;
    try {
      response = await fetch(`${this.serverUrl}/api/v1${path}`, { ...options, headers });
    } catch {
      throw new ApiError(0, "Unable to reach the server");
    }

    const text = await response.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        throw new ApiError(response.status, "Server returned invalid JSON");
      }
    }

    if (!response.ok) {
      const message = body && typeof body.message === "string" ? body.message : "Request failed";
      throw new ApiError(response.status, message, body);
    }
    return body;
  }

  get(path) {
    return this.request(path);
  }

  post(path, body) {
    return this.request(path, { method: "POST", body: JSON.stringify(body) });
  }

  put(path, body) {
    return this.request(path, { method: "PUT", body: JSON.stringify(body) });
  }

  delete(path) {
    return this.request(path, { method: "DELETE" });
  }
}

export { normalizeServerUrl };
