# Agent CLI Design — Block 3: ERC-8004 Agent Identity CLI + MCP Tools

## Purpose

A TypeScript CLI and MCP tool server that allows builders to register, update, deregister, and query agents on the Injective EVM ERC-8004 IdentityRegistry. This is Block 3 of the Injective Agentic Economy Phase 2.

## Constraints

- Depends on Block 1 contracts (deployed to testnet at known addresses)
- Block 2 indexer API is not yet available — `status` command reads on-chain data directly for now
- IPFS upload is stubbed — builders use `--uri` flag; real upload wired in later
- Key management starts with `INJ_PRIVATE_KEY` env var; keyring/keystore added later

## Success Criteria

- All four commands (`register`, `update`, `deregister`, `status`) work against testnet
- Same logic is exposed as MCP tools for AI agent integration
- Full registration flow: generate agent card, submit 4 transactions, output identity tuple
- Unit tests for card generation, ABI encoding, key derivation, error messages
- Integration test: full register flow on testnet

---

## Architecture

```
injective-agent-cli/
  package.json
  tsconfig.json
  src/
    cli.ts                    # Entry point, commander setup
    commands/
      register.ts             # inj-agent register
      update.ts               # inj-agent update
      deregister.ts           # inj-agent deregister
      status.ts               # inj-agent status
    mcp/
      server.ts               # MCP server entry point
      tools.ts                # MCP tool definitions wrapping command logic
    lib/
      contracts.ts            # viem contract instances + ABI bindings
      keys.ts                 # Key resolution (env var -> private key -> account)
      ipfs.ts                 # IPFS upload (stubbed, --uri passthrough)
      agent-card.ts           # Agent card JSON generation + schema validation
      config.ts               # Chain config, addresses, RPC URLs
      wallet-signature.ts     # Generate wallet linkage signature
      formatting.ts           # Human-readable output formatting
    types/
      index.ts                # Shared types (AgentType, AgentCard, etc.)
    abi/
      IdentityRegistry.json   # Full compiled ABI from Block 1 (includes ERC-721 inherited functions)
  test/
    commands/
      register.test.ts
      update.test.ts
      deregister.test.ts
      status.test.ts
    lib/
      agent-card.test.ts
      keys.test.ts
      wallet-signature.test.ts
  bin/
    inj-agent                 # Shebang entry: #!/usr/bin/env node
```

### Dual Interface: CLI + MCP

Each command is implemented as a pure async function in `commands/*.ts` that takes typed options and returns a result object. The CLI layer (`cli.ts`) parses args via commander and calls these functions. The MCP layer (`mcp/tools.ts`) wraps the same functions as MCP tools. No business logic lives in either adapter layer.

```
CLI (commander)  ──>  commands/*.ts (pure functions)  <──  MCP tools
    cli.ts                    |                           mcp/tools.ts
                    +---------v-----------+
                    |  lib/               |
                    |  contracts, keys,   |
                    |  ipfs, agent-card   |
                    +---------------------+
```

---

## Commands

### `inj-agent register`

**Input options:**
| Flag | Required | Type | Validation |
|------|----------|------|------------|
| `--name` | yes | string | non-empty, max 100 chars |
| `--type` | yes | enum | trading, liquidation, data, portfolio, other |
| `--description` | no | string | max 500 chars |
| `--builder-code` | yes | string | non-empty |
| `--wallet` | yes | string | valid 0x address, checksummed |
| `--uri` | no | string | valid URI (skips IPFS upload) |
| `--gas-price` | no | string | wei amount |
| `--dry-run` | no | boolean | print tx details, don't send |
| `--json` | no | boolean | JSON output |

**Flow:**
1. Resolve signing key from `INJ_PRIVATE_KEY` env var
2. Validate all inputs
3. Generate agent card JSON (ERC-8004 schema)
4. If `--uri` not provided: stub error telling user to use `--uri` (IPFS not yet wired)
5. If `--dry-run`: call `simulateContract` for `register(tokenURI)` to get predicted agentId, print all 4 planned transaction details, and exit without submitting
6. Send 4 transactions sequentially with manual nonce tracking (fetch nonce once, increment locally):
   - `register(tokenURI)` -> extract agentId from `AgentRegistered` event (field: `agentId`)
   - `setMetadata(agentId, "builderCode", encodeAbiParameters([{type:'string'}], [builderCode]))`
   - `setMetadata(agentId, "agentType", encodeAbiParameters([{type:'string'}], [type]))`
   - `setAgentWallet(agentId, wallet, deadline, signature)` — self-sign if wallet == signer, otherwise skip with warning
7. Output: agentId, identity tuple, tx hashes, 8004Scan URL

**Nonce management:** Fetch `eth_getTransactionCount(address, 'pending')` once before the 4-transaction sequence. Pass explicit nonce to each `writeContract` call, incrementing locally after each.

**Metadata encoding:** All string metadata values are encoded using viem's `encodeAbiParameters([{ type: 'string' }], [value])`. This produces ABI-encoded bytes that match what `abi.encode(string)` produces in Solidity. The `getMetadata` return value is decoded with `decodeAbiParameters([{ type: 'string' }], bytes)`.

**Error handling:**

| Condition | User-Facing Message | Exit Code |
|-----------|---------------------|-----------|
| No signing key | `No signing key provided. Set INJ_PRIVATE_KEY environment variable.` | 1 |
| Insufficient balance | `Insufficient EVM balance for registration. Need approximately 0.001 INJ for gas. Fund your EVM address <addr>.` | 1 |
| IPFS not wired (no --uri) | `IPFS upload is not yet available. Use --uri to provide your own hosted agent card URL.` | 1 |
| Invalid --type value | `Invalid agent type "<value>". Must be one of: trading, liquidation, data, portfolio, other.` | 1 |
| --name too long | `Agent name must be 100 characters or fewer.` | 1 |
| --description too long | `Description must be 500 characters or fewer.` | 1 |
| Invalid --wallet address | `Invalid wallet address: <addr>. Must be a checksummed 0x address.` | 1 |
| Contract revert: `EmptyTokenURI` | `Registration failed: token URI cannot be empty.` | 1 |
| Contract revert: `WalletAlreadyLinked(wallet, existingAgentId)` | `Wallet <wallet> is already linked to agent <existingAgentId>. Each wallet can only be linked to one agent.` | 1 |
| Contract revert: `NotAgentOwner(agentId)` | `You are not the owner of agent <agentId>.` | 1 |
| Contract revert: `DeadlineExpired` | `Wallet signature deadline has expired. Try again.` | 1 |
| Contract revert: `InvalidSignature` | `Invalid wallet signature. Ensure the wallet private key matches the --wallet address.` | 1 |
| Contract revert (generic) | `Transaction reverted: <revert reason>. Tx hash: <hash>` | 1 |

### `inj-agent update`

**Input:** `<AGENT_ID>` positional + optional flags:
| Flag | Type | Notes |
|------|------|-------|
| `--name` | string | Update display name (requires `--uri` to re-host updated card) |
| `--description` | string | Update description (requires `--uri` to re-host updated card) |
| `--builder-code` | string | Update builder code (on-chain metadata) |
| `--type` | enum | Update agent type (on-chain metadata) |
| `--wallet` | string | Update agent wallet (requires new signature) |
| `--uri` | string | Update agent card URI directly |
| `--json` | no | JSON output |

**Flow:**
1. Read current on-chain state: `tokenURI(agentId)`, `ownerOf(agentId)`, `getMetadata(agentId, "builderCode")`, `getMetadata(agentId, "agentType")`
2. Verify caller is the owner
3. If `--name` or `--description` provided without `--uri`: error with message "Changing name or description requires a new agent card URI. Provide --uri with the updated card's hosted URL."
4. Build list of transactions needed:
   - If `--builder-code`: `setMetadata(agentId, "builderCode", encode(builderCode))`
   - If `--type`: `setMetadata(agentId, "agentType", encode(type))`
   - If `--uri`: `setAgentURI(agentId, uri)`
   - If `--wallet`: generate signature, `setAgentWallet(agentId, wallet, deadline, sig)`
5. Send transactions sequentially with manual nonce tracking
6. Output: updated fields + tx hashes

### `inj-agent deregister`

**Input:** `<AGENT_ID>` positional, `--force` flag, `--json` flag

**Flow:**
1. Read agent name from on-chain `tokenURI` (fetch and parse the agent card)
2. If not `--force`: print warning and prompt for agent name confirmation (stdin)
3. Send `deregister(agentId)` transaction
4. Output: confirmation + tx hash

### `inj-agent status`

**Input:** `[AGENT_ID]` optional positional, `--all` flag, `--json` flag

**Flow (AGENT_ID provided):**
1. Read on-chain: `ownerOf(agentId)`, `tokenURI(agentId)`, `getAgentWallet(agentId)`, `getMetadata(agentId, "builderCode")`, `getMetadata(agentId, "agentType")`
2. Fetch and parse agent card from tokenURI (if IPFS, resolve via gateway `https://w3s.link/ipfs/{CID}`)
3. Display: agent name, ID, identity tuple, builder code, wallet, status, registered date
4. Trading metrics and reputation: display "Metrics available when indexer API is live" placeholder

**Flow (--all):**
1. Not feasible without indexer API. Display: "The --all flag requires the indexer API which is not yet available. Provide an AGENT_ID instead."

---

## Library Modules

### `lib/contracts.ts`
- Creates viem `PublicClient` and `WalletClient` from RPC URL and private key
- Exports typed contract instances for IdentityRegistry using the **full compiled ABI JSON** from `src/abi/IdentityRegistry.json` (not just the custom interface — this includes inherited ERC-721 functions like `tokenURI`, `ownerOf`, `balanceOf`)
- Gas estimation with 20% buffer, fallback to hardcoded limits
- Uses `simulateContract` before `writeContract` to capture return values and validate before sending

### `lib/keys.ts`
- Reads `INJ_PRIVATE_KEY` from env
- Validates hex format (with or without 0x prefix), derives 0x address and inj1 address
- inj1 address derivation: Bech32 encode of ripemd160(sha256(compressed_pubkey)) with "inj" prefix
- Displays both addresses when key is loaded
- Future: add `--from-keyring` and `--keystore` support

### `lib/ipfs.ts`
- Exports `uploadAgentCard(card: AgentCard): Promise<string>`
- Current implementation: throws with message to use `--uri`
- Future: wire up web3.storage or Pinata with 3x retry + exponential backoff (1s, 2s, 4s)

### `lib/agent-card.ts`
- `generateAgentCard(opts)` -> builds JSON matching the agent card schema
- `validateAgentCard(card)` -> validates against the JSON schema from Block 1 artifacts
- `fetchAgentCard(uri)` -> fetches and parses card from IPFS gateway or HTTP URL

### `lib/wallet-signature.ts`
- `signWalletLink(agentId, wallet, deadline, privateKey, chainId, contractAddress)` -> produces ECDSA signature
- Digest: `keccak256(abi.encodePacked(agentId, wallet, deadline, chainId, contractAddress))` — matching the contract's `setAgentWallet` verification
- Then ERC-191 prefix: `keccak256("\x19Ethereum Signed Message:\n32" + digest)` — matching the contract's use of `MessageHashUtils.toEthSignedMessageHash`
- Sign with viem's `signMessage` using the wallet's private key
- Test vector (from Block 1 tests): agentId=1, wallet=walletSigner address from `makeAddrAndKey("walletSigner")`, deadline=block.timestamp+3600, chainId=31337 (anvil), contractAddress=identity proxy address. The signature must pass the on-chain `setAgentWallet` call.

### `lib/config.ts`
- Network configs: testnet (default) and mainnet
- Contract addresses loaded from `testnet.json` or `mainnet.json` based on `INJ_NETWORK` env var
- Testnet file must contain `chainId` field for validation
- RPC URLs, chain ID (1776), IPFS gateway URL (`https://w3s.link/ipfs/`)
- Overridable via env vars: `INJ_RPC_URL`, `INJ_NETWORK` (testnet/mainnet)

### `lib/formatting.ts`
- Human-readable output for each command
- Identity tuple formatting: `eip155:1776:<registry>:<agentId>`
- Address truncation, table rendering
- JSON mode: output raw result objects

---

## MCP Tools

The MCP server exposes four tools matching the CLI commands. MCP adapter always passes `force: true` for deregister (no stdin in MCP context).

| Tool Name | Description | Parameters | Return |
|-----------|-------------|------------|--------|
| `agent_register` | Register a new agent on ERC-8004 IdentityRegistry | `name` (string, required), `type` (string, required, enum), `builderCode` (string, required), `wallet` (string, required, 0x address), `uri` (string, required for now), `description` (string, optional) | `{ agentId: string, identityTuple: string, txHashes: string[], cardUri: string }` |
| `agent_update` | Update an existing agent's metadata or wallet | `agentId` (string, required, decimal uint256), `builderCode` (string, optional), `type` (string, optional, enum), `wallet` (string, optional, 0x address), `uri` (string, optional) | `{ agentId: string, updatedFields: string[], txHashes: string[] }` |
| `agent_deregister` | Burn an agent's identity NFT (irreversible) | `agentId` (string, required, decimal uint256) | `{ agentId: string, txHash: string }` |
| `agent_status` | Get agent registration status and on-chain data | `agentId` (string, required, decimal uint256) | `{ agentId: string, name: string, type: string, owner: string, wallet: string, builderCode: string, tokenUri: string, identityTuple: string }` |

`agentId` is always passed as a decimal string (e.g., "42") since JSON has no bigint type.

MCP server runs via: `npx @injective/agent-cli mcp` or as a standalone stdio server.

---

## Testing

### Unit Tests
- `agent-card.test.ts`: card generation from all flag combos, schema validation, edge cases
- `keys.test.ts`: key derivation produces correct 0x and inj1 addresses (test with known key pairs)
- `wallet-signature.test.ts`: signature matches what the contract expects; cross-verify with Block 1 test vectors using known private key -> expected signature
- `register.test.ts`: ABI encoding for all 4 transactions, dry-run output, all error conditions from error table, metadata encoding roundtrip
- `update.test.ts`: partial updates, error on --name without --uri, regenerate flow
- `deregister.test.ts`: confirmation prompt, force flag
- `status.test.ts`: on-chain data parsing, formatted output, agent card fetch

### Integration Tests (testnet)
- Full `register` flow with `--uri` flag against testnet contracts
- `status` reads back the registered agent
- `deregister --force` burns the NFT
- `register --dry-run` produces correct output without submitting

---

## Dependencies

```json
{
  "dependencies": {
    "viem": "^2.x",
    "commander": "^12.x",
    "@modelcontextprotocol/sdk": "^1.x",
    "bech32": "^2.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "vitest": "^3.x",
    "tsx": "^4.x",
    "@types/node": "^22.x"
  }
}
```

---

## Phased Delivery

**Phase A (this implementation):**
- All 4 CLI commands working with `INJ_PRIVATE_KEY` + `--uri` flag
- MCP tool wrappers
- Unit tests + testnet integration test
- `status` reads on-chain data only

**Phase B (when Block 2 ships):**
- Wire `status` to indexer API (`GET /agents/{agentId}`, `GET /builders/{addr}/agents`)
- Enable `--all` flag on status

**Phase C (IPFS + key management):**
- Wire up web3.storage/Pinata for IPFS upload
- Add `--from-keyring` and `--keystore` key resolution
