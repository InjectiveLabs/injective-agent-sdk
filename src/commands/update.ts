import type { UpdateOptions, UpdateResult } from "../types/index.js";
import { getConfig } from "../lib/config.js";
import { resolveKey } from "../lib/keys.js";
import { createClients } from "../lib/contracts.js";
import { signWalletLink } from "../lib/wallet-signature.js";
import { CliError, formatContractError } from "../lib/errors.js";
import { encodeAbiParameters, parseAbiParameters } from "viem";

export async function update(opts: UpdateOptions): Promise<UpdateResult> {
  if ((opts.name || opts.description) && !opts.uri) {
    throw new CliError("Changing name or description requires a new agent card URI. Provide --uri with the updated card's hosted URL.");
  }

  const config = getConfig();
  const key = resolveKey();
  const { publicClient, walletClient, identityRegistry } = createClients(config, key.privateKey);

  let nonce = await publicClient.getTransactionCount({ address: key.address, blockTag: "pending" });
  const txHashes: `0x${string}`[] = [];
  const updatedFields: string[] = [];

  try {
    if (opts.builderCode) {
      const bytes = encodeAbiParameters(parseAbiParameters("string"), [opts.builderCode]);
      txHashes.push(await walletClient.writeContract({
        address: config.identityRegistry, abi: identityRegistry.abi,
        functionName: "setMetadata", args: [opts.agentId, "builderCode", bytes], nonce: nonce++,
      }));
      updatedFields.push("builderCode");
    }
    if (opts.type) {
      const bytes = encodeAbiParameters(parseAbiParameters("string"), [opts.type]);
      txHashes.push(await walletClient.writeContract({
        address: config.identityRegistry, abi: identityRegistry.abi,
        functionName: "setMetadata", args: [opts.agentId, "agentType", bytes], nonce: nonce++,
      }));
      updatedFields.push("agentType");
    }
    if (opts.uri) {
      txHashes.push(await walletClient.writeContract({
        address: config.identityRegistry, abi: identityRegistry.abi,
        functionName: "setAgentURI", args: [opts.agentId, opts.uri], nonce: nonce++,
      }));
      updatedFields.push("tokenURI");
    }
    if (opts.wallet) {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const sig = await signWalletLink({
        agentId: opts.agentId, wallet: opts.wallet, deadline,
        walletPrivateKey: key.privateKey, chainId: config.chainId,
        contractAddress: config.identityRegistry,
      });
      txHashes.push(await walletClient.writeContract({
        address: config.identityRegistry, abi: identityRegistry.abi,
        functionName: "setAgentWallet", args: [opts.agentId, opts.wallet, deadline, sig], nonce: nonce++,
      }));
      updatedFields.push("wallet");
    }
    for (const hash of txHashes) { await publicClient.waitForTransactionReceipt({ hash }); }
    if (updatedFields.length === 0) throw new CliError("No fields to update. Provide at least one update flag.");
    return { agentId: opts.agentId, updatedFields, txHashes };
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(formatContractError(error));
  }
}
