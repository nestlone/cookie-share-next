import { createEncryptedBucket, encryptWithKey, unlockEncryptedBucket } from "./envelope.js";

const entries = new Map();

export function hasBucketKey(bucketId) {
  return entries.has(bucketId);
}

export function clearBucketKey(bucketId) {
  entries.delete(bucketId);
}

export function clearKeyring() {
  entries.clear();
}

export async function createAndUnlockBucket(bucketId, password, plaintext) {
  const { envelope, key, salt } = await createEncryptedBucket(password, plaintext);
  entries.set(bucketId, { key, salt });
  return envelope;
}

export async function unlockBucket(bucketId, password, envelope) {
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
