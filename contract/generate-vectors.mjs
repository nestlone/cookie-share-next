// Generates contract/vectors.json — the shared protocol fixtures that both the
// server suite and the extension crypto suite must satisfy. Run with:
//   node contract/generate-vectors.mjs
// Regenerate only when the protocol changes (envelope format, PBKDF2 params,
// validation rules). The envelope uses a FIXED salt + IV so the output is
// deterministic and reproducible byte-for-byte.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ENCRYPTION_VERSION = 1;
const PBKDF2_ITERATIONS = 100000;
const AES_KEY_LENGTH = 256;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const encoder = new TextEncoder();

function base64UrlEncode(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

function fixedBytes(length, start) {
  return Uint8Array.from({ length }, (_, i) => (start + i) % 256);
}

async function deriveAesKey(password, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return await crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    keyMaterial,
    { name: "AES-GCM", length: AES_KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptEnvelope(password, plaintext) {
  const salt = fixedBytes(SALT_LENGTH, 0x11);
  const iv = fixedBytes(IV_LENGTH, 0x41);
  const key = await deriveAesKey(password, salt);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoder.encode(JSON.stringify(plaintext))
    )
  );
  return {
    version: ENCRYPTION_VERSION,
    salt: base64UrlEncode(salt),
    iv: base64UrlEncode(iv),
    payload: base64UrlEncode(ciphertext),
  };
}

const bucketPassword = "vector-bucket-password";

// A normal bucket plaintext: cookie shape matches the normalized shape the
// client stores (already normalized — server never sees it, only the client
// round-trips it).
const bucketPlaintext = {
  v: 1,
  bucketId: "vectorBucket1",
  name: "Vector Bucket",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  cookies: [
    {
      domain: "example.com",
      expirationDate: 1893456000,
      hostOnly: false,
      httpOnly: true,
      name: "session",
      path: "/",
      sameSite: "lax",
      secure: true,
      session: false,
      storeId: null,
      value: "token-value",
    },
  ],
};

const vectors = {
  description:
    "Shared protocol fixtures for cookie-share-next. Both the server suite and the extension crypto suite must pass every case. Regenerate with: node contract/generate-vectors.mjs",
  version: 1,
  iterations: PBKDF2_ITERATIONS,
  password: bucketPassword,
  bucket: {
    envelope: await encryptEnvelope(bucketPassword, bucketPlaintext),
    plaintext: bucketPlaintext,
  },
  bucketFile: {
    format: "cookie-share-next/bucket",
    version: 1,
    exportedAt: "2026-01-01T00:00:00.000Z",
    envelope: await encryptEnvelope(bucketPassword, bucketPlaintext),
  },
  invalidEnvelopes: [
    {},
    { version: 2, salt: "AAAA", iv: "AAAA", payload: "AAAA" },
    { version: 1, salt: "AAAA", iv: "AAAA" },
    { version: 1, salt: 1, iv: "AAAA", payload: "AAAA" },
    "not-an-object",
  ],
  ids: {
    valid: ["a", "ABC123xyz", "Z".repeat(64)],
    invalid: ["", "bad-id!", "with space", "a".repeat(65), "under_score"],
  },
  usernames: {
    valid: ["alice", "alice_01", "a-b.c", "x".repeat(32)],
    invalid: ["", "ab", "a".repeat(33), "has space", "has@symbol", "中文"],
  },
  passwords: {
    valid: ["12345678", "x".repeat(100), "with space"],
    invalid: ["", "short", "1234567"],
  },
};

const outPath = join(dirname(fileURLToPath(import.meta.url)), "vectors.json");
writeFileSync(outPath, JSON.stringify(vectors, null, 2) + "\n");
console.log(`Wrote ${outPath}`);
