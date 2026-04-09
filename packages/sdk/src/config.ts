import type { NetworkConfig } from "./types.js";
import { AgentSdkError } from "./errors.js";
import { DEFAULT_IPFS_GATEWAY } from "./card.js";

export const TESTNET: NetworkConfig = {
  name: "testnet",
  chainId: 1439,
  rpcUrl: "https://testnet.sentry.chain.json-rpc.injective.network",
  identityRegistry: "0x19d1916ba1a2ac081b04893563a6ca0c92bc8c8e",
  reputationRegistry: "0x019b24a73d493d86c61cc5dfea32e4865eecb922",
  validationRegistry: "0xbd84e152f41e28d92437b4b822b77e7e31bfd2a4",
  ipfsGateway: DEFAULT_IPFS_GATEWAY,
  deployBlock: 119354199n,
};

export const MAINNET: NetworkConfig = {
  name: "mainnet",
  chainId: 2525,
  rpcUrl: "https://evm.injective.network",
  identityRegistry: "0x0000000000000000000000000000000000000000",
  reputationRegistry: "0x0000000000000000000000000000000000000000",
  validationRegistry: "0x0000000000000000000000000000000000000000",
  ipfsGateway: DEFAULT_IPFS_GATEWAY,
  deployBlock: 0n,
};

export function resolveNetworkConfig(opts?: { network?: string; rpcUrl?: string }): NetworkConfig {
  const network = opts?.network ?? "testnet";
  if (network === "mainnet") {
    throw new AgentSdkError("Mainnet contracts are not yet deployed. Use network: 'testnet'.");
  }
  const base = TESTNET;
  return opts?.rpcUrl ? { ...base, rpcUrl: opts.rpcUrl } : base;
}
