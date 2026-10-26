# Cookie Share Next

Cookie Share Next is a Manifest V3 browser extension for managing encrypted Cookie buckets across authorized browser profiles. It is intended only for accounts and sessions you are authorized to use; it does not bypass authentication, access controls, or platform policies.

> Chinese documentation: [README_CN.md](README_CN.md)

## Features

- Detect the active website and show only accounts saved for that exact site.
- Save the current account, switch an account after clearing the current site's Cookies, and refresh the tab.
- Use local GitHub page metadata, when available, to suggest an account name such as `github.com · octocat`.
- Manage all encrypted buckets, import or export plaintext JSON backups, rename entries, and reset the vault from the separate Settings page.
- Read and restore HTTPOnly Cookies where Chromium grants the extension access.
- Save and restore same-origin local/session storage alongside cookies for sites that keep client-side authentication state.
- Encrypt bucket contents and directory metadata locally before synchronization.
- Import and export versioned plaintext JSON backups after unlocking the vault. Imported data is validated locally and re-encrypted before synchronization.
- Sign in with GitHub, Google, or LinuxDo OAuth through a compatible backend.
- Use the official service at `https://cookie.nestlone.com` or a compatible self-hosted backend.

## Security and privacy

A vault password is independent of account authentication and never leaves the extension. New buckets use PBKDF2-SHA256 with 600,000 iterations and AES-256-GCM; version-1 buckets remain readable for compatibility. The service stores opaque encrypted envelopes, bucket IDs, ciphertext sizes, and timestamps only.

Operators can observe account identities, bucket counts, approximate ciphertext sizes, and request timing. They cannot decrypt bucket names, Cookie domains, Cookie values, or bucket passwords from stored data. Email addresses reported by different OAuth providers are never merged automatically. See the complete [protocol and threat model](docs/protocol.md).

The sign-in token is held in `chrome.storage.session`, not persistent extension storage. Closing the browser ends the extension session and requires signing in again. Plaintext exports contain active session credentials: store them only where you trust the storage, and delete them after use.

## Daily use and vault reset

Open the extension on an HTTP(S) page, unlock the vault, and select **Save current account**. The popup then shows only accounts associated with that site. **Switch** removes the current site's Cookies, restores the selected encrypted account, and refreshes the active tab.

Use **Settings** for all-bucket management, renaming, and plaintext JSON import/export. These backup actions require the vault to be unlocked; imports are immediately encrypted with the current vault password before upload. **Delete all encrypted data and reset vault password** is a destructive operation: it requires typing `DELETE`, permanently removes every encrypted bucket from the server, locks the vault, and lets you choose a new vault password the next time you save an account. It does not delete your server sign-in account.

## Install the extension

From version 0.0.14, the packaged public key matches the Chrome Web Store identity `lakmdllikmnehpebnphhemkcedkgkfpj`. Older unpacked releases used `kilogkcionjhdmmeafjogdhpoiocgaom`. These are separate browser extension identities: installing the new identity does not automatically migrate the old identity's local settings or unlock state. Existing encrypted server buckets remain accessible after signing in to the same service account and unlocking the vault. Self-hosted servers must allow the new ID in `ALLOWED_EXTENSION_IDS` for OAuth callbacks.

This project currently ships as an unpacked native extension; no production bundle is required.

1. Clone this repository and install test dependencies if needed.
2. Open the Chrome or Edge extensions page.
3. Enable **Developer mode**.
4. Select **Load unpacked** and choose this repository directory (`frontend/` in the local workspace).
5. Open the popup, keep `https://cookie.nestlone.com` or enter your self-hosted HTTPS origin, and sign in with an enabled OAuth provider.
6. Unlock the vault with a strong, unique password and save an account from a website.

The extension requests `activeTab`, `cookies`, `storage`, `downloads`, `identity`, and `scripting`. The only required host is the official API, `https://cookie.nestlone.com/*`. Website access is optional: saving or switching an account asks for the current hostname and its subdomains, without granting access to every site. A self-hosted API needs a separate grant through **Connect server and load sign-in methods**. Additional cookie hosts in older/imported accounts are listed for authorization before any current cookies are cleared. Denying a request cancels that operation. Access can be revoked through the browser's extension settings. `scripting` accesses same-origin Web Storage and supported-site account metadata locally. Review the source before installing it in a sensitive browser profile.

## Use a self-hosted backend

The backend is maintained in a separate repository: [cookie-share-next-server](https://github.com/nestlone/cookie-share-next-server). Deploy it behind HTTPS, configure at least one OAuth provider, and use its public origin in the extension.

The frontend and backend deliberately maintain their own copies of the protocol fixtures and documentation. When changing the protocol, update both repositories and verify their respective contract tests.

## Development

Requirements: Node.js 22.5 or newer.

```bash
npm ci
npm test
node -e "JSON.parse(require('node:fs').readFileSync('manifest.json'));"
```

For the complete local integration check, build the sibling backend first and then run:

```bash
npm --prefix ../backend ci
npm --prefix ../backend run build
node e2e/run.mjs
```

The integration check is intentionally local. GitHub Actions validates the extension, manifest, and crypto contract without storing credentials for the separate private backend repository.

## Repository layout

```text
.github/       Frontend continuous integration
contract/      Fixed protocol fixtures used by extension tests
docs/          Protocol and threat-model documentation
e2e/           Local extension-and-backend integration check
icons/         Extension icons
src/           Manifest V3 service worker, popup, and shared modules
test/          Crypto and contract tests
```

## License

Cookie Share Next is licensed under the [GNU General Public License v3.0](LICENSE).
