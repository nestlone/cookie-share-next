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
    const actions = el("div", "", "actions");
    actions.append(button("重命名", async () => {
      const name = prompt("新的账号名称", bucket.name || "");
      if (!name?.trim()) return;
      if (!(await send("vault:status")).unlocked) {
        const password = prompt("输入总密码以解锁 Cookie 桶");
        if (!password) return;
        await send("vault:unlock", { password });
      }
      await send("bucket:rename", { id: bucket.id, name });
      await render();
    }, "secondary"), button("删除", async () => { if (confirm(`删除“${bucket.name || bucket.id}”？`)) { await send("bucket:delete", { id: bucket.id }); await render(); } }, "danger"));
    row.append(copy, actions); listNode.append(row);
  }
  const header = el("header", "", "header"); const title = el("div"); title.append(el("h1", "Cookie Share Next 设置"), el("p", `${me.user.displayName} · ${vault.unlocked ? "Cookie 桶已解锁" : "Cookie 桶已锁定"}`));
  header.append(title, button("退出登录", async () => { await send("auth:logout"); await render(); }, "secondary"));
  const reset = button("删除全部加密数据并重置总密码", async () => {
    const confirmation = prompt("此操作会永久删除所有 Cookie 桶和密码数据。输入 DELETE 确认");
    if (confirmation !== "DELETE") return;
    await send("vault:reset", { confirmation });
    alert("已删除全部加密数据。下次保存账号时可设置新的总密码。");
    await render();
  }, "danger");
  app.replaceChildren(header, el("h2", "全部加密桶"), listNode, el("h2", "危险操作"), reset, el("p", "此操作不可撤销，但不会退出服务器账号。", "muted"));
}
render().catch((error) => app.replaceChildren(el("p", error.message, "error")));
