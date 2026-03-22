import { createPublicClient, createWalletClient, http, getContract } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { NetworkConfig } from "../types/index.js";
import IdentityRegistryABI from "../abi/IdentityRegistry.json" with { type: "json" };

export function createClients(config: NetworkConfig, privateKey: `0x${string}`) {
  const chain = {
    id: config.chainId,
    name: config.name,
    nativeCurrency: { name: "INJ", symbol: "INJ", decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
  };
  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });
  const walletClient = createWalletClient({ chain, account, transport: http(config.rpcUrl) });
  const identityRegistry = getContract({
    address: config.identityRegistry,
    abi: IdentityRegistryABI,
    client: { public: publicClient, wallet: walletClient },
  });
  return { publicClient, walletClient, identityRegistry, account };
}
