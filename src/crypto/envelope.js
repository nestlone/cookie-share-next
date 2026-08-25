import {
  AES_KEY_LENGTH,
  AUTH_TAG_LENGTH,
  ENVELOPE_VERSION,
  LEGACY_ENVELOPE_VERSION,
  LEGACY_PBKDF2_ITERATIONS,
  IV_LENGTH,
  PBKDF2_ITERATIONS,
  SALT_LENGTH,
} from "../shared/constants.js";
import { decodeBase64Url, encodeBase64Url } from "./base64url.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function isEnvelope(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const { version, salt, iv, payload } = value;
  if ((version !== ENVELOPE_VERSION && version !== LEGACY_ENVELOPE_VERSION) || typeof salt !== "string" || typeof iv !== "string" || typeof payload !== "string") {
    return false;
  }

  try {
    return (
      decodeBase64Url(salt).length === SALT_LENGTH &&
      decodeBase64Url(iv).length === IV_LENGTH &&
      decodeBase64Url(payload).length >= AUTH_TAG_LENGTH
    );
  } catch {
    return false;
  }
}

export async function deriveBucketKey(password, salt, iterations = PBKDF2_ITERATIONS) {
  if (typeof password !== "string" || password.length === 0) {
    throw new Error("Bucket password is required");
  }
  if (!(salt instanceof Uint8Array) || salt.length !== SALT_LENGTH) {
    throw new Error("Invalid encryption salt");
  }
  if (!Number.isInteger(iterations) || (iterations !== LEGACY_PBKDF2_ITERATIONS && iterations < PBKDF2_ITERATIONS)) {
    throw new Error(`PBKDF2 iterations must be ${LEGACY_PBKDF2_ITERATIONS} or at least ${PBKDF2_ITERATIONS}`);
  }

  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return await crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    { name: "AES-GCM", length: AES_KEY_LENGTH },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptWithKey(key, salt, plaintext, version = ENVELOPE_VERSION) {
  if (!(salt instanceof Uint8Array) || salt.length !== SALT_LENGTH) {
    throw new Error("Invalid encryption salt");
  }

  const iv = randomBytes(IV_LENGTH);
  const bytes = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(JSON.stringify(plaintext)),
  );
  return {
    version,
    salt: encodeBase64Url(salt),
    iv: encodeBase64Url(iv),
    payload: encodeBase64Url(new Uint8Array(bytes)),
  };
}

export async function createEncryptedBucket(password, plaintext, iterations = PBKDF2_ITERATIONS) {
  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveBucketKey(password, salt, iterations);
  const envelope = await encryptWithKey(key, salt, plaintext, iterations === LEGACY_PBKDF2_ITERATIONS ? LEGACY_ENVELOPE_VERSION : ENVELOPE_VERSION);
  return { envelope, key, salt };
}

export async function unlockEncryptedBucket(password, envelope) {
  if (!isEnvelope(envelope)) {
    throw new Error("Invalid encrypted bucket");
  }

  const salt = decodeBase64Url(envelope.salt);
  const iv = decodeBase64Url(envelope.iv);
  const payload = decodeBase64Url(envelope.payload);
  const iterations = envelope.version === LEGACY_ENVELOPE_VERSION ? LEGACY_PBKDF2_ITERATIONS : PBKDF2_ITERATIONS;
  const key = await deriveBucketKey(password, salt, iterations);

  try {
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, payload);
    return { key, salt, plaintext: JSON.parse(decoder.decode(plaintext)) };
  } catch {
    throw new Error("Invalid bucket password or corrupted bucket");
  }
}

export async function encryptEnvelope(password, plaintext, iterations = PBKDF2_ITERATIONS) {
  return (await createEncryptedBucket(password, plaintext, iterations)).envelope;
}

export async function decryptEnvelope(password, envelope) {
  return (await unlockEncryptedBucket(password, envelope)).plaintext;
}
