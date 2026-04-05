import { describe, it, expect } from "vitest";
import { validatePolicy } from "../src/policy.js";
import { PolicyViolationError } from "../src/errors.js";

describe("validatePolicy", () => {
  it("passes when no constraints set", () => {
    expect(() => validatePolicy({}, { contract: "0x1234" as `0x${string}` })).not.toThrow();
  });

  it("throws PolicyViolationError when wallet not in allowedWallets", () => {
    const policy = { allowedWallets: ["0xaaaa" as `0x${string}`] };
    expect(() => validatePolicy(policy, { contract: "0x1234" as `0x${string}`, wallet: "0xbbbb" as `0x${string}` }))
      .toThrow(PolicyViolationError);
  });

  it("passes when wallet is in allowedWallets", () => {
    const policy = { allowedWallets: ["0xaaaa" as `0x${string}`] };
    expect(() => validatePolicy(policy, { contract: "0x1234" as `0x${string}`, wallet: "0xaaaa" as `0x${string}` }))
      .not.toThrow();
  });

  it("throws PolicyViolationError when contract not in allowedContracts", () => {
    const policy = { allowedContracts: ["0xaaaa" as `0x${string}`] };
    expect(() => validatePolicy(policy, { contract: "0xbbbb" as `0x${string}` }))
      .toThrow(PolicyViolationError);
  });

  it("passes when contract is in allowedContracts", () => {
    const policy = { allowedContracts: ["0xaaaa" as `0x${string}`] };
    expect(() => validatePolicy(policy, { contract: "0xaaaa" as `0x${string}` }))
      .not.toThrow();
  });

  it("throws PolicyViolationError when name matches blockedNamePattern", () => {
    const policy = { blockedNamePatterns: [/DROP TABLE/i] };
    expect(() => validatePolicy(policy, { contract: "0x1234" as `0x${string}`, name: "DROP TABLE agents" }))
      .toThrow(PolicyViolationError);
  });

  it("passes when name does not match any blockedNamePattern", () => {
    const policy = { blockedNamePatterns: [/DROP TABLE/i] };
    expect(() => validatePolicy(policy, { contract: "0x1234" as `0x${string}`, name: "My Agent" }))
      .not.toThrow();
  });

  it("PolicyViolationError has field and value properties", () => {
    const policy = { allowedWallets: ["0xaaaa" as `0x${string}`] };
    let caught: PolicyViolationError | undefined;
    try {
      validatePolicy(policy, { contract: "0x1234" as `0x${string}`, wallet: "0xbbbb" as `0x${string}` });
    } catch (e) {
      caught = e as PolicyViolationError;
    }
    expect(caught).toBeInstanceOf(PolicyViolationError);
    expect(caught?.field).toBe("wallet");
    expect(caught?.value).toBe("0xbbbb");
  });

  it("wallet comparison is case-insensitive", () => {
    const policy = { allowedWallets: ["0xAAAA" as `0x${string}`] };
    expect(() => validatePolicy(policy, { contract: "0x1234" as `0x${string}`, wallet: "0xaaaa" as `0x${string}` }))
      .not.toThrow();
  });

  it("empty allowedWallets blocks all wallets (secure default)", () => {
    const policy = { allowedWallets: [] as `0x${string}`[] };
    expect(() => validatePolicy(policy, { contract: "0x1234" as `0x${string}`, wallet: "0xaaaa" as `0x${string}` }))
      .toThrow(PolicyViolationError);
  });

  it("empty allowedContracts blocks all contracts (secure default)", () => {
    const policy = { allowedContracts: [] as `0x${string}`[] };
    expect(() => validatePolicy(policy, { contract: "0xbbbb" as `0x${string}` }))
      .toThrow(PolicyViolationError);
  });
});
