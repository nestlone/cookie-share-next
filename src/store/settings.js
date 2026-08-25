const KEY = "cookieShareNextSettings";
const SESSION_KEY = "cookieShareNextSession";

function sessionStore() {
  return chrome.storage?.session;
}

export async function getSettings() {
  const local = (await chrome.storage.local.get(KEY))[KEY] ?? { serverUrl: "", displayName: "", token: null };
  const session = sessionStore();
  if (!session) return local;
  const stored = (await session.get(SESSION_KEY))[SESSION_KEY];
  if (stored?.token) return { serverUrl: local.serverUrl ?? "", displayName: stored.displayName ?? "", token: stored.token };

  // One-time migration removes pre-v0.0.7 tokens from persistent storage.
  if (local.token) {
    await session.set({ [SESSION_KEY]: { displayName: local.displayName ?? "", token: local.token } });
    await chrome.storage.local.set({ [KEY]: { serverUrl: local.serverUrl ?? "", displayName: "", token: null } });
  }
  return { serverUrl: local.serverUrl ?? "", displayName: local.displayName ?? "", token: local.token ?? null };
}

export async function saveSession({ serverUrl, displayName, token }) {
  await chrome.storage.local.set({ [KEY]: { serverUrl, displayName: "", token: null } });
  const session = sessionStore();
  if (session) await session.set({ [SESSION_KEY]: { displayName, token } });
}

export async function clearSession() {
  const current = await getSettings();
  await chrome.storage.local.set({ [KEY]: { serverUrl: current.serverUrl ?? "", displayName: "", token: null } });
  await sessionStore()?.remove(SESSION_KEY);
}

export async function saveServerUrl(serverUrl) {
  const current = await getSettings();
  await chrome.storage.local.set({ [KEY]: { serverUrl, displayName: "", token: null } });
}
