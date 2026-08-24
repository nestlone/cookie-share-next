import { ApiClient } from "./client.js";

function client(serverUrl, token) { return new ApiClient(serverUrl, token); }

export async function getProviders(serverUrl) { return await client(serverUrl).get("/auth/providers"); }
export async function startOAuth(serverUrl, provider, mode, redirectUri, token) { return await client(serverUrl, token).post(`/auth/oauth/${encodeURIComponent(provider)}/start`, { mode, redirectUri }); }
export async function exchangeOAuth(serverUrl, code) { return await client(serverUrl).post("/auth/oauth/exchange", { code }); }
export async function unlinkOAuth(serverUrl, token, provider) { return await client(serverUrl, token).delete(`/auth/oauth/${encodeURIComponent(provider)}`); }
export async function logout(serverUrl, token) { return await client(serverUrl, token).post("/auth/logout", {}); }
export async function getMe(serverUrl, token) { return await client(serverUrl, token).get("/me"); }
export async function listBuckets(serverUrl, token) { return await client(serverUrl, token).get("/buckets"); }
export async function getBucket(serverUrl, token, id) { return await client(serverUrl, token).get(`/buckets/${encodeURIComponent(id)}`); }
export async function createBucket(serverUrl, token, id, envelope) { return await client(serverUrl, token).post("/buckets", { id, envelope }); }
export async function updateBucket(serverUrl, token, id, envelope) { return await client(serverUrl, token).put(`/buckets/${encodeURIComponent(id)}`, { envelope }); }
export async function deleteBucket(serverUrl, token, id) { return await client(serverUrl, token).delete(`/buckets/${encodeURIComponent(id)}`); }
