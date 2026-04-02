export type AgentType = "trading" | "liquidation" | "data" | "portfolio" | "other";
export const AGENT_TYPES: AgentType[] = ["trading", "liquidation", "data", "portfolio", "other"];

export type ServiceType = "mcp" | "a2a" | "web" | "oasf";
export const SERVICE_TYPES: ServiceType[] = ["mcp", "a2a", "web", "oasf"];

export interface ServiceEntry {
  type: ServiceType;
  url: string;
  description?: string;
}

export interface AgentCard {
  type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1";
  name: string;
  description?: string;
  services: ServiceEntry[];
  image: string;
  x402Support: boolean;
  metadata: {
    chain: "injective";
    chainId: "1776";
    agentType: AgentType;
    builderCode: string;
    operatorAddress: string;
  };
}

export interface RegisterOptions {
  name: string;
  type: AgentType;
  description?: string;
  builderCode: string;
  wallet: `0x${string}`;
  uri?: string;
  gasPrice?: bigint;
  dryRun?: boolean;
  services?: ServiceEntry[];
  image?: string;
  x402?: boolean;
}

export interface RegisterResult {
  agentId: bigint;
  identityTuple: string;
  cardUri: string;
  txHashes: `0x${string}`[];
  scanUrl: string;
}

export interface UpdateOptions {
  name?: string;
  description?: string;
  builderCode?: string;
  type?: AgentType;
  wallet?: `0x${string}`;
  uri?: string;
  gasPrice?: bigint;
  services?: ServiceEntry[];
  removeServices?: ServiceType[];
  image?: string;
  x402?: boolean;
  allowFreshCard?: boolean;
}

export interface DeregisterOptions {
  gasPrice?: bigint;
}

export interface UpdateResult {
  agentId: bigint;
  updatedFields: string[];
  txHashes: `0x${string}`[];
}

export interface DeregisterResult {
  agentId: bigint;
  txHash: `0x${string}`;
}

export interface StatusResult {
  agentId: bigint;
  name: string;
  type: string;
  owner: `0x${string}`;
  wallet: `0x${string}`;
  builderCode: string;
  tokenUri: string;
  identityTuple: string;
}

export interface NetworkConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  identityRegistry: `0x${string}`;
  reputationRegistry: `0x${string}`;
  validationRegistry: `0x${string}`;
  ipfsGateway: string;
}

export interface AgentClientConfig {
  privateKey: `0x${string}`;
  network?: "testnet" | "mainnet";
  rpcUrl?: string;
  storage?: StorageProvider;
  callbacks?: AgentClientCallbacks;
}

export interface ReadClientConfig {
  network?: "testnet" | "mainnet";
  rpcUrl?: string;
}

export interface AgentClientCallbacks {
  onProgress?: (message: string) => void;
  onWarning?: (message: string) => void;
}

export interface StorageProvider {
  uploadJSON(data: unknown, name?: string): Promise<string>;
  uploadFile?(content: Uint8Array, filename: string, mimeType: string): Promise<string>;
}

export interface GenerateCardOptions {
  name: string;
  type: AgentType;
  description?: string;
  builderCode: string;
  operatorAddress: string;
  services?: ServiceEntry[];
  image?: string;
  x402?: boolean;
}

export interface CardUpdates {
  name?: string;
  description?: string;
  services?: ServiceEntry[];
  removeServices?: ServiceType[];
  image?: string;
  x402?: boolean;
}

export interface SignWalletLinkParams {
  agentId: bigint;
  wallet: `0x${string}`;
  ownerAddress: `0x${string}`;
  deadline: bigint;
  account: import("viem/accounts").LocalAccount;
  chainId: number;
  contractAddress: `0x${string}`;
}
