const SAME_SITE_VALUES = new Set(["lax", "strict", "none"]);

function normalizeSameSite(value) {
  if (value === "no_restriction") {
    return "none";
  }
  if (value === "unspecified" || value === undefined || value === null) {
    return "lax";
  }
  if (typeof value !== "string" || !SAME_SITE_VALUES.has(value.toLowerCase())) {
    throw new Error("Invalid cookie sameSite value");
  }
  return value.toLowerCase();
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

  const domain = cookie.domain.trim().replace(/^\./, "").toLowerCase();
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
    path: typeof cookie.path === "string" && cookie.path ? cookie.path : "/",
    sameSite: normalizeSameSite(cookie.sameSite),
    secure: cookie.secure,
    session: Boolean(cookie.session),
    storeId: null,
    value: cookie.value,
  };
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
