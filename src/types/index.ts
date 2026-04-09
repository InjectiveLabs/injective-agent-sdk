export type AgentType = "trading" | "liquidation" | "data" | "portfolio" | "other";
export const AGENT_TYPES: AgentType[] = ["trading", "liquidation", "data", "portfolio", "other"];

export type ServiceType = "mcp" | "a2a" | "web" | "oasf" | "rest" | "grpc" | "webhook" | "custom";
export const SERVICE_TYPES: ServiceType[] = ["mcp", "a2a", "web", "oasf", "rest", "grpc", "webhook", "custom"];

export const AGENT_CARD_TYPE = "https://eips.ethereum.org/EIPS/eip-8004#registration-v1" as const;
export const AGENT_CARD_TYPE_ALT = "https://erc8004.org/agent-card" as const;

export interface ServiceEntry {
  type: ServiceType;
  url: string;
  description?: string;
}

export interface AgentCard {
  type: string;
  name: string;
  description?: string;
  services: ServiceEntry[];
  image: string;
  x402Support: boolean;
  metadata: {
    chain: "injective";
    chainId: string;
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
  agentId: bigint;
  name?: string;
  description?: string;
  builderCode?: string;
  type?: AgentType;
  wallet?: `0x${string}`;
  uri?: string;
  json?: boolean;
  services?: ServiceEntry[];
  removeServices?: ServiceType[];
  image?: string;
  x402?: boolean;       // true = enable, false = disable, undefined = no change
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
