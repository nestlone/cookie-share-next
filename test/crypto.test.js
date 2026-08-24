import { readFileSync } from "node:fs";
import path from "node:path";
import { webcrypto } from "node:crypto";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { decodeBase64Url, encodeBase64Url } from "../src/crypto/base64url.js";
import { createBucketFile, parseBucketFile } from "../src/crypto/bucket-file.js";
import { decryptEnvelope, encryptEnvelope, unlockEncryptedBucket } from "../src/crypto/envelope.js";
import {
  clearKeyring,
  createAndUnlockBucket,
  encryptUnlockedBucket,
  unlockBucket,
} from "../src/crypto/keyring.js";
import { createBucketId, isBucketId } from "../src/shared/id.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const vectors = JSON.parse(
  readFileSync(path.resolve(dirname, "../contract/vectors.json"), "utf8"),
);

beforeAll(() => {
  if (!globalThis.crypto) {
    globalThis.crypto = webcrypto;
  }
});

describe("extension crypto contract", () => {
  it("decrypts the fixed shared contract vector", async () => {
    await expect(decryptEnvelope(vectors.password, vectors.bucket.envelope)).resolves.toEqual(vectors.bucket.plaintext);
  });

  it("rejects a wrong bucket password", async () => {
    await expect(decryptEnvelope("wrong-bucket-password", vectors.bucket.envelope)).rejects.toThrow(
      "Invalid bucket password or corrupted bucket",
    );
  });

  it("round-trips fresh encrypted envelopes", async () => {
    const plaintext = { v: 1, bucketId: "bucketOne", name: "Private", cookies: [] };
    const envelope = await encryptEnvelope("strong-bucket-password", plaintext);
    expect(envelope).toMatchObject({ version: 1 });
    await expect(decryptEnvelope("strong-bucket-password", envelope)).resolves.toEqual(plaintext);
  });

  it("re-encrypts an unlocked bucket without retaining its password", async () => {
    clearKeyring();
    const first = await createAndUnlockBucket("bucketOne", "strong-bucket-password", { version: 1 });
    const updated = await encryptUnlockedBucket("bucketOne", { version: 2 });
    expect(updated.salt).toBe(first.salt);
    const reopened = await unlockBucket("bucketOne", "strong-bucket-password", updated);
    expect(reopened).toEqual({ version: 2 });
  });

  it("validates bucket files and base64url", () => {
    const file = createBucketFile(vectors.bucket.envelope, vectors.bucketFile.exportedAt);
    expect(parseBucketFile(file)).toEqual(file);
    expect(() => parseBucketFile({ ...file, format: "wrong" })).toThrow("Invalid bucket file");

    const bytes = Uint8Array.from([0, 1, 2, 253, 254, 255]);
    expect(decodeBase64Url(encodeBase64Url(bytes))).toEqual(bytes);
  });

  it("generates valid, distinct bucket IDs", () => {
    const first = createBucketId();
    const second = createBucketId();
    expect(isBucketId(first)).toBe(true);
    expect(isBucketId(second)).toBe(true);
    expect(first).not.toBe(second);
  });
});
