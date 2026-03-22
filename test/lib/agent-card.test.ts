import { describe, it, expect } from "vitest";
import { generateAgentCard } from "../../src/lib/agent-card.js";

describe("generateAgentCard", () => {
  it("generates valid card with all fields", () => {
    const card = generateAgentCard({
      name: "TestAgent",
      type: "trading",
      description: "A test agent",
      builderCode: "test-builder",
      operatorAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    });
    expect(card.type).toBe("https://eips.ethereum.org/EIPS/eip-8004#registration-v1");
    expect(card.name).toBe("TestAgent");
    expect(card.description).toBe("A test agent");
    expect(card.metadata.chain).toBe("injective");
    expect(card.metadata.chainId).toBe("1776");
    expect(card.metadata.agentType).toBe("trading");
    expect(card.metadata.builderCode).toBe("test-builder");
  });

  it("generates card without optional description", () => {
    const card = generateAgentCard({
      name: "Minimal",
      type: "data",
      builderCode: "builder",
      operatorAddress: "0x1234567890123456789012345678901234567890",
    });
    expect(card.name).toBe("Minimal");
    expect(card.description).toBeUndefined();
  });
});
