import { describe, it, expect } from "vitest";
import { validateStringField, VALIDATION_LIMITS } from "../src/validation.js";
import { ValidationError } from "../src/errors.js";
import { AgentClient } from "../src/client.js";

// Valid throwaway key for testing (do not use on any real network)
const TEST_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`;
const TEST_WALLET = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`;

function makeClient() {
  return new AgentClient({ privateKey: TEST_KEY, network: "testnet" });
}

describe("validateStringField", () => {
  it("passes for undefined value when not required", () => {
    expect(() => validateStringField(undefined, "test", 100)).not.toThrow();
  });

  it("passes for empty string when not required", () => {
    expect(() => validateStringField("", "test", 100)).not.toThrow();
  });

  it("throws for undefined value when required", () => {
    expect(() => validateStringField(undefined, "test", 100, true)).toThrow(ValidationError);
  });

  it("throws for empty string when required", () => {
    expect(() => validateStringField("", "test", 100, true)).toThrow(ValidationError);
  });

  it("throws for whitespace-only string when required", () => {
    expect(() => validateStringField("   ", "test", 100, true)).toThrow(ValidationError);
  });

  it("passes for string within byte limit", () => {
    expect(() => validateStringField("hello", "test", 10)).not.toThrow();
  });

  it("passes for string exactly at byte limit", () => {
    expect(() => validateStringField("a".repeat(100), "test", 100)).not.toThrow();
  });

  it("throws for string exceeding byte limit", () => {
    expect(() => validateStringField("a".repeat(101), "test", 100)).toThrow(ValidationError);
    expect(() => validateStringField("a".repeat(101), "test", 100)).toThrow(/100 byte limit/);
  });

  it("uses byte length not character length for multibyte strings", () => {
    // Each emoji is 4 bytes. 26 emojis = 104 bytes > 100 limit, but only 26 characters
    const emojis = "🔥".repeat(26);
    expect(emojis.length).toBe(52); // JS string length (surrogate pairs)
    expect(new TextEncoder().encode(emojis).byteLength).toBe(104);
    expect(() => validateStringField(emojis, "test", 100)).toThrow(ValidationError);
  });

  it("includes field name in error message", () => {
    expect(() => validateStringField("a".repeat(101), "Agent name", 100)).toThrow(/Agent name/);
  });

  it("includes byte counts in error message", () => {
    expect(() => validateStringField("a".repeat(101), "test", 100)).toThrow(/got 101 bytes/);
  });
});

describe("VALIDATION_LIMITS", () => {
  it("exports expected limit keys", () => {
    expect(VALIDATION_LIMITS.NAME_MAX_BYTES).toBe(100);
    expect(VALIDATION_LIMITS.DESCRIPTION_MAX_BYTES).toBe(500);
    expect(VALIDATION_LIMITS.BUILDER_CODE_MAX_BYTES).toBe(100);
    expect(VALIDATION_LIMITS.TAG_MAX_BYTES).toBe(64);
    expect(VALIDATION_LIMITS.ENDPOINT_MAX_BYTES).toBe(256);
    expect(VALIDATION_LIMITS.FEEDBACK_URI_MAX_BYTES).toBe(512);
    expect(VALIDATION_LIMITS.VALUE_DECIMALS_MIN).toBe(0);
    expect(VALIDATION_LIMITS.VALUE_DECIMALS_MAX).toBe(18);
  });
});

describe("register() validation", () => {
  it("throws for empty name", async () => {
    const client = makeClient();
    await expect(client.register({ name: "", type: "trading", builderCode: "test", wallet: TEST_WALLET }))
      .rejects.toThrow(ValidationError);
  });

  it("throws for name exceeding 100 bytes", async () => {
    const client = makeClient();
    await expect(client.register({ name: "x".repeat(101), type: "trading", builderCode: "test", wallet: TEST_WALLET }))
      .rejects.toThrow(ValidationError);
  });

  it("throws for multibyte name exceeding 100 bytes", async () => {
    const client = makeClient();
    // 26 fire emoji = 104 bytes
    await expect(client.register({ name: "🔥".repeat(26), type: "trading", builderCode: "test", wallet: TEST_WALLET }))
      .rejects.toThrow(ValidationError);
  });

  it("throws for builderCode exceeding 100 bytes", async () => {
    const client = makeClient();
    await expect(client.register({ name: "Valid", type: "trading", builderCode: "x".repeat(101), wallet: TEST_WALLET }))
      .rejects.toThrow(ValidationError);
  });

  it("throws for description exceeding 500 bytes", async () => {
    const client = makeClient();
    await expect(client.register({ name: "Valid", type: "trading", builderCode: "test", wallet: TEST_WALLET, description: "x".repeat(501) }))
      .rejects.toThrow(ValidationError);
  });

  it("throws for invalid agent type", async () => {
    const client = makeClient();
    await expect(client.register({ name: "Valid", type: "invalid" as any, builderCode: "test", wallet: TEST_WALLET }))
      .rejects.toThrow(ValidationError);
  });
});

describe("update() validation", () => {
  it("throws for name exceeding 100 bytes", async () => {
    const client = makeClient();
    await expect(client.update(1n, { name: "x".repeat(101) }))
      .rejects.toThrow(ValidationError);
  });

  it("throws for description exceeding 500 bytes", async () => {
    const client = makeClient();
    await expect(client.update(1n, { description: "x".repeat(501) }))
      .rejects.toThrow(ValidationError);
  });

  it("throws for invalid agent type", async () => {
    const client = makeClient();
    await expect(client.update(1n, { type: "bogus" as any }))
      .rejects.toThrow(ValidationError);
  });

  it("throws for builderCode exceeding 100 bytes", async () => {
    const client = makeClient();
    await expect(client.update(1n, { builderCode: "x".repeat(101) }))
      .rejects.toThrow(ValidationError);
  });
});

describe("giveFeedback() validation", () => {
  it("throws for tag1 exceeding 64 bytes", async () => {
    const client = makeClient();
    await expect(client.giveFeedback({ agentId: 1n, value: 100n, tag1: "x".repeat(65) }))
      .rejects.toThrow(ValidationError);
  });

  it("throws for tag2 exceeding 64 bytes", async () => {
    const client = makeClient();
    await expect(client.giveFeedback({ agentId: 1n, value: 100n, tag2: "x".repeat(65) }))
      .rejects.toThrow(ValidationError);
  });

  it("throws for endpoint exceeding 256 bytes", async () => {
    const client = makeClient();
    await expect(client.giveFeedback({ agentId: 1n, value: 100n, endpoint: "x".repeat(257) }))
      .rejects.toThrow(ValidationError);
  });

  it("throws for feedbackURI exceeding 512 bytes", async () => {
    const client = makeClient();
    await expect(client.giveFeedback({ agentId: 1n, value: 100n, feedbackURI: "x".repeat(513) }))
      .rejects.toThrow(ValidationError);
  });

  it("throws for valueDecimals = -1", async () => {
    const client = makeClient();
    await expect(client.giveFeedback({ agentId: 1n, value: 100n, valueDecimals: -1 }))
      .rejects.toThrow(ValidationError);
  });

  it("throws for valueDecimals = 19", async () => {
    const client = makeClient();
    await expect(client.giveFeedback({ agentId: 1n, value: 100n, valueDecimals: 19 }))
      .rejects.toThrow(ValidationError);
  });

  it("accepts valueDecimals = 0 (lower bound)", async () => {
    // Validation passes — subsequent RPC call fails, but NOT with ValidationError
    const client = makeClient();
    await expect(client.giveFeedback({ agentId: 1n, value: 100n, valueDecimals: 0 }))
      .rejects.not.toBeInstanceOf(ValidationError);
  });

  it("accepts valueDecimals = 18 (upper bound)", async () => {
    const client = makeClient();
    await expect(client.giveFeedback({ agentId: 1n, value: 100n, valueDecimals: 18 }))
      .rejects.not.toBeInstanceOf(ValidationError);
  });
});
