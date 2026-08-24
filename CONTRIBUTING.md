# Contributing

## Scope

Contributions should preserve the zero-knowledge boundary: bucket passwords and plaintext Cookie data must remain client-side. Do not add behavior that transmits decrypted bucket content or bucket passwords to a server.

## Development workflow

1. Create a focused branch from `main` named `feat/*`, `fix/*`, `docs/*`, `test/*`, or `chore/*`.
2. Keep changes small and use English Conventional Commit messages such as `fix(popup): preserve selected bucket`.
3. Run the checks below before opening a pull request:

   ```bash
   npm ci
   npm test
   node -e "JSON.parse(require('node:fs').readFileSync('manifest.json'));"
   ```

4. Include tests whenever behavior changes. Changes to encryption, validation, or the API contract must update the protocol documentation and contract vectors in both repositories.

## Pull requests

Describe the user-visible behavior, security implications, and verification performed. Do not include real Cookie values, OAuth secrets, exported bucket files, session tokens, or `.env` files in issues, commits, tests, or pull requests.

## Local integration check

With the sibling backend repository available, run:

```bash
npm --prefix ../backend ci
npm --prefix ../backend run build
npm run e2e
```
