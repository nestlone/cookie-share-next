# Cookie Share Next

Cookie Share Next 是一个 Manifest V3 浏览器扩展，用于在**有权使用的浏览器账号与会话**之间管理加密 Cookie 桶。它不绕过登录认证、访问控制或平台规则。

> English documentation: [README.md](README.md)

## 功能

- 创建、解锁、捕获、编辑、删除和应用 Cookie 桶。
- 在 Chromium 允许扩展访问的范围内读取和恢复 HTTPOnly Cookie。
- 每个桶使用独立密码在扩展本地加密后再同步。
- 导出或导入加密的 `.csn-bucket.json` 文件，实现基于文件的分享。
- 通过兼容后端使用 GitHub、Google 或 LinuxDo OAuth 登录。
- 可使用官方服务 `https://cookie.nestlone.com`，也可连接兼容的自部署后端。

## 安全与隐私

桶密码独立于账号登录，且永不离开扩展。扩展使用 PBKDF2-SHA256 在本地派生 AES-256-GCM 密钥；服务端只保存不透明的加密信封、桶 ID、密文大小和时间戳。

服务运营者可以看到账号身份、桶数量、近似密文大小与请求时间，但不能从存储数据中解密桶名称、Cookie 域名、Cookie 值或桶密码。不同 OAuth 提供商报告相同邮箱时，账号不会自动合并。完整细节见[协议与威胁模型](docs/protocol.md)。

导出的桶文件和桶密码都是敏感信息，应通过不同的安全渠道发送。桶密码一旦分享，不能只对某一位接收者撤销；需要撤销访问时，请创建新桶并设置新密码。

## 安装扩展

项目目前以原生未打包扩展形式提供，不需要生产构建步骤。

1. 克隆仓库；如需运行测试，先安装依赖。
2. 打开 Chrome 或 Edge 的扩展管理页面。
3. 启用**开发者模式**。
4. 点击**加载已解压的扩展程序**，选择本仓库目录（本地工作区中的 `frontend/`）。
5. 打开扩展弹窗，保留 `https://cookie.nestlone.com`，或填写自部署后端的 HTTPS 地址；使用已配置的 OAuth 提供商登录。
6. 创建 Cookie 桶并设置高强度、唯一的桶密码。

扩展申请 `cookies`、`storage`、`tabs`、`downloads`、`identity` 和所有站点的 host 权限，用于读取、存储、恢复 Cookie 桶和完成登录。在敏感浏览器配置文件中安装前，请先审查源码。

## 使用自部署后端

后端在独立仓库维护：[cookie-share-next-server](https://github.com/nestlone/cookie-share-next-server)。请将其部署在 HTTPS 之后，配置至少一个 OAuth 提供商，并在扩展中使用该公开服务地址。

前端与后端有意分别维护协议测试向量和文档副本。修改协议时，必须同步更新两个仓库并运行各自的契约测试。

## 开发

要求：Node.js 22.5 或更新版本。

```bash
npm ci
npm test
node -e "JSON.parse(require('node:fs').readFileSync('manifest.json'));"
```

完整的本地集成验证需要先构建相邻的后端目录：

```bash
npm --prefix ../backend ci
npm --prefix ../backend run build
node e2e/run.mjs
```

GitHub Actions 仅验证扩展、Manifest 和加密契约；完整 E2E 仅在本地运行，以避免为独立私有后端仓库保存读取凭据。

## 目录结构

```text
.github/       前端持续集成
contract/      扩展测试使用的固定协议向量
docs/          协议与威胁模型
e2e/           本地扩展与后端集成验证
icons/          扩展图标
src/            Manifest V3 service worker、弹窗和共享模块
test/           加密与契约测试
```

## 许可证

Cookie Share Next 使用 [GNU General Public License v3.0](LICENSE)。