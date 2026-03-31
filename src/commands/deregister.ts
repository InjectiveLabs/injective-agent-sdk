import type { DeregisterOptions, DeregisterResult } from "../types/index.js";
import { getConfig } from "../lib/config.js";
import { resolveKey } from "../lib/keys.js";
import { createClients } from "../lib/contracts.js";
import { fetchAgentCard } from "../lib/agent-card.js";
import { CliError, formatContractError } from "../lib/errors.js";
import * as readline from "node:readline/promises";

export async function deregister(opts: DeregisterOptions): Promise<DeregisterResult> {
  const config = getConfig();
  const key = resolveKey();
  const { publicClient, walletClient, identityRegistry } = createClients(config, key.account);

  if (!opts.force) {
    // Verify agent exists (let this error propagate)
    const tokenUri = await publicClient.readContract({
      address: config.identityRegistry, abi: identityRegistry.abi,
      functionName: "tokenURI", args: [opts.agentId],
    }) as string;

    let agentName = `Agent ${opts.agentId}`;
    try {
      const card = await fetchAgentCard(tokenUri, config.ipfsGateway);
      agentName = card.name;
    } catch { /* Card fetch may fail (IPFS unavailable), use fallback name */ }

    console.log(`You are about to deregister agent "${agentName}" (ID: ${opts.agentId}).`);
    console.log("This will burn the identity NFT. This cannot be undone.");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`Type the agent name to confirm: `);
    rl.close();
    if (answer !== agentName) throw new CliError("Confirmation failed. Agent name did not match.");
  }

  try {
    const hash = await walletClient.writeContract({
      address: config.identityRegistry, abi: identityRegistry.abi,
      functionName: "deregister", args: [opts.agentId],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    return { agentId: opts.agentId, txHash: hash };
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(formatContractError(error));
  }
}
