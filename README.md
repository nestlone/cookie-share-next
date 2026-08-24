# Cookie Share Next

Cookie Share Next is a Manifest V3 browser extension for managing encrypted Cookie buckets across authorized browser profiles. It is intended only for accounts and sessions you are authorized to use; it does not bypass authentication, access controls, or platform policies.

> Chinese documentation: [README_CN.md](README_CN.md)

## Features

- Create, unlock, capture, edit, delete, and apply Cookie buckets.
- Read and restore HTTPOnly Cookies where Chromium grants the extension access.
- Encrypt every bucket locally with its own password before synchronization.
- Export and import encrypted `.csn-bucket.json` files for file-based sharing.
- Sign in with GitHub, Google, or LinuxDo OAuth through a compatible backend.
- Use the official service at `https://cookie.nestlone.com` or a compatible self-hosted backend.

## Security and privacy

A bucket password is independent of account authentication and never leaves the extension. The extension derives a local AES-256-GCM key with PBKDF2-SHA256; the service stores opaque encrypted envelopes, bucket IDs, ciphertext sizes, and timestamps only.

Operators can observe account identities, bucket counts, approximate ciphertext sizes, and request timing. They cannot decrypt bucket names, Cookie domains, Cookie values, or bucket passwords from stored data. Email addresses reported by different OAuth providers are never merged automatically. See the complete [protocol and threat model](docs/protocol.md).

Treat an exported bucket file and its password as separate secrets. Send them through different secure channels. Sharing a bucket password cannot be selectively revoked; create a new bucket with a new password when access must be withdrawn.

## Install the extension

This project currently ships as an unpacked native extension; no production bundle is required.

1. Clone this repository and install test dependencies if needed.
2. Open the Chrome or Edge extensions page.
3. Enable **Developer mode**.
4. Select **Load unpacked** and choose this repository directory (`frontend/` in the local workspace).
5. Open the popup, keep `https://cookie.nestlone.com` or enter your self-hosted HTTPS origin, and sign in with an enabled OAuth provider.
6. Create a bucket and assign a strong, unique bucket password.

The extension requests `cookies`, `storage`, `tabs`, `downloads`, and `identity`, plus host access to all URLs. These permissions are required to capture, store, restore, and authenticate Cookie buckets. Review the source before installing it in a sensitive browser profile.

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