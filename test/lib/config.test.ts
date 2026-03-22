import { describe, it, expect, beforeEach } from "vitest";
import { getConfig } from "../../src/lib/config.js";

describe("getConfig", () => {
  beforeEach(() => {
    delete process.env.INJ_NETWORK;
    delete process.env.INJ_RPC_URL;
  });

  it("defaults to testnet", () => {
    const config = getConfig();
    expect(config.name).toBe("testnet");
    expect(config.chainId).toBe(1776);
    expect(config.identityRegistry).toMatch(/^0x/);
  });

  it("uses INJ_RPC_URL override", () => {
    process.env.INJ_RPC_URL = "http://localhost:8545";
    const config = getConfig();
    expect(config.rpcUrl).toBe("http://localhost:8545");
  });
});
