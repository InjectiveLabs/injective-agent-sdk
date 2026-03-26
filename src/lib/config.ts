import type { NetworkConfig } from "../types/index.js";

const TESTNET: NetworkConfig = {
  name: "testnet",
  chainId: 1439,
  rpcUrl: "https://testnet.sentry.chain.json-rpc.injective.network",
  identityRegistry: "0x8004A2C41f13a9A5FbD9E8FaE4B5010ed079C95c",
  reputationRegistry: "0x8004B10BD97503c52B8a3625D460F66e0f4C1561",
  validationRegistry: "0x8004CFB61D2E34bdEE8de3B38BdCA400C95CB26f",
  ipfsGateway: "https://w3s.link/ipfs/",
};

const MAINNET: NetworkConfig = {
  name: "mainnet",
  chainId: 1, // TBD: Injective mainnet EVM chain ID
  rpcUrl: "https://evm.injective.network",
  identityRegistry: "0x0000000000000000000000000000000000000000",
  reputationRegistry: "0x0000000000000000000000000000000000000000",
  validationRegistry: "0x0000000000000000000000000000000000000000",
  ipfsGateway: "https://w3s.link/ipfs/",
};

export function getConfig(): NetworkConfig {
  const network = process.env.INJ_NETWORK ?? "testnet";
  const base = network === "mainnet" ? MAINNET : TESTNET;
  const rpcOverride = process.env.INJ_RPC_URL;
  return rpcOverride ? { ...base, rpcUrl: rpcOverride } : base;
}
