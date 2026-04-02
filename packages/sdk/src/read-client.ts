import type {
  ReadClientConfig, StatusResult, AgentCard, NetworkConfig,
  DiscoverOptions, ListAgentsOptions, ListAgentsResult,
  ReputationResult, FeedbackEntry, EnrichedAgentResult,
} from "./types.js";
import { resolveNetworkConfig } from "./config.js";
import { createReadOnlyClients, decodeStringMetadata, identityTuple, ReputationRegistryABI } from "./contracts.js";
import { fetchAgentCard } from "./card.js";
import { AgentSdkError, formatContractError } from "./errors.js";
import { parseAbiItem } from "viem";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as `0x${string}`;
const TRANSFER_EVENT = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)");
const DEFAULT_CHUNK_SIZE = 10_000;
const DEFAULT_CACHE_TTL = 60_000;

export class AgentReadClient {
  readonly config: NetworkConfig;
  private publicClient: ReturnType<typeof createReadOnlyClients>["publicClient"];
  private identityRegistry: ReturnType<typeof createReadOnlyClients>["identityRegistry"];
  private reputationRegistry: ReturnType<typeof createReadOnlyClients>["reputationRegistry"];

  // Discovery cache with incremental scan support
  private cachedMinted = new Set<bigint>();
  private cachedBurned = new Set<bigint>();
  private lastScannedBlock: bigint | null = null;
  private cacheTimestamp = 0;
  private discoverPromise: Promise<bigint[]> | null = null;

  constructor(opts?: ReadClientConfig) {
    this.config = resolveNetworkConfig({ network: opts?.network, rpcUrl: opts?.rpcUrl });
    const { publicClient, identityRegistry, reputationRegistry } = createReadOnlyClients(this.config);
    this.publicClient = publicClient;
    this.identityRegistry = identityRegistry;
    this.reputationRegistry = reputationRegistry;
  }

  // ─── Single Agent ──────────────────────────────────────────────────

  async getStatus(agentId: bigint): Promise<StatusResult> {
    try {
      const contractArgs = { address: this.config.identityRegistry, abi: this.identityRegistry.abi } as const;

      const [owner, tokenUri, wallet, builderCodeRaw, typeRaw] = await Promise.all([
        this.publicClient.readContract({ ...contractArgs, functionName: "ownerOf", args: [agentId] }) as Promise<`0x${string}`>,
        this.publicClient.readContract({ ...contractArgs, functionName: "tokenURI", args: [agentId] }) as Promise<string>,
        this.publicClient.readContract({ ...contractArgs, functionName: "getAgentWallet", args: [agentId] }) as Promise<`0x${string}`>,
        this.publicClient.readContract({ ...contractArgs, functionName: "getMetadata", args: [agentId, "builderCode"] }) as Promise<`0x${string}`>,
        this.publicClient.readContract({ ...contractArgs, functionName: "getMetadata", args: [agentId, "agentType"] }) as Promise<`0x${string}`>,
      ]);

      const builderCode = decodeStringMetadata(builderCodeRaw);
      const agentType = decodeStringMetadata(typeRaw);

      let name = `Agent ${agentId}`;
      try { const card = await fetchAgentCard(tokenUri, this.config.ipfsGateway); name = card.name; } catch {}

      return {
        agentId, name, type: agentType, owner, wallet, builderCode, tokenUri,
        identityTuple: identityTuple(this.config, agentId),
      };
    } catch (error) {
      if (error instanceof AgentSdkError) throw error;
      throw formatContractError(error);
    }
  }

  async fetchCard(uri: string): Promise<AgentCard> {
    return fetchAgentCard(uri, this.config.ipfsGateway);
  }

  async ping(): Promise<boolean> {
    try {
      await this.publicClient.getBlockNumber();
      return true;
    } catch {
      return false;
    }
  }

  async pingDetailed(): Promise<{ reachable: boolean; blockNumber?: bigint; latencyMs?: number }> {
    const start = Date.now();
    try {
      const blockNumber = await this.publicClient.getBlockNumber();
      return { reachable: true, blockNumber, latencyMs: Date.now() - start };
    } catch {
      return { reachable: false, latencyMs: Date.now() - start };
    }
  }

  // ─── Discovery ─────────────────────────────────────────────────────

  async discoverAgentIds(opts?: DiscoverOptions): Promise<bigint[]> {
    const cacheTtl = opts?.cacheTtl ?? DEFAULT_CACHE_TTL;

    // Explicit fromBlock bypasses cache entirely
    if (opts?.fromBlock) {
      return this.scanBlocks(opts.fromBlock, opts.chunkSize);
    }

    // Return cached if fresh
    if (this.lastScannedBlock && Date.now() - this.cacheTimestamp < cacheTtl) {
      return this.getLiveIds();
    }

    // Deduplicate concurrent calls
    if (this.discoverPromise) return this.discoverPromise;

    this.discoverPromise = this.refreshCache(opts?.chunkSize).finally(() => {
      this.discoverPromise = null;
    });

    return this.discoverPromise;
  }

  private async refreshCache(chunkSize?: number): Promise<bigint[]> {
    const fromBlock = this.lastScannedBlock ? this.lastScannedBlock + 1n : this.config.deployBlock;
    const latestBlock = await this.publicClient.getBlockNumber();

    if (fromBlock <= latestBlock) {
      await this.scanBlockRange(fromBlock, latestBlock, chunkSize ?? DEFAULT_CHUNK_SIZE);
      this.lastScannedBlock = latestBlock;
    }

    this.cacheTimestamp = Date.now();
    return this.getLiveIds();
  }

  private async scanBlocks(fromBlock: bigint, chunkSize?: number): Promise<bigint[]> {
    const latestBlock = await this.publicClient.getBlockNumber();
    const minted = new Set<bigint>();
    const burned = new Set<bigint>();

    const size = chunkSize ?? DEFAULT_CHUNK_SIZE;
    for (let start = fromBlock; start <= latestBlock; start += BigInt(size)) {
      const end = start + BigInt(size) - 1n > latestBlock ? latestBlock : start + BigInt(size) - 1n;
      const logs = await this.publicClient.getLogs({
        address: this.config.identityRegistry, event: TRANSFER_EVENT,
        fromBlock: start, toBlock: end,
      });
      for (const log of logs) {
        if (log.args.from! === ZERO_ADDRESS) minted.add(log.args.tokenId!);
        if (log.args.to! === ZERO_ADDRESS) burned.add(log.args.tokenId!);
      }
    }

    return [...minted].filter(id => !burned.has(id)).sort((a, b) => Number(a - b));
  }

  private async scanBlockRange(fromBlock: bigint, toBlock: bigint, chunkSize: number): Promise<void> {
    for (let start = fromBlock; start <= toBlock; start += BigInt(chunkSize)) {
      const end = start + BigInt(chunkSize) - 1n > toBlock ? toBlock : start + BigInt(chunkSize) - 1n;
      const logs = await this.publicClient.getLogs({
        address: this.config.identityRegistry, event: TRANSFER_EVENT,
        fromBlock: start, toBlock: end,
      });
      for (const log of logs) {
        if (log.args.from! === ZERO_ADDRESS) this.cachedMinted.add(log.args.tokenId!);
        if (log.args.to! === ZERO_ADDRESS) this.cachedBurned.add(log.args.tokenId!);
      }
    }
  }

  private getLiveIds(): bigint[] {
    return [...this.cachedMinted].filter(id => !this.cachedBurned.has(id)).sort((a, b) => Number(a - b));
  }

  // ─── Listing & Pagination ──────────────────────────────────────────

  async listAgents(opts?: ListAgentsOptions): Promise<ListAgentsResult> {
    const offset = opts?.offset ?? 0;
    const limit = opts?.limit ?? 50;
    const allIds = await this.discoverAgentIds();
    const total = allIds.length;
    const pageIds = allIds.slice(offset, offset + limit);

    const results = await Promise.allSettled(
      pageIds.map(id => opts?.enrich ? this.getEnrichedAgent(id) : this.getStatus(id))
    );

    const agents: StatusResult[] = [];
    const failed: bigint[] = [];

    for (let i = 0; i < results.length; i++) {
      if (results[i].status === "fulfilled") {
        agents.push((results[i] as PromiseFulfilledResult<StatusResult>).value);
      } else {
        failed.push(pageIds[i]);
      }
    }

    return { agents, total, offset, limit, failed };
  }

  // ─── Query by Owner ────────────────────────────────────────────────

  async getAgentsByOwner(address: `0x${string}`, opts?: { offset?: number; limit?: number }): Promise<ListAgentsResult> {
    const allIds = await this.discoverAgentIds();
    const contractArgs = { address: this.config.identityRegistry, abi: this.identityRegistry.abi } as const;

    const ownerResults = await Promise.allSettled(
      allIds.map(id => this.publicClient.readContract({ ...contractArgs, functionName: "ownerOf", args: [id] }) as Promise<`0x${string}`>)
    );

    const ownedIds = allIds.filter((_, i) => {
      const result = ownerResults[i];
      return result.status === "fulfilled" && result.value.toLowerCase() === address.toLowerCase();
    });

    const offset = opts?.offset ?? 0;
    const limit = opts?.limit ?? 50;
    const pageIds = ownedIds.slice(offset, offset + limit);

    const results = await Promise.allSettled(pageIds.map(id => this.getStatus(id)));
    const agents: StatusResult[] = [];
    const failed: bigint[] = [];

    for (let i = 0; i < results.length; i++) {
      if (results[i].status === "fulfilled") {
        agents.push((results[i] as PromiseFulfilledResult<StatusResult>).value);
      } else {
        failed.push(pageIds[i]);
      }
    }

    return { agents, total: ownedIds.length, offset, limit, failed };
  }

  // ─── Reputation ────────────────────────────────────────────────────

  async getReputation(agentId: bigint): Promise<ReputationResult> {
    const entries = await this.getFeedbackEntries(agentId);
    const active = entries.filter(e => !e.revoked);

    if (active.length === 0) return { score: 0, count: 0 };

    const total = active.reduce((sum, e) => sum + Number(e.value) / Math.pow(10, e.decimals), 0);
    const avg = total / active.length;
    // Round to 2 decimal places (values are typically 0-100 after decimal normalization)
    const score = Math.round(avg * 100) / 100;

    return { score, count: active.length };
  }

  async getFeedbackEntries(agentId: bigint): Promise<FeedbackEntry[]> {
    const repArgs = { address: this.config.reputationRegistry, abi: ReputationRegistryABI } as const;

    const result = await this.publicClient.readContract({
      ...repArgs,
      functionName: "readAllFeedback",
      args: [agentId, [], "", "", false],
    }) as [
      `0x${string}`[], bigint[], bigint[], number[], string[], string[], boolean[],
    ];

    const [clients, , values, valueDecimals, tag1s, tag2s, revokedStatuses] = result;

    return clients.map((client, i) => ({
      client,
      value: values[i],
      decimals: Number(valueDecimals[i]),
      tags: [tag1s[i], tag2s[i]] as [string, string],
      revoked: revokedStatuses[i],
    }));
  }

  // ─── Enriched ──────────────────────────────────────────────────────

  async getEnrichedAgent(agentId: bigint): Promise<EnrichedAgentResult> {
    const [status, reputation] = await Promise.all([
      this.getStatus(agentId),
      this.getReputation(agentId),
    ]);

    let card: AgentCard | null = null;
    try { card = await fetchAgentCard(status.tokenUri, this.config.ipfsGateway); } catch {}

    return { ...status, reputation, card };
  }

  // ─── Event Watching ────────────────────────────────────────────────

  watchRegistrations(callback: (event: { agentId: bigint; owner: `0x${string}`; txHash: `0x${string}` }) => void): () => void {
    return this.publicClient.watchEvent({
      address: this.config.identityRegistry,
      event: TRANSFER_EVENT,
      args: { from: ZERO_ADDRESS },
      onLogs: (logs) => {
        for (const log of logs) {
          callback({ agentId: log.args.tokenId!, owner: log.args.to!, txHash: log.transactionHash });
        }
      },
    });
  }

  watchDeregistrations(callback: (event: { agentId: bigint; previousOwner: `0x${string}`; txHash: `0x${string}` }) => void): () => void {
    return this.publicClient.watchEvent({
      address: this.config.identityRegistry,
      event: TRANSFER_EVENT,
      args: { to: ZERO_ADDRESS },
      onLogs: (logs) => {
        for (const log of logs) {
          callback({ agentId: log.args.tokenId!, previousOwner: log.args.from!, txHash: log.transactionHash });
        }
      },
    });
  }
}
