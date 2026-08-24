import { BUCKET_ID_PATTERN } from "./constants.js";

export function createBucketId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isBucketId(value) {
  return typeof value === "string" && BUCKET_ID_PATTERN.test(value);
}
