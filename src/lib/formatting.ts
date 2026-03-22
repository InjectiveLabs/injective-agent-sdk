import type { RegisterResult, DeregisterResult, StatusResult, UpdateResult } from "../types/index.js";

export function formatRegisterResult(result: RegisterResult): string {
  if (result.txHashes.length === 0) return "";
  return [
    `Agent registered successfully!`,
    `  Agent ID: ${result.agentId}`,
    `  Identity: ${result.identityTuple}`,
    `  Card URI: ${result.cardUri}`,
    `  Tx hashes: ${result.txHashes.join(", ")}`,
    `  View: ${result.scanUrl}`,
  ].join("\n");
}

export function formatDeregisterResult(result: DeregisterResult): string {
  return `Agent ${result.agentId} deregistered. Tx hash: ${result.txHash}`;
}

export function formatStatusResult(result: StatusResult): string {
  return [
    `Agent: ${result.name} (ID: ${result.agentId})`,
    `Identity: ${result.identityTuple}`,
    `Type: ${result.type}`,
    `Builder Code: ${result.builderCode}`,
    `Owner: ${result.owner}`,
    `Wallet: ${result.wallet}`,
    `Token URI: ${result.tokenUri}`,
    ``,
    `Trading & Reputation: Metrics available when indexer API is live.`,
  ].join("\n");
}

export function formatUpdateResult(result: UpdateResult): string {
  return [
    `Agent ${result.agentId} updated.`,
    `  Updated fields: ${result.updatedFields.join(", ")}`,
    `  Tx hashes: ${result.txHashes.join(", ")}`,
  ].join("\n");
}
