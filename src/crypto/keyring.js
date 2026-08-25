import { createEncryptedBucket, encryptWithKey, unlockEncryptedBucket } from "./envelope.js";

const entries = new Map();
const VAULT_SESSION_KEY = "cookieShareNextVaultPassword";
let memoryVaultPassword = null;

function hasSessionStorage() {
  return typeof chrome !== "undefined" && Boolean(chrome.storage?.session);
}

export async function hasVaultPassword() {
  if (!hasSessionStorage()) return Boolean(memoryVaultPassword);
  const result = await chrome.storage.session.get(VAULT_SESSION_KEY);
  return typeof result[VAULT_SESSION_KEY] === "string" && result[VAULT_SESSION_KEY].length > 0;
}

export async function unlockVault(password) {
  if (typeof password !== "string" || password.length === 0) throw new Error("Vault password is required");
  if (!hasSessionStorage()) { memoryVaultPassword = password; return; }
  await chrome.storage.session.set({ [VAULT_SESSION_KEY]: password });
}

export async function lockVault() {
  entries.clear();
  memoryVaultPassword = null;
  if (!hasSessionStorage()) return;
  await chrome.storage.session.remove(VAULT_SESSION_KEY);
}

async function vaultPassword() {
  if (!hasSessionStorage()) {
    if (!memoryVaultPassword) throw new Error("Unlock the cookie vault first");
    return memoryVaultPassword;
  }
  const result = await chrome.storage.session.get(VAULT_SESSION_KEY);
  if (typeof result[VAULT_SESSION_KEY] !== "string" || !result[VAULT_SESSION_KEY]) {
    throw new Error("Unlock the cookie vault first");
  }
  return result[VAULT_SESSION_KEY];
}

export function hasBucketKey(bucketId) {
  return entries.has(bucketId);
}

export function clearBucketKey(bucketId) {
  entries.delete(bucketId);
}

export async function clearKeyring() {
  await lockVault();
}

export async function createAndUnlockBucket(bucketId, plaintextOrPassword, legacyPlaintext) {
  const password = legacyPlaintext === undefined ? await vaultPassword() : plaintextOrPassword;
  const plaintext = legacyPlaintext === undefined ? plaintextOrPassword : legacyPlaintext;
  const { envelope, key, salt } = await createEncryptedBucket(password, plaintext);
  entries.set(bucketId, { key, salt });
  return envelope;
}

export async function unlockBucket(bucketId, envelopeOrPassword, legacyEnvelope) {
  if (legacyEnvelope !== undefined) return await unlockBucketWithPassword(bucketId, envelopeOrPassword, legacyEnvelope);
  return await unlockBucketWithPassword(bucketId, await vaultPassword(), envelopeOrPassword);
}

export async function unlockBucketWithPassword(bucketId, password, envelope) {
  const { key, salt, plaintext } = await unlockEncryptedBucket(password, envelope);
  entries.set(bucketId, { key, salt });
  return plaintext;
}

export async function encryptUnlockedBucket(bucketId, plaintext) {
  const entry = entries.get(bucketId);
  if (!entry) {
    throw new Error("Bucket is locked");
  }
  return await encryptWithKey(entry.key, entry.salt, plaintext);
}
