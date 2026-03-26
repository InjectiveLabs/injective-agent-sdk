#!/usr/bin/env node
import { Command } from "commander";
import { AGENT_TYPES } from "./types/index.js";
import { register } from "./commands/register.js";
import { update } from "./commands/update.js";
import { deregister } from "./commands/deregister.js";
import { status } from "./commands/status.js";
import { CliError } from "./lib/errors.js";
import {
  formatRegisterResult,
  formatUpdateResult,
  formatDeregisterResult,
  formatStatusResult,
  bigintReplacer,
} from "./lib/formatting.js";

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
  .action(async (opts) => {
    try {
      const result = await register({
        name: opts.name,
        type: opts.type,
        builderCode: opts.builderCode,
        wallet: opts.wallet as `0x${string}`,
        uri: opts.uri,
        description: opts.description,
        gasPrice: opts.gasPrice ? BigInt(opts.gasPrice) : undefined,
        dryRun: opts.dryRun,
        json: opts.json,
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
  .action(async (agentIdStr, opts) => {
    try {
      const result = await update({
        agentId: BigInt(agentIdStr),
        name: opts.name,
        description: opts.description,
        builderCode: opts.builderCode,
        type: opts.type,
        wallet: opts.wallet as `0x${string}` | undefined,
        uri: opts.uri,
        json: opts.json,
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
        agentId: BigInt(agentIdStr),
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
        agentId: BigInt(agentIdStr),
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
