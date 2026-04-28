import type { RegisterResult, StatusResult, UpdateResult, GiveFeedbackResult, RevokeFeedbackResult, FeedbackEntry } from "@injective/agent-sdk";

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

export function formatGiveFeedbackResult(result: GiveFeedbackResult): string {
  return [
    `Feedback submitted!`,
    `  Agent ID: ${result.agentId}`,
    `  Feedback Index: ${result.feedbackIndex}`,
    `  Tx hash: ${result.txHash}`,
  ].join("\n");
}

export function formatRevokeFeedbackResult(result: RevokeFeedbackResult): string {
  return `Feedback revoked for agent ${result.agentId}. Tx hash: ${result.txHash}`;
}

export function formatFeedbackEntries(entries: FeedbackEntry[]): string {
  if (entries.length === 0) return "No feedback entries found.";
  return entries.map((e, i) => [
    `[${i + 1}] Index: ${e.feedbackIndex}`,
    `    Client: ${e.client}`,
    `    Value: ${e.value} (decimals: ${e.decimals})`,
    `    Tags: ${e.tags.filter(Boolean).join(", ") || "(none)"}`,
    `    Revoked: ${e.revoked}`,
  ].join("\n")).join("\n\n");
}
