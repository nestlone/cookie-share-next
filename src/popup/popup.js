import { getSettings } from "../store/settings.js";

const app = document.querySelector("#app");
let notice = null;
let editingAccountId = null;
const message = (action, payload = {}) => new Promise((resolve, reject) => chrome.runtime.sendMessage({ action, ...payload }, (response) => {
  if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
  if (!response?.ok) return reject(new Error(response?.error ?? "Extension request failed"));
  resolve(response.data);
}));
function element(tag, options = {}, children = []) { const node = document.createElement(tag); for (const [key, value] of Object.entries(options)) { if (key === "className") node.className = value; else if (key === "text") node.textContent = value; else if (key === "type") node.type = value; else if (key === "value") node.value = value; else if (key === "placeholder") node.placeholder = value; else if (key.startsWith("on")) node.addEventListener(key.slice(2).toLowerCase(), value); else if (value !== false && value != null) node.setAttribute(key, value === true ? "" : String(value)); } node.append(...children.filter(Boolean)); return node; }
const button = (text, onClick, className = "") => element("button", { type: "button", text, className, onClick });
const render = (nodes) => app.replaceChildren(...nodes.filter(Boolean));
const noticeNode = () => notice ? element("div", { className: `notice ${notice.error ? "notice--error" : ""}`, role: "alert", text: notice.text }) : null;

async function run(operation) { try { notice = null; await operation(); } catch (error) { notice = { text: error instanceof Error ? error.message : "Unexpected error", error: true }; await refresh(); } }
async function ensureVaultUnlocked() { if ((await message("vault:status")).unlocked) return; const password = prompt("输入总密码以解锁 Cookie 桶"); if (!password) throw new Error("需要先解锁 Cookie 桶"); await message("vault:unlock", { password }); }
function icon(site) { return site.favIconUrl ? element("img", { className: "site-icon", src: site.favIconUrl, alt: "" }) : element("span", { className: "site-icon site-icon--fallback", text: site.hostname[0]?.toUpperCase() ?? "?" }); }

function renderLogin(settings) {
  const input = element("input", { type: "url", value: settings.serverUrl || "https://cookie.nestlone.com", placeholder: "https://server.example" });
  const providers = element("div", { className: "provider-actions" }, [element("span", { className: "muted", text: "正在加载登录方式…" })]);
  const load = async () => { try { const result = await message("auth:providers", { serverUrl: input.value }); providers.replaceChildren(...result.providers.map((provider) => button(`使用 ${provider.name} 登录`, () => run(async () => { await message("auth:oauth", { serverUrl: input.value, provider: provider.id }); await refresh(); })))); } catch (error) { providers.replaceChildren(element("span", { className: "notice notice--error", text: error.message })); } };
  render([element("header", { className: "app-header" }, [element("div", { className: "brand" }, [element("img", { className: "brand-mark", src: "../../icons/icon.svg", alt: "" }), element("div", { className: "brand-copy" }, [element("h1", { text: "Cookie Share Next" }), element("p", { text: "本地加密的账号切换器" })])])]), noticeNode(), element("section", { className: "panel" }, [element("label", { text: "服务器地址" }), input, button("加载登录方式", load), providers])]);
  load();
}

function accountRow(bucket) {
  const label = bucket.name || "未命名账号";
  const editing = editingAccountId === bucket.id;
  const actions = [
    button("切换", () => run(async () => { await ensureVaultUnlocked(); await message("site:switch", { id: bucket.id }); notice = { text: `已切换到 ${label}，页面正在刷新`, error: false }; await refresh(); })),
    button(editing ? "收起" : "编辑", () => { editingAccountId = editing ? null : bucket.id; refresh(); }, "secondary compact"),
  ];
  const advanced = editing ? element("div", { className: "account-editor" }, [
    button("重命名", () => run(async () => { const name = prompt("新的账号名称", label); if (!name?.trim()) return; await ensureVaultUnlocked(); await message("bucket:rename", { id: bucket.id, name }); editingAccountId = null; await refresh(); }), "secondary compact"),
    button("删除账号", () => run(async () => { if (!confirm(`删除账号“${label}”？`)) return; await message("bucket:delete", { id: bucket.id }); editingAccountId = null; await refresh(); }), "danger compact"),
  ]) : null;
  return element("article", { className: "account-row" }, [element("div", { className: "account-copy" }, [element("strong", { text: label }), element("span", { text: `更新于 ${new Date(bucket.updatedAt).toLocaleDateString()}` })]), element("div", { className: "account-actions" }, actions), advanced]);
}

function renderCurrent(result, vault) {
  const { site, buckets, locked } = result;
  const suggested = site.accountName ? `${site.hostname} · ${site.accountName}` : site.hostname;
  const save = button("保存当前账号", () => run(async () => { await ensureVaultUnlocked(); await message("site:save-current", { name: suggested }); notice = { text: `已保存 ${suggested}`, error: false }; await refresh(); }));
  const body = locked ? element("section", { className: "empty-state" }, [element("h3", { text: "Cookie 桶已锁定" }), element("p", { text: "解锁后即可显示此网站的可用账号。" }), button("解锁并查看", () => run(async () => { await ensureVaultUnlocked(); await refresh(); }))]) : buckets.length ? element("section", { className: "account-list" }, buckets.map(accountRow)) : element("section", { className: "empty-state" }, [element("h3", { text: "此网站还没有已保存账号" }), element("p", { text: "保存当前登录状态，即可在这里一键切换。" })]);
  const lock = button(vault.unlocked ? "锁定" : "解锁", () => run(async () => { if (vault.unlocked) await message("vault:lock"); else await ensureVaultUnlocked(); await refresh(); }), "secondary compact");
  render([element("header", { className: "app-header" }, [element("div", { className: "brand" }, [icon(site), element("div", { className: "brand-copy" }, [element("h1", { text: site.hostname }), element("p", { text: site.accountName ? `当前识别为 ${site.accountName}` : "当前网站账号" })])]), element("div", { className: "header-actions" }, [lock, button("设置", () => chrome.runtime.openOptionsPage(), "secondary compact")])]), noticeNode(), save, element("div", { className: "section-title" }, [element("h2", { text: "可切换账号" }), element("span", { text: String(buckets.length) })]), body]);
}

async function refresh() { const settings = await getSettings(); if (!settings.token) return renderLogin(settings); try { const [site, vault] = await Promise.all([message("site:buckets"), message("vault:status")]); renderCurrent(site, vault); } catch (error) { notice = { text: error instanceof Error ? error.message : "无法读取当前网站", error: true }; renderLogin(settings); } }
refresh();
