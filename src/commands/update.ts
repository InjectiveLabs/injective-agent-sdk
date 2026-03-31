import type { UpdateOptions, UpdateResult } from "../types/index.js";
import { getConfig } from "../lib/config.js";
import { resolveKey } from "../lib/keys.js";
import { createClients, encodeStringMetadata, walletLinkDeadline } from "../lib/contracts.js";
import { signWalletLink } from "../lib/wallet-signature.js";
import { CliError, formatContractError } from "../lib/errors.js";
import { isAddress } from "viem";

export async function update(opts: UpdateOptions): Promise<UpdateResult> {
  if ((opts.name || opts.description) && !opts.uri) {
    throw new CliError("Changing name or description requires a new agent card URI. Provide --uri with the updated card's hosted URL.");
  }
  if (!opts.builderCode && !opts.type && !opts.uri && !opts.wallet) {
    throw new CliError("No fields to update. Provide at least one update flag.");
  }
  if (opts.wallet && !isAddress(opts.wallet)) {
    throw new CliError(`Invalid wallet address: ${opts.wallet}. Must be a checksummed 0x address.`);
  }

  const config = getConfig();
  const key = resolveKey();
  const { publicClient, walletClient, identityRegistry } = createClients(config, key.account);

  // Verify caller owns this agent before spending gas
  const owner = await publicClient.readContract({
    address: config.identityRegistry, abi: identityRegistry.abi,
    functionName: "ownerOf", args: [opts.agentId],
  }) as `0x${string}`;
  if (owner.toLowerCase() !== key.address.toLowerCase()) {
    throw new CliError(`You are not the owner of agent ${opts.agentId}. Owner: ${owner}`);
  }

  let nonce = await publicClient.getTransactionCount({ address: key.address, blockTag: "pending" });
  const txHashes: `0x${string}`[] = [];
  const updatedFields: string[] = [];

  try {
    if (opts.builderCode) {
      txHashes.push(await walletClient.writeContract({
        address: config.identityRegistry, abi: identityRegistry.abi,
        functionName: "setMetadata", args: [opts.agentId, "builderCode", encodeStringMetadata(opts.builderCode)], nonce: nonce++,
      }));
      updatedFields.push("builderCode");
    }
    if (opts.type) {
      txHashes.push(await walletClient.writeContract({
        address: config.identityRegistry, abi: identityRegistry.abi,
        functionName: "setMetadata", args: [opts.agentId, "agentType", encodeStringMetadata(opts.type)], nonce: nonce++,
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
      if (opts.wallet.toLowerCase() !== key.address.toLowerCase()) {
        throw new CliError(`Wallet linkage requires the wallet's private key. Currently only self-signing is supported (--wallet must match the signer address ${key.address}).`);
      }
      const deadline = walletLinkDeadline();
      const sig = await signWalletLink({
        agentId: opts.agentId, wallet: opts.wallet, ownerAddress: key.address, deadline,
        account: key.account, chainId: config.chainId,
        contractAddress: config.identityRegistry,
      });
      txHashes.push(await walletClient.writeContract({
        address: config.identityRegistry, abi: identityRegistry.abi,
        functionName: "setAgentWallet", args: [opts.agentId, opts.wallet, deadline, sig], nonce: nonce++,
      }));
      updatedFields.push("wallet");
    }
    await Promise.all(txHashes.map(hash => publicClient.waitForTransactionReceipt({ hash })));
    return { agentId: opts.agentId, updatedFields, txHashes };
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(formatContractError(error));
  }
}
