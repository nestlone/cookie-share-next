import { cookieUrl, normalizeCookies, toChromeSameSite } from "./normalize.js";

function toCookieDetails(cookie) {
  const details = {
    url: cookieUrl(cookie),
    name: cookie.name,
    value: cookie.value,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: toChromeSameSite(cookie.sameSite),
  };

  if (!cookie.hostOnly) {
    details.domain = cookie.domain;
  }
  if (!cookie.session && cookie.expirationDate !== undefined) {
    details.expirationDate = cookie.expirationDate;
  }
  return details;
}

export async function applyCookies(cookies) {
  const normalized = normalizeCookies(cookies);
  const results = await Promise.allSettled(normalized.map((cookie) => chrome.cookies.set(toCookieDetails(cookie))));
  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length > 0) {
    throw new Error(`${failures.length} cookies could not be applied`);
  }
  return normalized.length;
}

export async function replaceCookiesForUrl(url, cookies) {
  const { hostname } = new URL(url);
  const existing = await chrome.cookies.getAll({ domain: hostname });
  await Promise.allSettled(existing.map((cookie) => chrome.cookies.remove({ url: cookieUrl(cookie), name: cookie.name, storeId: cookie.storeId })));
  return await applyCookies(cookies);
}
