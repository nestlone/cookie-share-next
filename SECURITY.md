# Security Policy

## Reporting a vulnerability

Do not disclose security vulnerabilities through public issues, pull requests, logs, test fixtures, or exported bucket files. Use the repository's private security-reporting channel when it is available; otherwise contact the repository maintainer privately.

Include a minimal reproduction, affected version or commit, impact, and any mitigation you identified. Never include live Cookie values, session tokens, OAuth client secrets, bucket passwords, or an unredacted database.

## Security boundary

This extension is designed so that bucket passwords and decrypted Cookie data remain local. Changes that weaken that boundary, expose secrets through the UI or logs, or alter the cryptographic protocol require explicit security review and updated contract tests.
