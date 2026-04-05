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
  gasEstimate?: bigint;
}

export interface UpdateOptions {
  name?: string;
  description?: string;
  builderCode?: string;
  type?: AgentType;
  wallet?: `0x${string}`;
  uri?: string;
  gasPrice?: bigint;
  dryRun?: boolean;
  services?: ServiceEntry[];
  removeServices?: ServiceType[];
  image?: string;
  x402?: boolean;
  allowFreshCard?: boolean;
}

export interface DeregisterOptions {
  gasPrice?: bigint;
  dryRun?: boolean;
}

export interface UpdateResult {
  agentId: bigint;
  updatedFields: string[];
  txHashes: `0x${string}`[];
  simulations?: Array<{ method: string; gasEstimate: bigint }>;
}

export interface DeregisterResult {
  agentId: bigint;
  txHash: `0x${string}`;
  gasEstimate?: bigint;
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
  deployBlock: bigint;
}

export interface AgentClientConfig {
  privateKey?: `0x${string}`;           // now optional
  keystorePassword?: string;            // unlock keystore file
  keystorePath?: string;                // custom path (default: ~/.injective-agent/keystore.json)
  network?: "testnet" | "mainnet";
  rpcUrl?: string;
  storage?: StorageProvider;
  callbacks?: AgentClientCallbacks;
  audit?: boolean;
  auditLogPath?: string;
  auditSource?: "cli" | "sdk";
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
  chainId?: number | string;
}

export interface CardUpdates {
  name?: string;
  description?: string;
  services?: ServiceEntry[];
  removeServices?: ServiceType[];
  image?: string;
  x402?: boolean;
}

// Discovery & listing
export interface DiscoverOptions {
  fromBlock?: bigint;
  chunkSize?: number;
  cacheTtl?: number;
}

export interface ListAgentsOptions {
  offset?: number;
  limit?: number;
  enrich?: boolean;
}

export interface ListAgentsResult {
  agents: StatusResult[];
  total: number;
  offset: number;
  limit: number;
  failed: bigint[];
}

// Reputation
export interface ReputationResult {
  score: number;
  count: number;
  clients: `0x${string}`[];
}

export interface FeedbackEntry {
  client: `0x${string}`;
  feedbackIndex: bigint;
  value: bigint;
  decimals: number;
  tags: [string, string];
  revoked: boolean;
}

// --- Feedback Write ---
export interface GiveFeedbackOptions {
  agentId: bigint;
  value: bigint;
  valueDecimals?: number;
  tag1?: string;
  tag2?: string;
  endpoint?: string;
  feedbackURI?: string;
  feedbackHash?: `0x${string}`;
  gasPrice?: bigint;
  dryRun?: boolean;
}

export interface GiveFeedbackResult {
  txHash: `0x${string}`;
  agentId: bigint;
  feedbackIndex: bigint;
  gasEstimate?: bigint;
}

export interface RevokeFeedbackOptions {
  agentId: bigint;
  feedbackIndex: bigint;
  gasPrice?: bigint;
  dryRun?: boolean;
}

export interface RevokeFeedbackResult {
  txHash: `0x${string}`;
  agentId: bigint;
  gasEstimate?: bigint;
}

// --- Feedback Query ---
export interface FeedbackQueryOptions {
  clientAddresses?: `0x${string}`[];
  tag1?: string;
  tag2?: string;
  includeRevoked?: boolean;
}

export interface ReputationQueryOptions {
  clientAddresses?: `0x${string}`[];
  tag1?: string;
  tag2?: string;
}

export interface EnrichedAgentResult extends StatusResult {
  reputation: ReputationResult;
  card: AgentCard | null;
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
