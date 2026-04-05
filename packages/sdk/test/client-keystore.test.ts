import { describe, it, expect } from "vitest";
import { AgentClient } from "../src/client.js";
import { encryptKey, saveKeystore } from "../src/keystore.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const KEY = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" as `0x${string}`;

describe("AgentClient key resolution", () => {
  it("accepts keystorePassword + keystorePath instead of privateKey", () => {
    const dir = mkdtempSync(join(tmpdir(), "client-ks-"));
    const path = join(dir, "keystore.json");
    try {
      saveKeystore(encryptKey({ privateKey: KEY, password: "pw" }), path);
      const client = new AgentClient({
        keystorePath: path,
        keystorePassword: "pw",
        network: "testnet",
        audit: false,
      });
      expect(client.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("keystorePassword wrong throws", () => {
    const dir = mkdtempSync(join(tmpdir(), "client-ks-"));
    const path = join(dir, "keystore.json");
    try {
      saveKeystore(encryptKey({ privateKey: KEY, password: "correct" }), path);
      expect(() => new AgentClient({
        keystorePath: path,
        keystorePassword: "wrong",
        network: "testnet",
        audit: false,
      })).toThrow();
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("throws if neither privateKey nor keystorePassword provided", () => {
    expect(() => new AgentClient({ network: "testnet", audit: false } as any))
      .toThrow(/No signing key/);
  });

  it("privateKey still works (backward compat)", () => {
    const client = new AgentClient({ privateKey: KEY, network: "testnet", audit: false });
    expect(client.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
});
