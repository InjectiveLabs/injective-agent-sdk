import { BaseError, ContractFunctionRevertedError } from "viem";

export class AgentSdkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentSdkError";
  }
}

export class ValidationError extends AgentSdkError {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class ContractError extends AgentSdkError {
  readonly revertReason: string | undefined;

  constructor(message: string, revertReason?: string) {
    super(message);
    this.name = "ContractError";
    this.revertReason = revertReason;
  }
}

export class StorageError extends AgentSdkError {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}

export function formatContractError(error: unknown): ContractError {
  if (error instanceof BaseError) {
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      const args = revert.data?.args as unknown[];
      switch (name) {
        case "EmptyTokenURI":
          return new ContractError("Registration failed: token URI cannot be empty.", name);
        case "WalletAlreadyLinked":
          return new ContractError(`Wallet ${args?.[0]} is already linked to agent ${args?.[1]}. Each wallet can only be linked to one agent.`, name);
        case "NotAgentOwner":
          return new ContractError(`You are not the owner of agent ${args?.[0]}.`, name);
        case "DeadlineExpired":
          return new ContractError("Wallet signature deadline has expired. Try again.", name);
        case "InvalidSignature":
          return new ContractError("Invalid wallet signature. Ensure the wallet private key matches the provided wallet address.", name);
        case "SoulboundTransfer":
          return new ContractError("Agent identity tokens cannot be transferred.", name);
        default:
          return new ContractError(`Transaction reverted: ${name ?? "unknown error"}`, name);
      }
    }
    return new ContractError(`Transaction failed: ${error.shortMessage ?? error.message}`);
  }
  return new ContractError(`Unexpected error: ${String(error)}`);
}
