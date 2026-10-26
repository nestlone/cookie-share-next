import { afterEach, describe, expect, it, vi } from "vitest";
import { missingOrigins, requestOrigins, restoreOrigins, serverOrigins, siteOrigins } from "../src/shared/permissions.js";
import { replaceCookiesForUrl } from "../src/cookies/apply.js";
import { captureForUrl } from "../src/cookies/capture.js";
import { ApiClient } from "../src/api/client.js";

afterEach(() => vi.unstubAllGlobals());

const cookie = { name: "session", value: "test", domain: "auth.example.com", path: "/", secure: true, httpOnly: true };

describe("optional host authorization", () => {
  it("limits website patterns to the selected hostname and its descendants", () => {
    expect(siteOrigins("https://app.example.co.uk/page")).toEqual(["*://*.app.example.co.uk/*"]);
    expect(siteOrigins("http://127.0.0.1:3000/")).toEqual(["*://127.0.0.1/*"]);
    expect(siteOrigins("http://[::1]:3000/")).toEqual(["*://[::1]/*"]);
    expect(() => siteOrigins("chrome://settings")).toThrow();
  });

  it("requests only the configured server host and rejects non-web addresses", () => {
    expect(serverOrigins("https://backend.example.com:8443/api")).toEqual(["https://backend.example.com/*"]);
    expect(() => serverOrigins("file:///tmp/server")).toThrow();
    expect(() => serverOrigins("https://user:password@example.com")).toThrow();
  });

  it("preflights every restored cookie host, including older multi-domain buckets", () => {
    expect(restoreOrigins("https://example.com", [cookie])).toEqual([
      "*://*.example.com/*", "https://auth.example.com/*",
    ]);
  });

  it("invokes the permission request synchronously and handles rejection", async () => {
    const request = vi.fn().mockResolvedValue(false);
    vi.stubGlobal("chrome", { permissions: { request } });
    const result = requestOrigins(["https://example.com/*"]);
    expect(request).toHaveBeenCalledOnce();
    await expect(result).rejects.toThrow("操作已取消");
  });

  it("returns revoked/missing hosts rather than requesting in the background", async () => {
    const contains = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    vi.stubGlobal("chrome", { permissions: { contains } });
    await expect(missingOrigins(["https://example.com/*", "https://other.example/*"]))
      .resolves.toEqual(["https://other.example/*"]);
  });

  it("does not read or clear cookies when access is absent or revoked", async () => {
    const getAll = vi.fn();
    const remove = vi.fn();
    const set = vi.fn();
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(false) },
      cookies: { getAll, remove, set },
    });
    await expect(captureForUrl("https://example.com", 1)).rejects.toThrow("尚未授权");
    await expect(replaceCookiesForUrl("https://example.com", [cookie])).rejects.toThrow("尚未授权");
    expect(getAll).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it("does not erase current cookies if one imported cookie host is unauthorized", async () => {
    const getAll = vi.fn();
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false) },
      cookies: { getAll },
    });
    await expect(replaceCookiesForUrl("https://example.com", [cookie])).rejects.toThrow("尚未授权");
    expect(getAll).not.toHaveBeenCalled();
  });

  it("does not contact an unauthorized self-hosted server", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("chrome", { permissions: { contains: vi.fn().mockResolvedValue(false) } });
    await expect(new ApiClient("https://backend.example.com").get("/auth/providers")).rejects.toThrow("尚未授权");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("can contact an authorized server with its service token", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "ok" })));
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("chrome", { permissions: { contains: vi.fn().mockResolvedValue(true) } });
    await expect(new ApiClient("https://backend.example.com", "test-service-token").get("/me"))
      .resolves.toEqual({ status: "ok" });
    expect(fetch.mock.calls[0][0]).toBe("https://backend.example.com/api/v1/me");
    expect(fetch.mock.calls[0][1].headers.get("Authorization")).toBe("Bearer test-service-token");
  });

  it("restores an account after every cookie host has been granted", async () => {
    const set = vi.fn().mockResolvedValue(cookie);
    const remove = vi.fn().mockResolvedValue({});
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      cookies: { getAll: vi.fn().mockResolvedValue([{ ...cookie, storeId: "0" }]), remove, set },
    });
    await expect(replaceCookiesForUrl("https://example.com", [cookie])).resolves.toBe(1);
    expect(remove).toHaveBeenCalledOnce();
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ url: "https://auth.example.com/", name: "session" }));
  });
});
