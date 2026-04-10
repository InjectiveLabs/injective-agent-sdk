#!/usr/bin/env tsx
/**
 * Migration: re-upload SGT staging agent cards with 8004scan-compliant schema.
 *
 * Reads agents 0-3 from the staging IdentityRegistry, fetches their IPFS cards,
 * transforms legacy type/url service fields to name/endpoint, adds registrations,
 * active, and updatedAt, re-uploads to Pinata, and calls setAgentURI on-chain.
 *
 * Usage:
 *   INJ_PRIVATE_KEY=0x... PINATA_JWT=... npx tsx scripts/migrate-sgt-cards.ts
 *   INJ_PRIVATE_KEY=0x... PINATA_JWT=... npx tsx scripts/migrate-sgt-cards.ts --dry-run
 */
import "dotenv/config";
import { AgentClient } from "../packages/sdk/src/client.js";
import { PinataStorage } from "../packages/sdk/src/storage/pinata.js";
import { fetchAgentCard } from "../packages/sdk/src/card.js";
import { LEGACY_SERVICE_NAME_MAP } from "../packages/sdk/src/types.js";
import type { ServiceEntry } from "../packages/sdk/src/types.js";

const AGENT_IDS = [0n, 1n, 2n, 3n];
const NETWORK = "staging" as const;
const DRY_RUN = process.argv.includes("--dry-run");

function transformServices(services: unknown[]): ServiceEntry[] {
  return services.flatMap((s): ServiceEntry[] => {
    if (typeof s !== "object" || s === null) return [];
    const svc = s as Record<string, unknown>;

    // Already compliant — name + endpoint
    if (typeof svc.name === "string" && typeof svc.endpoint === "string") {
      const entry: ServiceEntry = { name: svc.name, endpoint: svc.endpoint };
      if (typeof svc.description === "string") entry.description = svc.description;
      if (typeof svc.version === "string") entry.version = svc.version;
      return [entry];
    }

    // Legacy — type + url
    if (typeof svc.type === "string" && typeof svc.url === "string") {
      const name = LEGACY_SERVICE_NAME_MAP[svc.type as keyof typeof LEGACY_SERVICE_NAME_MAP] ?? svc.type;
      const entry: ServiceEntry = { name, endpoint: svc.url };
      if (typeof svc.description === "string") entry.description = svc.description;
      return [entry];
    }

    return [];
  });
}

async function main() {
  if (!process.env.INJ_PRIVATE_KEY) {
    console.error("Error: INJ_PRIVATE_KEY environment variable is required.");
    process.exit(1);
  }
  if (!process.env.PINATA_JWT) {
    console.error("Error: PINATA_JWT environment variable is required.");
    process.exit(1);
  }

  const storage = new PinataStorage({ jwt: process.env.PINATA_JWT });
  const client = new AgentClient({
    privateKey: process.env.INJ_PRIVATE_KEY as `0x${string}`,
    network: NETWORK,
    storage,
    callbacks: { onProgress: (m: string) => console.log(`  ${m}`) },
  });

  console.log(`\n8004scan SGT card migration`);
  console.log(`Network: ${NETWORK} (chain ${client.config.chainId})`);
  console.log(`Registry: ${client.config.identityRegistry}`);
  console.log(`Dry-run: ${DRY_RUN}`);
  console.log("─".repeat(50));

  for (const agentId of AGENT_IDS) {
    console.log(`\nAgent #${agentId}`);
    try {
      const status = await client.getStatus(agentId);
      console.log(`  Owner: ${status.owner}`);
      console.log(`  Current URI: ${status.tokenUri}`);

      if (!status.tokenUri) {
        console.log("  No tokenURI — skipping.");
        continue;
      }

      // Fetch current card
      let rawCard: unknown;
      try {
        rawCard = await fetchAgentCard(status.tokenUri);
        console.log(`  Fetched card OK`);
      } catch (err) {
        console.warn(`  Failed to fetch card: ${err}. Skipping.`);
        continue;
      }

      const card = rawCard as Record<string, unknown>;

      // Transform services
      const rawServices = Array.isArray(card.services) ? card.services : [];
      const services = transformServices(rawServices);

      // Build compliant card (preserve all existing fields, update the new ones)
      const compliantCard = {
        ...card,
        services,
        active: true,
        updatedAt: Math.floor(Date.now() / 1000),
        registrations: [{
          agentId: Number(agentId),
          agentRegistry: `eip155:${client.config.chainId}:${client.config.identityRegistry}`,
        }],
        metadata: {
          ...(typeof card.metadata === "object" && card.metadata !== null ? card.metadata as object : {}),
          chainId: String(client.config.chainId),
        },
      };

      console.log("  Transformed card:");
      console.log(`    services: ${JSON.stringify(compliantCard.services)}`);
      console.log(`    active: ${compliantCard.active}`);
      console.log(`    updatedAt: ${compliantCard.updatedAt}`);
      console.log(`    registrations: ${JSON.stringify(compliantCard.registrations)}`);
      console.log(`    metadata.chainId: ${(compliantCard.metadata as Record<string, unknown>).chainId}`);

      if (DRY_RUN) {
        console.log("  [dry-run] Would upload to IPFS and call setAgentURI.");
        continue;
      }

      // Upload new card
      const agentName = typeof card.name === "string" ? card.name : `agent-${agentId}`;
      console.log(`  Uploading to IPFS...`);
      const newUri = await storage.uploadJSON(compliantCard, agentName);
      console.log(`  New URI: ${newUri}`);

      if (newUri === status.tokenUri) {
        console.log("  URI unchanged (content identical) — no on-chain update needed.");
        continue;
      }

      // Update on-chain
      console.log(`  Calling setAgentURI...`);
      const result = await client.update(agentId, { uri: newUri });
      console.log(`  setAgentURI tx: ${result.txHashes[0]}`);
      console.log(`  Agent #${agentId} migrated.`);

    } catch (err) {
      console.error(`  Error migrating agent #${agentId}:`, err);
    }
  }

  console.log("\n" + "─".repeat(50));
  console.log("Migration complete.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
