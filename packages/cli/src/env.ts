import { AgentClient, AgentReadClient, PinataStorage } from "@injective/agent-sdk";
import type { AgentClientCallbacks } from "@injective/agent-sdk";

export function normalizeKey(raw: string | undefined): `0x${string}` {
  if (!raw) throw new Error("No signing key provided. Set INJ_PRIVATE_KEY environment variable.");
  return raw.startsWith("0x") ? raw as `0x${string}` : `0x${raw}` as `0x${string}`;
}

export function createClient(callbacks?: AgentClientCallbacks): AgentClient {
  return new AgentClient({
    privateKey: normalizeKey(process.env.INJ_PRIVATE_KEY),
    network: (process.env.INJ_NETWORK ?? "testnet") as "testnet" | "mainnet",
    rpcUrl: process.env.INJ_RPC_URL,
    storage: process.env.PINATA_JWT ? new PinataStorage({ jwt: process.env.PINATA_JWT }) : undefined,
    callbacks,
  });
}

export function createReadClient(): AgentReadClient {
  return new AgentReadClient({
    network: (process.env.INJ_NETWORK ?? "testnet") as "testnet" | "mainnet",
    rpcUrl: process.env.INJ_RPC_URL,
  });
}
