import { describe, it, expect, beforeEach } from "vitest";
import { resolveKey } from "../../src/lib/keys.js";

const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const EXPECTED_0X = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

describe("resolveKey", () => {
  beforeEach(() => { delete process.env.INJ_PRIVATE_KEY; });

  it("derives correct 0x address from private key", () => {
    process.env.INJ_PRIVATE_KEY = TEST_PRIVATE_KEY;
    const key = resolveKey();
    expect(key.address.toLowerCase()).toBe(EXPECTED_0X.toLowerCase());
  });

  it("derives inj1 address", () => {
    process.env.INJ_PRIVATE_KEY = TEST_PRIVATE_KEY;
    const key = resolveKey();
    expect(key.injAddress).toMatch(/^inj1/);
  });

  it("handles key without 0x prefix", () => {
    process.env.INJ_PRIVATE_KEY = TEST_PRIVATE_KEY.slice(2);
    const key = resolveKey();
    expect(key.address.toLowerCase()).toBe(EXPECTED_0X.toLowerCase());
  });

  it("throws when no key is set", () => {
    expect(() => resolveKey()).toThrow("No signing key provided");
  });
});
