# Cookie-share-next Protocol

## Overview

Zero-knowledge cookie bucket management. The server is a "dumb store" — it sees encrypted blobs and nothing else. All encryption/decryption happens client-side.

## Key Hierarchy

```
OAuth identity (GitHub, Google, or LinuxDo)
  └── Server: provider subject is bound to an account; no local account password

Bucket password (user-entered, per-bucket)
  └── PBKDF2-SHA256 → AES-256-GCM key (encrypts/decrypts the bucket envelope)
```

- OAuth identity and bucket passwords are **fully independent**.
- Provider identities are manually linked; the service does not merge accounts by email.
- Bucket passwords are **never** sent to the server.

## Envelope Format

Every encrypted blob uses the same envelope:

```json
{
  "version": 2,
  "salt": "<base64url-encoded 16 bytes>",
  "iv":   "<base64url-encoded 12 bytes>",
  "payload": "<base64url-encoded ciphertext + 16-byte auth tag>"
}
```

### Algorithm

| Parameter | Value |
|---|---|
| Key derivation | PBKDF2-SHA256 |
| Iterations | 600000 (version 2); 100000 for readable version-1 legacy envelopes |
| Derived key length | 256 bits (32 bytes) |
| Symmetric cipher | AES-256-GCM |
| Salt length | 16 bytes |
| IV length | 12 bytes |
| Auth tag length | 16 bytes (appended to ciphertext) |
| Encoding | Base64URL (no padding, `-`/`_` instead of `+`/`/`) |

### Key Derivation

```
key = PBKDF2-SHA256(password, salt, iterations, 32 bytes)
```

Version 2 is the default for newly encrypted buckets. Version 1 is retained
only for backwards-compatible decryption and is never produced by a current
client unless explicitly requested by a legacy migration tool.

### Encryption

```
plaintext = utf8.encode(JSON.stringify(object))
ciphertext = AES-256-GCM.encrypt(key, iv, plaintext)
payload = base64url(ciphertext + authTag16)
```

### Decryption

```
ciphertext = base64url_decode(payload).slice(0, -16)
authTag   = base64url_decode(payload).slice(-16)
plaintext = AES-256-GCM.decrypt(key, iv, ciphertext, authTag)
object = JSON.parse(utf8.decode(plaintext))
```

On wrong password, AES-GCM authentication tag verification fails and the
operation throws. This is how the client verifies a bucket password is correct.

## Bucket Plaintext (client-side only, never sent to server)

```json
{
  "v": 1,
  "bucketId": "vectorBucket1",
  "name": "Facebook",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z",
  "cookies": [
    { "domain": "example.com", "name": "session", "value": "abc", ... }
  ]
}
```

- `bucketId` must match the server-side bucket ID (for verification on import).
- `name` is encrypted inside the envelope — the server never sees it.
- `cookies` is an array of normalized cookie objects (see Cookie Shape below).

## Bucket File (export/import container)

```json
{
  "format": "cookie-share-next/bucket",
  "version": 1,
  "exportedAt": "2026-08-24T12:00:00.000Z",
  "envelope": { ... }
}
```

- Exported client-side, imported client-side. The server is never involved.
- Import requires the bucket password: `decryptEnvelope(password, envelope)` must
  succeed. This is the gate that proves the importer knows the password.

## Cookie Shape

Normalized cookie object (maps to `chrome.cookies.Cookie`):

```json
{
  "domain": "example.com",
  "name": "session",
  "value": "abc123",
  "path": "/",
  "secure": true,
  "httpOnly": true,
  "sameSite": "lax",
  "session": false,
  "expirationDate": 1893456000,
  "hostOnly": false,
  "storeId": null
}
```

- `sameSite`: one of `"lax"`, `"strict"`, `"none"` (lowercase).
- `session`: boolean. If `true`, `expirationDate` is absent/null.
- `expirationDate`: number (seconds since epoch, like `chrome.cookies`).
- `hostOnly`: boolean. If `true`, domain is not prefixed with `.`.
- `storeId`: always `null` in this protocol (present for `chrome.cookies` compat).

## Bucket ID

- Pattern: `/^[A-Za-z0-9]{1,64}$/`
- Generated client-side: 16 random bytes → 32-char hex string.
- Must be unique **within an account** (server returns 409 on duplicate for that account).

## Username Validation

- Pattern: `/^[A-Za-z0-9_.-]{3,32}$/`
- Case-insensitive (`COLLATE NOCASE` on the server).

## Password Validation

- Minimum 8 characters.
- No maximum enforced by the server (bcrypt handles up to 72 bytes).
- Clients should recommend strong passwords.

## API Endpoints

Base path: `/api/v1`

### Auth (public)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/auth/providers` | — | `200 {providers}` |
| POST | `/auth/oauth/:provider/start` | `{mode, redirectUri}` | `200 {authorizeUrl}` |
| GET | `/auth/oauth/:provider/callback` | provider query | `302` to extension redirect with a one-time code |
| POST | `/auth/oauth/exchange` | `{code}` | `200 {token, user}` |
| DELETE | `/auth/oauth/:provider` | — | `200 {providers}`; cannot remove the last provider |
| POST | `/auth/logout` | — | `204` |
| GET | `/health` | — | `200 {status:"ok"}` |

### User (authenticated)

| Method | Path | Response |
|---|---|---|
| GET | `/me` | `200 {user, usage}` |

### Buckets (authenticated)

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/buckets` | `{id, envelope}` | `201` |
| GET | `/buckets` | — | `200 [{id, size, createdAt, updatedAt}]` |
| GET | `/buckets/:id` | — | `200 {id, envelope, ...}` |
| PUT | `/buckets/:id` | `{envelope}` | `200` |
| DELETE | `/buckets/:id` | — | `204` |

### Admin (X-Admin-Token header)

| Method | Path | Response |
|---|---|---|
| GET | `/admin/users` | `200 [{id, displayName, ...}]` |
| PATCH | `/admin/users/:id` | `200 {user}` |

## Quota

- `POST /buckets`: checks `SUM(payload_bytes) + new_bytes <= quota_bytes`.
- `PUT /buckets/:id`: adjusts delta: `used - old + new <= quota_bytes`.
- `GET /me` returns `usage: {usedBytes, todayRequests, todayRequestsLimit}`.
- Daily request limit is DB-backed (survives restarts).

## Threat Model

**What the server operator can see:**
- Bucket IDs (random strings, no semantic meaning)
- Encrypted blob bytes (cannot decrypt without bucket password)
- Payload byte sizes (leaks approximate bucket size)
- Creation/update timestamps
- Number of buckets per user
- Request frequency patterns

**What the server operator cannot see:**
- Bucket names
- Cookie contents, domains, or values
- Bucket passwords
- The user's account password (stored as bcrypt hash)

**What happens in a server breach:**
- Attacker gets bcrypt hashes (can be brute-forced for weak passwords)
- Attacker gets encrypted blobs (cannot decrypt without bucket passwords)
- Active sessions are compromised (tokens stored as SHA-256 hashes)
- No plaintext cookie data is exposed

## Design Rationale: PBKDF2 vs Argon2

The protocol uses PBKDF2-SHA256 rather than Argon2 (which KeePass uses) for
two reasons:

1. **Browser WebCrypto compatibility**: PBKDF2 + AES-GCM are natively available
   in all browsers and Node.js. Argon2 requires a WASM/JS implementation,
   adding complexity and dependency.
2. **Protocol consistency**: Reuses the proven envelope format from the existing
   cookie-share project, ensuring cross-implementation compatibility.

Weakness: PBKDF2 is less resistant to GPU/ASIC parallel brute-forcing than
Argon2. Mitigation: use a strong, unique bucket password. Moving to a more
expensive KDF requires a versioned protocol upgrade so existing files remain
decipherable.
