import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateAgentCard, mergeAgentCard, validateFetchedCard, validateServiceEntry, fetchAgentCard } from "../src/card.js";
import { AGENT_CARD_TYPE, AGENT_CARD_TYPE_ALT } from "../src/types.js";
import type { AgentCard } from "../src/types.js";

describe("generateAgentCard", () => {
  it("generates valid card with all fields", () => {
    const card = generateAgentCard({
      name: "TestAgent", type: "trading", description: "A test agent",
      builderCode: "test-builder", operatorAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      chainId: 1439,
    });
    expect(card.type).toBe(AGENT_CARD_TYPE);
    expect(card.metadata.chainId).toBe("1439");
    expect(card.name).toBe("TestAgent");
    expect(card.description).toBe("A test agent");
    expect(card.metadata.agentType).toBe("trading");
  });

  it("includes default values for services, image, x402Support", () => {
    const card = generateAgentCard({
      name: "Defaults", type: "data", builderCode: "builder", operatorAddress: "0x1234567890123456789012345678901234567890",
    });
    expect(card.services).toEqual([]);
    expect(card.image).toBe("");
    expect(card.x402Support).toBe(false);
  });

  it("generates card with services, image, and x402", () => {
    const card = generateAgentCard({
      name: "FullAgent", type: "trading", builderCode: "acme", operatorAddress: "0x1234567890123456789012345678901234567890",
      services: [{ name: "MCP", endpoint: "https://agent.dev/mcp" }],
      image: "ipfs://QmTest123", x402: true,
    });
    expect(card.services).toHaveLength(1);
    expect(card.image).toBe("ipfs://QmTest123");
    expect(card.x402Support).toBe(true);
  });

  it("generates card with 8004scan-compliant service fields (name/endpoint)", () => {
    const card = generateAgentCard({
      name: "Compliant", type: "trading", builderCode: "acme",
      operatorAddress: "0x1234567890123456789012345678901234567890",
      services: [{ name: "MCP", endpoint: "https://agent.dev/mcp" }],
      chainId: 1439,
    });
    expect(card.services[0].name).toBe("MCP");
    expect(card.services[0].endpoint).toBe("https://agent.dev/mcp");
    expect((card.services[0] as any).type).toBeUndefined();
    expect((card.services[0] as any).url).toBeUndefined();
  });

  it("sets active: true by default", () => {
    const card = generateAgentCard({
      name: "Active", type: "trading", builderCode: "b",
      operatorAddress: "0x0000000000000000000000000000000000000000", chainId: 1439,
    });
    expect(card.active).toBe(true);
  });

  it("populates registrations from registryAddress + chainId", () => {
    const card = generateAgentCard({
      name: "Reg", type: "trading", builderCode: "b",
      operatorAddress: "0x0000000000000000000000000000000000000000",
      chainId: 1439,
      registryAddress: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    });
    expect(card.registrations).toEqual([
      { agentId: null, agentRegistry: "eip155:1439:0x8004A818BFB912233c491871b3d84c89A494BD9e" },
    ]);
  });

  it("sets updatedAt to a recent Unix timestamp", () => {
    const before = Math.floor(Date.now() / 1000);
    const card = generateAgentCard({
      name: "Ts", type: "data", builderCode: "b",
      operatorAddress: "0x0000000000000000000000000000000000000000", chainId: 1439,
    });
    const after = Math.floor(Date.now() / 1000);
    expect(card.updatedAt).toBeGreaterThanOrEqual(before);
    expect(card.updatedAt).toBeLessThanOrEqual(after);
  });

  it("omits registrations when registryAddress not provided", () => {
    const card = generateAgentCard({
      name: "NoReg", type: "data", builderCode: "b",
      operatorAddress: "0x0000000000000000000000000000000000000000",
    });
    expect(card.registrations).toBeUndefined();
  });

  it("omits registrations when chainId not provided even if registryAddress is given", () => {
    const card = generateAgentCard({
      name: "NoChainReg", type: "data", builderCode: "b",
      operatorAddress: "0x0000000000000000000000000000000000000000",
      registryAddress: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
      // chainId intentionally omitted
    });
    expect(card.registrations).toBeUndefined();
  });
});

describe("mergeAgentCard", () => {
  const baseCard: AgentCard = {
    type: AGENT_CARD_TYPE,
    name: "Original", description: "Original description",
    services: [{ name: "MCP", endpoint: "https://old.io/mcp" }],
    image: "ipfs://OldImage", x402Support: false,
    metadata: { chain: "injective", chainId: "1439", agentType: "trading", builderCode: "builder", operatorAddress: "0x123" },
  };

  it("replaces service of same name", () => {
    const merged = mergeAgentCard(baseCard, { services: [{ name: "MCP", endpoint: "https://new.io/mcp" }] });
    expect(merged.services).toHaveLength(1);
    expect(merged.services[0].endpoint).toBe("https://new.io/mcp");
  });

  it("appends service of new name", () => {
    const merged = mergeAgentCard(baseCard, { services: [{ name: "A2A", endpoint: "https://new.io/a2a" }] });
    expect(merged.services).toHaveLength(2);
  });

  it("removes service by name", () => {
    const merged = mergeAgentCard(baseCard, { removeServices: ["MCP"] });
    expect(merged.services).toHaveLength(0);
  });

  it("toggles x402Support", () => {
    const enabled = mergeAgentCard(baseCard, { x402: true });
    expect(enabled.x402Support).toBe(true);
    const disabled = mergeAgentCard(enabled, { x402: false });
    expect(disabled.x402Support).toBe(false);
  });

  it("partial update leaves other fields untouched", () => {
    const merged = mergeAgentCard(baseCard, { x402: true });
    expect(merged.name).toBe("Original");
    expect(merged.services).toEqual(baseCard.services);
  });

  it("preserves registrations on merge", () => {
    const card: AgentCard = {
      ...baseCard,
      registrations: [{ agentId: 1n, agentRegistry: "eip155:1439:0x8004A818BFB912233c491871b3d84c89A494BD9e" }],
    };
    const merged = mergeAgentCard(card, { name: "Updated" });
    expect(merged.registrations).toEqual([{ agentId: 1n, agentRegistry: "eip155:1439:0x8004A818BFB912233c491871b3d84c89A494BD9e" }]);
  });

  it("merges active flag to false", () => {
    const card = { ...baseCard, active: true };
    const merged = mergeAgentCard(card, { active: false });
    expect(merged.active).toBe(false);
  });

  it("updates updatedAt on any merge", () => {
    const before = Math.floor(Date.now() / 1000);
    const merged = mergeAgentCard(baseCard, { name: "Refreshed" });
    expect(merged.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it("removes service by name", () => {
    const card: AgentCard = {
      ...baseCard,
      services: [{ name: "MCP", endpoint: "https://old.io/mcp" }],
    };
    const merged = mergeAgentCard(card, { removeServices: ["MCP"] });
    expect(merged.services).toHaveLength(0);
  });

  it("matches services by name for upsert", () => {
    const card: AgentCard = {
      ...baseCard,
      services: [{ name: "MCP", endpoint: "https://old.io/mcp" }],
    };
    const merged = mergeAgentCard(card, {
      services: [{ name: "MCP", endpoint: "https://new.io/mcp" }],
    });
    expect(merged.services).toHaveLength(1);
    expect(merged.services[0].endpoint).toBe("https://new.io/mcp");
  });
});

describe("generateAgentCard chainId", () => {
  it("defaults to 'unknown' when no chainId provided", () => {
    const card = generateAgentCard({
      name: "NoChain", type: "other", builderCode: "b", operatorAddress: "0x0",
    });
    expect(card.metadata.chainId).toBe("unknown");
  });

  it("converts numeric chainId to string", () => {
    const card = generateAgentCard({
      name: "Numeric", type: "other", builderCode: "b", operatorAddress: "0x0", chainId: 2525,
    });
    expect(card.metadata.chainId).toBe("2525");
  });
});

describe("validateFetchedCard", () => {
  it("preserves legacy chainId '1776'", () => {
    const card = validateFetchedCard({
      name: "Legacy", metadata: { chain: "injective", chainId: "1776", agentType: "trading", builderCode: "b", operatorAddress: "0x0" },
    });
    expect(card.metadata.chainId).toBe("1776");
  });

  it("defaults chainId to 'unknown' when missing", () => {
    const card = validateFetchedCard({
      name: "NoChainId", metadata: { chain: "injective", agentType: "trading", builderCode: "b", operatorAddress: "0x0" },
    });
    expect(card.metadata.chainId).toBe("unknown");
  });

  it("defaults chainId to 'unknown' when metadata is missing entirely", () => {
    const card = validateFetchedCard({ name: "NoMeta" });
    expect(card.metadata.chainId).toBe("unknown");
  });

  it("accepts alternate card type URI", () => {
    const card = validateFetchedCard({
      type: AGENT_CARD_TYPE_ALT, name: "AltType",
      metadata: { chain: "injective", chainId: "1439", agentType: "trading", builderCode: "b", operatorAddress: "0x0" },
    });
    expect(card.type).toBe(AGENT_CARD_TYPE_ALT);
  });

  it("preserves card type from JSON", () => {
    const card = validateFetchedCard({
      type: AGENT_CARD_TYPE, name: "Canonical",
    });
    expect(card.type).toBe(AGENT_CARD_TYPE);
  });

  it("defaults type to AGENT_CARD_TYPE when missing", () => {
    const card = validateFetchedCard({ name: "NoType" });
    expect(card.type).toBe(AGENT_CARD_TYPE);
  });
});

describe("fetchAgentCard", () => {
  const validCard = { name: "TestAgent", metadata: { chain: "injective", chainId: "1439", agentType: "trading", builderCode: "b", operatorAddress: "0x0" } };
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("fetches card from https URI directly (no fallback)", async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(validCard), { status: 200 }));
    const card = await fetchAgentCard("https://example.com/card.json");
    expect(card.name).toBe("TestAgent");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects unsupported URI scheme", async () => {
    await expect(fetchAgentCard("ftp://bad.com/card")).rejects.toThrow("Unsupported URI scheme");
  });

  it("uses primary gateway for ipfs:// URI", async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(validCard), { status: 200 }));
    const card = await fetchAgentCard("ipfs://QmTestCid", "https://gateway.pinata.cloud/ipfs/");
    expect(card.name).toBe("TestAgent");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe("https://gateway.pinata.cloud/ipfs/QmTestCid");
  });

  it("falls back to next gateway on primary failure", async () => {
    fetchSpy
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(new Response(JSON.stringify(validCard), { status: 200 }));
    const card = await fetchAgentCard("ipfs://QmTestCid", "https://gateway.pinata.cloud/ipfs/");
    expect(card.name).toBe("TestAgent");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[1][0]).toBe("https://ipfs.io/ipfs/QmTestCid");
  });

  it("falls back to third gateway when first two fail", async () => {
    fetchSpy
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(new Response("", { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(validCard), { status: 200 }));
    const card = await fetchAgentCard("ipfs://QmTestCid", "https://gateway.pinata.cloud/ipfs/");
    expect(card.name).toBe("TestAgent");
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(fetchSpy.mock.calls[2][0]).toBe("https://cloudflare-ipfs.com/ipfs/QmTestCid");
  });

  it("throws when all gateways fail", async () => {
    fetchSpy
      .mockRejectedValueOnce(new Error("timeout"))
      .mockRejectedValueOnce(new Error("timeout"))
      .mockRejectedValueOnce(new Error("timeout"));
    await expect(fetchAgentCard("ipfs://QmTestCid")).rejects.toThrow("Failed to fetch agent card from all IPFS gateways");
  });

  it("deduplicates primary gateway from fallback list", async () => {
    fetchSpy
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(new Response(JSON.stringify(validCard), { status: 200 }));
    // Primary is ipfs.io which is also in fallback list — should not be tried twice
    const card = await fetchAgentCard("ipfs://QmTestCid", "https://ipfs.io/ipfs/");
    expect(card.name).toBe("TestAgent");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // Second call should be cloudflare, not ipfs.io again
    expect(fetchSpy.mock.calls[1][0]).toBe("https://cloudflare-ipfs.com/ipfs/QmTestCid");
  });
});

describe("validateServiceEntry", () => {
  it("preserves known service types", () => {
    const entry = validateServiceEntry({ type: "mcp", url: "https://a.io" });
    expect(entry).toEqual({ name: "MCP", endpoint: "https://a.io" });
  });

  it("preserves wider service types (rest, grpc)", () => {
    expect(validateServiceEntry({ type: "rest", url: "https://a.io" })).toEqual({ name: "web", endpoint: "https://a.io" });
    expect(validateServiceEntry({ type: "grpc", url: "grpc://a.io:50051" })).toEqual({ name: "web", endpoint: "grpc://a.io:50051" });
  });

  it("preserves unknown future service types", () => {
    const entry = validateServiceEntry({ type: "quantum-rpc", url: "https://q.io" });
    expect(entry).toEqual({ name: "quantum-rpc", endpoint: "https://q.io" });
  });

  it("drops entries with missing url", () => {
    expect(validateServiceEntry({ type: "mcp" })).toBeNull();
  });

  it("drops entries with missing type", () => {
    expect(validateServiceEntry({ url: "https://a.io" })).toBeNull();
  });

  it("drops non-object entries", () => {
    expect(validateServiceEntry("string")).toBeNull();
    expect(validateServiceEntry(null)).toBeNull();
  });

  it("accepts new name/endpoint format directly", () => {
    const entry = validateServiceEntry({ name: "MCP", endpoint: "https://a.io", version: "2025-06-18" });
    expect(entry).toEqual({ name: "MCP", endpoint: "https://a.io", version: "2025-06-18" });
  });
});

describe("validateFetchedCard backward compatibility", () => {
  it("converts legacy type/url to name/endpoint", () => {
    const card = validateFetchedCard({
      name: "Legacy",
      services: [{ type: "mcp", url: "https://old.io/mcp" }],
    });
    expect(card.services[0].name).toBe("MCP");
    expect(card.services[0].endpoint).toBe("https://old.io/mcp");
    expect((card.services[0] as any).type).toBeUndefined();
    expect((card.services[0] as any).url).toBeUndefined();
  });

  it("passes through new name/endpoint fields as-is", () => {
    const card = validateFetchedCard({
      name: "Modern",
      services: [{ name: "MCP", endpoint: "https://new.io/mcp", version: "2025-06-18" }],
    });
    expect(card.services[0]).toEqual({ name: "MCP", endpoint: "https://new.io/mcp", version: "2025-06-18" });
  });

  it("preserves registrations array", () => {
    const card = validateFetchedCard({
      name: "WithReg",
      registrations: [{ agentId: 3, agentRegistry: "eip155:1439:0x8004A818BFB912233c491871b3d84c89A494BD9e" }],
    });
    expect(card.registrations).toHaveLength(1);
    expect(card.registrations![0].agentRegistry).toBe("eip155:1439:0x8004A818BFB912233c491871b3d84c89A494BD9e");
  });

  it("preserves active flag", () => {
    const card = validateFetchedCard({ name: "Active", active: true });
    expect(card.active).toBe(true);
  });

  it("preserves updatedAt", () => {
    const card = validateFetchedCard({ name: "Ts", updatedAt: 1712700000 });
    expect(card.updatedAt).toBe(1712700000);
  });

  it("converts legacy a2a type", () => {
    const card = validateFetchedCard({
      name: "A2ALegacy",
      services: [{ type: "a2a", url: "https://old.io/a2a", description: "A2A endpoint" }],
    });
    expect(card.services[0].name).toBe("A2A");
    expect(card.services[0].endpoint).toBe("https://old.io/a2a");
    expect(card.services[0].description).toBe("A2A endpoint");
  });

  it("maps legacy rest/grpc to web", () => {
    const card = validateFetchedCard({
      name: "Rest",
      services: [{ type: "rest", url: "https://api.io/rest" }],
    });
    expect(card.services[0].name).toBe("web");
  });
});
