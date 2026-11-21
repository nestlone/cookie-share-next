// Browser interaction checks use mocked extension APIs and an isolated Edge profile.
import { chromium, expect } from "@playwright/test";
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  if (!/^\/(src|icons)\//.test(pathname) || pathname.includes("..")) { response.writeHead(404).end(); return; }
  try {
    const content = await readFile(path.join(root, pathname));
    const types = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml", ".png": "image/png" };
    response.writeHead(200, { "Content-Type": types[path.extname(pathname)] || "application/octet-stream" }).end(content);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: "msedge", headless: true });
const failures = [];

async function pageFor(state = {}) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
  page.on("pageerror", error => failures.push(error.message));
  await page.addInitScript(({ base, version, state, optionalHosts }) => {
    const local = { cookieShareNextSettings: { serverUrl: "https://cookie.nestlone.com" } };
    const session = state.token ? { cookieShareNextSession: { token: "mock-session", displayName: "测试账户" } } : {};
    window.testState = { calls: [], opened: [], permissions: [], ...state };
    window.close = () => {};
    const storage = data => ({ get: async key => ({ [key]: data[key] }), set: async values => Object.assign(data, values), remove: async key => { delete data[key]; } });
    const providerList = [{ id: "github", name: "GitHub" }, { id: "linuxdo", name: "LinuxDo" }];
    const profile = () => ({ user: { id: 1, displayName: "测试账户", hasLoginKey: state.hasLoginKey ?? true, providers: state.providers ?? [], quotaBytes: 10485760 }, usage: { usedBytes: 1024, todayRequests: 3, todayRequestsLimit: 1000 } });
    const api = {
      storage: { local: storage(local), session: storage(session) },
      permissions: { contains: async () => true, request: async ({ origins }) => {
        for (const origin of origins) {
          if (!optionalHosts.includes(`${origin.split("://")[0]}://*/*`)) {
            throw new Error("Only permissions specified in the manifest may be requested.");
          }
        }
        window.testState.permissions.push(origins);
        return !state.denyPermissions;
      } },
      tabs: { create: async value => window.testState.opened.push(value) },
      downloads: { download: async () => 1 },
      runtime: { getManifest: () => ({ version }), getURL: value => base + "/" + value, sendMessage: (message, callback) => {
        window.testState.calls.push(message);
        let data = null;
        if (message.action === "auth:providers") {
          if (window.testState.failProviders) { window.testState.failProviders = false; callback({ ok: false, error: "无法连接服务器，请重试。", status: 0 }); return; }
          data = { providers: providerList };
        }
        if (message.action === "auth:status") data = profile();
        if (message.action === "vault:status") data = { unlocked: true };
        if (message.action === "bucket:list") data = { buckets: [] };
        if (message.action === "site:buckets") {
          if (state.failSite) { callback({ ok: false, error: "网络连接中断", status: 0 }); return; }
          data = { site: { hostname: "example.com", url: "https://example.com/", tabId: 7 }, buckets: state.buckets ?? [], locked: false };
        }
        if (message.action === "site:switch") data = {};
        if (message.action === "auth:key:register" || message.action === "auth:backup-key:reset") data = { key: "K".repeat(43) };
        if (message.action === "auth:link" && state.linkConflict) { callback({ ok: false, error: "这个第三方账号已绑定到其他账户，不能重复绑定或合并。" }); return; }
        callback({ ok: true, data });
      } },
    };
    Object.assign(window.chrome ?? (window.chrome = {}), api);
    window.fetch = async () => new Response(JSON.stringify({ providers: providerList }), { headers: { "Content-Type": "application/json" } });
  }, { base, version: manifest.version, state, optionalHosts: manifest.optional_host_permissions });
  return page;
}

try {
  const login = await pageFor({ failProviders: true });
  await login.goto(base + "/src/popup/popup.html");
  await expect(login.getByRole("button", { name: "创建密钥账户", exact: true })).toBeVisible();
  await expect(login.locator('input[type="url"]')).toHaveCount(0);
  await expect(login.getByText(`Cookie Share Next v${manifest.version}`)).toBeVisible();
  await login.getByRole("button", { name: "重试连接" }).click();
  await expect(login.getByRole("button", { name: "使用 GitHub 登录" })).toBeVisible();
  await login.getByRole("button", { name: "创建密钥账户", exact: true }).click();
  expect(await login.evaluate(() => window.testState.opened[0].url)).toContain("key.html?mode=create");
  await login.screenshot({ path: path.join(root, "test-results/login.png"), fullPage: true });

  const key = await pageFor();
  await key.goto(base + "/src/options/key.html?mode=create&server=https%3A%2F%2Fcookie.nestlone.com");
  await expect(key.getByRole("heading", { name: "账户已创建，保存登录密钥" })).toBeVisible();
  await expect(key.getByRole("button", { name: "我已保存，前往设置" })).toBeDisabled();
  await key.getByRole("checkbox").check();
  await expect(key.getByRole("button", { name: "我已保存，前往设置" })).toBeEnabled();
  key.on("dialog", dialog => dialog.accept());
  await key.reload();
  await expect(key.getByRole("heading", { name: "密钥展示已结束" })).toBeVisible();
  expect(await key.evaluate(() => window.testState.calls.filter(call => call.action === "auth:key:register").length)).toBe(0);

  const security = await pageFor({ token: true, providers: [{ id: "github", login: "test-github" }], linkConflict: true });
  await security.goto(base + "/src/options/security.html");
  await expect(security.getByRole("button", { name: "绑定 LinuxDo" })).toBeVisible();
  await expect(security.getByRole("button", { name: "绑定 GitHub", exact: true })).toHaveCount(0);
  await security.getByRole("button", { name: "绑定 LinuxDo" }).click();
  await expect(security.getByRole("alert")).toContainText("不能重复绑定");
  await expect(security.getByRole("button", { name: "解绑", exact: true })).toBeEnabled();
  await security.screenshot({ path: path.join(root, "test-results/security.png"), fullPage: true });
  await security.getByRole("link", { name: "备份管理", exact: true }).click();
  await expect(security).toHaveURL(/backups\.html$/);
  await expect(security.getByRole("heading", { name: "导入账号备份" })).toBeVisible();

  const lastLogin = await pageFor({ token: true, hasLoginKey: false, providers: [{ id: "github", login: "only-login" }] });
  await lastLogin.goto(base + "/src/options/security.html");
  await expect(lastLogin.getByRole("button", { name: "解绑", exact: true })).toBeDisabled();
  await expect(lastLogin.getByRole("button", { name: "生成登录密钥" })).toBeVisible();

  const network = await pageFor({ token: true, failSite: true });
  await network.goto(base + "/src/popup/popup.html");
  await expect(network.getByText("你的登录会话仍被保留")).toBeVisible();
  await expect(network.getByRole("link", { name: "设置", exact: true })).toBeVisible();
  await expect(network.getByRole("button", { name: "使用密钥登录" })).toHaveCount(0);
  expect(await network.evaluate(() => window.testState.calls.some(call => call.action === "auth:session:clear"))).toBe(false);

  const accounts = await pageFor({ token: true, buckets: [{ id: "test-account", name: "测试账号", updatedAt: "2026-11-21T00:00:00Z" }] });
  await accounts.goto(base + "/src/popup/popup.html");
  await accounts.getByRole("button", { name: "保存当前账号", exact: true }).click();
  await expect(accounts.getByRole("alert")).toContainText("当前账号已加密保存");
  await accounts.getByRole("button", { name: "切换", exact: true }).click();
  await expect(accounts.getByRole("alert")).toContainText("网页正在刷新");
  expect(await accounts.evaluate(() => window.testState.permissions)).toEqual([
    ["https://*.example.com/*", "http://*.example.com/*"],
    ["https://*.example.com/*", "http://*.example.com/*"],
  ]);
  const denied = await pageFor({ token: true, denyPermissions: true });
  await denied.goto(base + "/src/popup/popup.html");
  await denied.getByRole("button", { name: "保存当前账号", exact: true }).click();
  await expect(denied.getByRole("alert")).toContainText("操作已取消");
  expect(await denied.evaluate(() => window.testState.calls.some(call => call.action === "site:save-current"))).toBe(false);

  const settings = await pageFor();
  await settings.goto(base + "/src/options/server.html");
  await expect(settings.getByRole("textbox", { name: "服务器地址" })).toBeVisible();
  await settings.getByRole("button", { name: "测试连接并保存" }).click();
  await expect(settings.getByRole("alert")).toContainText("连接正常");
  await settings.setViewportSize({ width: 390, height: 844 });
  expect(await settings.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(failures).toEqual([]);
  console.log("Browser UI: save/switch permission schemes and denial, login recovery, hidden server fields, one-time key page, separate settings, binding conflicts and session preservation passed (mocked extension APIs).");
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
