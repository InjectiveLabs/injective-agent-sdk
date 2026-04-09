import type { NetworkConfig } from "../types/index.js";
import { CliError } from "./errors.js";

/** Staging: Injective's own early deployment on testnet (chain 1439). */
const STAGING: NetworkConfig = {
  name: "staging",
  chainId: 1439,
  rpcUrl: "https://testnet.sentry.chain.json-rpc.injective.network",
  identityRegistry: "0x19d1916ba1a2ac081b04893563a6ca0c92bc8c8e",
  reputationRegistry: "0x019b24a73d493d86c61cc5dfea32e4865eecb922",
  validationRegistry: "0xbd84e152f41e28d92437b4b822b77e7e31bfd2a4",
  ipfsGateway: "https://gateway.pinata.cloud/ipfs/",
};

/** Testnet: Canonical ERC-8004 contracts on Injective testnet (chain 1439). */
const TESTNET: NetworkConfig = {
  name: "testnet",
  chainId: 1439,
  rpcUrl: "https://testnet.sentry.chain.json-rpc.injective.network",
  identityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  reputationRegistry: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
  validationRegistry: "0x0000000000000000000000000000000000000000",
  ipfsGateway: "https://gateway.pinata.cloud/ipfs/",
};

/** Mainnet: Canonical ERC-8004 contracts on Injective mainnet (chain 2525). */
const MAINNET: NetworkConfig = {
  name: "mainnet",
  chainId: 2525,
  rpcUrl: "https://evm.injective.network",
  identityRegistry: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
  reputationRegistry: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
  validationRegistry: "0x0000000000000000000000000000000000000000",
  ipfsGateway: "https://gateway.pinata.cloud/ipfs/",
};

const NETWORKS: Record<string, NetworkConfig> = { staging: STAGING, testnet: TESTNET, mainnet: MAINNET };

export function getConfig(): NetworkConfig {
  const network = process.env.INJ_NETWORK ?? "testnet";
  const base = NETWORKS[network];
  if (!base) {
    throw new CliError(`Unknown network: "${network}". Use INJ_NETWORK=staging, testnet, or mainnet.`);
  }
  const rpcOverride = process.env.INJ_RPC_URL;
  return rpcOverride ? { ...base, rpcUrl: rpcOverride } : base;
}
