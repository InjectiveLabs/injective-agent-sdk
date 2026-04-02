import type {
  AgentClientConfig, NetworkConfig, RegisterOptions, RegisterResult,
  UpdateOptions, UpdateResult, DeregisterResult, DeregisterOptions, StatusResult,
  AgentClientCallbacks, StorageProvider, AgentCard,
} from "./types.js";
import { AGENT_TYPES } from "./types.js";
import { resolveNetworkConfig } from "./config.js";
import { resolveKey, signWalletLink, type ResolvedKey } from "./wallet.js";
import { createClients, createReadOnlyClients, encodeStringMetadata, identityTuple, walletLinkDeadline } from "./contracts.js";
import { generateAgentCard, mergeAgentCard, fetchAgentCard, checkServiceReachability } from "./card.js";
import { AgentReadClient } from "./read-client.js";
import { AgentSdkError, ContractError, StorageError, ValidationError, formatContractError } from "./errors.js";
import { isAddress, keccak256, toHex } from "viem";

const REGISTERED_EVENT_TOPIC = keccak256(toHex("Registered(uint256,string,address)"));

const ALLOWED_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".svg", ".webp"];
const MIME_TYPES: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml", ".webp": "image/webp",
};
const MAX_IMAGE_SIZE = 2 * 1024 * 1024;

export class AgentClient {
  readonly address: `0x${string}`;
  readonly injAddress: string;
  readonly config: NetworkConfig;

  private key: ResolvedKey;
  private storage: StorageProvider | undefined;
  private callbacks: AgentClientCallbacks;
  private clients: ReturnType<typeof createClients>;
  private _readClient: AgentReadClient | undefined;

  constructor(opts: AgentClientConfig) {
    this.config = resolveNetworkConfig({ network: opts.network, rpcUrl: opts.rpcUrl });
    this.key = resolveKey(opts.privateKey);
    this.storage = opts.storage;
    this.callbacks = opts.callbacks ?? {};
    this.address = this.key.address;
    this.injAddress = this.key.injAddress;
    this.clients = createClients(this.config, this.key.account);
  }

  private get readClient(): AgentReadClient {
    return (this._readClient ??= new AgentReadClient({ network: this.config.name as "testnet" | "mainnet", rpcUrl: this.config.rpcUrl }));
  }

  async register(opts: RegisterOptions): Promise<RegisterResult> {
    if (!opts.name || opts.name.length > 100) throw new ValidationError("Agent name must be 1-100 characters.");
    if (!AGENT_TYPES.includes(opts.type)) throw new ValidationError(`Invalid agent type "${opts.type}". Must be one of: ${AGENT_TYPES.join(", ")}.`);
    if (opts.description && opts.description.length > 500) throw new ValidationError("Description must be 500 characters or fewer.");
    if (!opts.builderCode) throw new ValidationError("Builder code is required.");
    if (!isAddress(opts.wallet)) throw new ValidationError(`Invalid wallet address: ${opts.wallet}. Must be a checksummed 0x address.`);

    const { publicClient, walletClient, identityRegistry, account } = this.clients;

    // Resolve image and check service URLs in parallel
    const [resolvedImage] = await Promise.all([
      opts.image ? this.resolveImage(opts.image) : Promise.resolve(undefined),
      opts.services?.length ? this.checkServices(opts.services.map(s => s.url)) : Promise.resolve(),
    ]);

    const card = generateAgentCard({
      name: opts.name, type: opts.type, description: opts.description,
      builderCode: opts.builderCode, operatorAddress: this.key.address,
      services: opts.services, image: resolvedImage, x402: opts.x402,
    });

    let cardUri: string;
    if (opts.uri) {
      cardUri = opts.uri;
    } else if (opts.dryRun) {
      cardUri = "ipfs://dry-run-placeholder";
    } else {
      if (!this.storage) throw new StorageError("No storage provider configured. Provide a uri or configure a StorageProvider.");
      this.callbacks.onProgress?.("Uploading agent card to IPFS...");
      cardUri = await this.storage.uploadJSON(card, card.name);
    }

    if (opts.dryRun) {
      const { result: predictedId } = await publicClient.simulateContract({
        address: this.config.identityRegistry, abi: identityRegistry.abi,
        functionName: "register", args: [cardUri], account,
      });
      return { agentId: predictedId as bigint, identityTuple: "", cardUri, txHashes: [], scanUrl: "" };
    }

    let nonce = await publicClient.getTransactionCount({ address: this.key.address, blockTag: "pending" });
    const txHashes: `0x${string}`[] = [];
    const gasPrice = opts.gasPrice ? opts.gasPrice * BigInt(1e9) : undefined;

    try {
      const metadata = [
        { metadataKey: "builderCode", metadataValue: encodeStringMetadata(opts.builderCode) },
        { metadataKey: "agentType", metadataValue: encodeStringMetadata(opts.type) },
      ];
      const registerHash = await walletClient.writeContract({
        address: this.config.identityRegistry, abi: identityRegistry.abi,
        functionName: "register", args: [cardUri, metadata], nonce: nonce++, gasPrice, gas: 500_000n,
      });
      txHashes.push(registerHash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: registerHash });

      const registeredLog = receipt.logs.find((log) =>
        log.address.toLowerCase() === this.config.identityRegistry.toLowerCase() &&
        log.topics[0] === REGISTERED_EVENT_TOPIC
      );
      if (!registeredLog?.topics[1]) throw new ContractError("Failed to extract agentId from register transaction.");
      const agentId = BigInt(registeredLog.topics[1]);

      if (opts.wallet.toLowerCase() === this.key.address.toLowerCase()) {
        const deadline = walletLinkDeadline();
        const sig = await signWalletLink({
          agentId, wallet: opts.wallet, ownerAddress: this.key.address, deadline,
          account: this.key.account, chainId: this.config.chainId,
          contractAddress: this.config.identityRegistry,
        });
        txHashes.push(await walletClient.writeContract({
          address: this.config.identityRegistry, abi: identityRegistry.abi,
          functionName: "setAgentWallet", args: [agentId, opts.wallet, deadline, sig], nonce: nonce++, gasPrice, gas: 300_000n,
        }));
      } else {
        this.callbacks.onWarning?.(`Skipping wallet linkage: wallet (${opts.wallet}) differs from signer (${this.key.address}).`);
      }

      await Promise.all(txHashes.slice(1).map(hash => publicClient.waitForTransactionReceipt({ hash })));

      const tuple = identityTuple(this.config, agentId);
      return { agentId, identityTuple: tuple, cardUri, txHashes, scanUrl: `https://8004scan.io/agent/${tuple}` };
    } catch (error) {
      if (error instanceof AgentSdkError) throw error;
      throw formatContractError(error);
    }
  }

  async update(agentId: bigint, opts: UpdateOptions): Promise<UpdateResult> {
    if (!opts.builderCode && !opts.type && !opts.uri && !opts.wallet &&
        !opts.name && !opts.description && !opts.services?.length &&
        !opts.removeServices?.length && !opts.image && opts.x402 === undefined) {
      throw new ValidationError("No fields to update. Provide at least one update option.");
    }
    if (opts.wallet && !isAddress(opts.wallet)) {
      throw new ValidationError(`Invalid wallet address: ${opts.wallet}. Must be a checksummed 0x address.`);
    }

    const { publicClient, walletClient, identityRegistry } = this.clients;
    const contractArgs = { address: this.config.identityRegistry, abi: identityRegistry.abi } as const;

    const hasCardChanges = !!(
      opts.name || opts.description || opts.services?.length ||
      opts.removeServices?.length || opts.image || opts.x402 !== undefined
    );

    const [owner, tokenUri] = await Promise.all([
      publicClient.readContract({ ...contractArgs, functionName: "ownerOf", args: [agentId] }) as Promise<`0x${string}`>,
      hasCardChanges && !opts.uri
        ? publicClient.readContract({ ...contractArgs, functionName: "tokenURI", args: [agentId] }) as Promise<string>
        : Promise.resolve(null),
    ]);
    if (owner.toLowerCase() !== this.key.address.toLowerCase()) {
      throw new ContractError(`You are not the owner of agent ${agentId}. Owner: ${owner}`);
    }

    let newCardUri: string | undefined;
    if (hasCardChanges && !opts.uri && tokenUri) {
      let existingCard: AgentCard;
      try {
        existingCard = await fetchAgentCard(tokenUri, this.config.ipfsGateway);
      } catch (firstError) {
        this.callbacks.onWarning?.(`Failed to fetch agent card, retrying... (${firstError instanceof Error ? firstError.message : String(firstError)})`);
        try {
          existingCard = await fetchAgentCard(tokenUri, this.config.ipfsGateway);
        } catch {
          if (opts.allowFreshCard) {
            existingCard = generateAgentCard({
              name: `Agent ${agentId}`, type: "other",
              builderCode: "", operatorAddress: "",
            });
          } else {
            throw new AgentSdkError(
              `Could not fetch existing agent card for Agent #${agentId}. ` +
              "Set allowFreshCard: true to proceed with a fresh card, " +
              "or provide all card fields explicitly."
            );
          }
        }
      }

      const [resolvedImage] = await Promise.all([
        opts.image ? this.resolveImage(opts.image) : Promise.resolve(undefined),
        opts.services?.length ? this.checkServices(opts.services.map(s => s.url)) : Promise.resolve(),
      ]);

      const mergedCard = mergeAgentCard(existingCard, {
        name: opts.name,
        description: opts.description,
        services: opts.services,
        removeServices: opts.removeServices,
        image: resolvedImage,
        x402: opts.x402,
      });

      if (!this.storage) throw new StorageError("No storage provider configured. Provide a uri or configure a StorageProvider.");
      this.callbacks.onProgress?.("Uploading updated agent card to IPFS...");
      newCardUri = await this.storage.uploadJSON(mergedCard, mergedCard.name);
    }

    let nonce = await publicClient.getTransactionCount({ address: this.key.address, blockTag: "pending" });
    const txHashes: `0x${string}`[] = [];
    const updatedFields: string[] = [];
    const gasPrice = opts.gasPrice ? opts.gasPrice * BigInt(1e9) : undefined;

    try {
      if (opts.builderCode) {
        txHashes.push(await walletClient.writeContract({
          ...contractArgs, functionName: "setMetadata",
          args: [agentId, "builderCode", encodeStringMetadata(opts.builderCode)], nonce: nonce++, gasPrice,
        }));
        updatedFields.push("builderCode");
      }
      if (opts.type) {
        txHashes.push(await walletClient.writeContract({
          ...contractArgs, functionName: "setMetadata",
          args: [agentId, "agentType", encodeStringMetadata(opts.type)], nonce: nonce++, gasPrice,
        }));
        updatedFields.push("agentType");
      }
      const effectiveUri = opts.uri ?? newCardUri;
      if (effectiveUri) {
        txHashes.push(await walletClient.writeContract({
          ...contractArgs, functionName: "setAgentURI",
          args: [agentId, effectiveUri], nonce: nonce++, gasPrice,
        }));
        updatedFields.push("tokenURI");
      }
      if (opts.wallet) {
        if (opts.wallet.toLowerCase() !== this.key.address.toLowerCase()) {
          throw new ValidationError(`Wallet linkage requires the wallet's private key. Currently only self-signing is supported (wallet must match signer ${this.key.address}).`);
        }
        const deadline = walletLinkDeadline();
        const sig = await signWalletLink({
          agentId, wallet: opts.wallet, ownerAddress: this.key.address, deadline,
          account: this.key.account, chainId: this.config.chainId,
          contractAddress: this.config.identityRegistry,
        });
        txHashes.push(await walletClient.writeContract({
          ...contractArgs, functionName: "setAgentWallet",
          args: [agentId, opts.wallet, deadline, sig], nonce: nonce++, gasPrice,
        }));
        updatedFields.push("wallet");
      }
      await Promise.all(txHashes.map(hash => publicClient.waitForTransactionReceipt({ hash })));
      return { agentId, updatedFields, txHashes };
    } catch (error) {
      if (error instanceof AgentSdkError) throw error;
      throw formatContractError(error);
    }
  }

  async deregister(agentId: bigint, opts?: DeregisterOptions): Promise<DeregisterResult> {
    const { publicClient, walletClient, identityRegistry } = this.clients;
    const gasPrice = opts?.gasPrice ? opts.gasPrice * BigInt(1e9) : undefined;

    try {
      const hash = await walletClient.writeContract({
        address: this.config.identityRegistry, abi: identityRegistry.abi,
        functionName: "deregister", args: [agentId], gasPrice,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return { agentId, txHash: hash };
    } catch (error) {
      if (error instanceof AgentSdkError) throw error;
      throw formatContractError(error);
    }
  }

  async getStatus(agentId: bigint): Promise<StatusResult> {
    return this.readClient.getStatus(agentId);
  }

  private async resolveImage(imageInput: string): Promise<string> {
    if (imageInput.startsWith("ipfs://") || imageInput.startsWith("https://") || imageInput.startsWith("http://")) {
      return imageInput;
    }
    if (!this.storage?.uploadFile) {
      this.callbacks.onWarning?.("Cannot upload image — no storage provider with file upload configured. Registering without image.");
      return "";
    }
    const { readFile } = await import("node:fs/promises");
    const { extname, basename } = await import("node:path");
    const ext = extname(imageInput).toLowerCase();
    if (!ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
      throw new ValidationError(`Unsupported image type "${ext}". Must be one of: ${ALLOWED_IMAGE_EXTENSIONS.join(", ")}.`);
    }
    const content = await readFile(imageInput).catch(() => {
      throw new StorageError(`Image file not found: ${imageInput}`);
    });
    if (content.byteLength > MAX_IMAGE_SIZE) {
      this.callbacks.onWarning?.(`Image file exceeds 2MB limit (${(content.byteLength / 1024 / 1024).toFixed(1)}MB). Registering without image.`);
      return "";
    }
    this.callbacks.onProgress?.("Uploading image to IPFS...");
    return this.storage.uploadFile(content, basename(imageInput), MIME_TYPES[ext]);
  }

  private async checkServices(urls: string[]): Promise<void> {
    const warnings = await Promise.all(urls.map(url => checkServiceReachability(url)));
    for (const warning of warnings) {
      if (warning) this.callbacks.onWarning?.(warning);
    }
  }
}
