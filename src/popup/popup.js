import { getSettings } from "../store/settings.js";
import { requestOrigins, serverOrigins, siteOrigins } from "../shared/permissions.js";
import { el, button, send, version, settingsLink, dialog, unlockVault } from "../shared/ui.js";

const app = document.querySelector("#app");
const DEFAULT_SERVER = "https://cookie.nestlone.com";
let viewNotice, viewBusy = false;

function showError(error) {
  viewNotice.textContent = error.message;
  viewNotice.className = "notice notice--error";
  viewNotice.hidden = false;
}

function action(text, handler, busy = "处理中…", className = "") {
  return button(text, () => {
    if (viewBusy) return;
    viewBusy = true;
    viewNotice.hidden = true;
    try { return Promise.resolve(handler()).finally(() => { viewBusy = false; }); }
    catch (error) { viewBusy = false; throw error; }
  }, { busy, className, onError: showError });
}

function shell(title = "Cookie Share Next", subtitle = "安全保存，轻松切换", iconUrl) {
  viewNotice = el("div", { className: "notice", role: "alert", hidden: true });
  app.replaceChildren(el("header", { className: "app-header" }, [
    el("div", { className: "brand" }, [el("img", { src: iconUrl || "../../icons/icon-48.png", alt: "", className: "brand-mark" }), el("div", { className: "brand-copy" }, [el("h1", { text: title }), el("p", { text: subtitle })])]), settingsLink(),
  ]), viewNotice);
  return el("footer", { className: "popup-footer" }, [el("span", { text: `Cookie Share Next ${version()}` }), el("span", { text: "本地加密" })]);
}

function renderLogin(settings, expired = false) {
  const footer = shell();
  const serverUrl = settings.serverUrl || DEFAULT_SERVER;
  const key = el("input", { id: "login-key", type: "password", placeholder: "粘贴你的登录密钥", autocomplete: "off", spellcheck: false });
  const toggle = el("button", { type: "button", className: "secondary reveal", text: "显示", "aria-label": "显示登录密钥", onClick: () => { const hidden = key.type === "password"; key.type = hidden ? "text" : "password"; toggle.textContent = hidden ? "隐藏" : "显示"; } });
  const login = action("使用密钥登录", async () => {
    await requestOrigins(serverOrigins(serverUrl));
    if (!/^[A-Za-z0-9_-]{43}$/.test(key.value.trim())) throw new Error("请输入完整的 43 位登录密钥。");
    await send("auth:backup-key", { serverUrl, key: key.value.trim() });
    key.value = ""; await refresh();
  }, "登录中…");
  key.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); login.click(); } });
  const providers = el("div", { className: "provider-actions" });
  const connection = el("p", { className: "connection-state muted", role: "status", text: "正在连接登录服务…" });
  let loading = false;
  async function loadProviders() {
    if (loading) return;
    loading = true; providers.replaceChildren(); connection.textContent = "正在连接登录服务…";
    try {
      const result = await send("auth:providers", { serverUrl });
      connection.textContent = result.providers.length ? "也可以使用第三方账户" : "此服务器支持密钥登录";
      providers.replaceChildren(...result.providers.map(provider => action(`使用 ${provider.name} 登录`, async () => {
        await requestOrigins(serverOrigins(serverUrl)); await send("auth:oauth", { serverUrl, provider: provider.id }); await refresh();
      }, "等待授权…", "secondary")));
    } catch (error) {
      connection.textContent = error.message;
      providers.append(action("重试连接", async () => { await requestOrigins(serverOrigins(serverUrl)); await loadProviders(); }, "连接中…", "secondary"));
    } finally { loading = false; }
  }
  app.append(el("section", { className: "panel login-panel" }, [
    el("div", {}, [el("h2", { text: "登录你的账户" }), el("p", { className: "muted", text: "输入密钥，继续管理已保存的网站账号。" })]),
    el("label", { for: "login-key", text: "登录密钥" }), el("div", { className: "input-action" }, [key, toggle]), login,
    el("div", { className: "divider", text: "首次使用" }),
    action("创建密钥账户", async () => {
      await requestOrigins(serverOrigins(serverUrl));
      const page = new URL(chrome.runtime.getURL("src/options/key.html"));
      page.searchParams.set("mode", "create"); page.searchParams.set("server", serverUrl);
      await chrome.tabs.create({ url: page.href }); window.close();
    }, "打开安全页面…", "secondary"),
    el("p", { className: "muted", text: "无需第三方账户。创建后请在独立页面妥善保存密钥。" }),
  ]), el("section", { className: "provider-section", "aria-label": "第三方登录" }, [connection, providers]), footer);
  if (expired) showError(new Error("登录已过期，请重新登录。"));
  void loadProviders();
}

async function switchAccount(bucket, site) {
  const result = await send("site:switch", { id: bucket.id, tabId: site.tabId, url: site.url });
  if (result.permissionRequired?.length) {
    const footer = shell("授予网站访问权限", "授权后继续切换账号");
    app.append(el("section", { className: "panel" }, [el("p", { className: "muted", text: "此账号还包含以下网站的登录状态：" }), el("ul", { className: "permission-list" }, result.permissionRequired.map(origin => el("li", { text: origin }))),
      action("授权并继续切换", async () => { await requestOrigins(result.permissionRequired); await switchAccount(bucket, site); }, "切换中…"), action("返回", () => refresh(), "加载中…", "secondary"),
    ]), footer); return;
  }
  await refresh(); viewNotice.hidden = false; viewNotice.className = "notice"; viewNotice.textContent = `已应用“${bucket.name || "所选账号"}”的登录数据，网页正在刷新。`;
}

function accountRow(bucket, site) {
  const name = bucket.name || "未命名账号";
  const editor = el("details", { className: "account-editor" }, [el("summary", { text: "更多操作" }), el("div", { className: "actions" }, [
    action("重命名", async () => {
      const value = await dialog({ title: "重命名账号", label: "账号名称", value: name });
      if (!value?.trim() || !await unlockVault()) return;
      await send("bucket:rename", { id: bucket.id, name: value.trim() }); await refresh();
    }, "保存中…", "secondary compact"),
    action("删除", async () => {
      if (!await dialog({ title: "删除已保存账号？", description: `将删除“${name}”的已保存登录数据。`, confirmText: "删除", danger: true })) return;
      await send("bucket:delete", { id: bucket.id }); await refresh();
    }, "删除中…", "danger compact"),
  ])]);
  return el("article", { className: "account-row" }, [el("div", { className: "account-copy" }, [el("strong", { text: name, title: name }), el("span", { text: `更新于 ${new Date(bucket.updatedAt).toLocaleDateString()}` })]),
    action("切换", async () => { await requestOrigins(siteOrigins(site.url)); if (await unlockVault()) await switchAccount(bucket, site); }, "切换中…"), editor,
  ]);
}

function renderCurrent({ site, buckets, locked }, vault) {
  const footer = shell(site.hostname, site.accountName ? `识别为 ${site.accountName}` : "当前网站的已保存账号", site.favIconUrl);
  const list = el("section", { className: "account-list" });
  const search = el("input", { type: "search", placeholder: "搜索已保存账号", "aria-label": "搜索已保存账号" });
  const draw = () => {
    const filtered = buckets.filter(bucket => (bucket.name || bucket.id).toLowerCase().includes(search.value.toLowerCase()));
    list.replaceChildren(...filtered.map(bucket => accountRow(bucket, site)));
    if (!filtered.length) list.append(el("p", { className: "muted", text: "没有匹配的账号。" }));
  };
  search.addEventListener("input", draw);
  const suggested = site.accountName ? `${site.hostname} · ${site.accountName}` : site.hostname;
  app.append(el("div", { className: "toolbar" }, [el("span", { className: `status-chip ${vault.unlocked ? "is-unlocked" : ""}`, text: vault.unlocked ? "保险库已解锁" : "保险库已锁定" }), action(vault.unlocked ? "锁定" : "解锁", async () => { if (vault.unlocked) await send("vault:lock"); else if (!await unlockVault()) return; await refresh(); }, "处理中…", "secondary compact")]),
    action("保存当前账号", async () => { await requestOrigins(siteOrigins(site.url)); if (!await unlockVault()) return; await send("site:save-current", { name: suggested, tabId: site.tabId, url: site.url }); await refresh(); viewNotice.hidden = false; viewNotice.className = "notice"; viewNotice.textContent = "当前账号已加密保存。"; }, "保存中…"),
    el("div", { className: "section-title" }, [el("h2", { text: "可切换账号" }), el("span", { text: String(buckets.length) })]),
  );
  if (locked) app.append(el("section", { className: "empty-state" }, [el("h3", { text: "解锁后查看账号" }), el("p", { text: "使用保险库总密码解锁，本地解密你的已保存账号。" }), action("解锁保险库", async () => { if (await unlockVault()) await refresh(); }, "解锁中…")]));
  else if (!buckets.length) app.append(el("section", { className: "empty-state" }, [el("img", { src: "assets/empty-bucket.svg", alt: "", className: "empty-state-art" }), el("h3", { text: "还没有保存此网站的账号" }), el("p", { text: "先在网站登录，再点击“保存当前账号”。" })]));
  else { if (buckets.length > 4) app.append(search); app.append(list); draw(); }
  app.append(footer);
}

async function refresh() {
  const settings = await getSettings();
  if (!settings.token) return renderLogin(settings);
  const footer = shell(); app.append(el("section", { className: "empty-state", role: "status", text: "正在读取当前网站…" }), footer);
  try {
    const [site, vault] = await Promise.all([send("site:buckets"), send("vault:status")]); renderCurrent(site, vault);
  } catch (error) {
    if (error.status === 401) {
      await send("auth:session:clear");
      return renderLogin(await getSettings(), true);
    }
    const footer = shell("暂时无法显示账号", "你的登录会话仍被保留");
    app.append(el("section", { className: "panel" }, [el("p", { className: "muted", text: error.message }), action("重新加载", () => refresh(), "加载中…"), el("p", { className: "muted", text: "请在普通网站页面使用。也可前往设置管理账号、备份及登录方式。" })]), footer);
  }
}

void refresh();
