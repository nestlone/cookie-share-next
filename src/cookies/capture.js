import { normalizeCookies } from "./normalize.js";

export async function captureForUrl(url) {
  const { hostname } = new URL(url);
  const cookies = await chrome.cookies.getAll({ domain: hostname });
  return normalizeCookies(cookies);
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
  return await captureForUrl(tab.url);
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
