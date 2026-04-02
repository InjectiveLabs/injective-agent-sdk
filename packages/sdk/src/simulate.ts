import { BaseError } from "viem";
import type { AgentClientCallbacks } from "./types.js";
import { SimulationError, extractRevertName } from "./errors.js";

export interface SimulationResult {
  method: string;
  gasEstimate: bigint;
  result: unknown;
}

/**
 * Simulate a contract call without broadcasting. Throws SimulationError on revert.
 */
export async function simulateOnly(
  publicClient: { simulateContract: (args: any) => Promise<any>; estimateContractGas: (args: any) => Promise<bigint> },
  params: {
    address: `0x${string}`;
    abi: unknown[];
    functionName: string;
    args: readonly unknown[];
    account: unknown;
    gasPrice?: bigint;
    gas?: bigint;
  },
  callbacks?: AgentClientCallbacks,
): Promise<SimulationResult> {
  callbacks?.onProgress?.(`Simulating ${params.functionName}...`);

  const simParams = {
    address: params.address,
    abi: params.abi,
    functionName: params.functionName,
    args: params.args as unknown[],
    account: params.account as `0x${string}`,
    gasPrice: params.gasPrice,
    gas: params.gas,
  };

  try {
    const [{ result }, gasEstimate] = await Promise.all([
      publicClient.simulateContract(simParams),
      publicClient.estimateContractGas(simParams).catch(() => 0n),
    ]);

    callbacks?.onProgress?.(`Simulation passed for ${params.functionName} (est. gas: ${gasEstimate}).`);

    return { method: params.functionName, gasEstimate, result };
  } catch (error) {
    if (error instanceof BaseError) {
      throw new SimulationError(
        `Simulation failed for ${params.functionName}: ${error.shortMessage ?? error.message}`,
        extractRevertName(error),
      );
    }
    throw new SimulationError(
      `Simulation failed for ${params.functionName}: ${String(error)}`,
    );
  }
}

/**
 * Convenience helper: simulate then broadcast in one call.
 * Exported for consumers building custom contract interactions.
 * Not used internally — the SDK calls simulateOnly + writeContract
 * separately to capture gasEstimate for audit logging.
 */
export async function simulateAndWrite(
  publicClient: { simulateContract: (args: any) => Promise<any>; estimateContractGas: (args: any) => Promise<bigint> },
  walletClient: { writeContract: (args: any) => Promise<`0x${string}`> },
  params: {
    address: `0x${string}`;
    abi: unknown[];
    functionName: string;
    args: readonly unknown[];
    account: unknown;
    nonce?: number;
    gasPrice?: bigint;
    gas?: bigint;
  },
  callbacks?: AgentClientCallbacks,
): Promise<`0x${string}`> {
  await simulateOnly(publicClient, params, callbacks);

  callbacks?.onProgress?.(`Broadcasting ${params.functionName}...`);

  return walletClient.writeContract({
    address: params.address,
    abi: params.abi,
    functionName: params.functionName,
    args: params.args as unknown[],
    account: params.account,
    nonce: params.nonce,
    gasPrice: params.gasPrice,
    gas: params.gas,
  });
}
