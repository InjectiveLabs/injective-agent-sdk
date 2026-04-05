import { createPublicClient, createWalletClient, http, getContract, encodeAbiParameters, decodeAbiParameters, parseAbiParameters } from "viem";
import type { LocalAccount } from "viem/accounts";
import type { NetworkConfig } from "./types.js";
import IdentityRegistryABI from "./abi/IdentityRegistry.json" with { type: "json" };
import ReputationRegistryABI from "./abi/ReputationRegistry.json" with { type: "json" };

export { IdentityRegistryABI, ReputationRegistryABI };

function makeChain(config: NetworkConfig) {
  return {
    id: config.chainId,
    name: config.name,
    nativeCurrency: { name: "INJ", symbol: "INJ", decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
  };
}

export function createClients(config: NetworkConfig, account: LocalAccount) {
  const chain = makeChain(config);
  const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });
  const walletClient = createWalletClient({ chain, account, transport: http(config.rpcUrl) });
  const identityRegistry = getContract({
    address: config.identityRegistry,
    abi: IdentityRegistryABI,
    client: { public: publicClient, wallet: walletClient },
  });
  return { publicClient, walletClient, identityRegistry, account };
}

export function createReadOnlyClients(config: NetworkConfig) {
  const chain = makeChain(config);
  const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });
  const identityRegistry = getContract({
    address: config.identityRegistry,
    abi: IdentityRegistryABI,
    client: { public: publicClient },
  });
  const reputationRegistry = getContract({
    address: config.reputationRegistry,
    abi: ReputationRegistryABI,
    client: { public: publicClient },
  });
  return { publicClient, identityRegistry, reputationRegistry };
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

// Must match IdentityRegistryUpgradeable.sol MAX_DEADLINE_DELAY (5 minutes)
export const MAX_DEADLINE_SECONDS = 300;

export function walletLinkDeadline(offsetSeconds = 240): bigint {
  if (offsetSeconds > MAX_DEADLINE_SECONDS) {
    throw new Error(
      `walletLinkDeadline: offsetSeconds (${offsetSeconds}) exceeds contract maximum (${MAX_DEADLINE_SECONDS})`
    );
  }
  return BigInt(Math.floor(Date.now() / 1000) + offsetSeconds);
}
