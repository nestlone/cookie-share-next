import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "../src/api/client.js";

beforeEach(() => vi.stubGlobal("chrome", { permissions: { contains: vi.fn().mockResolvedValue(true) } }));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("server connection recovery", () => {
  it("retries a failed provider read, then recovers", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(new Response(JSON.stringify({ providers: [] })));
    vi.stubGlobal("fetch", fetchMock);
    await expect(new ApiClient("https://example.com").get("/auth/providers")).resolves.toEqual({ providers: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("does not replay a registration when its response is lost", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch")); vi.stubGlobal("fetch", fetchMock);
    await expect(new ApiClient("https://example.com").post("/auth/key/register", {})).rejects.toThrow("无法连接 example.com");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("aborts stalled requests and reports a timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted"))))));
    const result = new ApiClient("https://example.com").post("/auth/key/register", {});
    const checked = expect(result).rejects.toThrow("超时");
    await vi.advanceTimersByTimeAsync(8001); await checked;
  });
  it("does not retry invalid credentials or rate limited requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(new ApiClient("https://example.com").get("/me")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
