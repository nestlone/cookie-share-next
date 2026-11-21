import { el, button, send, downloadText, version } from "../shared/ui.js";
import { getSettings } from "../store/settings.js";

const app = document.querySelector("#app");
const params = new URLSearchParams(location.search);
const mode = params.get("mode"), serverUrl = params.get("server");
// Remove the operation before starting: refreshing cannot create/reset another key.
history.replaceState(null, "", location.pathname);
let key = "";
let finished = false;

function showKey(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw new Error("服务器未返回有效密钥。请在安全设置中重置。");
  key = value;
  const input = el("textarea", { readonly: true, rows: "2", className: "key-value", "aria-label": "登录密钥", spellcheck: false });
  input.value = key;
  const feedback = el("p", { className: "muted", role: "status" });
  const error = problem => { feedback.textContent = problem.message; };
  const saved = el("input", { type: "checkbox" });
  const done = button("我已保存，前往设置", () => {
    key = ""; input.value = ""; finished = true; location.replace("security.html");
  });
  done.disabled = true;
  saved.addEventListener("change", () => { done.disabled = !saved.checked; });
  app.replaceChildren(el("div", { className: "key-heading" }, [el("span", { className: "eyebrow", text: `COOKIE SHARE NEXT · ${version()}` }), el("h1", { text: mode === "reset" ? "保存你的新登录密钥" : "账户已创建，保存登录密钥" }), el("p", { className: "muted", text: "仅在此页面显示一次。请先保存，再离开此页。" })]),
    el("section", { className: "panel" }, [el("label", { text: "登录密钥" }), input,
      el("div", { className: "actions" }, [
        button("复制密钥", async () => {
          try { await navigator.clipboard.writeText(key); feedback.textContent = "已复制，请保存到可信的位置。"; }
          catch { input.focus(); input.select(); feedback.textContent = "自动复制失败，请手动复制选中的密钥。"; }
        }, { className: "secondary", onError: error }),
        button("下载密钥文件", () => downloadText(`Cookie Share Next 登录密钥\n服务器：${serverUrl || "见扩展设置"}\n密钥：${key}\n\n请妥善保存。它用于账户登录，与保险库总密码不同。\n`, "cookie-share-login-key.txt", "text/plain;charset=utf-8"), { className: "secondary", onError: error }),
      ]), feedback,
      el("div", { className: "notice" }, [el("strong", { text: "这不是保险库总密码" }), el("p", { text: "登录密钥用于进入账户。保险库总密码用于本地加密。你可以在安全设置绑定第三方登录；未绑定且退出后丢失密钥，将无法找回账户。" })]),
      el("label", { className: "check-label" }, [saved, document.createTextNode(" 我已妥善保存登录密钥")]), done,
    ]), el("p", { className: "muted", text: "服务端仅保存密钥哈希。关闭或刷新此页后，无法再次查看此密钥。" }));
}

async function start() {
  if (!["create", "reset"].includes(mode)) {
    app.replaceChildren(el("h1", { text: "密钥展示已结束" }), el("p", { className: "muted", text: "此页面不会重复创建或重置密钥。仍在登录时，可以在安全设置中重新生成。" }), el("a", { href: "security.html", text: "前往安全设置", className: "text-link" })); return;
  }
  app.replaceChildren(el("h1", { text: mode === "reset" ? "正在重置密钥…" : "正在创建密钥账户…" }), el("p", { className: "muted", text: "完成后请在此页面保存密钥。" }));
  try {
    if (mode === "create" && (await getSettings()).token) throw new Error("你已经登录。请在安全设置中管理登录密钥；如需创建新账户，请先退出当前账户。");
    const result = mode === "create" ? await send("auth:key:register", { serverUrl }) : await send("auth:backup-key:reset");
    showKey(result.key);
  } catch (error) {
    finished = true;
    app.replaceChildren(el("h1", { text: "操作未完成" }), el("p", { className: "notice notice--error", text: error.message }), el("p", { className: "muted", text: "如果请求发送后连接中断，服务器可能已完成操作。仍在登录时可在安全设置重置密钥。" }), el("a", { href: "security.html", className: "text-link", text: "前往安全设置" }));
  }
}
window.addEventListener("beforeunload", event => { if (key && !finished) { event.preventDefault(); event.returnValue = ""; } });
void start();
