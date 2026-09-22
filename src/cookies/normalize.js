const SAME_SITE_VALUES = new Set(["lax", "strict", "none", "unspecified"]);

function normalizeDomain(value) {
  const domain = value.trim().replace(/^\./, "").toLowerCase();
  if (!domain || /[\s/@:?#[\]\\]/.test(domain)) throw new Error("Invalid cookie domain");
  let parsed;
  try { parsed = new URL(`https://${domain}`); } catch { throw new Error("Invalid cookie domain"); }
  if (parsed.hostname !== domain || parsed.port || parsed.pathname !== "/" || parsed.search || parsed.hash) throw new Error("Invalid cookie domain");
  return domain;
}

function normalizePath(value) {
  const path = typeof value === "string" && value ? value : "/";
  if (!path.startsWith("/") || /[\r\n?#]/.test(path)) throw new Error("Invalid cookie path");
  return path;
}

function normalizeSameSite(value) {
  if (value === "no_restriction") {
    return "none";
  }
  if (value === "unspecified" || value === undefined || value === null) {
    return "unspecified";
  }
  if (typeof value !== "string" || !SAME_SITE_VALUES.has(value.toLowerCase())) {
    throw new Error("Invalid cookie sameSite value");
  }
  return value.toLowerCase();
}

function normalizePartitionKey(value) {
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid cookie partitionKey");
  const source = value;
  const partitionKey = {};
  if (source.topLevelSite !== undefined) {
    if (typeof source.topLevelSite !== "string") throw new Error("Invalid cookie partitionKey");
    let site;
    try { site = new URL(source.topLevelSite); } catch { throw new Error("Invalid cookie partitionKey"); }
    if (!/^https?:$/.test(site.protocol) || site.origin !== source.topLevelSite.replace(/\/$/, "")) throw new Error("Invalid cookie partitionKey");
    partitionKey.topLevelSite = source.topLevelSite.replace(/\/$/, "");
  }
  if (source.hasCrossSiteAncestor !== undefined) {
    if (typeof source.hasCrossSiteAncestor !== "boolean") throw new Error("Invalid cookie partitionKey");
    partitionKey.hasCrossSiteAncestor = source.hasCrossSiteAncestor;
  }
  if (Object.keys(partitionKey).length === 0) throw new Error("Invalid cookie partitionKey");
  return partitionKey;
}

export function normalizeCookie(cookie) {
  if (!cookie || typeof cookie !== "object" || Array.isArray(cookie)) {
    throw new Error("Invalid cookie");
  }
  if (typeof cookie.name !== "string" || !cookie.name || typeof cookie.value !== "string") {
    throw new Error("Invalid cookie name or value");
  }
  if (typeof cookie.domain !== "string" || !cookie.domain.trim()) {
    throw new Error("Invalid cookie domain");
  }
  if (typeof cookie.httpOnly !== "boolean" || typeof cookie.secure !== "boolean") {
    throw new Error("Invalid cookie security flags");
  }

  const domain = normalizeDomain(cookie.domain);
  const expirationDate = cookie.expirationDate === undefined || cookie.expirationDate === null
    ? undefined
    : Number(cookie.expirationDate);
  if (expirationDate !== undefined && !Number.isFinite(expirationDate)) {
    throw new Error("Invalid cookie expiration date");
  }

  const normalized = {
    domain,
    hostOnly: typeof cookie.hostOnly === "boolean" ? cookie.hostOnly : !cookie.domain.trim().startsWith("."),
    httpOnly: cookie.httpOnly,
    name: cookie.name,
    path: normalizePath(cookie.path),
    sameSite: normalizeSameSite(cookie.sameSite),
    secure: cookie.secure,
    session: Boolean(cookie.session),
    storeId: null,
    value: cookie.value,
  };
  const partitionKey = normalizePartitionKey(cookie.partitionKey);
  if (partitionKey) normalized.partitionKey = partitionKey;
  if (expirationDate !== undefined) {
    normalized.expirationDate = expirationDate;
  }
  return normalized;
}

export function normalizeCookies(cookies) {
  if (!Array.isArray(cookies)) {
    throw new Error("Invalid cookies");
  }
  return cookies.map(normalizeCookie);
}

export function cookieUrl(cookie) {
  const domain = cookie.domain.replace(/^\./, "");
  return `${cookie.secure ? "https" : "http"}://${domain}${cookie.path || "/"}`;
}

export function toChromeSameSite(value) {
  return value === "none" ? "no_restriction" : value;
}
