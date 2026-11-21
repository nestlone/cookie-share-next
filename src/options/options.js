import { getSettings, saveServerUrl } from "../store/settings.js";
import { normalizeServerUrl } from "../api/client.js";
import { getProviders } from "../api/endpoints.js";
import { requestOrigins, serverOrigins } from "../shared/permissions.js";
import { el, button, send, version, dialog, unlockVault, downloadText, formatBytes } from "../shared/ui.js";

const app = document.querySelector("#app");
const page = document.body.dataset.page || "accounts";
const pages = [["accounts", "options.html", "账号管理"], ["backups", "backups.html", "备份管理"], ["security", "security.html", "安全设置"], ["server", "server.html", "服务器设置"]];
let notice, content;
function notify(text, error = false) { notice.textContent = text; notice.className = `notice ${error ? "notice--error" : ""}`; notice.hidden = false; }
function action(text, handler, className = "secondary", busy = "处理中…") { return button(text, handler, { className, busy, onError: error => notify(error.message, true) }); }
function panel(title, description, children = []) { return el("section", { className: "panel" }, [el("div", { className: "panel-heading" }, [el("h2", { text: title }), description ? el("p", { className: "muted", text: description }) : null]), ...children]); }

function shell(settings) {
  notice = el("div", { role: "alert", hidden: true });
  content = el("div", { className: "page-content" });
  app.replaceChildren(el("header", { className: "page-header" }, [
    el("a", { href: "options.html", className: "brand" }, [el("img", { src: "../../icons/icon-48.png", alt: "" }), el("div", {}, [el("strong", { text: "Cookie Share Next" }), el("span", { text: version() })])]),
    el("span", { className: "status-chip", text: settings.token ? "账户已登录" : "尚未登录" }),
  ]), el("div", { className: "settings-layout" }, [
    el("nav", { className: "settings-nav", "aria-label": "设置导航" }, pages.map(([id, href, name]) => el("a", { href, text: name, "aria-current": page === id ? "page" : null }))),
    el("div", { className: "settings-main" }, [el("h1", { text: pages.find(([id]) => id === page)?.[2] || "设置" }), notice, content]),
  ]));
}

async function loadAccounts(backups = false) {
  const [{ buckets }, vault] = await Promise.all([send("bucket:list"), send("vault:status")]);
  const search = el("input", { type: "search", placeholder: "搜索账号名称或标识符", "aria-label": "搜索账号" });
  const list = el("div", { className: "bucket-list" });
  const draw = () => {
    const filtered = buckets.filter(bucket => (bucket.name || bucket.id).toLowerCase().includes(search.value.toLowerCase()));
    list.replaceChildren(...filtered.map(bucket => el("article", { className: "bucket" }, [
      el("div", { className: "bucket-copy" }, [el("strong", { text: bucket.name || bucket.id, title: bucket.name || bucket.id }), el("span", { text: `${formatBytes(bucket.size)} · ${new Date(bucket.updatedAt).toLocaleString()}` })]),
      el("div", { className: "actions" }, backups ? [action("导出", async () => {
        if (!await unlockVault()) return;
        const exported = await send("bucket:export", { id: bucket.id });
        await downloadText(exported.content, exported.filename); notify("已打开导出保存窗口。");
      })] : [
        action("重命名", async () => {
          const name = await dialog({ title: "重命名账号", label: "账号名称", value: bucket.name || "" });
          if (!name?.trim() || !await unlockVault()) return;
          await send("bucket:rename", { id: bucket.id, name: name.trim() }); await render();
        }),
        action("导出", async () => { if (!await unlockVault()) return; const exported = await send("bucket:export", { id: bucket.id }); await downloadText(exported.content, exported.filename); }),
        action("删除", async () => {
          if (!await dialog({ title: "删除已保存账号？", description: `将永久删除“${bucket.name || bucket.id}”的已保存数据。`, confirmText: "删除", danger: true })) return;
          await send("bucket:delete", { id: bucket.id }); await render();
        }, "danger"),
      ]),
    ])));
    if (!filtered.length) list.append(el("div", { className: "empty-state" }, [el("h3", { text: buckets.length ? "没有匹配的账号" : "还没有保存账号" }), el("p", { className: "muted", text: buckets.length ? "试试其他名称。" : "在网站登录后，打开扩展并保存当前账号。" })]));
  };
  search.addEventListener("input", draw);
  if (!vault.unlocked) content.append(panel("保险库已锁定", "解锁后显示账号名称，并可导入和导出备份。", [action("解锁保险库", async () => { if (await unlockVault()) await render(); }, "", "解锁中…")]));
  if (backups) {
    const file = el("input", { type: "file", accept: ".json,application/json", hidden: true });
    file.addEventListener("change", async () => {
      const selected = file.files?.[0]; if (!selected) return;
      try {
        if (!await unlockVault()) return;
        await send("bucket:import", { content: await selected.text() }); await render(); notify("备份已导入，并使用当前保险库总密码重新加密。");
      } catch (error) { notify(error.message, true); } finally { file.value = ""; }
    });
    content.append(panel("导入账号备份", "备份文件包含明文会话凭据，请保存在可信位置。导入后会在本地加密再上传。", [file, action("选择备份文件", () => file.click(), "")]));
  }
  content.append(panel(backups ? "导出备份" : `全部已保存账号 · ${buckets.length}`, "账号内容在扩展内加密。服务器只保存密文。", [search, list])); draw();
}

async function loadSecurity(settings, me) {
  const providersPanel = panel("登录方式", "同一第三方身份只能绑定一个账户；每种提供商最多绑定一个身份。绑定不会合并其他账户的数据。");
  const names = { github: "GitHub", linuxdo: "LinuxDo", google: "Google" };
  for (const provider of me.user.providers) {
    const canUnlink = me.user.hasLoginKey || me.user.providers.length > 1;
    const unlink = action("解绑", async () => {
      if (!await dialog({ title: `解绑 ${names[provider.id]}？`, description: "此登录方式将无法再进入当前账户。请确保仍有可用的登录方式。", confirmText: "确认解绑", danger: true })) return;
      await send("auth:unlink", { provider: provider.id }); await render(); notify("已解除绑定。");
    });
    unlink.disabled = !canUnlink;
    if (!canUnlink) unlink.title = "请先生成并保存登录密钥，或绑定其他登录方式。";
    providersPanel.append(el("div", { className: "provider-row" }, [el("div", { className: "bucket-copy" }, [el("strong", { text: names[provider.id] }), el("span", { text: provider.login })]), el("span", { className: "status-chip is-unlocked", text: "已绑定" }), unlink]));
  }
  if (!me.user.providers.length) providersPanel.append(el("p", { className: "muted", text: "暂未绑定第三方登录。绑定后也可用它进入当前密钥账户。" }));
  const available = el("div", { className: "actions" });
  const providerStatus = el("p", { className: "muted", role: "status" });
  async function loadProviders() {
    available.replaceChildren(); providerStatus.textContent = "正在加载可绑定的登录方式…";
    try {
      const result = await getProviders(settings.serverUrl);
      const unlinked = result.providers.filter(provider => !me.user.providers.some(link => link.id === provider.id));
      providerStatus.textContent = unlinked.length ? "选择一种登录方式完成授权。" : "当前服务器可用的登录方式均已绑定。";
      available.replaceChildren(...unlinked.map(provider => action(`绑定 ${provider.name}`, async () => { await send("auth:link", { provider: provider.id }); await render(); notify(`${provider.name} 已绑定到当前账户。`); }, "secondary", "等待授权…")));
    } catch (error) { providerStatus.textContent = error.message; available.append(action("重新加载", loadProviders)); }
  }
  providersPanel.append(providerStatus, available);
  content.append(providersPanel,
    panel("登录密钥", me.user.hasLoginKey ? "已启用密钥登录。密钥只在创建或重置时显示一次。" : "生成密钥后，可在第三方登录不可用时使用密钥进入此账户。", [
      action(me.user.hasLoginKey ? "重置登录密钥" : "生成登录密钥", async () => {
        if (me.user.hasLoginKey && !await dialog({ title: "重置登录密钥？", description: "原密钥立即失效。新密钥将在独立页面显示，请妥善保存。", confirmText: "重置密钥" })) return;
        await chrome.tabs.create({ url: chrome.runtime.getURL("src/options/key.html?mode=reset") });
      }),
    ]),
    panel("退出当前会话", "浏览器完全退出后，扩展会话也会结束。请确保登录密钥已保存。", [action("退出登录", async () => { await send("auth:logout"); await render(); })]),
    el("section", { className: "panel danger-panel" }, [el("h2", { text: "删除全部加密数据" }), el("p", { className: "muted", text: "永久删除所有已保存账号和加密目录，之后可设置新的保险库总密码。此操作不会删除服务账户。" }),
      action("删除全部数据并重置总密码", async () => {
        const confirmation = await dialog({ title: "永久删除全部加密数据？", description: "此操作无法撤销。请输入 DELETE 确认。", label: "确认文本", confirmText: "永久删除", danger: true });
        if (confirmation !== "DELETE") return;
        await send("vault:reset", { confirmation }); await render(); notify("全部加密数据已删除，下次保存时可设置新的总密码。");
      }, "danger"),
    ]),
  );
  void loadProviders();
}

function loadServer(settings) {
  const input = el("input", { type: "url", id: "server-url", value: settings.serverUrl || "https://cookie.nestlone.com", placeholder: "https://server.example" });
  content.append(panel("服务器连接", "默认使用官方服务。更换服务器会退出当前账户；各服务器的数据独立。", [
    el("label", { for: "server-url", text: "服务器地址" }), input,
    action("测试连接并保存", async () => {
      // Request permission from the click before opening any confirmation dialog.
      await requestOrigins(serverOrigins(input.value.trim()));
      const url = normalizeServerUrl(input.value);
      await getProviders(url);
      if (url !== settings.serverUrl && settings.token) {
        if (!await dialog({ title: "更换服务器？", description: "将退出当前会话。原服务器的加密数据会保留。", confirmText: "更换服务器" })) return;
        try { await send("auth:logout"); } catch { /* Logout always clears the local session. */ }
      }
      if (url !== settings.serverUrl) await saveServerUrl(url);
      await render(); notify("连接正常，服务器地址已保存。");
    }, "", "正在测试连接…"),
    el("p", { className: "muted", text: "连接失败时检查网络、代理及服务器地址。自托管服务器需要单独授权访问。" }),
  ]));
}

async function render() {
  const settings = await getSettings(); shell(settings);
  if (page === "server") { loadServer(settings); return; }
  if (!settings.token) {
    content.append(panel("请先登录", "在普通网站页面点击浏览器工具栏中的扩展图标，输入密钥、创建账户或选择第三方登录。服务器地址可在服务器设置中修改。")); return;
  }
  content.append(el("p", { role: "status", text: "正在加载…", className: "muted" }));
  try {
    const me = await send("auth:status"); content.replaceChildren();
    if (page === "security") await loadSecurity(settings, me);
    else {
      content.append(el("div", { className: "usage-card" }, [el("div", {}, [el("span", { className: "eyebrow", text: "加密存储用量" }), el("strong", { text: `${formatBytes(me.usage.usedBytes)} / ${formatBytes(me.user.quotaBytes)}` })]), el("progress", { max: String(Math.max(1, me.user.quotaBytes)), value: String(me.usage.usedBytes), "aria-label": "存储使用量" }), el("p", { className: "muted", text: `${me.user.displayName} · 今日请求 ${me.usage.todayRequests} / ${me.usage.todayRequestsLimit}` })]));
      await loadAccounts(page === "backups");
    }
  } catch (error) {
    content.replaceChildren(panel("暂时无法加载", error.message, [action("重新加载", render)]));
  }
}
void render();
