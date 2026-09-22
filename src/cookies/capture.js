import { normalizeCookies } from "./normalize.js";

function cookieIdentity(cookie) {
  const partition = cookie.partitionKey ? `${cookie.partitionKey.topLevelSite ?? ""}:${String(cookie.partitionKey.hasCrossSiteAncestor ?? "")}` : "";
  return `${cookie.name}\u0000${cookie.domain}\u0000${cookie.path}\u0000${partition}`;
}

export async function captureForUrl(url, tabId) {
  const { hostname } = new URL(url);
  const cookies = await chrome.cookies.getAll({ domain: hostname });
  if (typeof chrome.cookies.getPartitionKey !== "function" || tabId === undefined) return normalizeCookies(cookies);
  try {
    const partitionKey = await chrome.cookies.getPartitionKey({ tabId });
    if (!partitionKey?.topLevelSite) return normalizeCookies(cookies);
    const partitioned = await chrome.cookies.getAll({ domain: hostname, partitionKey });
    return normalizeCookies([...new Map([...cookies, ...partitioned].map((cookie) => [cookieIdentity(cookie), cookie])).values()]);
  } catch {
    // Partition-key support is unavailable in older Chromium builds or restricted tabs.
    return normalizeCookies(cookies);
  }
}

export async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs[0];
  if (!tab?.url || !/^https?:\/\//.test(tab.url)) {
    throw new Error("Open a normal HTTP or HTTPS page first");
  }
  return tab;
}

export async function captureActiveTab() {
  const tab = await getActiveTab();
  return await captureForUrl(tab.url, tab.id);
}

export async function activeSiteContext() {
  const tab = await getActiveTab();
  const url = new URL(tab.url);
  return {
    tabId: tab.id,
    url: tab.url,
    hostname: url.hostname.toLowerCase(),
    title: tab.title || url.hostname,
    favIconUrl: tab.favIconUrl || "",
  };
}
