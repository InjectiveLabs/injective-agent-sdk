#!/usr/bin/env npx tsx
/**
 * Baptise SGT Grid Trader — stAtom/Atom
 *
 * First agent registered via the baptism process.
 * Registers the SGT spot grid trading contract as an ERC-8004 agent
 * with a machine-readable action schema so LLMs can interact with it.
 *
 * Prerequisites:
 *   - PINATA_JWT env var set (for IPFS card upload)
 *   - INJ_KEYSTORE_PASSWORD env var set OR interactive TTY
 *   - Keystore funded with INJ on EVM testnet
 *
 * Usage:
 *   npx tsx scripts/baptise-sgt-statom-atom.ts
 *   npx tsx scripts/baptise-sgt-statom-atom.ts --dry-run
 */

import { AgentClient, PinataStorage, createAgentClientFromEnv } from "../packages/sdk/src/index.js";
import type { ActionSchema } from "../packages/sdk/src/types.js";

const DRY_RUN = process.argv.includes("--dry-run");

const SGT_CONTRACT_INJ = "inj1cr35mf6u8lh5na5n20pcsat3ja58sx6pdl8vlj";
const SGT_CONTRACT_EVM = "0xc0e34da75c3fef49f69353c38875719768781b41" as `0x${string}`;

const actions: ActionSchema[] = [
  {
    name: "create_strategy",
    description:
      "Create a spot grid trading strategy on the stAtom/Atom market. " +
      "Requires 3 authz grants (MsgCreateSpotMarketOrder, MsgBatchUpdateOrders, MsgWithdraw) " +
      "to the contract before calling.",
    transport: "cosmwasm_execute",
    contract: SGT_CONTRACT_INJ,
    prerequisites: [
      {
        type: "authz_grant",
        grantee: SGT_CONTRACT_INJ,
        msg_types: [
          "/injective.exchange.v1beta1.MsgCreateSpotMarketOrder",
          "/injective.exchange.v1beta1.MsgBatchUpdateOrders",
          "/injective.exchange.v1beta1.MsgWithdraw",
        ],
      },
    ],
    parameters: {
      subaccount_id: {
        type: "string",
        description: "Your EVM address (hex) + market suffix 00737461746f6d2d61746f6d",
        pattern: "^0x[a-fA-F0-9]{64}$",
        required: true,
      },
      bounds: {
        type: "array",
        description: "Price range [lower, upper]. Current mid-price must fall inside.",
        required: true,
        items: { type: "string", format: "decimal" },
      },
      levels: {
        type: "integer",
        minimum: 3,
        maximum: 150,
        description: "Number of grid levels. More levels = more orders, smaller size.",
        required: true,
      },
      slippage: {
        type: "string",
        format: "decimal",
        default: "0.1",
        description: "Max slippage for initial rebalance. 0.1 = 10%. Max 0.3.",
      },
      exit_type: {
        type: "string",
        enum: ["default", "base", "quote", "none"],
        default: "default",
        description: "What happens to funds when strategy is removed.",
      },
      fee_recipient: {
        type: "string",
        const: "inj1agr8apykrm6gq70e4dgqrjvnem6k0a5cjqqxat",
        description: "Helix fee recipient. Required for this integration.",
      },
      strategy_type: {
        type: "object",
        description: "Use trailing_arithmetic_l_p with upper and lower trailing bounds.",
        properties: {
          trailing_arithmetic_l_p: {
            type: "object",
            properties: {
              upper_trailing_bound: { type: "string", format: "decimal" },
              lower_trailing_bound: { type: "string", format: "decimal" },
            },
          },
        },
      },
      stop_loss: {
        type: "object",
        description: "Optional. Auto-exit if price drops to exit_price (below lower bound).",
        properties: {
          exit_type: { type: "string", enum: ["base", "quote"] },
          exit_price: { type: "string", format: "decimal" },
        },
      },
      take_profit: {
        type: "object",
        description: "Optional. Auto-exit if price rises to exit_price (above upper bound).",
        properties: {
          exit_type: { type: "string", enum: ["base", "quote"] },
          exit_price: { type: "string", format: "decimal" },
        },
      },
    },
    funds: {
      denom: "ibc/C4CFF46FD6DE35CA4CF4CE031E643C8FDC9BA4B99AE598E9B0ED98FE3A2319F9",
      description: "Atom amount to deposit. Must cover minimum investment for levels * range.",
    },
    example: {
      msg: {
        create_strategy: {
          subaccount_id: "0x70240948033fbe6ae16822a3fa12b59ae2be230200737461746f6d2d61746f6d",
          bounds: ["1.811", "1.829"],
          levels: 10,
          slippage: "0.1",
          exit_type: "default",
          fee_recipient: "inj1agr8apykrm6gq70e4dgqrjvnem6k0a5cjqqxat",
          strategy_type: {
            trailing_arithmetic_l_p: {
              upper_trailing_bound: "1.911",
              lower_trailing_bound: "1.729",
            },
          },
        },
      },
      funds: "29700000ibc/C4CFF46FD6DE35CA4CF4CE031E643C8FDC9BA4B99AE598E9B0ED98FE3A2319F9",
    },
  },
  {
    name: "remove_strategy",
    description:
      "Stop a running grid strategy. Cancels all orders, exits positions, withdraws funds to main account.",
    transport: "cosmwasm_execute",
    contract: SGT_CONTRACT_INJ,
    parameters: {
      subaccount_id: {
        type: "string",
        description: "Same subaccount ID used in create_strategy.",
        required: true,
      },
    },
    example: {
      msg: {
        remove_strategy: {
          subaccount_id: "0x70240948033fbe6ae16822a3fa12b59ae2be230200737461746f6d2d61746f6d",
        },
      },
    },
  },
];

async function main() {
  console.log("=== SGT Grid Trader — stAtom/Atom — Agent Baptism ===\n");

  if (DRY_RUN) {
    console.log("[DRY RUN] Will simulate registration without broadcasting.\n");
  }

  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    console.error("Error: PINATA_JWT env var is required for IPFS card upload.");
    process.exit(1);
  }

  // Uses INJ_KEYSTORE_PASSWORD (preferred) or INJ_PRIVATE_KEY from env.
  // Also reads INJ_NETWORK (default: testnet) and INJ_RPC_URL.
  const client = createAgentClientFromEnv({
    onProgress: (msg) => console.log(`  [progress] ${msg}`),
    onWarning: (msg) => console.warn(`  [warn] ${msg}`),
  });

  console.log("Registering agent...\n");
  console.log("  Name:        SGT Grid Trader — stAtom/Atom");
  console.log("  Type:        trading");
  console.log("  Builder:     injective");
  console.log(`  Wallet:      ${SGT_CONTRACT_EVM}`);
  console.log(`  Actions:     ${actions.length} (create_strategy, remove_strategy)`);
  console.log("");

  const result = await client.register({
    name: "SGT Grid Trader — stAtom/Atom",
    type: "trading",
    description:
      "Autonomous spot grid trading bot on Injective. " +
      "Places and manages a grid of limit orders across a configurable price range on the stAtom/Atom market, " +
      "trails the market price, and supports stop-loss and take-profit exits. " +
      "Operates on-chain via CosmWasm with authz delegation.",
    builderCode: "injective",
    wallet: SGT_CONTRACT_EVM,
    services: [
      {
        type: "custom",
        url: `injective://contract/${SGT_CONTRACT_INJ}`,
        description: "CosmWasm spot grid trading contract",
      },
    ],
    actions,
    dryRun: DRY_RUN,
  });

  console.log("=== Registration Complete ===\n");
  console.log(`  Agent ID:    ${result.agentId}`);
  console.log(`  Card URI:    ${result.cardUri}`);
  console.log(`  Scan URL:    ${result.scanUrl}`);
  console.log(`  Tx Hashes:   ${result.txHashes.join(", ")}`);

  if (result.gasEstimate) {
    console.log(`  Gas Est:     ${result.gasEstimate}`);
  }

  console.log("\nNext steps:");
  console.log("  1. Verify on Agent Hub: https://agents.injective.network");
  console.log("  2. Check IPFS card resolves at the card URI above");
  console.log("  3. Record the Agent ID in the baptism card");
}

main().catch((err) => {
  console.error("Registration failed:", err.message);
  process.exit(1);
});
