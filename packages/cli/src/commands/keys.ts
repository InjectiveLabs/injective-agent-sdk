import { Command } from "commander";
import * as readline from "node:readline/promises";
import { existsSync } from "node:fs";
import { rmSync } from "node:fs";
import {
  encryptKey, decryptKey, loadKeystore, saveKeystore, DEFAULT_KEYSTORE_PATH,
} from "@injective/agent-sdk";

function createRl() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

export function keysCommand(): Command {
  const keys = new Command("keys").description("Manage encrypted keystores");

  keys.command("import")
    .description("Import and encrypt a private key into the keystore")
    .option("--env", "Read private key from INJ_PRIVATE_KEY environment variable")
    .option("--path <path>", "Keystore file path", DEFAULT_KEYSTORE_PATH)
    .action(async (opts) => {
      const iface = createRl();
      let rawKey: string;
      if (opts.env) {
        rawKey = process.env.INJ_PRIVATE_KEY ?? "";
        if (!rawKey) {
          iface.close();
          console.error("INJ_PRIVATE_KEY is not set.");
          process.exit(1);
        }
        console.warn("[warn] Consider removing INJ_PRIVATE_KEY from your .env file after import.");
      } else {
        rawKey = await iface.question("Enter private key (hex): ");
      }

      const password = await iface.question("Create password: ");
      const confirm = await iface.question("Confirm password: ");
      iface.close();

      if (password !== confirm) {
        console.error("Passwords do not match.");
        process.exit(1);
      }
      if (password.length < 8) {
        console.error("Password must be at least 8 characters.");
        process.exit(1);
      }

      const privateKey = (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`;
      console.log("Encrypting key (this may take a moment)...");
      const ks = encryptKey({ privateKey, password });
      saveKeystore(ks, opts.path);
      console.log(`Key stored at ${opts.path}`);
      console.log(`Address:    ${ks.address}`);
      console.log(`Inj:        ${ks.injAddress}`);
    });

  keys.command("list")
    .description("Show stored key info without decrypting")
    .option("--path <path>", "Keystore file path", DEFAULT_KEYSTORE_PATH)
    .action((opts) => {
      if (!existsSync(opts.path)) {
        console.log(`No keystore found at ${opts.path}. Run 'inj-agent keys import' to create one.`);
        return;
      }
      const ks = loadKeystore(opts.path);
      console.log(`Path:       ${opts.path}`);
      console.log(`Address:    ${ks.address}`);
      console.log(`Inj:        ${ks.injAddress}`);
      console.log(`Created:    ${ks.createdAt}`);
    });

  keys.command("export")
    .description("Decrypt and print the private key hex")
    .option("--path <path>", "Keystore file path", DEFAULT_KEYSTORE_PATH)
    .action(async (opts) => {
      if (!existsSync(opts.path)) {
        console.error(`No keystore found at ${opts.path}. Run 'inj-agent keys import' to create one.`);
        process.exit(1);
      }
      const ks = loadKeystore(opts.path);
      const iface = createRl();
      const password = await iface.question("Enter password: ");
      iface.close();
      const key = decryptKey({ keystore: ks, password });
      console.warn("[warn] This key is now visible. Clear your terminal history.");
      console.log(key);
    });

  keys.command("delete")
    .description("Delete the keystore file")
    .option("--path <path>", "Keystore file path", DEFAULT_KEYSTORE_PATH)
    .action(async (opts) => {
      if (!existsSync(opts.path)) {
        console.log("No keystore found.");
        return;
      }
      const iface = createRl();
      const answer = await iface.question('Type "DELETE" to confirm: ');
      iface.close();
      if (answer !== "DELETE") {
        console.error("Confirmation failed.");
        process.exit(1);
      }
      rmSync(opts.path);
      console.log("Keystore deleted.");
    });

  return keys;
}
