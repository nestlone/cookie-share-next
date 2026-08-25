import { normalizeCookies } from "../cookies/normalize.js";
import { isBucketId } from "../shared/id.js";

function timestamp() {
  return new Date().toISOString();
}

function normalizeSites(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((site) => typeof site === "string" && /^[a-z0-9.-]+$/i.test(site)).map((site) => site.toLowerCase()))];
}

export function createBucketDocument(bucketId, name, cookies = [], sites = []) {
  if (!isBucketId(bucketId)) {
    throw new Error("Invalid bucket ID");
  }
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("Bucket name is required");
  }
  const now = timestamp();
  return {
    v: 1,
    bucketId,
    name: name.trim(),
    createdAt: now,
    updatedAt: now,
    cookies: normalizeCookies(cookies),
    sites: normalizeSites(sites),
  };
}

export function validateBucketDocument(value, expectedId) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid decrypted bucket");
  }
  if (value.v !== 1 || !isBucketId(value.bucketId) || value.bucketId !== expectedId) {
    throw new Error("Bucket ID does not match encrypted content");
  }
  if (typeof value.name !== "string" || !value.name.trim() || !Array.isArray(value.cookies)) {
    throw new Error("Invalid decrypted bucket");
  }
  return {
    v: 1,
    bucketId: value.bucketId,
    name: value.name.trim(),
    createdAt: typeof value.createdAt === "string" ? value.createdAt : timestamp(),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : timestamp(),
    cookies: normalizeCookies(value.cookies),
    sites: normalizeSites(value.sites),
  };
}

export function withCookies(bucket, cookies, sites = bucket.sites) {
  return {
    ...bucket,
    updatedAt: timestamp(),
    cookies: normalizeCookies(cookies),
    sites: normalizeSites(sites),
  };
}
