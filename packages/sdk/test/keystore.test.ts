import { describe, it, expect } from "vitest";
import { encryptKey, decryptKey, loadKeystore, saveKeystore } from "../src/keystore.js";
import { mkdtempSync, rmSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("keystore", () => {
  it("round-trips: encrypt then decrypt returns original key", () => {
    const key = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" as `0x${string}`;
    const ks = encryptKey({ privateKey: key, password: "hunter2" });
    expect(decryptKey({ keystore: ks, password: "hunter2" })).toBe(key);
  });

  it("wrong password throws", () => {
    const ks = encryptKey({ privateKey: "0x" + "ab".repeat(32) as `0x${string}`, password: "correct" });
    expect(() => decryptKey({ keystore: ks, password: "wrong" })).toThrow();
  });

  it("keystore has expected shape", () => {
    const ks = encryptKey({ privateKey: "0x" + "cd".repeat(32) as `0x${string}`, password: "pw" });
    expect(ks.version).toBe(1);
    expect(ks.crypto.kdf).toBe("scrypt");
    expect(ks.crypto.cipher).toBe("aes-256-gcm");
    expect(ks.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(ks.injAddress).toMatch(/^inj1/);
  });

  it("saveKeystore writes 0600 file, loadKeystore reads it back", () => {
    const dir = mkdtempSync(join(tmpdir(), "ks-test-"));
    const path = join(dir, "keystore.json");
    try {
      const key = "0x" + "ef".repeat(32) as `0x${string}`;
      const ks = encryptKey({ privateKey: key, password: "pw" });
      saveKeystore(ks, path);
      expect(existsSync(path)).toBe(true);
      const mode = statSync(path).mode & 0o777;
      expect(mode).toBe(0o600);
      const loaded = loadKeystore(path);
      expect(decryptKey({ keystore: loaded, password: "pw" })).toBe(key);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("two encryptions of same key produce different ciphertext (random salt/nonce)", () => {
    const key = "0x" + "11".repeat(32) as `0x${string}`;
    const a = encryptKey({ privateKey: key, password: "pw" });
    const b = encryptKey({ privateKey: key, password: "pw" });
    expect(a.crypto.nonce).not.toBe(b.crypto.nonce);
    expect(a.crypto.ciphertext).not.toBe(b.crypto.ciphertext);
  });
});
