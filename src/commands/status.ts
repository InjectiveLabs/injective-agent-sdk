import type { StatusOptions, StatusResult } from "../types/index.js";
import { getConfig } from "../lib/config.js";
import { createClients, decodeStringMetadata, identityTuple } from "../lib/contracts.js";
import { fetchAgentCard } from "../lib/agent-card.js";
import { CliError, formatContractError } from "../lib/errors.js";

export async function status(opts: StatusOptions): Promise<StatusResult> {
  const config = getConfig();
  // Read-only — use a dummy key
  const { publicClient, identityRegistry } = createClients(config, "0x0000000000000000000000000000000000000000000000000000000000000001" as `0x${string}`);

  try {
    const contractArgs = { address: config.identityRegistry, abi: identityRegistry.abi } as const;

    const [owner, tokenUri, wallet, builderCodeRaw, typeRaw] = await Promise.all([
      publicClient.readContract({ ...contractArgs, functionName: "ownerOf", args: [opts.agentId] }) as Promise<`0x${string}`>,
      publicClient.readContract({ ...contractArgs, functionName: "tokenURI", args: [opts.agentId] }) as Promise<string>,
      publicClient.readContract({ ...contractArgs, functionName: "getAgentWallet", args: [opts.agentId] }) as Promise<`0x${string}`>,
      publicClient.readContract({ ...contractArgs, functionName: "getMetadata", args: [opts.agentId, "builderCode"] }) as Promise<`0x${string}`>,
      publicClient.readContract({ ...contractArgs, functionName: "getMetadata", args: [opts.agentId, "agentType"] }) as Promise<`0x${string}`>,
    ]);

    const builderCode = decodeStringMetadata(builderCodeRaw);
    const agentType = decodeStringMetadata(typeRaw);

    let name = `Agent ${opts.agentId}`;
    try { const card = await fetchAgentCard(tokenUri, config.ipfsGateway); name = card.name; } catch {}

    return {
      agentId: opts.agentId, name, type: agentType, owner, wallet, builderCode, tokenUri,
      identityTuple: identityTuple(config, opts.agentId),
    };
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(formatContractError(error));
  }
}
