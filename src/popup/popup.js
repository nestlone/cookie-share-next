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
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
  }
  node.append(...children);
  return node;
}

function button(text, onClick, className = "") {
  return element("button", { text, className, onClick });
}

function header(title, right) {
  return element("header", {}, [element("h1", { text: title }), right]);
}

function renderNotice() {
  if (!notice) return null;
  return element("div", { className: `notice ${notice.error ? "error" : ""}`, text: notice.text });
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
  const serverInput = element("input", { type: "url", value: settings.serverUrl || "https://cookie.nestlone.com", placeholder: "https://cookie.nestlone.com" });
  const providers = element("div", { className: "row" });
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
      providers.replaceChildren(button("重新加载登录方式", load, "secondary"));
      setNotice(error instanceof Error ? error.message : "无法连接服务器", true);
    }
  };
  const form = element("form", { onsubmit: async (event) => { event.preventDefault(); await load(); } }, [
    element("label", { text: "服务器地址" }, [serverInput]),
    element("div", { className: "row" }, [button("加载登录方式", () => form.requestSubmit())]),
    providers,
  ]);
  render([header("Cookie Share Next"), renderNotice(), form, element("p", { className: "muted", text: "使用 GitHub、Google 或 LinuxDo 登录。桶密码只在本地用于加密。" })]);
  load();
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function renderBucketItem(bucket) {
  const open = button("打开", async () => {
    const password = prompt("输入此桶的桶密码");
    if (!password) return;
    await run(async () => {
      const result = await message("bucket:open", { id: bucket.id, password });
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
    element("div", { className: "bucket-title", text: bucket.id }),
    element("div", { className: "muted", text: `${formatBytes(bucket.size)} · 更新于 ${new Date(bucket.updatedAt).toLocaleString()}` }),
    element("div", { className: "row" }, [open, exportButton]),
  ]);
}

function renderDashboard(me, buckets) {
  currentDocument = null;
  const usage = me.usage;
  const percentage = me.user.quotaBytes === 0 ? 0 : Math.min(100, usage.usedBytes / me.user.quotaBytes * 100);
  const create = button("新建桶", async () => {
    const name = prompt("桶名称（名称会加密）");
    if (!name) return;
    const password = prompt("设置独立的桶密码");
    if (!password) return;
    await run(async () => {
      const result = await message("bucket:create", { name, password });
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
  }, "secondary");
  const quota = element("section", { className: "stack" }, [
    element("div", { className: "row" }, [
      element("span", { text: me.user.displayName }),
      element("span", { className: "muted", text: `${formatBytes(usage.usedBytes)} / ${formatBytes(me.user.quotaBytes)}` }),
    ]),
    element("div", { className: "usage" }, [element("span", { className: "usage-fill" })]),
    element("div", { className: "muted", text: `今日请求 ${usage.todayRequests} / ${usage.todayRequestsLimit}` }),
  ]);
  quota.querySelector(".usage-fill").style.width = `${percentage}%`;
  const providerControls = element("section", { className: "stack" }, [
    element("div", { className: "muted", text: "已绑定登录方式" }),
    element("div", { className: "row" }, me.user.providers.flatMap((provider) => [
      element("span", { text: `${provider.id}: ${provider.login}` }),
      button("解绑", async () => await run(async () => { await message("auth:unlink", { provider: provider.id }); await refreshDashboard(); }), "secondary"),
    ])),
    element("div", { className: "row" }, ["github", "google", "linuxdo"].filter((id) => !me.user.providers.some((provider) => provider.id === id)).map((id) => button(`绑定 ${id}`, async () => await run(async () => { await message("auth:link", { provider: id }); await refreshDashboard(); }), "secondary"))),
  ]);

  render([
    header("Cookie Share Next", logoutButton),
    renderNotice(),
    quota,
    providerControls,
    element("div", { className: "row" }, [create, importButton]),
    element("h2", { text: "加密 Cookie 桶" }),
    buckets.length ? element("section", { className: "bucket-list" }, buckets.map(renderBucketItem)) : element("div", { className: "empty", text: "尚无桶。新建一个，或导入别人分享的加密桶文件。" }),
  ]);
}

async function refreshDashboard() {
  const [me, list] = await Promise.all([message("auth:status"), message("bucket:list")]);
  renderDashboard(me, list.buckets);
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
  const head = element("thead", {}, [element("tr", {}, [
    element("th", { text: "名称" }), element("th", { text: "域名" }), element("th", { text: "值" }), element("th", { text: "" }),
  ])]);
  const body = element("tbody");
  for (const [index, cookie] of document.cookies.entries()) {
    const remove = button("删除", async () => {
      if (!confirm(`删除 Cookie ${cookie.name}？`)) return;
      await run(async () => await persistDocument({ ...document, cookies: document.cookies.filter((_, itemIndex) => itemIndex !== index) }));
    }, "danger icon");
    const edit = button("编辑", async () => {
      const value = prompt(`修改 ${cookie.name} 的值`, cookie.value);
      if (value === null) return;
      await run(async () => {
        const cookies = [...document.cookies];
        cookies[index] = { ...cookie, value };
        await persistDocument({ ...document, cookies });
      });
    }, "secondary icon");
    body.append(element("tr", {}, [
      element("td", { text: cookie.name }),
      element("td", { text: cookie.domain }),
      element("td", { text: cookie.value }),
      element("td", {}, [edit, remove]),
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
  });
  const apply = button("应用到浏览器", async () => {
    await run(async () => {
      const result = await message("bucket:apply", { id: document.bucketId });
      setNotice(`已应用 ${result.applied} 个 Cookie。`);
      renderBucket(document);
    });
  }, "secondary");
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
  const back = button("返回", () => { run(refreshDashboard); }, "secondary");

  render([
    header(document.name, back),
    renderNotice(),
    element("div", { className: "muted", text: `${document.cookies.length} 个 Cookie · 桶名与内容均只存在于加密信封中` }),
    document.cookies.length ? table : element("div", { className: "empty", text: "该桶为空。" }),
    element("div", { className: "row" }, [add, capture]),
    element("div", { className: "row" }, [apply, exportButton]),
    removeBucket,
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
