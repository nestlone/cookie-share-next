const MAX_STORAGE_ENTRIES = 500;
const MAX_STORAGE_BYTES = 2 * 1024 * 1024;

function normalizeEntries(value, label) {
  if (!Array.isArray(value)) throw new Error(`Invalid ${label}`);
  if (value.length > MAX_STORAGE_ENTRIES) throw new Error(`${label} has too many entries`);
  let bytes = 0;
  const seen = new Set();
  return value.map((entry) => {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" || typeof entry[1] !== "string") {
      throw new Error(`Invalid ${label}`);
    }
    if (seen.has(entry[0])) throw new Error(`Invalid ${label}`);
    seen.add(entry[0]);
    bytes += entry[0].length + entry[1].length;
    if (bytes > MAX_STORAGE_BYTES) throw new Error(`${label} is too large`);
    return [entry[0], entry[1]];
  });
}

export function normalizeSiteStorage(value) {
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid site storage");
  if (typeof value.origin !== "string") throw new Error("Invalid site storage origin");
  let origin;
  try { origin = new URL(value.origin); } catch { throw new Error("Invalid site storage origin"); }
  if (!/^https?:$/.test(origin.protocol) || origin.origin !== value.origin) throw new Error("Invalid site storage origin");
  return {
    origin: value.origin,
    localStorage: normalizeEntries(value.localStorage ?? [], "localStorage"),
    sessionStorage: normalizeEntries(value.sessionStorage ?? [], "sessionStorage"),
  };
}

export async function captureSiteStorage(tabId, pageUrl) {
  const expectedOrigin = new URL(pageUrl).origin;
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: () => {
      const entries = (storage) => {
        const result = [];
        for (let index = 0; index < storage.length; index += 1) {
          const key = storage.key(index);
          if (key !== null) result.push([key, storage.getItem(key) ?? ""]);
        }
        return result;
      };
      return { origin: location.origin, localStorage: entries(localStorage), sessionStorage: entries(sessionStorage) };
    },
  });
  if (!injection?.result) throw new Error("Could not read this site's local state");
  const siteStorage = normalizeSiteStorage(injection.result);
  if (siteStorage.origin !== expectedOrigin) throw new Error("The page changed while its local state was being saved");
  return siteStorage;
}

export async function replaceSiteStorage(tabId, pageUrl, siteStorage) {
  const expectedOrigin = new URL(pageUrl).origin;
  // Cookie-only buckets predate site storage. Clear current state for them so it
  // cannot keep the account that was active before the Cookie switch.
  const normalized = siteStorage
    ? normalizeSiteStorage(siteStorage)
    : { origin: expectedOrigin, localStorage: [], sessionStorage: [] };
  if (normalized.origin !== expectedOrigin) throw new Error("Saved local state belongs to a different website");
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    args: [normalized],
    func: (state) => {
      if (location.origin !== state.origin) throw new Error("The page changed while its local state was being restored");
      localStorage.clear();
      sessionStorage.clear();
      for (const [key, value] of state.localStorage) localStorage.setItem(key, value);
      for (const [key, value] of state.sessionStorage) sessionStorage.setItem(key, value);
      return true;
    },
  });
  if (injection?.result !== true) throw new Error("Could not restore this site's local state");
}
