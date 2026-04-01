#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { AGENT_TYPES, SERVICE_TYPES } from "./types/index.js";
import type { ServiceEntry, ServiceType } from "./types/index.js";
import { register } from "./commands/register.js";
import { update } from "./commands/update.js";
import { deregister } from "./commands/deregister.js";
import { status } from "./commands/status.js";
import { CliError } from "./lib/errors.js";
import { assertPublicUrl } from "./lib/url.js";
import {
  formatRegisterResult,
  formatUpdateResult,
  formatDeregisterResult,
  formatStatusResult,
  bigintReplacer,
} from "./lib/formatting.js";

function parseBigInt(value: string, label: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new CliError(`Invalid ${label}: "${value}". Must be a non-negative integer.`);
  }
  return BigInt(value);
}

function parseService(value: string, previous: ServiceEntry[]): ServiceEntry[] {
  let parsed: { type?: string; url?: string; description?: string };
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new CliError('Service must be valid JSON: \'{"type":"mcp","url":"https://..."}\'');
  }
  if (!parsed.type || !parsed.url) {
    throw new CliError('Service JSON must include "type" and "url" fields.');
  }
  if (!SERVICE_TYPES.includes(parsed.type as ServiceType)) {
    throw new CliError(`Invalid service type "${parsed.type}". Must be one of: ${SERVICE_TYPES.join(", ")}.`);
  }
  try {
    assertPublicUrl(parsed.url, "Service URL");
  } catch (err) {
    if (err instanceof CliError) throw err;
    throw new CliError(`Invalid service URL: "${parsed.url}". Must be a valid URL.`);
  }
  const entry: ServiceEntry = { type: parsed.type as ServiceType, url: parsed.url };
  if (parsed.description) entry.description = parsed.description;
  return [...previous, entry];
}

function parseRemoveService(value: string, previous: ServiceType[]): ServiceType[] {
  if (!SERVICE_TYPES.includes(value as ServiceType)) {
    throw new CliError(`Invalid service type "${value}". Must be one of: ${SERVICE_TYPES.join(", ")}.`);
  }
  return [...previous, value as ServiceType];
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
      const result = await register({
        name: opts.name,
        type: opts.type,
        builderCode: opts.builderCode,
        wallet: opts.wallet as `0x${string}`,
        uri: opts.uri,
        description: opts.description,
        gasPrice: opts.gasPrice ? parseBigInt(opts.gasPrice, "--gas-price") : undefined,
        dryRun: opts.dryRun,
        json: opts.json,
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
      if (error instanceof CliError) {
        console.error(error.message);
      } else {
        console.error(String(error));
      }
      process.exit(1);
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
  .option("--json", "Output result as JSON")
  .option("--service <json>", "Service endpoint as JSON (repeatable)", parseService, [])
  .option("--remove-service <type>", "Remove a service by type (repeatable)", parseRemoveService, [])
  .option("--image <pathOrUrl>", "New agent image (local file path or URL)")
  .option("--x402", "Enable x402 payment support")
  .option("--no-x402", "Disable x402 payment support")
  .action(async (agentIdStr, opts) => {
    try {
      const result = await update({
        agentId: parseBigInt(agentIdStr, "agent ID"),
        name: opts.name,
        description: opts.description,
        builderCode: opts.builderCode,
        type: opts.type,
        wallet: opts.wallet as `0x${string}` | undefined,
        uri: opts.uri,
        json: opts.json,
        services: opts.service.length > 0 ? opts.service : undefined,
        removeServices: opts.removeService.length > 0 ? opts.removeService : undefined,
        image: opts.image,
        x402: opts.x402,
      });
      if (opts.json) {
        console.log(JSON.stringify(result, bigintReplacer, 2));
      } else {
        console.log(formatUpdateResult(result));
      }
    } catch (error) {
      if (error instanceof CliError) {
        console.error(error.message);
      } else {
        console.error(String(error));
      }
      process.exit(1);
    }
  });

// deregister
program
  .command("deregister <agentId>")
  .description("Deregister (burn) an agent identity NFT")
  .option("--force", "Skip confirmation prompt")
  .option("--json", "Output result as JSON")
  .action(async (agentIdStr, opts) => {
    try {
      const result = await deregister({
        agentId: parseBigInt(agentIdStr, "agent ID"),
        force: opts.force,
        json: opts.json,
      });
      if (opts.json) {
        console.log(JSON.stringify(result, bigintReplacer, 2));
      } else {
        console.log(formatDeregisterResult(result));
      }
    } catch (error) {
      if (error instanceof CliError) {
        console.error(error.message);
      } else {
        console.error(String(error));
      }
      process.exit(1);
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
      const result = await status({
        agentId: parseBigInt(agentIdStr, "agent ID"),
        json: opts.json,
      });
      if (opts.json) {
        console.log(JSON.stringify(result, bigintReplacer, 2));
      } else {
        console.log(formatStatusResult(result));
      }
    } catch (error) {
      if (error instanceof CliError) {
        console.error(error.message);
      } else {
        console.error(String(error));
      }
      process.exit(1);
    }
  });

program
  .command("mcp")
  .description("Start MCP tool server (stdio)")
  .action(async () => {
    const { startMcpServer } = await import("./mcp/server.js");
    await startMcpServer();
  });

program.parse(process.argv);
