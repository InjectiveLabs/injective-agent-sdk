import type { NetworkConfig } from "../types/index.js";
import { CliError } from "./errors.js";

const TESTNET: NetworkConfig = {
  name: "testnet",
  chainId: 1439,
  rpcUrl: "https://testnet.sentry.chain.json-rpc.injective.network",
  identityRegistry: "0x19d1916ba1a2ac081b04893563a6ca0c92bc8c8e",
  reputationRegistry: "0x019b24a73d493d86c61cc5dfea32e4865eecb922",
  validationRegistry: "0xbd84e152f41e28d92437b4b822b77e7e31bfd2a4",
  ipfsGateway: "https://w3s.link/ipfs/",
};

const MAINNET: NetworkConfig = {
  name: "mainnet",
  chainId: 2525,
  rpcUrl: "https://evm.injective.network",
  identityRegistry: "0x0000000000000000000000000000000000000000",
  reputationRegistry: "0x0000000000000000000000000000000000000000",
  validationRegistry: "0x0000000000000000000000000000000000000000",
  ipfsGateway: "https://w3s.link/ipfs/",
};

export function getConfig(): NetworkConfig {
  const network = process.env.INJ_NETWORK ?? "testnet";
  if (network === "mainnet") {
    throw new CliError("Mainnet contracts are not yet deployed. Use INJ_NETWORK=testnet.");
  }
  const base = TESTNET;
  const rpcOverride = process.env.INJ_RPC_URL;
  return rpcOverride ? { ...base, rpcUrl: rpcOverride } : base;
}
