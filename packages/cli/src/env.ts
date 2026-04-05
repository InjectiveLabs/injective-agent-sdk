import { AgentClient, AgentReadClient, PinataStorage, loadKeystore, decryptKey, DEFAULT_KEYSTORE_PATH } from "@injective/agent-sdk";
import type { AgentClientCallbacks } from "@injective/agent-sdk";
import { existsSync } from "node:fs";
import * as readline from "node:readline/promises";

export function normalizeKey(raw: string | undefined): `0x${string}` {
  if (!raw) throw new Error("No signing key provided. Set INJ_PRIVATE_KEY environment variable.");
  return raw.startsWith("0x") ? raw as `0x${string}` : `0x${raw}` as `0x${string}`;
}

/**
 * Resolves the signing private key. Precedence:
 * 1. INJ_PRIVATE_KEY env var (legacy, deprecated — prints a warning)
 * 2. Keystore file: INJ_KEYSTORE_PASSWORD env var (non-interactive)
 * 3. Keystore file: interactive password prompt (TTY only)
 * Throws if no key source is available.
 */
async function resolveSigningKey(): Promise<`0x${string}`> {
  const rawEnvKey = process.env.INJ_PRIVATE_KEY;
  if (rawEnvKey) {
    console.warn("[warn] INJ_PRIVATE_KEY is deprecated. Run 'inj-agent keys import --env' to encrypt your key.");
    return normalizeKey(rawEnvKey);
  }

  const keystorePath = process.env.INJ_KEYSTORE_PATH ?? DEFAULT_KEYSTORE_PATH;
  if (existsSync(keystorePath)) {
    const ks = loadKeystore(keystorePath);
    const envPw = process.env.INJ_KEYSTORE_PASSWORD;
    if (envPw !== undefined) {
      return decryptKey({ keystore: ks, password: envPw });
    }
    const iface = readline.createInterface({ input: process.stdin, output: process.stdout });
    const password = await iface.question(`Keystore password for ${ks.injAddress}: `);
    iface.close();
    return decryptKey({ keystore: ks, password });
  }

  throw new Error(
    "No signing key found. Set INJ_PRIVATE_KEY or run 'inj-agent keys import' to create an encrypted keystore."
  );
}

export async function createClient(callbacks?: AgentClientCallbacks, auditSource?: "cli" | "sdk"): Promise<AgentClient> {
  const privateKey = await resolveSigningKey();
  return new AgentClient({
    privateKey,
    network: (process.env.INJ_NETWORK ?? "testnet") as "testnet" | "mainnet",
    rpcUrl: process.env.INJ_RPC_URL,
    storage: process.env.PINATA_JWT ? new PinataStorage({ jwt: process.env.PINATA_JWT }) : undefined,
    callbacks,
    auditSource,
  });
}

export function createReadClient(): AgentReadClient {
  return new AgentReadClient({
    network: (process.env.INJ_NETWORK ?? "testnet") as "testnet" | "mainnet",
    rpcUrl: process.env.INJ_RPC_URL,
  });
}
