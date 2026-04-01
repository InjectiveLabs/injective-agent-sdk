import { describe, it, expect } from "vitest";
import { generateAgentCard, mergeAgentCard } from "../../src/lib/agent-card.js";
import type { AgentCard } from "../../src/types/index.js";

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

  it("includes default values for services, image, x402Support", () => {
    const card = generateAgentCard({
      name: "Defaults",
      type: "data",
      builderCode: "builder",
      operatorAddress: "0x1234567890123456789012345678901234567890",
    });
    expect(card.services).toEqual([]);
    expect(card.image).toBe("");
    expect(card.x402Support).toBe(false);
  });

  it("generates card with services, image, and x402", () => {
    const card = generateAgentCard({
      name: "FullAgent",
      type: "trading",
      builderCode: "acme",
      operatorAddress: "0x1234567890123456789012345678901234567890",
      services: [
        { type: "mcp", url: "https://agent.dev/mcp" },
        { type: "a2a", url: "https://agent.dev/a2a", description: "A2A endpoint" },
      ],
      image: "ipfs://QmTest123",
      x402: true,
    });
    expect(card.services).toHaveLength(2);
    expect(card.services[0]).toEqual({ type: "mcp", url: "https://agent.dev/mcp" });
    expect(card.services[1].description).toBe("A2A endpoint");
    expect(card.image).toBe("ipfs://QmTest123");
    expect(card.x402Support).toBe(true);
  });
});

describe("mergeAgentCard", () => {
  const baseCard: AgentCard = {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "Original",
    description: "Original description",
    services: [{ type: "mcp", url: "https://old.io/mcp" }],
    image: "ipfs://OldImage",
    x402Support: false,
    metadata: {
      chain: "injective", chainId: "1776",
      agentType: "trading", builderCode: "builder", operatorAddress: "0x123",
    },
  };

  it("replaces service of same type (upsert)", () => {
    const merged = mergeAgentCard(baseCard, {
      services: [{ type: "mcp", url: "https://new.io/mcp" }],
    });
    expect(merged.services).toHaveLength(1);
    expect(merged.services[0].url).toBe("https://new.io/mcp");
  });

  it("appends service of new type", () => {
    const merged = mergeAgentCard(baseCard, {
      services: [{ type: "a2a", url: "https://new.io/a2a" }],
    });
    expect(merged.services).toHaveLength(2);
    expect(merged.services[0].type).toBe("mcp");
    expect(merged.services[1].type).toBe("a2a");
  });

  it("removes service by type", () => {
    const merged = mergeAgentCard(baseCard, {
      removeServices: ["mcp"],
    });
    expect(merged.services).toHaveLength(0);
  });

  it("toggles x402Support", () => {
    const enabled = mergeAgentCard(baseCard, { x402: true });
    expect(enabled.x402Support).toBe(true);

    const disabled = mergeAgentCard(enabled, { x402: false });
    expect(disabled.x402Support).toBe(false);
  });

  it("replaces image", () => {
    const merged = mergeAgentCard(baseCard, { image: "ipfs://NewImage" });
    expect(merged.image).toBe("ipfs://NewImage");
  });

  it("updates name and description", () => {
    const merged = mergeAgentCard(baseCard, { name: "NewName", description: "New desc" });
    expect(merged.name).toBe("NewName");
    expect(merged.description).toBe("New desc");
  });

  it("partial update leaves other fields untouched", () => {
    const merged = mergeAgentCard(baseCard, { x402: true });
    expect(merged.name).toBe("Original");
    expect(merged.description).toBe("Original description");
    expect(merged.services).toEqual(baseCard.services);
    expect(merged.image).toBe("ipfs://OldImage");
  });

  it("spread preserves all fields from existing card", () => {
    const merged = mergeAgentCard(baseCard, { name: "Updated" });
    expect(merged.name).toBe("Updated");
    expect(merged.metadata).toEqual(baseCard.metadata);
  });

  it("normalizes missing fields on old cards", () => {
    const oldCard = { ...baseCard } as Record<string, unknown>;
    delete oldCard.image;
    delete oldCard.x402Support;
    delete oldCard.services;
    const merged = mergeAgentCard(oldCard as AgentCard, { x402: true });
    expect(merged.services).toEqual([]);
    expect(merged.image).toBe("");
    expect(merged.x402Support).toBe(true);
  });
});
