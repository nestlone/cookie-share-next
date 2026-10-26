import { createHash, createPublicKey } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("keeps the development identity aligned with the Chrome Web Store public key", () => {
  const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
  const der = Buffer.from(manifest.key, "base64");
  expect(createPublicKey({ key: der, format: "der", type: "spki" }).asymmetricKeyType).toBe("rsa");
  const id = createHash("sha256").update(der).digest("hex").slice(0, 32)
    .replace(/[0-9a-f]/g, (digit) => String.fromCharCode(97 + parseInt(digit, 16)));
  expect(id).toBe("lakmdllikmnehpebnphhemkcedkgkfpj");
});
