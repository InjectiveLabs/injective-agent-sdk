import { type RegisterOptions, type RegisterResult, AGENT_TYPES } from "../types/index.js";
import { getConfig } from "../lib/config.js";
import { resolveKey } from "../lib/keys.js";
import { createClients, encodeStringMetadata, identityTuple, walletLinkDeadline } from "../lib/contracts.js";
import { generateAgentCard } from "../lib/agent-card.js";
import { signWalletLink } from "../lib/wallet-signature.js";
import { uploadAgentCard, resolveImageUri } from "../lib/ipfs.js";
import { warnIfUnreachable } from "../lib/agent-card.js";
import { CliError, formatContractError } from "../lib/errors.js";
import { isAddress, keccak256, toHex } from "viem";

const REGISTERED_EVENT_TOPIC = keccak256(toHex("Registered(uint256,string,address)"));

export async function register(opts: RegisterOptions): Promise<RegisterResult> {
  if (!opts.name || opts.name.length > 100) throw new CliError("Agent name must be 1-100 characters.");
  if (!AGENT_TYPES.includes(opts.type)) throw new CliError(`Invalid agent type "${opts.type}". Must be one of: ${AGENT_TYPES.join(", ")}.`);
  if (opts.description && opts.description.length > 500) throw new CliError("Description must be 500 characters or fewer.");
  if (!opts.builderCode) throw new CliError("Builder code is required.");
  if (!isAddress(opts.wallet)) throw new CliError(`Invalid wallet address: ${opts.wallet}. Must be a checksummed 0x address.`);

  const config = getConfig();
  const key = resolveKey();
  const { publicClient, walletClient, identityRegistry, account } = createClients(config, key.account);

  // Resolve image and check service URLs in parallel
  const [resolvedImage] = await Promise.all([
    opts.image ? resolveImageUri(opts.image) : Promise.resolve(undefined),
    opts.services?.length
      ? Promise.all(opts.services.map(s => warnIfUnreachable(s.url)))
      : Promise.resolve(),
  ]);

  const card = generateAgentCard({
    name: opts.name, type: opts.type, description: opts.description,
    builderCode: opts.builderCode, operatorAddress: key.address,
    services: opts.services, image: resolvedImage, x402: opts.x402,
  });

  let cardUri: string;
  if (opts.uri) {
    cardUri = opts.uri;
  } else if (opts.dryRun) {
    cardUri = "ipfs://dry-run-placeholder";
  } else {
    console.log("Uploading agent card to IPFS...");
    cardUri = await uploadAgentCard(card);
  }

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
  const gasPrice = opts.gasPrice ? opts.gasPrice * BigInt(1e9) : undefined;

  try {
    // TX 1: register with metadata batch (saves 2 transaction base costs vs separate setMetadata calls)
    const metadata = [
      { metadataKey: "builderCode", metadataValue: encodeStringMetadata(opts.builderCode) },
      { metadataKey: "agentType", metadataValue: encodeStringMetadata(opts.type) },
    ];
    const registerHash = await walletClient.writeContract({
      address: config.identityRegistry, abi: identityRegistry.abi,
      functionName: "register", args: [cardUri, metadata], nonce: nonce++, gasPrice, gas: 500_000n,
    });
    txHashes.push(registerHash);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: registerHash });

    // Extract agentId from canonical Registered(uint256 indexed agentId, string, address indexed)
    const registeredLog = receipt.logs.find((log) =>
      log.address.toLowerCase() === config.identityRegistry.toLowerCase() &&
      log.topics[0] === REGISTERED_EVENT_TOPIC
    );
    if (!registeredLog?.topics[1]) throw new CliError("Failed to extract agentId from register transaction.");
    const agentId = BigInt(registeredLog.topics[1]);

    // TX 2: setAgentWallet (self-sign only, needs agentId from TX 1)
    if (opts.wallet.toLowerCase() === key.address.toLowerCase()) {
      const deadline = walletLinkDeadline();
      const sig = await signWalletLink({
        agentId, wallet: opts.wallet, ownerAddress: key.address, deadline,
        account: key.account, chainId: config.chainId,
        contractAddress: config.identityRegistry,
      });
      txHashes.push(await walletClient.writeContract({
        address: config.identityRegistry, abi: identityRegistry.abi,
        functionName: "setAgentWallet", args: [agentId, opts.wallet, deadline, sig], nonce: nonce++, gasPrice, gas: 300_000n,
      }));
    } else {
      console.warn(`Skipping wallet linkage: --wallet (${opts.wallet}) differs from signer (${key.address}).`);
    }

    await Promise.all(txHashes.slice(1).map(hash => publicClient.waitForTransactionReceipt({ hash })));

    const tuple = identityTuple(config, agentId);
    return { agentId, identityTuple: tuple, cardUri, txHashes, scanUrl: `https://8004scan.io/agent/${tuple}` };
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(formatContractError(error));
  }
}
