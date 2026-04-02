// Client classes
export { AgentClient } from "./client.js";
export { AgentReadClient } from "./read-client.js";

// Convenience factory for Node.js (reads process.env)
import { AgentClient } from "./client.js";
import { PinataStorage } from "./storage/pinata.js";
import { ValidationError } from "./errors.js";
import type { AgentClientCallbacks } from "./types.js";

export function createAgentClientFromEnv(callbacks?: AgentClientCallbacks): AgentClient {
  const raw = process.env.INJ_PRIVATE_KEY;
  if (!raw) throw new ValidationError("No signing key found. Set INJ_PRIVATE_KEY environment variable.");
  const privateKey = (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
  return new AgentClient({
    privateKey,
    network: (process.env.INJ_NETWORK ?? "testnet") as "testnet" | "mainnet",
    rpcUrl: process.env.INJ_RPC_URL,
    storage: process.env.PINATA_JWT ? new PinataStorage({ jwt: process.env.PINATA_JWT }) : undefined,
    callbacks,
  });
}

// Storage providers
export { PinataStorage } from "./storage/pinata.js";
export { CustomUrlStorage } from "./storage/custom-url.js";

// Agent card utilities
export { generateAgentCard, mergeAgentCard, fetchAgentCard, validateFetchedCard, checkServiceReachability, validateServiceEntry } from "./card.js";

// Wallet utilities
export { evmToInj, signWalletLink, resolveKey } from "./wallet.js";
export type { ResolvedKey } from "./wallet.js";

// Contract utilities
export { identityTuple, encodeStringMetadata, decodeStringMetadata, walletLinkDeadline, IdentityRegistryABI } from "./contracts.js";

// Config
export { resolveNetworkConfig, TESTNET, MAINNET } from "./config.js";

// Validation
export { assertPublicUrl } from "./validation.js";

// Errors
export { AgentSdkError, ContractError, StorageError, ValidationError, formatContractError } from "./errors.js";

// Formatting
export { bigintReplacer } from "./formatting.js";

// Types
export type {
  AgentType, ServiceType, ServiceEntry, AgentCard,
  RegisterOptions, RegisterResult,
  UpdateOptions, UpdateResult,
  DeregisterOptions, DeregisterResult, StatusResult,
  NetworkConfig, AgentClientConfig, ReadClientConfig,
  AgentClientCallbacks, StorageProvider,
  GenerateCardOptions, CardUpdates, SignWalletLinkParams,
} from "./types.js";

// Constants
export { AGENT_TYPES, SERVICE_TYPES } from "./types.js";
