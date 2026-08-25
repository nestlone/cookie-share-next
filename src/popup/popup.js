import { getSettings } from "../store/settings.js";

const app = document.querySelector("#app");
const importFile = document.querySelector("#import-file");
let currentDocument = null;
let notice = null;

function message(action, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action, ...payload }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error ?? "Extension request failed"));
        return;
      }
      resolve(response.data);
    });
  });
}

function element(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(options)) {
    if (key === "className") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "type") node.type = value;
    else if (key === "value") node.value = value;
    else if (key === "placeholder") node.placeholder = value;
    else if (key === "disabled") node.disabled = value;
    else if (key === "htmlFor") node.htmlFor = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== false && value != null) node.setAttribute(key, value === true ? "" : String(value));
  }
  node.append(...children.filter(Boolean));
  return node;
}

function button(text, onClick, className = "") {
  return element("button", { type: "button", text, className, onClick });
}

function header(title, subtitle = "", right = null) {
  return element("header", { className: "app-header" }, [
    element("div", { className: "brand" }, [
      element("img", { className: "brand-mark", src: "../../icons/icon.svg", alt: "" }),
      element("div", { className: "brand-copy" }, [
        element("h1", { text: title }),
        subtitle ? element("p", { text: subtitle }) : null,
      ]),
    ]),
    right ? element("div", { className: "header-actions" }, [right]) : null,
  ]);
}

function renderNotice() {
  if (!notice) return null;
  return element("div", {
    className: `notice ${notice.error ? "notice--error" : "notice--success"}`,
    role: notice.error ? "alert" : "status",
    "aria-live": notice.error ? "assertive" : "polite",
    text: notice.text,
  });
}

function render(nodes) {
  app.replaceChildren(...nodes.filter(Boolean));
}

function setNotice(text, error = false) {
  notice = { text, error };
}

function clearNotice() {
  notice = null;
}

async function ensureVaultUnlocked() {
  const status = await message("vault:status");
  if (status.unlocked) return;
  const password = prompt("输入总密码以解锁所有 Cookie 桶");
  if (!password) throw new Error("需要先解锁 Cookie 桶");
  await message("vault:unlock", { password });
}

async function run(operation) {
  try {
    clearNotice();
    await operation();
  } catch (error) {
    setNotice(error instanceof Error ? error.message : "Unexpected error", true);
    if (currentDocument) renderBucket(currentDocument);
    else await renderStartup();
  }
}

function renderLogin(settings) {
  const serverInput = element("input", {
    id: "server-url",
    name: "server-url",
    type: "url",
    value: settings.serverUrl || "https://cookie.nestlone.com",
    placeholder: "https://cookie.nestlone.com",
    autocomplete: "url",
    required: true,
  });
  const providers = element("div", { className: "provider-actions", "aria-live": "polite" });
  const load = async () => {
    providers.replaceChildren(element("span", { className: "muted", text: "正在加载登录方式…" }));
    try {
      const response = await message("auth:providers", { serverUrl: serverInput.value });
      const buttons = response.providers.map((provider) => button(`使用 ${provider.name} 登录`, async () => {
        await run(async () => await refreshDashboard(await message("auth:oauth", { serverUrl: serverInput.value, provider: provider.id })));
      }));
      providers.replaceChildren(...buttons);
      if (buttons.length === 0) providers.replaceChildren(element("span", { className: "muted", text: "此服务器尚未配置登录方式。" }));
    } catch (error) {
      providers.replaceChildren(
        element("span", { className: "notice notice--error", role: "alert", text: error instanceof Error ? error.message : "无法连接服务器" }),
        button("重新加载登录方式", load, "secondary"),
      );
    }
  };
  const form = element("form", { className: "panel login-panel", onsubmit: async (event) => { event.preventDefault(); await load(); } }, [
    element("div", { className: "field" }, [
      element("label", { htmlFor: "server-url", text: "服务器地址" }),
      serverInput,
    ]),
    button("加载登录方式", () => form.requestSubmit()),
    providers,
  ]);
  render([
    header("Cookie Share Next", "加密 Cookie 桶，仅在本地解密"),
    renderNotice(),
    form,
    element("p", { className: "privacy-note", text: "使用当前服务器提供的登录方式。桶密码仅在本地用于加密。" }),
  ]);
  load();
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function renderBucketItem(bucket) {
  const open = button("打开", async () => {
    await run(async () => {
      await ensureVaultUnlocked();
      let result;
      try {
        result = await message("bucket:open", { id: bucket.id });
      } catch (error) {
        const legacyPassword = prompt("此桶可能仍使用旧的独立密码。输入旧密码后会迁移为总密码。");
        if (!legacyPassword) throw error;
        result = await message("bucket:open", { id: bucket.id, legacyPassword });
      }
      currentDocument = result.document;
      renderBucket(currentDocument);
    });
  });
  const exportButton = button("导出", async () => {
    await run(async () => {
      const file = await message("bucket:export", { id: bucket.id });
      downloadFile(file.content, file.filename);
      setNotice("已导出加密桶文件。");
      await refreshDashboard();
    });
  }, "secondary");
  return element("article", { className: "bucket" }, [
    element("div", { className: "bucket-copy" }, [
      element("div", { className: "bucket-title", title: bucket.id, text: bucket.name ?? bucket.id }),
      element("div", { className: "bucket-meta", text: `${formatBytes(bucket.size)} · 更新于 ${new Date(bucket.updatedAt).toLocaleString()}` }),
    ]),
    element("div", { className: "bucket-actions" }, [open, exportButton]),
  ]);
}

function renderDashboard(me, buckets, configuredProviders) {
  currentDocument = null;
  const usage = me.usage;
  const percentage = me.user.quotaBytes === 0 ? 0 : Math.min(100, usage.usedBytes / me.user.quotaBytes * 100);
  const create = button("新建桶", async () => {
    const name = prompt("桶名称（名称会加密）");
    if (!name) return;
    await run(async () => {
      await ensureVaultUnlocked();
      const result = await message("bucket:create", { name });
      currentDocument = result.document;
      renderBucket(currentDocument);
    });
  });
  const importButton = button("导入", () => importFile.click(), "secondary");
  const logoutButton = button("退出", async () => {
    await run(async () => {
      await message("auth:logout");
      const settings = await getSettings();
      renderLogin(settings);
    });
  }, "secondary compact");
  const lockButton = button("锁定", async () => {
    await run(async () => { await message("vault:lock"); await refreshDashboard(); });
  }, "secondary compact");
  const meter = element("div", {
    className: "usage",
    role: "progressbar",
    "aria-label": "存储空间使用情况",
    "aria-valuemin": "0",
    "aria-valuemax": String(me.user.quotaBytes),
    "aria-valuenow": String(usage.usedBytes),
  }, [element("span", { className: "usage-fill" })]);
  meter.querySelector(".usage-fill").style.width = `${percentage}%`;
  const quota = element("section", { className: "panel usage-panel", "aria-label": "账户用量" }, [
    element("div", { className: "section-heading" }, [
      element("div", {}, [
        element("span", { className: "eyebrow", text: "已登录账户" }),
        element("strong", { text: me.user.displayName }),
      ]),
      element("span", { className: "usage-value", text: `${formatBytes(usage.usedBytes)} / ${formatBytes(me.user.quotaBytes)}` }),
    ]),
    meter,
    element("div", { className: "usage-meta", text: `今日请求 ${usage.todayRequests} / ${usage.todayRequestsLimit}` }),
  ]);
  const providerNames = new Map(configuredProviders.map((provider) => [provider.id, provider.name]));
  const linkedProviders = me.user.providers.map((provider) => element("li", { className: "provider-row" }, [
    element("span", { className: "provider-name", text: providerNames.get(provider.id) ?? provider.id }),
    element("span", { className: "provider-login", title: provider.login, text: provider.login }),
    button("解绑", async () => await run(async () => { await message("auth:unlink", { provider: provider.id }); await refreshDashboard(); }), "secondary compact"),
  ]));
  const unlinkedProviderButtons = configuredProviders
    .filter((provider) => !me.user.providers.some((linked) => linked.id === provider.id))
    .map((provider) => button(`绑定 ${provider.name}`, async () => await run(async () => { await message("auth:link", { provider: provider.id }); await refreshDashboard(); }), "secondary compact"));
  const providerControls = element("section", { className: "panel provider-panel" }, [
    element("div", { className: "section-heading" }, [
      element("div", {}, [element("span", { className: "eyebrow", text: "账号安全" }), element("strong", { text: "已绑定登录方式" })]),
    ]),
    element("ul", { className: "provider-list" }, linkedProviders),
    unlinkedProviderButtons.length ? element("div", { className: "link-provider-actions" }, unlinkedProviderButtons) : null,
  ]);
  const emptyState = element("section", { className: "empty-state" }, [
    element("img", { className: "empty-state-art", src: "assets/empty-bucket.svg", alt: "", "aria-hidden": "true" }),
    element("h3", { text: "还没有 Cookie 桶" }),
    element("p", { text: "新建一个加密桶，或导入他人分享的加密桶文件。" }),
  ]);

  render([
    header("Cookie Share Next", "你的 Cookie，仅由你在本地解密", element("div", { className: "header-actions" }, [lockButton, logoutButton])),
    renderNotice(),
    quota,
    providerControls,
    element("div", { className: "primary-actions" }, [create, importButton]),
    element("div", { className: "section-title" }, [element("h2", { text: "加密 Cookie 桶" }), element("span", { text: `${buckets.length}` })]),
    buckets.length ? element("section", { className: "bucket-list", "aria-label": "加密 Cookie 桶" }, buckets.map(renderBucketItem)) : emptyState,
  ]);
}

async function refreshDashboard() {
  const settings = await getSettings();
  const [me, list, providerResponse] = await Promise.all([
    message("auth:status"),
    message("bucket:list"),
    message("auth:providers", { serverUrl: settings.serverUrl }),
  ]);
  renderDashboard(me, list.buckets, providerResponse.providers);
}

function downloadFile(content, filename) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function persistDocument(nextDocument) {
  const documentToSave = { ...nextDocument, updatedAt: new Date().toISOString() };
  const result = await message("bucket:save", { id: documentToSave.bucketId, document: documentToSave });
  currentDocument = result.document;
  renderBucket(currentDocument);
}

function renderBucket(document) {
  const table = element("table", { className: "cookie-table" });
  table.append(element("caption", { text: "Cookie 列表" }));
  const head = element("thead", {}, [element("tr", {}, [
    element("th", { text: "名称", scope: "col" }), element("th", { text: "域名", scope: "col" }), element("th", { text: "值", scope: "col" }), element("th", { text: "操作", scope: "col" }),
  ])]);
  const body = element("tbody");
  for (const [index, cookie] of document.cookies.entries()) {
    const remove = button("删除", async () => {
      if (!confirm(`删除 Cookie ${cookie.name}？`)) return;
      await run(async () => await persistDocument({ ...document, cookies: document.cookies.filter((_, itemIndex) => itemIndex !== index) }));
    }, "danger compact");
    const edit = button("编辑", async () => {
      const value = prompt(`修改 ${cookie.name} 的值`, cookie.value);
      if (value === null) return;
      await run(async () => {
        const cookies = [...document.cookies];
        cookies[index] = { ...cookie, value };
        await persistDocument({ ...document, cookies });
      });
    }, "secondary compact");
    body.append(element("tr", {}, [
      element("td", { title: cookie.name, text: cookie.name }),
      element("td", { title: cookie.domain, text: cookie.domain }),
      element("td", { className: "cookie-value", title: cookie.value, text: cookie.value }),
      element("td", { className: "cookie-actions" }, [edit, remove]),
    ]));
  }
  table.append(head, body);

  const add = button("添加 Cookie", async () => {
    const name = prompt("Cookie 名称");
    if (!name) return;
    const value = prompt("Cookie 值");
    if (value === null) return;
    const domain = prompt("域名", "example.com");
    if (!domain) return;
    const path = prompt("路径", "/") || "/";
    const sameSite = (prompt("SameSite: lax / strict / none", "lax") || "lax").toLowerCase();
    await run(async () => {
      await persistDocument({
        ...document,
        cookies: [...document.cookies, {
          name, value, domain, path, sameSite,
          secure: confirm("启用 Secure？"),
          httpOnly: confirm("启用 HttpOnly？"),
          hostOnly: true, session: true, storeId: null,
        }],
      });
    });
  });
  const capture = button("捕获当前页", async () => {
    await run(async () => {
      const result = await message("bucket:capture", { id: document.bucketId });
      currentDocument = result.document;
      renderBucket(currentDocument);
    });
  }, "secondary");
  const apply = button("应用到浏览器", async () => {
    await run(async () => {
      const result = await message("bucket:apply", { id: document.bucketId });
      setNotice(`已应用 ${result.applied} 个 Cookie。`);
      renderBucket(document);
    });
  });
  const exportButton = button("导出", async () => {
    await run(async () => {
      const file = await message("bucket:export", { id: document.bucketId });
      downloadFile(file.content, `${document.name}.csn-bucket.json`);
      setNotice("已导出加密桶文件。");
      renderBucket(document);
    });
  }, "secondary");
  const removeBucket = button("删除桶", async () => {
    if (!confirm(`永久删除桶 “${document.name}”？`)) return;
    await run(async () => {
      await message("bucket:delete", { id: document.bucketId });
      await refreshDashboard();
    });
  }, "danger");
  const back = button("返回", () => { run(refreshDashboard); }, "secondary compact");

  render([
    header(document.name, `${document.cookies.length} 个 Cookie · 桶名与内容仅存在于加密信封中`, back),
    renderNotice(),
    element("div", { className: "detail-actions" }, [add, capture, apply, exportButton]),
    document.cookies.length
      ? element("div", { className: "table-wrap", role: "region", "aria-label": "Cookie 列表", tabindex: "0" }, [table])
      : element("section", { className: "empty-state compact-empty" }, [
        element("img", { className: "empty-state-art", src: "assets/empty-bucket.svg", alt: "", "aria-hidden": "true" }),
        element("h3", { text: "该桶为空" }),
        element("p", { text: "添加 Cookie 或捕获当前页面后即可保存。" }),
      ]),
    element("section", { className: "danger-zone" }, [
      element("span", { text: "危险操作" }),
      removeBucket,
    ]),
  ]);
}

importFile.addEventListener("change", async () => {
  const file = importFile.files?.[0];
  importFile.value = "";
  if (!file) return;
  const password = prompt("输入分享方提供的桶密码");
  if (!password) return;
  const name = prompt("导入后的桶名称（留空则使用原名称）") ?? "";
  await run(async () => {
    await ensureVaultUnlocked();
    const result = await message("bucket:import", { content: await file.text(), password, name });
    currentDocument = result.document;
    renderBucket(currentDocument);
  });
});

async function renderStartup() {
  const settings = await getSettings();
  if (!settings.token) {
    renderLogin(settings);
    return;
  }
  try {
    await refreshDashboard();
  } catch (error) {
    setNotice(error instanceof Error ? error.message : "Session unavailable", true);
    renderLogin(settings);
  }
}

renderStartup();
