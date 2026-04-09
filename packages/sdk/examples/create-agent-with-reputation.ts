#!/usr/bin/env node
/**
 * Example: Create a new agent with a random image, x402 support, and 2 reputation entries.
 *
 * Usage:
 *   export INJ_PRIVATE_KEY=0x...
 *   export PINATA_JWT=... (optional — without it, agent card will use dry-run placeholder)
 *   npx tsx examples/create-agent-with-reputation.ts
 */

import {
  AgentClient,
  AgentReadClient,
} from "../src/index.js";

async function main() {
  const privateKey = process.env.INJ_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("INJ_PRIVATE_KEY environment variable is required");
  }

  const client = new AgentClient({
    privateKey: privateKey as `0x${string}`,
    network: "testnet",
    audit: true,
  });

  console.log(`Using account: ${client.address} (${client.injAddress})\n`);

  // 1. Generate a random image URL (using a placeholder service)
  const randomId = Math.random().toString(36).substring(7);
  const randomImage = `https://picsum.photos/256?random=${randomId}`;

  // 2. Register agent
  console.log("📝 Registering agent...");
  const registerResult = await client.register({
    name: `TestAgent-${Date.now()}`,
    type: "trading",
    description: "A test agent created by the SDK example",
    builderCode: `example-${randomId}`,
    wallet: client.address,
    image: randomImage,
    x402: true, // Enable x402 support
    dryRun: false,
  });

  const agentId = registerResult.agentId;
  console.log(`✅ Agent registered with ID: ${agentId}`);
  console.log(`   Card URI: ${registerResult.cardUri}`);
  console.log(`   Scan: ${registerResult.scanUrl}\n`);

  // 3. Give feedback entry 1
  console.log("⭐ Adding feedback entry 1...");
  const feedback1 = await client.giveFeedback({
    agentId,
    value: 85n,
    valueDecimals: 0,
    tag1: "performance",
    tag2: "quality",
    endpoint: "https://agent.example.com/feedback",
    feedbackURI: `ipfs://QmExample1-${randomId}`,
    dryRun: false,
  });
  console.log(`✅ Feedback 1 recorded`);
  console.log(`   Index: ${feedback1.feedbackIndex}`);
  console.log(`   Tx: ${feedback1.txHash}\n`);

  // 4. Give feedback entry 2
  console.log("⭐ Adding feedback entry 2...");
  const feedback2 = await client.giveFeedback({
    agentId,
    value: 92n,
    valueDecimals: 0,
    tag1: "reliability",
    tag2: "speed",
    endpoint: "https://agent.example.com/feedback",
    feedbackURI: `ipfs://QmExample2-${randomId}`,
    dryRun: false,
  });
  console.log(`✅ Feedback 2 recorded`);
  console.log(`   Index: ${feedback2.feedbackIndex}`);
  console.log(`   Tx: ${feedback2.txHash}\n`);

  // 5. Query reputation
  const readClient = new AgentReadClient({ network: "testnet" });
  console.log("📊 Querying reputation...");
  const rep = await readClient.getReputation(agentId);
  console.log(`✅ Agent reputation:`);
  console.log(`   Score: ${rep.score}`);
  console.log(`   Feedback count: ${rep.count}`);
  console.log(`   Feedback clients: ${rep.clients.length}\n`);

  console.log("🎉 Done!");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
