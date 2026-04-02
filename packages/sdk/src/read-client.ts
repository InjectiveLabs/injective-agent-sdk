import type { ReadClientConfig, StatusResult, AgentCard, NetworkConfig } from "./types.js";
import { resolveNetworkConfig } from "./config.js";
import { createReadOnlyClients, decodeStringMetadata, identityTuple } from "./contracts.js";
import { fetchAgentCard } from "./card.js";
import { AgentSdkError, formatContractError } from "./errors.js";

export class AgentReadClient {
  readonly config: NetworkConfig;
  private publicClient: ReturnType<typeof createReadOnlyClients>["publicClient"];
  private identityRegistry: ReturnType<typeof createReadOnlyClients>["identityRegistry"];

  constructor(opts?: ReadClientConfig) {
    this.config = resolveNetworkConfig({ network: opts?.network, rpcUrl: opts?.rpcUrl });
    const { publicClient, identityRegistry } = createReadOnlyClients(this.config);
    this.publicClient = publicClient;
    this.identityRegistry = identityRegistry;
  }

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
}
