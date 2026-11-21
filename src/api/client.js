import { requireOrigins, serverOrigins } from "../shared/permissions.js";

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
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("服务器地址必须是 HTTP 或 HTTPS 地址，且不能包含账号、查询参数或片段。");
  }
  return url.toString().replace(/\/$/, "");
}

export class ApiClient {
  constructor(serverUrl, token = null) {
    this.serverUrl = normalizeServerUrl(serverUrl);
    this.token = token;
  }

  async request(path, options = {}) {
    await requireOrigins(serverOrigins(this.serverUrl));
    const headers = new Headers(options.headers);
    headers.set("Accept", "application/json");
    if (this.token) {
      headers.set("Authorization", `Bearer ${this.token}`);
    }
    if (options.body !== undefined && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const method = options.method ?? "GET";
    const attempts = method === "GET" ? 2 : 1;
    let response, text;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        response = await fetch(`${this.serverUrl}/api/v1${path}`, { ...options, headers, signal: controller.signal, cache: "no-store", credentials: "omit" });
        text = await response.text();
        if ([502, 503, 504].includes(response.status) && attempt + 1 < attempts) continue;
        break;
      } catch {
        if (attempt + 1 < attempts) continue;
        const timedOut = controller.signal.aborted;
        throw new ApiError(0, timedOut
          ? `连接 ${new URL(this.serverUrl).host} 超时，请检查网络后重试。`
          : `无法连接 ${new URL(this.serverUrl).host}。请检查网络、代理或服务器地址后重试。`, { code: timedOut ? "TIMEOUT" : "NETWORK" });
      } finally { clearTimeout(timer); }
    }
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        throw new ApiError(response.status, "服务器未返回有效数据，请稍后重试或检查服务器地址。");
      }
    }

    if (!response.ok) {
      if (response.status === 429) {
        const retryAfter = Number(body?.retryAfter ?? response.headers.get("Retry-After"));
        const message = Number.isFinite(retryAfter) && retryAfter > 0
          ? `操作过于频繁，请在 ${Math.ceil(retryAfter)} 秒后重试。`
          : "操作过于频繁，请稍后重试。";
        throw new ApiError(response.status, message, body);
      }
      const messages = { "Invalid backup key": "登录密钥无效，请检查是否复制完整，或是否已重置。", "Session expired or invalid": "登录已过期，请重新登录。", "Unauthorized": "请重新登录。" };
      const message = messages[body?.message] ?? (body && typeof body.message === "string" ? body.message : "请求失败，请稍后重试。");
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
