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
import { createBucketDocument, validateBucketDocument, withCookies } from "../bucket/model.js";
import { captureActiveTab } from "../cookies/capture.js";
import { applyCookies } from "../cookies/apply.js";
import { createBucketFile, parseBucketFile } from "../crypto/bucket-file.js";
import {
  clearBucketKey,
  clearKeyring,
  createAndUnlockBucket,
  encryptUnlockedBucket,
  unlockBucket,
} from "../crypto/keyring.js";
import { createBucketId } from "../shared/id.js";
import { clearSession, getSettings, saveSession } from "../store/settings.js";

const openDocuments = new Map();

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
  clearKeyring();
  openDocuments.clear();
  return response;
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
        clearKeyring();
        openDocuments.clear();
      }
      return null;
    }

    case "auth:status": {
      const settings = await requireSession();
      return await getMe(settings.serverUrl, settings.token);
    }

    case "bucket:list": {
      const settings = await requireSession();
      return await listBuckets(settings.serverUrl, settings.token);
    }

    case "bucket:create": {
      const settings = await requireSession();
      const id = createBucketId();
      const document = createBucketDocument(id, message.name);
      const envelope = await createAndUnlockBucket(id, message.password, document);
      try {
        const bucket = await createBucket(settings.serverUrl, settings.token, id, envelope);
        openDocuments.set(id, document);
        return { bucket, document };
      } catch (error) {
        clearBucketKey(id);
        throw error;
      }
    }

    case "bucket:open": {
      const settings = await requireSession();
      const bucket = await getBucket(settings.serverUrl, settings.token, message.id);
      const document = validateBucketDocument(
        await unlockBucket(message.id, message.password, bucket.envelope),
        message.id,
      );
      openDocuments.set(message.id, document);
      return { bucket, document };
    }

    case "bucket:current":
      return { document: getOpenDocument(message.id) };

    case "bucket:save": {
      const settings = await requireSession();
      const document = validateBucketDocument(message.document, message.id);
      return await saveOpenDocument(settings, document);
    }

    case "bucket:capture": {
      const settings = await requireSession();
      const document = withCookies(getOpenDocument(message.id), await captureActiveTab());
      return await saveOpenDocument(settings, document);
    }

    case "bucket:apply": {
      const document = getOpenDocument(message.id);
      return { applied: await applyCookies(document.cookies) };
    }

    case "bucket:delete": {
      const settings = await requireSession();
      await deleteBucket(settings.serverUrl, settings.token, message.id);
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
      const imported = await unlockBucket("import-preview", message.password, file.envelope);
      const source = validateBucketDocument(imported, imported.bucketId);
      clearBucketKey("import-preview");

      const id = createBucketId();
      const document = {
        ...createBucketDocument(id, message.name || source.name, source.cookies),
        createdAt: source.createdAt,
      };
      const envelope = await createAndUnlockBucket(id, message.password, document);
      try {
        const bucket = await createBucket(settings.serverUrl, settings.token, id, envelope);
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: errorMessage(error) }));
  return true;
});
