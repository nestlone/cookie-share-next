# Roadmap

## Password vault and browser integration

- [ ] Add encrypted password entries bound to an exact web origin, alongside the existing Cookie account entries.
- [ ] Store username, password, URL, title, and notes inside the existing client-side encrypted envelope; never send plaintext credentials or entry metadata to the server.
- [ ] Introduce a versioned Argon2id-based envelope for new password-vault data while preserving read compatibility for existing v1/v2 Cookie buckets.
- [ ] Add a content-script field detector for username/password fields, including dynamic forms via `MutationObserver`.
- [ ] Provide user-initiated credential selection and fill, dispatching normal input/change events for modern web applications.
- [ ] Detect submitted new or changed credentials and show an explicit save/update confirmation banner. Never silently save credentials.
- [ ] Keep automatic fill and form submission disabled by default; require exact-origin matching and an explicit user opt-in for either feature.
- [ ] Add targeted compatibility adapters after the generic flow is stable, starting with GitHub and other multi-step login pages.
- [ ] Import basic KeePass KDBX entries locally: title, URL, username, password, and notes. Do not upload the selected KDBX file or its master password.
- [ ] Deliberately defer KDBX key files, YubiKey, TOTP, attachments, SSH keys, custom fields, and full KDBX write compatibility.
