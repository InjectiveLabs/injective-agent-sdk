import type { UpdateOptions, UpdateResult, AgentCard } from "../types/index.js";
import { getConfig } from "../lib/config.js";
import { resolveKey } from "../lib/keys.js";
import { createClients, encodeStringMetadata, walletLinkDeadline } from "../lib/contracts.js";
import { signWalletLink } from "../lib/wallet-signature.js";
import { fetchAgentCard, generateAgentCard, mergeAgentCard, warnIfUnreachable } from "../lib/agent-card.js";
import { uploadAgentCard, resolveImageUri } from "../lib/ipfs.js";
import { CliError, formatContractError } from "../lib/errors.js";
import { isAddress } from "viem";
import * as readline from "node:readline/promises";

export async function update(opts: UpdateOptions): Promise<UpdateResult> {
  if (!opts.builderCode && !opts.type && !opts.uri && !opts.wallet &&
      !opts.name && !opts.description && !opts.services?.length &&
      !opts.removeServices?.length && !opts.image &&
      opts.x402 === undefined) {
    throw new CliError("No fields to update. Provide at least one update flag.");
  }
  if (opts.wallet && !isAddress(opts.wallet)) {
    throw new CliError(`Invalid wallet address: ${opts.wallet}. Must be a checksummed 0x address.`);
  }

  const config = getConfig();
  const key = resolveKey();
  const { publicClient, walletClient, identityRegistry } = createClients(config, key.account);

  // Determine if card-level fields are being changed (requires fetch-merge-upload)
  const hasCardChanges = !!(
    opts.name || opts.description || opts.services?.length ||
    opts.removeServices?.length || opts.image || opts.x402 !== undefined
  );

  const contractArgs = { address: config.identityRegistry, abi: identityRegistry.abi } as const;
  const [owner, tokenUri] = await Promise.all([
    publicClient.readContract({ ...contractArgs, functionName: "ownerOf", args: [opts.agentId] }) as Promise<`0x${string}`>,
    hasCardChanges && !opts.uri
      ? publicClient.readContract({ ...contractArgs, functionName: "tokenURI", args: [opts.agentId] }) as Promise<string>
      : Promise.resolve(null),
  ]);
  if (owner.toLowerCase() !== key.address.toLowerCase()) {
    throw new CliError(`You are not the owner of agent ${opts.agentId}. Owner: ${owner}`);
  }

  let newCardUri: string | undefined;
  if (hasCardChanges && !opts.uri && tokenUri) {
    let existingCard: AgentCard;
    try {
      existingCard = await fetchAgentCard(tokenUri, config.ipfsGateway);
    } catch (firstError) {
      console.warn(`Failed to fetch agent card, retrying... (${firstError instanceof Error ? firstError.message : String(firstError)})`);
      try {
        existingCard = await fetchAgentCard(tokenUri, config.ipfsGateway);
      } catch {
        if (process.stdin.isTTY) {
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const answer = await rl.question("Could not fetch existing agent card. Continue with a fresh card? (y/N) ");
          rl.close();
          if (answer.toLowerCase() !== "y") {
            throw new CliError("Update cancelled. Could not fetch existing card from IPFS.");
          }
        } else {
          throw new CliError(
            `Could not fetch existing agent card for Agent #${opts.agentId}. ` +
            "To update without merging, re-call agent_update with all fields " +
            "(services, image, x402Support) explicitly set. Missing fields will be reset to defaults."
          );
        }
        existingCard = generateAgentCard({
          name: `Agent ${opts.agentId}`, type: "other",
          builderCode: "", operatorAddress: "",
          chainId: config.chainId,
        });
      }
    }

    // Resolve image and check service URLs in parallel
    const [resolvedImage] = await Promise.all([
      opts.image ? resolveImageUri(opts.image) : Promise.resolve(undefined),
      opts.services?.length
        ? Promise.all(opts.services.map(s => warnIfUnreachable(s.endpoint)))
        : Promise.resolve(),
    ]);

    const mergedCard = mergeAgentCard(existingCard, {
      name: opts.name,
      description: opts.description,
      services: opts.services,
      removeServices: opts.removeServices,
      image: resolvedImage,
      x402: opts.x402,
    });

    console.log("Uploading updated agent card to IPFS...");
    newCardUri = await uploadAgentCard(mergedCard);
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
    const effectiveUri = opts.uri ?? newCardUri;
    if (effectiveUri) {
      txHashes.push(await walletClient.writeContract({
        address: config.identityRegistry, abi: identityRegistry.abi,
        functionName: "setAgentURI", args: [opts.agentId, effectiveUri], nonce: nonce++,
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
