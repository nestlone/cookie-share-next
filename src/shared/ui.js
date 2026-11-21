export function el(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(options)) {
    if (name === "text") node.textContent = value;
    else if (name === "className") node.className = value;
    else if (name === "value") node.value = value;
    else if (name.startsWith("on")) node.addEventListener(name.slice(2).toLowerCase(), value);
    else if (value !== false && value != null) node.setAttribute(name, value === true ? "" : String(value));
  }
  node.append(...children.filter(Boolean));
  return node;
}

export function send(action, payload = {}) {
  return new Promise((resolve, reject) => chrome.runtime.sendMessage({ action, ...payload }, response => {
    if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
    if (response?.ok) return resolve(response.data);
    const error = new Error(response?.error ?? "操作失败，请重试。");
    error.status = response?.status;
    error.retryAfter = response?.retryAfter;
    reject(error);
  }));
}

export function button(text, handler, { className = "", busy = "处理中…", onError = () => {} } = {}) {
  const node = el("button", { type: "button", className, text });
  node.addEventListener("click", async () => {
    if (node.disabled) return;
    node.disabled = true;
    node.setAttribute("aria-busy", "true");
    node.textContent = busy;
    let cooldown = false;
    try {
      // Call immediately: permission requests must keep the user's click gesture.
      await handler();
    } catch (error) {
      onError(error);
      if (error.retryAfter > 0 && node.isConnected) {
        cooldown = true;
        const until = Date.now() + error.retryAfter * 1000;
        const timer = setInterval(() => {
          const remaining = Math.ceil((until - Date.now()) / 1000);
          node.textContent = `${remaining} 秒后重试`;
          if (remaining <= 0 || !node.isConnected) {
            clearInterval(timer);
            node.disabled = false;
            node.textContent = text;
          }
        }, 1000);
      }
    } finally {
      node.removeAttribute("aria-busy");
      if (!cooldown) { node.disabled = false; node.textContent = text; }
    }
  });
  return node;
}

export const version = () => `v${chrome.runtime.getManifest().version}`;
export const settingsLink = () => el("a", { href: chrome.runtime.getURL("src/options/options.html"), target: "_blank", text: "设置", className: "text-link" });

export function dialog({ title, description, label, type = "text", value = "", confirmText = "确认", danger = false }) {
  return new Promise(resolve => {
    const input = label ? el("input", { type, value, required: true, autocomplete: type === "password" ? "current-password" : "off", id: "dialog-input" }) : null;
    const modal = el("dialog", { className: "modal", "aria-labelledby": "dialog-title" });
    const form = el("form", { method: "dialog" }, [
      el("h2", { id: "dialog-title", text: title }),
      el("p", { className: "muted", text: description }),
      label ? el("label", { for: "dialog-input", text: label }) : null, input,
      el("div", { className: "actions" }, [
        el("button", { type: "button", className: "secondary", text: "取消", onClick: () => modal.close() }),
        el("button", { type: "submit", className: danger ? "danger" : "", text: confirmText }),
      ]),
    ]);
    let result = null;
    form.addEventListener("submit", event => { event.preventDefault(); result = input ? input.value : true; modal.close(); });
    modal.addEventListener("close", () => { if (input) input.value = ""; modal.remove(); resolve(result); }, { once: true });
    modal.append(form);
    document.body.append(modal);
    modal.showModal();
    (input ?? form.querySelector("button")).focus();
  });
}

export async function unlockVault() {
  if ((await send("vault:status")).unlocked) return true;
  const password = await dialog({ title: "解锁保险库", description: "首次使用时设置总密码；已有数据请使用原总密码。总密码用于本地加密，与登录密钥不同。", label: "保险库总密码", type: "password", confirmText: "解锁" });
  if (!password) return false;
  await send("vault:unlock", { password });
  return true;
}

export async function downloadText(content, filename, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  try { await chrome.downloads.download({ url, filename, saveAs: true }); }
  finally { setTimeout(() => URL.revokeObjectURL(url), 60000); }
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / 1048576).toFixed(1)} MiB`;
}
