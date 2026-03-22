import { type RegisterOptions, type RegisterResult, AGENT_TYPES } from "../types/index.js";
import { getConfig } from "../lib/config.js";
import { resolveKey } from "../lib/keys.js";
import { createClients } from "../lib/contracts.js";
import { generateAgentCard } from "../lib/agent-card.js";
import { signWalletLink } from "../lib/wallet-signature.js";
import { uploadAgentCard } from "../lib/ipfs.js";
import { CliError, formatContractError } from "../lib/errors.js";
import { encodeAbiParameters, parseAbiParameters } from "viem";

export async function register(opts: RegisterOptions): Promise<RegisterResult> {
  if (!opts.name || opts.name.length > 100) throw new CliError("Agent name must be 1-100 characters.");
  if (!AGENT_TYPES.includes(opts.type)) throw new CliError(`Invalid agent type "${opts.type}". Must be one of: ${AGENT_TYPES.join(", ")}.`);
  if (opts.description && opts.description.length > 500) throw new CliError("Description must be 500 characters or fewer.");
  if (!opts.builderCode) throw new CliError("Builder code is required.");

  const config = getConfig();
  const key = resolveKey();
  const { publicClient, walletClient, identityRegistry, account } = createClients(config, key.privateKey);

  const card = generateAgentCard({
    name: opts.name, type: opts.type, description: opts.description,
    builderCode: opts.builderCode, operatorAddress: key.address,
  });

  let cardUri: string;
  if (opts.uri) { cardUri = opts.uri; } else { cardUri = await uploadAgentCard(card); }

  if (opts.dryRun) {
    const { result: predictedId } = await publicClient.simulateContract({
      address: config.identityRegistry, abi: identityRegistry.abi,
      functionName: "register", args: [cardUri], account,
    });
    console.log("=== DRY RUN ===");
    console.log(`Predicted Agent ID: ${predictedId}`);
    console.log(`Agent Card URI: ${cardUri}`);
    console.log(`Agent Card: ${JSON.stringify(card, null, 2)}`);
    return { agentId: predictedId as bigint, identityTuple: "", cardUri, txHashes: [], scanUrl: "" };
  }

  let nonce = await publicClient.getTransactionCount({ address: key.address, blockTag: "pending" });
  const txHashes: `0x${string}`[] = [];

  try {
    // TX 1: register
    const registerHash = await walletClient.writeContract({
      address: config.identityRegistry, abi: identityRegistry.abi,
      functionName: "register", args: [cardUri], nonce: nonce++,
    });
    txHashes.push(registerHash);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: registerHash });

    // Extract agentId from AgentRegistered event (first indexed topic = agentId)
    const agentRegisteredLog = receipt.logs.find((log) =>
      log.address.toLowerCase() === config.identityRegistry.toLowerCase() && log.topics.length >= 2
    );
    const agentId = agentRegisteredLog?.topics[1] ? BigInt(agentRegisteredLog.topics[1]) : 0n;
    if (agentId === 0n) throw new CliError("Failed to extract agentId from register transaction.");

    // TX 2: setMetadata builderCode
    const builderCodeBytes = encodeAbiParameters(parseAbiParameters("string"), [opts.builderCode]);
    txHashes.push(await walletClient.writeContract({
      address: config.identityRegistry, abi: identityRegistry.abi,
      functionName: "setMetadata", args: [agentId, "builderCode", builderCodeBytes], nonce: nonce++,
    }));

    // TX 3: setMetadata agentType
    const typeBytes = encodeAbiParameters(parseAbiParameters("string"), [opts.type]);
    txHashes.push(await walletClient.writeContract({
      address: config.identityRegistry, abi: identityRegistry.abi,
      functionName: "setMetadata", args: [agentId, "agentType", typeBytes], nonce: nonce++,
    }));

    // TX 4: setAgentWallet (self-sign only)
    if (opts.wallet.toLowerCase() === key.address.toLowerCase()) {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const sig = await signWalletLink({
        agentId, wallet: opts.wallet, deadline,
        walletPrivateKey: key.privateKey, chainId: config.chainId,
        contractAddress: config.identityRegistry,
      });
      txHashes.push(await walletClient.writeContract({
        address: config.identityRegistry, abi: identityRegistry.abi,
        functionName: "setAgentWallet", args: [agentId, opts.wallet, deadline, sig], nonce: nonce++,
      }));
    } else {
      console.warn(`Skipping wallet linkage: --wallet (${opts.wallet}) differs from signer (${key.address}).`);
    }

    for (const hash of txHashes.slice(1)) {
      await publicClient.waitForTransactionReceipt({ hash });
    }

    const identityTuple = `eip155:1776:${config.identityRegistry}:${agentId}`;
    return { agentId, identityTuple, cardUri, txHashes, scanUrl: `https://8004scan.io/agent/${identityTuple}` };
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(formatContractError(error));
  }
}
