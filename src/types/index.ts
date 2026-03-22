export type AgentType = "trading" | "liquidation" | "data" | "portfolio" | "other";
export const AGENT_TYPES: AgentType[] = ["trading", "liquidation", "data", "portfolio", "other"];

export interface AgentCard {
  type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1";
  name: string;
  description?: string;
  services: unknown[];
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
  json?: boolean;
}

export interface RegisterResult {
  agentId: bigint;
  identityTuple: string;
  cardUri: string;
  txHashes: `0x${string}`[];
  scanUrl: string;
}

export interface UpdateOptions {
  agentId: bigint;
  name?: string;
  description?: string;
  builderCode?: string;
  type?: AgentType;
  wallet?: `0x${string}`;
  uri?: string;
  json?: boolean;
}

export interface UpdateResult {
  agentId: bigint;
  updatedFields: string[];
  txHashes: `0x${string}`[];
}

export interface DeregisterOptions {
  agentId: bigint;
  force?: boolean;
  json?: boolean;
}

export interface DeregisterResult {
  agentId: bigint;
  txHash: `0x${string}`;
}

export interface StatusOptions {
  agentId: bigint;
  json?: boolean;
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
