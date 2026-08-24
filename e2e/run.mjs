import { createRequire } from "node:module";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

const require = createRequire(import.meta.url);
const { createApp } = require("../../backend/dist/app.js");
const { openDatabase } = require("../../backend/dist/db.js");
const api = await import("../src/api/endpoints.js");
const { createBucketFile, parseBucketFile } = await import("../src/crypto/bucket-file.js");
const { decryptEnvelope, encryptEnvelope } = await import("../src/crypto/envelope.js");
const { createBucketId } = await import("../src/shared/id.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const config = {
  host: "127.0.0.1",
  port: 0,
  serverRoot: process.cwd(),
  dbPath: ":memory:",
  publicBaseUrl: "http://127.0.0.1:3000",
  adminToken: "e2e-admin-token",
  defaultQuotaBytes: 2048,
  defaultDailyRequestLimit: 100,
  sessionTtlHours: 24,
  bcryptRounds: 4,
  loginRateLimit: 100,
  loginRateWindowMin: 1,
  requestLogRetentionDays: 7,
  oauthProviders: [],
};
const fakeProvider = {
  id: "github",
  name: "GitHub",
  authorizeUrl({ redirectUri, state }) { return `${redirectUri}?state=${encodeURIComponent(state)}`; },
  async exchangeCode({ code }) { return { subject: `github-${code}`, login: code }; },
};

async function signIn(serverUrl, login) {
  const start = await api.startOAuth(serverUrl, "github", "login", "https://e2e.chromiumapp.org/");
  const callback = new URL(start.authorizeUrl);
  const response = await fetch(`${serverUrl}${callback.pathname}${callback.search}&code=${encodeURIComponent(login)}`, { redirect: "manual" });
  const destination = response.headers.get("location");
  const code = destination ? new URL(destination).searchParams.get("code") : null;
  assert(response.status === 302 && code, "OAuth callback must return a one-time exchange code");
  return await api.exchangeOAuth(serverUrl, code);
}

const db = openDatabase(":memory:");
const app = createApp(config, db, [fakeProvider]);
const server = app.listen(0, config.host);

try {
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  const serverUrl = `http://${config.host}:${port}`;
  const bucketPassword = "a-different-strong-bucket-password";
  const sourceId = createBucketId();
  const plaintext = {
    v: 1,
    bucketId: sourceId,
    name: "E2E Private Bucket",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    cookies: [{
      domain: "example.com",
      hostOnly: true,
      httpOnly: true,
      name: "session",
      path: "/",
      sameSite: "lax",
      secure: true,
      session: true,
      storeId: null,
      value: "secret-cookie-value",
    }],
  };

  const alice = await signIn(serverUrl, "alice");
  const firstEnvelope = await encryptEnvelope(bucketPassword, plaintext);
  await api.createBucket(serverUrl, alice.token, sourceId, firstEnvelope);

  const listed = await api.listBuckets(serverUrl, alice.token);
  assert(listed.buckets.length === 1, "Alice should have one bucket");
  assert(!Object.hasOwn(listed.buckets[0], "name"), "Bucket name must not be returned by the server");

  const stored = await api.getBucket(serverUrl, alice.token, sourceId);
  assert(JSON.stringify(await decryptEnvelope(bucketPassword, stored.envelope)) === JSON.stringify(plaintext), "Stored envelope must decrypt locally");

  const changed = { ...plaintext, updatedAt: new Date().toISOString(), cookies: [...plaintext.cookies, {
    domain: "example.org",
    hostOnly: true,
    httpOnly: false,
    name: "another",
    path: "/",
    sameSite: "strict",
    secure: true,
    session: true,
    storeId: null,
    value: "another-secret",
  }] };
  await api.updateBucket(serverUrl, alice.token, sourceId, await encryptEnvelope(bucketPassword, changed));

  const exported = createBucketFile((await api.getBucket(serverUrl, alice.token, sourceId)).envelope);
  const parsedFile = parseBucketFile(JSON.parse(JSON.stringify(exported)));
  const importedPlaintext = await decryptEnvelope(bucketPassword, parsedFile.envelope);
  assert(importedPlaintext.name === "E2E Private Bucket", "Exported file must remain client-decryptable");

  const bob = await signIn(serverUrl, "bob");
  const bobId = createBucketId();
  const bobPlaintext = { ...importedPlaintext, bucketId: bobId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await api.createBucket(serverUrl, bob.token, bobId, await encryptEnvelope(bucketPassword, bobPlaintext));
  const bobStored = await api.getBucket(serverUrl, bob.token, bobId);
  assert((await decryptEnvelope(bucketPassword, bobStored.envelope)).bucketId === bobId, "Imported bucket must decrypt for recipient");

  const oversizedId = createBucketId();
  const oversized = { ...plaintext, bucketId: oversizedId, cookies: [{ ...plaintext.cookies[0], value: "x".repeat(4096) }] };
  let quotaRejected = false;
  try {
    await api.createBucket(serverUrl, alice.token, oversizedId, await encryptEnvelope(bucketPassword, oversized));
  } catch (error) {
    quotaRejected = error?.status === 413;
  }
  assert(quotaRejected, "Server must reject bucket writes above quota");

  console.log("E2E passed: OAuth sign-in, create, list, decrypt, update, export, import, and quota enforcement.");
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  db.close();
}
