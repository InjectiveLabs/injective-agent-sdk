import { PolicyViolationError } from "./errors.js";

export interface TransactionPolicy {
  allowedWallets?: `0x${string}`[];
  allowedContracts?: `0x${string}`[];
  requireSimulation?: boolean;
  blockedNamePatterns?: RegExp[];
}

export function validatePolicy(
  policy: TransactionPolicy,
  params: { wallet?: `0x${string}`; contract: `0x${string}`; name?: string },
): void {
  if (policy.allowedWallets && params.wallet) {
    const normalized = params.wallet.toLowerCase();
    if (!policy.allowedWallets.some(w => w.toLowerCase() === normalized)) {
      throw new PolicyViolationError(
        `Wallet ${params.wallet} is not in the allowed wallet list`,
        "wallet",
        params.wallet,
      );
    }
  }

  if (policy.allowedContracts) {
    const normalized = params.contract.toLowerCase();
    if (!policy.allowedContracts.some(c => c.toLowerCase() === normalized)) {
      throw new PolicyViolationError(
        `Contract ${params.contract} is not in the allowed contract list`,
        "contract",
        params.contract,
      );
    }
  }

  if (policy.blockedNamePatterns && params.name) {
    for (const pattern of policy.blockedNamePatterns) {
      if (pattern.test(params.name)) {
        throw new PolicyViolationError(
          `Agent name matches blocked pattern: ${pattern}`,
          "name",
          params.name,
        );
      }
    }
  }
}
