import { AgentClient, AgentReadClient, PinataStorage, loadKeystore, decryptKey, DEFAULT_KEYSTORE_PATH } from "@injective/agent-sdk";
import type { AgentClientCallbacks } from "@injective/agent-sdk";
import * as readline from "node:readline/promises";

export function normalizeKey(raw: string | undefined): `0x${string}` {
  if (!raw) throw new Error("No signing key provided. Set INJ_PRIVATE_KEY environment variable.");
  return raw.startsWith("0x") ? raw as `0x${string}` : `0x${raw}` as `0x${string}`;
}

/**
 * Resolves the signing private key. Precedence:
 * 1. Keystore file (INJ_KEYSTORE_PASSWORD env var for non-interactive; TTY prompt otherwise)
 * 2. INJ_PRIVATE_KEY env var (legacy — prints deprecation warning)
 * Throws if no key source is available.
 */
async function resolveSigningKey(): Promise<`0x${string}`> {
  try {
    const ks = loadKeystore(process.env.INJ_KEYSTORE_PATH ?? DEFAULT_KEYSTORE_PATH);
    const envPw = process.env.INJ_KEYSTORE_PASSWORD;
    if (envPw !== undefined) {
      return decryptKey({ keystore: ks, password: envPw });
    }
    if (!process.stdin.isTTY) {
      throw new Error(
        "Keystore found but no password provided. Set INJ_KEYSTORE_PASSWORD for non-interactive use."
      );
    }
    const iface = readline.createInterface({ input: process.stdin, output: process.stdout });
    const password = await iface.question(`Keystore password for ${ks.injAddress}: `);
    iface.close();
    return decryptKey({ keystore: ks, password });
  } catch (e: any) {
    // ENOENT means no keystore — fall through to legacy env var
    if (!e?.message?.includes("Keystore not found")) throw e;
  }

  const rawEnvKey = process.env.INJ_PRIVATE_KEY;
  if (rawEnvKey) {
    console.warn("[warn] INJ_PRIVATE_KEY is deprecated. Run 'inj-agent keys import --env' to encrypt your key.");
    return normalizeKey(rawEnvKey);
  }

  throw new Error(
    "No signing key found. Run 'inj-agent keys import' to create an encrypted keystore, or set INJ_PRIVATE_KEY."
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
