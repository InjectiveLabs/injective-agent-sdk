import { describe, it, expect, afterEach } from "vitest";
import { AuditLogger } from "../src/audit.js";
import { readFileSync, unlinkSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function tempLogPath() {
  return join(tmpdir(), `audit-test-${Date.now()}-${Math.random().toString(36).slice(2)}.log`);
}

function cleanup(path: string) {
  try { if (existsSync(path)) unlinkSync(path); } catch { /* ignore */ }
}

function readEntries(path: string) {
  return readFileSync(path, "utf-8").trim().split("\n").map(line => JSON.parse(line));
}

describe("AuditLogger", () => {
  const paths: string[] = [];

  afterEach(() => {
    for (const p of paths) cleanup(p);
    paths.length = 0;
  });

  it("writes valid JSONL entries", () => {
    const logPath = tempLogPath();
    paths.push(logPath);
    const logger = new AuditLogger({ logPath, source: "sdk" });

    logger.log({
      event: "tx:broadcast",
      network: "testnet",
      chainId: 1439,
      signerAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      contract: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      method: "register",
      args: { cardUri: "ipfs://test" },
      durationMs: 123,
    });

    logger.close();
    const entries = readEntries(logPath);
    expect(entries).toHaveLength(1);
    expect(entries[0].event).toBe("tx:broadcast");
    expect(entries[0].method).toBe("register");
    expect(entries[0].network).toBe("testnet");
  });

  it("timestamp is ISO 8601", () => {
    const logPath = tempLogPath();
    paths.push(logPath);
    const logger = new AuditLogger({ logPath });

    logger.log({
      event: "tx:simulate",
      network: "testnet",
      chainId: 1439,
      signerAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      contract: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      method: "register",
      args: { agentId: "1" },
      durationMs: 50,
    });

    logger.close();
    const entries = readEntries(logPath);
    expect(entries[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("writes multiple entries on separate lines", () => {
    const logPath = tempLogPath();
    paths.push(logPath);
    const logger = new AuditLogger({ logPath });
    const base = {
      network: "testnet" as const,
      chainId: 1439,
      signerAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`,
      contract: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as `0x${string}`,
      method: "register",
      args: {},
      durationMs: 10,
    };

    logger.log({ ...base, event: "tx:simulate" });
    logger.log({ ...base, event: "tx:broadcast" });
    logger.log({ ...base, event: "tx:confirm" });

    logger.close();
    const entries = readEntries(logPath);
    expect(entries).toHaveLength(3);
    expect(entries.map((e: { event: string }) => e.event)).toEqual(["tx:simulate", "tx:broadcast", "tx:confirm"]);
  });

  it("writes nothing when disabled", () => {
    const logPath = tempLogPath();
    paths.push(logPath);
    const logger = new AuditLogger({ logPath, enabled: false });

    logger.log({
      event: "tx:broadcast",
      network: "testnet",
      chainId: 1439,
      signerAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      contract: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      method: "register",
      args: {},
      durationMs: 10,
    });

    expect(existsSync(logPath)).toBe(false);
  });

  it("creates log file with 0600 permissions (Unix)", () => {
    if (process.platform === "win32") return;

    const logPath = tempLogPath();
    paths.push(logPath);
    const logger = new AuditLogger({ logPath });

    logger.log({
      event: "tx:broadcast",
      network: "testnet",
      chainId: 1439,
      signerAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      contract: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      method: "register",
      args: {},
      durationMs: 10,
    });

    logger.close();
    const mode = statSync(logPath).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("log() buffers without writing to disk", () => {
    const logPath = tempLogPath();
    paths.push(logPath);
    const logger = new AuditLogger({ logPath });

    logger.log({
      event: "tx:broadcast",
      network: "testnet",
      chainId: 1439,
      signerAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      contract: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      method: "register",
      args: {},
      durationMs: 10,
    });

    expect(existsSync(logPath)).toBe(false);
    logger.close();
  });

  it("flushSync() writes buffered entries to disk", () => {
    const logPath = tempLogPath();
    paths.push(logPath);
    const logger = new AuditLogger({ logPath });
    const base = {
      network: "testnet" as const,
      chainId: 1439,
      signerAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`,
      contract: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as `0x${string}`,
      method: "register",
      args: {},
      durationMs: 10,
    };

    logger.log({ ...base, event: "tx:simulate" });
    logger.log({ ...base, event: "tx:broadcast" });

    logger.flushSync();
    const entries = readEntries(logPath);
    expect(entries).toHaveLength(2);
    expect(entries[0].event).toBe("tx:simulate");
    expect(entries[1].event).toBe("tx:broadcast");
    logger.close();
  });

  it("close() clears timer and flushes remaining entries", () => {
    const logPath = tempLogPath();
    paths.push(logPath);
    const logger = new AuditLogger({ logPath });

    logger.log({
      event: "tx:confirm",
      network: "testnet",
      chainId: 1439,
      signerAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      contract: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      method: "register",
      args: {},
      durationMs: 10,
    });

    logger.close();
    const entries = readEntries(logPath);
    expect(entries).toHaveLength(1);
    expect(entries[0].event).toBe("tx:confirm");
  });

  it("flush() writes entries asynchronously", async () => {
    const logPath = tempLogPath();
    paths.push(logPath);
    const logger = new AuditLogger({ logPath });

    logger.log({
      event: "tx:broadcast",
      network: "testnet",
      chainId: 1439,
      signerAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      contract: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      method: "register",
      args: {},
      durationMs: 10,
    });

    await logger.flush();
    const entries = readEntries(logPath);
    expect(entries).toHaveLength(1);
    expect(entries[0].event).toBe("tx:broadcast");
    logger.close();
  });
});

describe("AuditLogger.sanitizeArgs", () => {
  it("sanitizes register args", () => {
    const result = AuditLogger.sanitizeArgs("register", ["ipfs://card", [{ metadataKey: "builderCode" }, { metadataKey: "agentType" }]]);
    expect(result).toEqual({ cardUri: "ipfs://card", metadataCount: 2 });
  });

  it("sanitizes setMetadata args — no raw bytes", () => {
    const result = AuditLogger.sanitizeArgs("setMetadata", [42n, "builderCode", "0xabcdef1234567890"]);
    expect(result).toEqual({ agentId: "42", key: "builderCode", valueLength: 18 });
    expect(result).not.toHaveProperty("value");
  });

  it("sanitizes setAgentWallet — no signature", () => {
    const result = AuditLogger.sanitizeArgs("setAgentWallet", [1n, "0xwallet", 1234n, "0xsignature_bytes_here"]);
    expect(result).toEqual({ agentId: "1", wallet: "0xwallet", deadline: "1234" });
    expect(result).not.toHaveProperty("signature");
    expect(Object.values(result)).not.toContain("0xsignature_bytes_here");
  });

  it("sanitizes setAgentURI args", () => {
    const result = AuditLogger.sanitizeArgs("setAgentURI", [5n, "ipfs://new-uri"]);
    expect(result).toEqual({ agentId: "5", uri: "ipfs://new-uri" });
  });

  it("sanitizes giveFeedback args — no feedbackURI or feedbackHash", () => {
    const result = AuditLogger.sanitizeArgs("giveFeedback", [
      42n, 85n, 0, "data-quality", "latency", "https://api.example.com", "ipfs://evidence", "0xdeadbeef",
    ]);
    expect(result).toEqual({
      agentId: "42", value: "85", valueDecimals: 0,
      tag1: "data-quality", tag2: "latency", endpoint: "https://api.example.com",
    });
    expect(result).not.toHaveProperty("feedbackURI");
    expect(result).not.toHaveProperty("feedbackHash");
  });

  it("sanitizes revokeFeedback args", () => {
    const result = AuditLogger.sanitizeArgs("revokeFeedback", [42n, 3n]);
    expect(result).toEqual({ agentId: "42", feedbackIndex: "3" });
  });

  it("returns argCount for unknown methods", () => {
    const result = AuditLogger.sanitizeArgs("unknownMethod", [1, 2, 3]);
    expect(result).toEqual({ argCount: 3 });
  });
});
