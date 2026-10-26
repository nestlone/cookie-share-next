import { cookieUrl, normalizeCookies } from "../cookies/normalize.js";

export function serverOrigins(value) {
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error("服务器地址必须是 HTTP 或 HTTPS 地址");
  // Match patterns do not support a port restriction.
  return [`${url.protocol}//${url.hostname}/*`];
}

export function siteOrigins(value) {
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol)) throw new Error("请在普通 HTTP 或 HTTPS 网页使用此功能");
  const host = url.hostname;
  const isAddress = host.includes(":") || /^[\d.]+$/.test(host) || host === "localhost";
  return [`*://${isAddress ? host : `*.${host}`}/*`];
}

export function restoreOrigins(value, cookies) {
  const origins = siteOrigins(value);
  for (const cookie of normalizeCookies(cookies)) origins.push(...serverOrigins(cookieUrl(cookie)));
  return [...new Set(origins)];
}

export async function missingOrigins(origins) {
  const missing = [];
  for (const origin of origins) {
    if (!await chrome.permissions.contains({ origins: [origin] })) missing.push(origin);
  }
  return missing;
}

export async function requireOrigins(origins) {
  if ((await missingOrigins(origins)).length) throw new Error("尚未授权访问此网站。请在扩展弹窗中点击授权后重试。");
}

// Call directly from a click handler, before awaiting messages or vault unlock.
export async function requestOrigins(origins) {
  if (!await chrome.permissions.request({ origins })) throw new Error("未获得网站访问权限，操作已取消，网站登录状态未更改。");
}
