const KEY = "cookieShareNextSettings";

export async function getSettings() {
  const result = await chrome.storage.local.get(KEY);
  return result[KEY] ?? { serverUrl: "", displayName: "", token: null };
}

export async function saveSession({ serverUrl, displayName, token }) {
  await chrome.storage.local.set({ [KEY]: { serverUrl, displayName, token } });
}

export async function clearSession() {
  const current = await getSettings();
  await chrome.storage.local.set({ [KEY]: { serverUrl: current.serverUrl ?? "", displayName: "", token: null } });
}

export async function saveServerUrl(serverUrl) {
  const current = await getSettings();
  await chrome.storage.local.set({ [KEY]: { ...current, serverUrl } });
}
