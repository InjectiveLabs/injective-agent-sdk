import { describe, it, expect } from "vitest";
import { resolveNetworkConfig, TESTNET } from "../src/config.js";
import { AgentSdkError } from "../src/errors.js";

describe("resolveNetworkConfig", () => {
  it("defaults to testnet", () => {
    const config = resolveNetworkConfig();
    expect(config.name).toBe("testnet");
    expect(config.chainId).toBe(1439);
  });

  it("accepts rpcUrl override", () => {
    const config = resolveNetworkConfig({ rpcUrl: "http://localhost:8545" });
    expect(config.rpcUrl).toBe("http://localhost:8545");
  });

  it("resolves mainnet config", () => {
    const config = resolveNetworkConfig({ network: "mainnet" });
    expect(config.name).toBe("mainnet");
    expect(config.chainId).toBe(1776);
  });

  it("throws on unknown network", () => {
    expect(() => resolveNetworkConfig({ network: "devnet" })).toThrow(AgentSdkError);
  });
});
