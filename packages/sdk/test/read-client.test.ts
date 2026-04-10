import { describe, it, expect } from "vitest";
import { AgentReadClient } from "../src/read-client.js";

const RPC_URL = "https://k8s.testnet.json-rpc.injective.network";
const itLive = process.env.SKIP_LIVE_TESTS ? it.skip : it;

// Live tests use staging — that's where agents 0-3 are registered.
// Canonical testnet registry (0x8004A818...) has no agents yet.
describe("AgentReadClient", () => {
  const client = new AgentReadClient({ network: "staging", rpcUrl: RPC_URL });

  itLive("ping returns true for reachable RPC", async () => {
    const result = await client.ping();
    expect(result).toBe(true);
  }, 10000);

  itLive("pingDetailed returns block number and latency", async () => {
    const result = await client.pingDetailed();
    expect(result.reachable).toBe(true);
    expect(result.blockNumber).toBeGreaterThan(0n);
    expect(typeof result.latencyMs).toBe("number");
  }, 10000);

  it("ping returns false for unreachable RPC", async () => {
    const badClient = new AgentReadClient({ network: "testnet", rpcUrl: "http://192.0.2.1:1" });
    const result = await badClient.ping();
    expect(result).toBe(false);
  }, 15000);

  itLive("getStatus returns agent details", async () => {
    const status = await client.getStatus(0n);
    expect(status.agentId).toBe(0n); // agent 0 on staging
    expect(status.owner).toMatch(/^0x/);
    expect(status.identityTuple).toContain("eip155:1439");
  }, 15000);

  itLive("discoverAgentIds returns live agent IDs", async () => {
    const ids = await client.discoverAgentIds();
    expect(ids.length).toBeGreaterThan(0);
    expect(typeof ids[0]).toBe("bigint");
  }, 120000);

  itLive("discoverAgentIds caches results", async () => {
    // Ensure cache is populated from previous test
    await client.discoverAgentIds();
    const start = Date.now();
    const ids = await client.discoverAgentIds();
    const elapsed = Date.now() - start;
    expect(ids.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(50);
  }, 120000);

  itLive("listAgents returns paginated results", async () => {
    // Uses cached discovery from previous tests
    const result = await client.listAgents({ offset: 0, limit: 3 });
    expect(result.agents.length).toBeLessThanOrEqual(3);
    expect(result.total).toBeGreaterThan(0);
    expect(result.offset).toBe(0);
    expect(result.limit).toBe(3);
  }, 120000);

  itLive("getReputation returns score and count", async () => {
    const rep = await client.getReputation(0n);
    expect(typeof rep.score).toBe("number");
    expect(typeof rep.count).toBe("number");
  }, 15000);

  itLive("getEnrichedAgent returns status + reputation", async () => {
    const enriched = await client.getEnrichedAgent(0n);
    expect(enriched.agentId).toBe(0n);
    expect(enriched.reputation).toBeDefined();
    expect(typeof enriched.reputation.score).toBe("number");
  }, 30000);

  itLive("getAgentsByOwner returns matching agents", async () => {
    // Uses cached discovery
    const result = await client.getAgentsByOwner("0x2968698C6b9Ed6D44b667a0b1F312a3b5D94Ded7");
    expect(result.agents.length).toBeGreaterThan(0);
    expect(result.agents[0].owner.toLowerCase()).toBe("0x2968698c6b9ed6d44b667a0b1f312a3b5d94ded7");
  }, 120000);

  // ─── Enhanced Reputation & Feedback ────────────────────────────

  itLive("getFeedbackEntries returns entries with feedbackIndex", async () => {
    const entries = await client.getFeedbackEntries(0n);
    if (entries.length > 0) {
      expect(entries[0]).toHaveProperty("feedbackIndex");
      expect(typeof entries[0].feedbackIndex).toBe("bigint");
    }
  }, 15000);

  itLive("getFeedbackEntries with no options behaves identically (backward compat)", async () => {
    const entries = await client.getFeedbackEntries(0n);
    for (const e of entries) {
      expect(e).toHaveProperty("client");
      expect(e).toHaveProperty("feedbackIndex");
      expect(e).toHaveProperty("value");
      expect(e).toHaveProperty("decimals");
      expect(e).toHaveProperty("tags");
      expect(e).toHaveProperty("revoked");
      expect(e.revoked).toBe(false); // default excludes revoked
    }
  }, 15000);

  itLive("getFeedbackEntries with includeRevoked returns all entries", async () => {
    const withoutRevoked = await client.getFeedbackEntries(0n);
    const withRevoked = await client.getFeedbackEntries(0n, { includeRevoked: true });
    expect(withRevoked.length).toBeGreaterThanOrEqual(withoutRevoked.length);
  }, 15000);

  itLive("getReputation returns clients array", async () => {
    const rep = await client.getReputation(0n);
    expect(typeof rep.score).toBe("number");
    expect(typeof rep.count).toBe("number");
    expect(Array.isArray(rep.clients)).toBe(true);
  }, 15000);

  itLive("getReputation for agent with no feedback returns zeros", async () => {
    // Use a very high agent ID that likely has no feedback
    const rep = await client.getReputation(999999n);
    expect(rep).toEqual({ score: 0, count: 0, clients: [] });
  }, 15000);

  itLive("getClients returns address array", async () => {
    const clients = await client.getClients(0n);
    expect(Array.isArray(clients)).toBe(true);
    if (clients.length > 0) {
      expect(clients[0]).toMatch(/^0x/);
    }
  }, 15000);
});
