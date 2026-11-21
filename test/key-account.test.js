import { afterEach, describe, expect, it, vi } from "vitest";
import { registerKeyAccount } from "../src/api/endpoints.js";
import { ApiClient } from "../src/api/client.js";

afterEach(() => vi.unstubAllGlobals());

describe("key account API", () => {
  it("registers directly without an OAuth token", async () => {
    vi.stubGlobal("chrome", { permissions: { contains: vi.fn().mockResolvedValue(true) } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ key: "new-key", token: "session", user: { providers: [] } }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await registerKeyAccount("https://example.com")).key).toBe("new-key");
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.com/api/v1/auth/key/register");
    expect(request.method).toBe("POST");
    expect(request.headers.has("Authorization")).toBe(false);
  });

  it("shows the retry delay for rate limited requests", async () => {
    vi.stubGlobal("chrome", { permissions: { contains: vi.fn().mockResolvedValue(true) } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Too many attempts", retryAfter: 27 }), { status: 429 })));
    await expect(new ApiClient("https://example.com").post("/auth/key/register", {})).rejects.toThrow("27 秒后重试");
  });
});
