import { BaseError, ContractFunctionRevertedError } from "viem";

export class CliError extends Error {
  constructor(message: string, public exitCode: number = 1) {
    super(message);
    this.name = "CliError";
  }
}

export function formatContractError(error: unknown): string {
  if (error instanceof BaseError) {
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      const args = revert.data?.args as unknown[];
      switch (name) {
        case "EmptyTokenURI":
          return "Registration failed: token URI cannot be empty.";
        case "WalletAlreadyLinked":
          return `Wallet ${args?.[0]} is already linked to agent ${args?.[1]}. Each wallet can only be linked to one agent.`;
        case "NotAgentOwner":
          return `You are not the owner of agent ${args?.[0]}.`;
        case "DeadlineExpired":
          return "Wallet signature deadline has expired. Try again.";
        case "InvalidSignature":
          return "Invalid wallet signature. Ensure the wallet private key matches the --wallet address.";
        case "SoulboundTransfer":
          return "Agent identity tokens cannot be transferred.";
        case "OwnableUnauthorizedAccount":
          return `Caller ${args?.[0]} is not authorized. This function is restricted to the contract owner.`;
        case "ERC721NonexistentToken":
          return `Agent ${args?.[0]} does not exist (already burned, or wrong network).`;
        case "ERC721IncorrectOwner":
          return `Caller ${args?.[0]} is not the owner of agent ${args?.[1]} (actual owner: ${args?.[2]}).`;
        default: {
          const argsStr = args && args.length > 0 ? `(${args.map(String).join(", ")})` : "";
          return `Transaction reverted: ${name ?? "unknown error"}${argsStr}`;
        }
      }
    }
    return `Transaction failed: ${error.shortMessage ?? error.message}`;
  }
  return `Unexpected error: ${String(error)}`;
}
