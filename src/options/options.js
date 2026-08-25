import { getSettings } from "../store/settings.js";
const app = document.querySelector("#app");
const send = (action, payload = {}) => new Promise((resolve, reject) => chrome.runtime.sendMessage({ action, ...payload }, (response) => response?.ok ? resolve(response.data) : reject(new Error(response?.error || chrome.runtime.lastError?.message || "Request failed"))));
function el(tag, text = "", className = "") { const node = document.createElement(tag); node.textContent = text; node.className = className; return node; }
function button(text, handler, className = "") { const node = el("button", text, className); node.type = "button"; node.addEventListener("click", handler); return node; }
async function render() {
  const settings = await getSettings();
  if (!settings.token) { app.replaceChildren(el("h1", "请先在扩展弹窗中登录")); return; }
  const [me, list, vault] = await Promise.all([send("auth:status"), send("bucket:list"), send("vault:status")]);
  const listNode = el("section", "", "bucket-list");
  for (const bucket of list.buckets) {
    const row = el("article", "", "bucket"); const copy = el("div", "", "copy");
    copy.append(el("strong", bucket.name || bucket.id), el("span", `${Math.round(bucket.size / 1024)} KB · ${new Date(bucket.updatedAt).toLocaleString()}`));
    row.append(copy, button("删除", async () => { if (confirm(`删除“${bucket.name || bucket.id}”？`)) { await send("bucket:delete", { id: bucket.id }); await render(); } }, "danger")); listNode.append(row);
  }
  const header = el("header", "", "header"); const title = el("div"); title.append(el("h1", "Cookie Share Next 设置"), el("p", `${me.user.displayName} · ${vault.unlocked ? "Cookie 桶已解锁" : "Cookie 桶已锁定"}`));
  header.append(title, button("退出登录", async () => { await send("auth:logout"); await render(); }, "secondary"));
  app.replaceChildren(header, el("h2", "全部加密桶"), listNode, el("p", "账号切换请在访问目标网站时使用扩展弹窗。", "muted"));
}
render().catch((error) => app.replaceChildren(el("p", error.message, "error")));
