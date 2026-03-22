import type { StatusOptions, StatusResult } from "../types/index.js";
import { getConfig } from "../lib/config.js";
import { createClients } from "../lib/contracts.js";
import { fetchAgentCard } from "../lib/agent-card.js";
import { CliError, formatContractError } from "../lib/errors.js";
import { decodeAbiParameters, parseAbiParameters } from "viem";

export async function status(opts: StatusOptions): Promise<StatusResult> {
  const config = getConfig();
  // Read-only — use a dummy key
  const { publicClient, identityRegistry } = createClients(config, "0x0000000000000000000000000000000000000000000000000000000000000001" as `0x${string}`);

  try {
    const owner = await publicClient.readContract({
      address: config.identityRegistry, abi: identityRegistry.abi,
      functionName: "ownerOf", args: [opts.agentId],
    }) as `0x${string}`;

    const tokenUri = await publicClient.readContract({
      address: config.identityRegistry, abi: identityRegistry.abi,
      functionName: "tokenURI", args: [opts.agentId],
    }) as string;

    const wallet = await publicClient.readContract({
      address: config.identityRegistry, abi: identityRegistry.abi,
      functionName: "getAgentWallet", args: [opts.agentId],
    }) as `0x${string}`;

    const builderCodeRaw = await publicClient.readContract({
      address: config.identityRegistry, abi: identityRegistry.abi,
      functionName: "getMetadata", args: [opts.agentId, "builderCode"],
    }) as `0x${string}`;

    const typeRaw = await publicClient.readContract({
      address: config.identityRegistry, abi: identityRegistry.abi,
      functionName: "getMetadata", args: [opts.agentId, "agentType"],
    }) as `0x${string}`;

    const builderCode = builderCodeRaw && builderCodeRaw !== "0x"
      ? decodeAbiParameters(parseAbiParameters("string"), builderCodeRaw)[0] : "";
    const agentType = typeRaw && typeRaw !== "0x"
      ? decodeAbiParameters(parseAbiParameters("string"), typeRaw)[0] : "";

    let name = `Agent ${opts.agentId}`;
    try { const card = await fetchAgentCard(tokenUri, config.ipfsGateway); name = card.name; } catch {}

    return {
      agentId: opts.agentId, name, type: agentType, owner, wallet, builderCode, tokenUri,
      identityTuple: `eip155:1776:${config.identityRegistry}:${opts.agentId}`,
    };
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(formatContractError(error));
  }
}
