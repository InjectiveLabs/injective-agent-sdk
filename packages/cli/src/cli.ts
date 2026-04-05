#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import {
  AGENT_TYPES, SERVICE_TYPES,
  AgentSdkError, bigintReplacer, assertPublicUrl, ValidationError,
  DEFAULT_AUDIT_LOG_PATH,
} from "@injective/agent-sdk";
import type { ServiceEntry, ServiceType } from "@injective/agent-sdk";
import {
  formatRegisterResult, formatUpdateResult,
  formatDeregisterResult, formatStatusResult,
  formatGiveFeedbackResult, formatRevokeFeedbackResult, formatFeedbackEntries,
} from "./formatting.js";
import { createClient, createReadClient } from "./env.js";
import { keysCommand } from "./commands/keys.js";
import * as readline from "node:readline/promises";

const cliCallbacks = { onProgress: (msg: string) => console.log(msg), onWarning: (msg: string) => console.warn(msg) };

function parseBigInt(value: string, label: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid ${label}: "${value}". Must be a non-negative integer.`);
  }
  return BigInt(value);
}

function parseSignedBigInt(value: string, label: string): bigint {
  if (!/^-?\d+$/.test(value)) {
    throw new Error(`Invalid ${label}: "${value}". Must be an integer.`);
  }
  return BigInt(value);
}

function parseService(value: string, previous: ServiceEntry[]): ServiceEntry[] {
  let parsed: { type?: string; url?: string; description?: string };
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Service must be valid JSON: \'{"type":"mcp","url":"https://..."}\'');
  }
  if (!parsed.type || !parsed.url) {
    throw new Error('Service JSON must include "type" and "url" fields.');
  }
  if (!SERVICE_TYPES.includes(parsed.type as ServiceType)) {
    throw new Error(`Invalid service type "${parsed.type}". Must be one of: ${SERVICE_TYPES.join(", ")}.`);
  }
  try {
    assertPublicUrl(parsed.url, "Service URL");
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new Error(`Invalid service URL: "${parsed.url}". Must be a valid URL.`);
  }
  const entry: ServiceEntry = { type: parsed.type as ServiceType, url: parsed.url };
  if (parsed.description) entry.description = parsed.description;
  return [...previous, entry];
}

function parseRemoveService(value: string, previous: ServiceType[]): ServiceType[] {
  if (!SERVICE_TYPES.includes(value as ServiceType)) {
    throw new Error(`Invalid service type "${value}". Must be one of: ${SERVICE_TYPES.join(", ")}.`);
  }
  return [...previous, value as ServiceType];
}

function handleError(error: unknown): never {
  console.error(error instanceof AgentSdkError ? error.message : String(error));
  process.exit(1);
}

const program = new Command();

program
  .name("inj-agent")
  .description("CLI for managing Injective agent identities on-chain")
  .version("1.0.0");

// register
program
  .command("register")
  .description("Register a new agent identity on-chain")
  .requiredOption("--name <name>", "Agent name (1-100 characters)")
  .requiredOption("--type <type>", `Agent type (${AGENT_TYPES.join(", ")})`)
  .requiredOption("--builder-code <code>", "Builder code identifier")
  .requiredOption("--wallet <address>", "Wallet address to link to this agent")
  .option("--uri <uri>", "Agent card URI (skips IPFS upload)")
  .option("--description <desc>", "Agent description (up to 500 characters)")
  .option("--gas-price <gwei>", "Gas price in gwei")
  .option("--dry-run", "Simulate the registration without sending transactions")
  .option("--json", "Output result as JSON")
  .option("--service <json>", "Service endpoint as JSON (repeatable)", parseService, [])
  .option("--image <pathOrUrl>", "Agent image (local file path or URL)")
  .option("--x402", "Enable x402 payment support")
  .action(async (opts) => {
    try {
      const client = await createClient(cliCallbacks, "cli");
      const result = await client.register({
        name: opts.name,
        type: opts.type,
        builderCode: opts.builderCode,
        wallet: opts.wallet as `0x${string}`,
        uri: opts.uri,
        description: opts.description,
        gasPrice: opts.gasPrice ? parseBigInt(opts.gasPrice, "--gas-price") : undefined,
        dryRun: opts.dryRun,
        services: opts.service.length > 0 ? opts.service : undefined,
        image: opts.image,
        x402: opts.x402 ?? false,
      });
      if (opts.json) {
        console.log(JSON.stringify(result, bigintReplacer, 2));
      } else {
        console.log(formatRegisterResult(result));
      }
    } catch (error) {
      handleError(error);
    }
  });

// update
program
  .command("update <agentId>")
  .description("Update an existing agent identity")
  .option("--name <name>", "New agent name")
  .option("--description <desc>", "New agent description")
  .option("--builder-code <code>", "New builder code")
  .option("--type <type>", `New agent type (${AGENT_TYPES.join(", ")})`)
  .option("--wallet <address>", "New wallet address to link")
  .option("--uri <uri>", "New agent card URI")
  .option("--dry-run", "Simulate without broadcasting")
  .option("--json", "Output result as JSON")
  .option("--service <json>", "Service endpoint as JSON (repeatable)", parseService, [])
  .option("--remove-service <type>", "Remove a service by type (repeatable)", parseRemoveService, [])
  .option("--image <pathOrUrl>", "New agent image (local file path or URL)")
  .option("--x402", "Enable x402 payment support")
  .option("--no-x402", "Disable x402 payment support")
  .action(async (agentIdStr, opts) => {
    const client = await createClient(cliCallbacks, "cli");
    const agentId = parseBigInt(agentIdStr, "agent ID");
    const updateOpts = {
      name: opts.name, description: opts.description, builderCode: opts.builderCode,
      type: opts.type, wallet: opts.wallet as `0x${string}` | undefined, uri: opts.uri,
      dryRun: opts.dryRun,
      services: opts.service.length > 0 ? opts.service : undefined,
      removeServices: opts.removeService.length > 0 ? opts.removeService : undefined,
      image: opts.image, x402: opts.x402,
    };
    try {
      const result = await client.update(agentId, updateOpts);
      if (opts.json) {
        console.log(JSON.stringify(result, bigintReplacer, 2));
      } else {
        console.log(formatUpdateResult(result));
      }
    } catch (error) {
      if (error instanceof AgentSdkError && error.message.includes("Could not fetch existing agent card") && process.stdin.isTTY) {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = await rl.question("Could not fetch existing agent card. Continue with a fresh card? (y/N) ");
        rl.close();
        if (answer.toLowerCase() === "y") {
          try {
            const result = await client.update(agentId, { ...updateOpts, allowFreshCard: true });
            if (opts.json) { console.log(JSON.stringify(result, bigintReplacer, 2)); }
            else { console.log(formatUpdateResult(result)); }
            return;
          } catch (retryError) { handleError(retryError); }
        }
      }
      handleError(error);
    }
  });

// deregister
program
  .command("deregister <agentId>")
  .description("Deregister (burn) an agent identity NFT")
  .option("--force", "Skip confirmation prompt")
  .option("--dry-run", "Simulate without broadcasting")
  .option("--json", "Output result as JSON")
  .action(async (agentIdStr, opts) => {
    try {
      const agentId = parseBigInt(agentIdStr, "agent ID");

      if (!opts.force) {
        const readClient = createReadClient();
        const statusResult = await readClient.getStatus(agentId);
        console.log(`You are about to deregister agent "${statusResult.name}" (ID: ${agentId}).`);
        console.log("This will burn the identity NFT. This cannot be undone.");
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = await rl.question(`Type the agent name to confirm: `);
        rl.close();
        if (answer !== statusResult.name) {
          console.error("Confirmation failed. Agent name did not match.");
          process.exit(1);
        }
      }

      const client = await createClient(cliCallbacks, "cli");
      const result = await client.deregister(agentId, { dryRun: opts.dryRun });
      if (opts.json) {
        console.log(JSON.stringify(result, bigintReplacer, 2));
      } else {
        console.log(formatDeregisterResult(result));
      }
    } catch (error) {
      handleError(error);
    }
  });

// status
program
  .command("status [agentId]")
  .description("Show status of an agent identity")
  .option("--all", "List all agents (not yet available)")
  .option("--json", "Output result as JSON")
  .action(async (agentIdStr, opts) => {
    try {
      if (opts.all) {
        console.log("The --all flag requires the indexer API which is not yet available. Provide an AGENT_ID instead.");
        return;
      }
      if (!agentIdStr) {
        console.error("Agent ID is required. Provide an agent ID or use --all.");
        process.exit(1);
      }
      const readClient = createReadClient();
      const result = await readClient.getStatus(parseBigInt(agentIdStr, "agent ID"));
      if (opts.json) {
        console.log(JSON.stringify(result, bigintReplacer, 2));
      } else {
        console.log(formatStatusResult(result));
      }
    } catch (error) {
      handleError(error);
    }
  });

// audit
program
  .command("audit")
  .description("View recent audit log entries")
  .option("--tail <n>", "Number of entries to show", "20")
  .option("--json", "Output raw JSONL")
  .action(async (opts) => {
    const { readFileSync } = await import("node:fs");
    const logPath = DEFAULT_AUDIT_LOG_PATH;

    let content: string;
    try {
      content = readFileSync(logPath, "utf-8");
    } catch (e: any) {
      if (e?.code === "ENOENT") {
        console.log("No audit log found. Transactions will be logged after the first signing operation.");
        return;
      }
      throw e;
    }
    const lines = content.trim().split("\n").filter(Boolean);
    const n = parseInt(opts.tail, 10) || 20;
    const tail = lines.slice(-n);

    if (opts.json) {
      for (const line of tail) console.log(line);
      return;
    }

    for (const line of tail) {
      try {
        const entry = JSON.parse(line);
        const time = entry.timestamp?.slice(11, 19) ?? "??:??:??";
        const event = (entry.event ?? "").padEnd(12);
        const method = (entry.method ?? "").padEnd(16);
        const hash = entry.result?.txHash ? entry.result.txHash.slice(0, 10) + "..." : "";
        const err = entry.error ? ` ERR: ${entry.error.message}` : "";
        console.log(`${time}  ${event}  ${method}  ${hash}${err}`);
      } catch {
        console.log(line);
      }
    }
  });

// give-feedback
program
  .command("give-feedback <agentId>")
  .description("Give feedback to an agent on-chain")
  .requiredOption("--value <int>", "Feedback score (int128, can be negative)")
  .option("--decimals <uint8>", "Value decimal places", "0")
  .option("--tag1 <string>", "First tag for categorization")
  .option("--tag2 <string>", "Second tag for categorization")
  .option("--endpoint <string>", "Service endpoint that was evaluated")
  .option("--feedback-uri <string>", "Off-chain evidence link")
  .option("--feedback-hash <hex>", "Integrity hash of off-chain evidence (bytes32)")
  .option("--gas-price <gwei>", "Gas price in gwei")
  .option("--dry-run", "Simulate without broadcasting")
  .option("--json", "Output result as JSON")
  .action(async (agentIdStr, opts) => {
    try {
      const client = await createClient(cliCallbacks, "cli");
      const result = await client.giveFeedback({
        agentId: parseBigInt(agentIdStr, "agent ID"),
        value: parseSignedBigInt(opts.value, "--value"),
        valueDecimals: parseInt(opts.decimals, 10),
        tag1: opts.tag1,
        tag2: opts.tag2,
        endpoint: opts.endpoint,
        feedbackURI: opts.feedbackUri,
        feedbackHash: opts.feedbackHash as `0x${string}` | undefined,
        gasPrice: opts.gasPrice ? parseBigInt(opts.gasPrice, "--gas-price") : undefined,
        dryRun: opts.dryRun,
      });
      if (opts.json) {
        console.log(JSON.stringify(result, bigintReplacer, 2));
      } else {
        console.log(formatGiveFeedbackResult(result));
      }
    } catch (error) {
      handleError(error);
    }
  });

// revoke-feedback
program
  .command("revoke-feedback <agentId> <feedbackIndex>")
  .description("Revoke previously given feedback")
  .option("--gas-price <gwei>", "Gas price in gwei")
  .option("--dry-run", "Simulate without broadcasting")
  .option("--json", "Output result as JSON")
  .action(async (agentIdStr, feedbackIndexStr, opts) => {
    try {
      const client = await createClient(cliCallbacks, "cli");
      const result = await client.revokeFeedback({
        agentId: parseBigInt(agentIdStr, "agent ID"),
        feedbackIndex: parseBigInt(feedbackIndexStr, "feedback index"),
        gasPrice: opts.gasPrice ? parseBigInt(opts.gasPrice, "--gas-price") : undefined,
        dryRun: opts.dryRun,
      });
      if (opts.json) {
        console.log(JSON.stringify(result, bigintReplacer, 2));
      } else {
        console.log(formatRevokeFeedbackResult(result));
      }
    } catch (error) {
      handleError(error);
    }
  });

// feedback (read)
program
  .command("feedback <agentId>")
  .description("List feedback entries for an agent")
  .option("--client <address>", "Filter by client address (repeatable)", (val: string, prev: string[]) => [...prev, val], [] as string[])
  .option("--tag1 <string>", "Filter by first tag")
  .option("--tag2 <string>", "Filter by second tag")
  .option("--include-revoked", "Include revoked feedback entries")
  .option("--json", "Output result as JSON")
  .action(async (agentIdStr, opts) => {
    try {
      const readClient = createReadClient();
      const entries = await readClient.getFeedbackEntries(
        parseBigInt(agentIdStr, "agent ID"),
        {
          clientAddresses: opts.client.length > 0 ? opts.client as `0x${string}`[] : undefined,
          tag1: opts.tag1,
          tag2: opts.tag2,
          includeRevoked: opts.includeRevoked,
        },
      );
      if (opts.json) {
        console.log(JSON.stringify(entries, bigintReplacer, 2));
      } else {
        console.log(formatFeedbackEntries(entries));
      }
    } catch (error) {
      handleError(error);
    }
  });

program.addCommand(keysCommand());

program.parse(process.argv);
