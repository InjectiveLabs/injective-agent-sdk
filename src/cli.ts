#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { AGENT_TYPES, SERVICE_TYPES, LEGACY_SERVICE_NAME_MAP } from "./types/index.js";
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
  // NAME:URL shorthand — e.g., MCP:https://api.example.com/mcp
  // Detect by: first colon exists AND the part after it starts with "http"
  const colonIdx = value.indexOf(":");
  if (colonIdx > 0 && value.substring(colonIdx + 1).startsWith("http")) {
    const name = value.substring(0, colonIdx);
    const endpoint = value.substring(colonIdx + 1);
    try {
      assertPublicUrl(endpoint, "Service URL");
    } catch (err) {
      if (err instanceof CliError) throw err;
      throw new CliError(`Invalid service URL: "${endpoint}". Must be a valid public URL.`);
    }
    return [...previous, { name, endpoint }];
  }

  // JSON format (new or legacy)
  let parsed: Record<string, string>;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new CliError(
      'Service must be NAME:URL (e.g., MCP:https://...) or JSON with "name"+"endpoint" or legacy "type"+"url".'
    );
  }

  // New JSON format: name + endpoint
  if (parsed.name && parsed.endpoint) {
    try { assertPublicUrl(parsed.endpoint, "Service URL"); } catch (err) {
      if (err instanceof CliError) throw err;
      throw new CliError(`Invalid service URL: "${parsed.endpoint}". Must be a valid public URL.`);
    }
    const entry: ServiceEntry = { name: parsed.name, endpoint: parsed.endpoint };
    if (parsed.description) entry.description = parsed.description;
    if (parsed.version) entry.version = parsed.version;
    return [...previous, entry];
  }

  // Legacy JSON format: type + url → convert
  if (parsed.type && parsed.url) {
    try { assertPublicUrl(parsed.url, "Service URL"); } catch (err) {
      if (err instanceof CliError) throw err;
      throw new CliError(`Invalid service URL: "${parsed.url}". Must be a valid public URL.`);
    }
    const name = LEGACY_SERVICE_NAME_MAP[parsed.type as ServiceType] ?? parsed.type;
    const entry: ServiceEntry = { name, endpoint: parsed.url };
    if (parsed.description) entry.description = parsed.description;
    return [...previous, entry];
  }

  throw new CliError(
    'Service JSON must include "name"+"endpoint" or legacy "type"+"url" fields.'
  );
}

function parseRemoveService(value: string, previous: string[]): string[] {
  // Accept any service name — no enum validation since names are now freeform
  return [...previous, value];
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
  .option("--service <json>", "Service as NAME:URL or JSON (repeatable, e.g. MCP:https://api.dev/mcp)", parseService, [])
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
  .option("--service <json>", "Service as NAME:URL or JSON (repeatable, e.g. MCP:https://api.dev/mcp)", parseService, [])
  .option("--remove-service <type>", "Remove a service by type (repeatable)", parseRemoveService, [])
  .option("--image <pathOrUrl>", "New agent image (local file path or URL)")
  .option("--x402", "Enable x402 payment support")
  .option("--no-x402", "Disable x402 payment support")
  .option("--active", "Mark agent as active on 8004scan")
  .option("--no-active", "Mark agent as inactive on 8004scan")
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
        active: opts.active,
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

program.parse(process.argv);
