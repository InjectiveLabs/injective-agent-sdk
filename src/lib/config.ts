import type { NetworkConfig } from "../types/index.js";

const TESTNET: NetworkConfig = {
  name: "testnet",
  chainId: 1776,
  rpcUrl: "https://testnet.sentry.chain.json-rpc.injective.network",
  identityRegistry: "0x257FFC254F57c71c620E4BC300Cf531F2fBed39D",
  reputationRegistry: "0xd8d45AB304df118C72FDb840FAC9f4563806fdF1",
  validationRegistry: "0xE56D35201D0a0E195FAde1A9CEEF369eD88D0A0C",
  ipfsGateway: "https://w3s.link/ipfs/",
};

const MAINNET: NetworkConfig = {
  name: "mainnet",
  chainId: 1776,
  rpcUrl: "https://sentry.chain.json-rpc.injective.network",
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
