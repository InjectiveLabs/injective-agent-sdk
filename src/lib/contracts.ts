import { createPublicClient, createWalletClient, http, getContract, encodeAbiParameters, decodeAbiParameters, parseAbiParameters } from "viem";
import type { LocalAccount } from "viem/accounts";
import type { NetworkConfig } from "../types/index.js";
import IdentityRegistryABI from "../abi/IdentityRegistry.json" with { type: "json" };

export function createClients(config: NetworkConfig, account: LocalAccount) {
  const chain = {
    id: config.chainId,
    name: config.name,
    nativeCurrency: { name: "INJ", symbol: "INJ", decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
  };
  const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });
  const walletClient = createWalletClient({ chain, account, transport: http(config.rpcUrl) });
  const identityRegistry = getContract({
    address: config.identityRegistry,
    abi: IdentityRegistryABI,
    client: { public: publicClient, wallet: walletClient },
  });
  return { publicClient, walletClient, identityRegistry, account };
}

export function encodeStringMetadata(value: string): `0x${string}` {
  return encodeAbiParameters(parseAbiParameters("string"), [value]);
}

export function decodeStringMetadata(raw: `0x${string}`): string {
  if (!raw || raw === "0x") return "";
  return decodeAbiParameters(parseAbiParameters("string"), raw)[0];
}

export function identityTuple(config: NetworkConfig, agentId: bigint): string {
  return `eip155:${config.chainId}:${config.identityRegistry}:${agentId}`;
}

export function walletLinkDeadline(offsetSeconds = 600): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + offsetSeconds);
}
