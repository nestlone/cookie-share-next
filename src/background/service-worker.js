import {
  createBucket,
  deleteBucket,
  getBucket,
  getMe,
  listBuckets,
  logout,
  exchangeOAuth,
  getProviders,
  startOAuth,
  unlinkOAuth,
  updateBucket,
} from "../api/endpoints.js";
import { ApiError } from "../api/client.js";
import { createBucketDocument, validateBucketDocument, withCookies } from "../bucket/model.js";
import { activeSiteContext, captureActiveTab } from "../cookies/capture.js";
import { applyCookies, replaceCookiesForUrl } from "../cookies/apply.js";
import { createBucketFile, parseBucketFile } from "../crypto/bucket-file.js";
import {
  clearBucketKey,
  clearKeyring,
  createAndUnlockBucket,
  encryptUnlockedBucket,
  hasVaultPassword,
  lockVault,
  unlockVault,
  unlockBucket,
  unlockBucketWithPassword,
} from "../crypto/keyring.js";
import { createBucketId } from "../shared/id.js";
import { clearSession, getSettings, saveSession } from "../store/settings.js";

const openDocuments = new Map();
const DIRECTORY_BUCKET_ID = "vaultindex";

function emptyDirectory() {
  return { v: 1, type: "bucket-index", buckets: {} };
}

function directoryEntry(document) {
  return { name: document.name, updatedAt: document.updatedAt, sites: Array.isArray(document.sites) ? document.sites : [] };
}

function validateDirectory(value) {
  if (!value || typeof value !== "object" || value.v !== 1 || value.type !== "bucket-index" || !value.buckets || typeof value.buckets !== "object" || Array.isArray(value.buckets)) throw new Error("Invalid encrypted bucket directory");
  return value;
}

async function loadDirectory(settings) {
  try {
    const bucket = await getBucket(settings.serverUrl, settings.token, DIRECTORY_BUCKET_ID);
    return validateDirectory(await unlockBucket(DIRECTORY_BUCKET_ID, bucket.envelope));
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) throw error;
    const directory = emptyDirectory();
    await createBucket(settings.serverUrl, settings.token, DIRECTORY_BUCKET_ID, await createAndUnlockBucket(DIRECTORY_BUCKET_ID, directory));
    return directory;
  }
}

async function saveDirectory(settings, directory) {
  await updateBucket(settings.serverUrl, settings.token, DIRECTORY_BUCKET_ID, await encryptUnlockedBucket(DIRECTORY_BUCKET_ID, directory));
}

async function addDirectoryEntry(settings, document) {
  const directory = await loadDirectory(settings);
  directory.buckets[document.bucketId] = directoryEntry(document);
  await saveDirectory(settings, directory);
}

async function hydrateDirectory(settings, summaries, directory) {
  if (Object.keys(directory.buckets).length > 0 || summaries.length === 0) return directory;
  for (const summary of summaries) {
    try {
      const bucket = await getBucket(settings.serverUrl, settings.token, summary.id);
      const document = validateBucketDocument(await unlockBucket(summary.id, bucket.envelope), summary.id);
      directory.buckets[summary.id] = directoryEntry(document);
    } catch {
      // Older individually-password-protected buckets remain unnamed until migrated on open.
    }
  }
  await saveDirectory(settings, directory);
  return directory;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : "Unexpected error";
}

async function requireSession() {
  const settings = await getSettings();
  if (!settings.serverUrl || !settings.token) {
    throw new Error("Sign in first");
  }
  return settings;
}

function getOpenDocument(id) {
  const document = openDocuments.get(id);
  if (!document) {
    throw new Error("Open and unlock this bucket first");
  }
  return document;
}

async function saveOpenDocument(settings, document) {
  const envelope = await encryptUnlockedBucket(document.bucketId, document);
  const result = await updateBucket(settings.serverUrl, settings.token, document.bucketId, envelope);
  openDocuments.set(document.bucketId, document);
  return { bucket: result, document };
}

async function signIn(serverUrl, provider, mode = "login") {
  const redirectUri = chrome.identity.getRedirectURL();
  const settings = await getSettings();
  const started = await startOAuth(serverUrl, provider, mode, redirectUri, mode === "link" ? settings.token : undefined);
  const resultUrl = await chrome.identity.launchWebAuthFlow({ url: started.authorizeUrl, interactive: true });
  const result = new URL(resultUrl);
  const error = result.searchParams.get("error");
  if (error) throw new Error(`OAuth sign-in failed: ${error}`);
  if (mode === "link") return { linked: result.searchParams.get("linked") === "1" };
  const code = result.searchParams.get("code");
  if (!code) throw new Error("OAuth sign-in did not return an exchange code");
  const response = await exchangeOAuth(serverUrl, code);
  await saveSession({ serverUrl, displayName: response.user.displayName, token: response.token });
  await clearKeyring();
  openDocuments.clear();
  return response;
}

async function currentSite() {
  const context = await activeSiteContext();
  if (context.hostname === "github.com") {
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: context.tabId },
        func: () => document.querySelector('meta[name="user-login"]')?.getAttribute("content") || "",
      });
      if (typeof result?.result === "string" && result.result) context.accountName = result.result;
    } catch {
      // The generic site flow remains available when a page blocks script injection.
    }
  }
  return context;
}

async function openBucket(settings, id, legacyPassword) {
  const bucket = await getBucket(settings.serverUrl, settings.token, id);
  let plaintext;
  try {
    plaintext = await unlockBucket(id, bucket.envelope);
  } catch (error) {
    if (typeof legacyPassword !== "string" || !legacyPassword) throw error;
    plaintext = await unlockBucketWithPassword(id, legacyPassword, bucket.envelope);
    const migrated = validateBucketDocument(plaintext, id);
    await createAndUnlockBucket(id, migrated);
    await updateBucket(settings.serverUrl, settings.token, id, await encryptUnlockedBucket(id, migrated));
    plaintext = migrated;
  }
  const document = validateBucketDocument(plaintext, id);
  openDocuments.set(id, document);
  return { bucket, document };
}

async function handleMessage(message) {
  switch (message.action) {
    case "auth:providers":
      return await getProviders(message.serverUrl);

    case "auth:oauth":
      return await signIn(message.serverUrl, message.provider);

    case "auth:link": {
      const settings = await requireSession();
      return await signIn(settings.serverUrl, message.provider, "link");
    }

    case "auth:unlink": {
      const settings = await requireSession();
      return await unlinkOAuth(settings.serverUrl, settings.token, message.provider);
    }

    case "auth:logout": {
      const settings = await getSettings();
      try {
        if (settings.serverUrl && settings.token) {
          await logout(settings.serverUrl, settings.token);
        }
      } finally {
        await clearSession();
        await clearKeyring();
        openDocuments.clear();
      }
      return null;
    }

    case "auth:status": {
      const settings = await requireSession();
      return await getMe(settings.serverUrl, settings.token);
    }

    case "vault:status":
      return { unlocked: await hasVaultPassword() };

    case "vault:unlock":
      await unlockVault(message.password);
      return { unlocked: true };

    case "vault:lock":
      await lockVault();
      openDocuments.clear();
      return { unlocked: false };

    case "site:context":
      return await currentSite();

    case "bucket:list": {
      const settings = await requireSession();
      const response = await listBuckets(settings.serverUrl, settings.token);
      const buckets = response.buckets.filter((bucket) => bucket.id !== DIRECTORY_BUCKET_ID);
      if (!await hasVaultPassword()) return { buckets };
      const directory = await hydrateDirectory(settings, buckets, await loadDirectory(settings));
      return { buckets: buckets.map((bucket) => ({ ...bucket, name: directory.buckets[bucket.id]?.name ?? bucket.id })) };
    }

    case "site:buckets": {
      const settings = await requireSession();
      const site = await currentSite();
      if (!await hasVaultPassword()) return { site, buckets: [], locked: true };
      const response = await listBuckets(settings.serverUrl, settings.token);
      const buckets = response.buckets.filter((bucket) => bucket.id !== DIRECTORY_BUCKET_ID);
      const directory = await hydrateDirectory(settings, buckets, await loadDirectory(settings));
      return { site, locked: false, buckets: buckets.filter((bucket) => directory.buckets[bucket.id]?.sites?.includes(site.hostname)).map((bucket) => ({ ...bucket, ...directory.buckets[bucket.id] })) };
    }

    case "site:save-current": {
      const settings = await requireSession();
      const site = await currentSite();
      const id = createBucketId();
      const name = typeof message.name === "string" && message.name.trim() ? message.name.trim() : site.accountName ? `${site.hostname} · ${site.accountName}` : site.hostname;
      const document = createBucketDocument(id, name, await captureActiveTab(), [site.hostname]);
      const envelope = await createAndUnlockBucket(id, document);
      const bucket = await createBucket(settings.serverUrl, settings.token, id, envelope);
      await addDirectoryEntry(settings, document);
      openDocuments.set(id, document);
      return { bucket, document, site };
    }

    case "site:switch": {
      const settings = await requireSession();
      const site = await currentSite();
      const { document } = await openBucket(settings, message.id, message.legacyPassword);
      if (!document.sites.includes(site.hostname)) throw new Error("This account is not saved for the current website");
      const applied = await replaceCookiesForUrl(site.url, document.cookies);
      await chrome.tabs.reload(site.tabId);
      return { applied, document, site };
    }

    case "bucket:create": {
      const settings = await requireSession();
      const id = createBucketId();
      const document = createBucketDocument(id, message.name);
      const envelope = await createAndUnlockBucket(id, document);
      try {
        const bucket = await createBucket(settings.serverUrl, settings.token, id, envelope);
        await addDirectoryEntry(settings, document);
        openDocuments.set(id, document);
        return { bucket, document };
      } catch (error) {
        clearBucketKey(id);
        throw error;
      }
    }

    case "bucket:open": {
      const settings = await requireSession();
      return await openBucket(settings, message.id, message.legacyPassword);
    }

    case "bucket:current":
      return { document: getOpenDocument(message.id) };

    case "bucket:save": {
      const settings = await requireSession();
      const document = validateBucketDocument(message.document, message.id);
      const result = await saveOpenDocument(settings, document);
      await addDirectoryEntry(settings, document);
      return result;
    }

    case "bucket:capture": {
      const settings = await requireSession();
      const site = await currentSite();
      const document = withCookies(getOpenDocument(message.id), await captureActiveTab(), [site.hostname]);
      return await saveOpenDocument(settings, document);
    }

    case "bucket:apply": {
      const document = getOpenDocument(message.id);
      return { applied: await applyCookies(document.cookies) };
    }

    case "bucket:delete": {
      const settings = await requireSession();
      await deleteBucket(settings.serverUrl, settings.token, message.id);
      if (await hasVaultPassword()) {
        const directory = await loadDirectory(settings);
        delete directory.buckets[message.id];
        await saveDirectory(settings, directory);
      }
      clearBucketKey(message.id);
      openDocuments.delete(message.id);
      return null;
    }

    case "bucket:export": {
      const settings = await requireSession();
      const bucket = await getBucket(settings.serverUrl, settings.token, message.id);
      return {
        content: JSON.stringify(createBucketFile(bucket.envelope), null, 2),
        filename: `${message.id}.csn-bucket.json`,
      };
    }

    case "bucket:import": {
      const settings = await requireSession();
      if (typeof message.content !== "string") {
        throw new Error("Select a bucket file first");
      }
      let parsed;
      try {
        parsed = JSON.parse(message.content);
      } catch {
        throw new Error("Invalid bucket file");
      }
      const file = parseBucketFile(parsed);
      const imported = await unlockBucketWithPassword("import-preview", message.password, file.envelope);
      const source = validateBucketDocument(imported, imported.bucketId);
      clearBucketKey("import-preview");

      const id = createBucketId();
      const document = {
        ...createBucketDocument(id, message.name || source.name, source.cookies),
        createdAt: source.createdAt,
      };
      const envelope = await createAndUnlockBucket(id, document);
      try {
        const bucket = await createBucket(settings.serverUrl, settings.token, id, envelope);
        await addDirectoryEntry(settings, document);
        openDocuments.set(id, document);
        return { bucket, document };
      } catch (error) {
        clearBucketKey(id);
        throw error;
      }
    }

    default:
      throw new Error("Unknown extension action");
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) {
    sendResponse({ ok: false, error: "Unauthorized extension sender" });
    return false;
  }
  handleMessage(message)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: errorMessage(error) }));
  return true;
});
