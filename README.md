# @injective/agent-sdk

TypeScript SDK and CLI for managing on-chain AI agent identities on the [Injective](https://injective.com) blockchain.

Register, update, and query [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) agent identity NFTs — from code or from the terminal. Browse the live registry at **[agents.injective.com](https://agents.injective.com/)**.

## What is ERC-8004?

ERC-8004 is the standard for on-chain AI agent identity. Each agent gets a soulbound NFT with:

- **Agent Card** — JSON metadata hosted on IPFS (name, description, services, image, x402 support)
- **On-chain metadata** — builder code, agent type, operator address
- **Wallet linkage** — EIP-712 signed wallet-to-agent binding
- **Identity tuple** — `eip155:{chainId}:{registry}:{agentId}` for cross-chain discovery

Agents registered on Injective are discoverable through the [Injective Agent Registry](https://agents.injective.com/) (browse, search, and view reputation/feedback) and on [8004scan](https://8004scan.io).

## Installation

```bash
# SDK — for programmatic use in your agent code
npm install @injective/agent-sdk

# CLI — for terminal use
npm install -g injective-agent-cli
```

> **Requirements:** Node.js 18+, ESM (`"type": "module"` in your package.json). The SDK has `viem` as a peer dependency.

## Quick Start

### From Code (SDK)

```typescript
import { AgentClient, PinataStorage } from '@injective/agent-sdk'

const client = new AgentClient({
  privateKey: '0x...',
  network: 'testnet',
  storage: new PinataStorage({ jwt: 'your-pinata-jwt' }),
})

// Register an agent
const result = await client.register({
  name: 'FundingRateSniper',
  type: 'trading',
  builderCode: 'acme-corp',
  wallet: client.address,
  description: 'Autonomous funding rate arbitrage agent',
  services: [
    { type: 'mcp', url: 'https://bot.acme.dev/mcp', description: 'MCP endpoint' },
    { type: 'a2a', url: 'https://bot.acme.dev/a2a' },
  ],
  image: 'https://example.com/avatar.png',
  x402: true,
})

console.log(`Agent #${result.agentId} registered`)
console.log(`Card: ${result.cardUri}`)
console.log(`View: ${result.scanUrl}`)
```

### From Terminal (CLI)

```bash
# Configure
cp .env.example .env
# Edit .env: INJ_PRIVATE_KEY, PINATA_JWT

# Register
inj-agent register \
  --name "FundingRateSniper" \
  --type trading \
  --builder-code acme-corp \
  --wallet 0x... \
  --service '{"type":"mcp","url":"https://bot.acme.dev/mcp"}' \
  --x402
```

### For MCP Users

For MCP tool access to Injective, use [`InjectiveLabs/mcp-server`](https://github.com/InjectiveLabs/mcp-server) — a unified MCP with trading + identity tools.

```bash
claude mcp add injective -- node /path/to/mcp-server/dist/mcp/server.js
```

## Table of Contents

- [SDK Reference](#sdk-reference)
  - [AgentClient](#agentclient)
  - [AgentReadClient](#agentreadclient) (discovery, listing, reputation, events)
  - [Storage Providers](#storage-providers)
  - [Card Utilities](#card-utilities)
  - [Wallet Utilities](#wallet-utilities)
  - [Error Types](#error-types)
- [CLI Reference](#cli-reference)
  - [register](#register)
  - [update](#update)
  - [status](#status)
- [Configuration](#configuration)
- [Agent Card Schema](#agent-card-schema)
- [Network & Contracts](#network--contracts)
- [Architecture](#architecture)
- [Development](#development)
- [Troubleshooting](#troubleshooting)

## SDK Reference

### AgentClient

The primary entry point for all write operations.

```typescript
import { AgentClient, PinataStorage } from '@injective/agent-sdk'

const client = new AgentClient({
  privateKey: '0x...',              // required
  network: 'testnet',              // 'staging' | 'testnet' | 'mainnet' (default: testnet)
  rpcUrl: 'https://custom-rpc',   // optional override
  storage: new PinataStorage({ jwt: '...' }),  // optional
  callbacks: {
    onProgress: (msg) => console.log(msg),  // optional
    onWarning: (msg) => console.warn(msg),  // optional
  },
})

// Properties
client.address     // '0x...' — EVM address derived from private key
client.injAddress  // 'inj1...' — bech32 Injective address
client.config      // NetworkConfig
```

#### `client.register(opts)`

```typescript
const result = await client.register({
  name: 'MyBot',                   // 1-100 characters
  type: 'trading',                 // trading | liquidation | data | portfolio | other
  builderCode: 'acme-corp',       // builder identifier
  wallet: '0x...',                 // wallet to link
  description: 'Optional desc',   // up to 500 chars
  services: [{ type: 'mcp', url: 'https://...' }],
  image: 'https://...',           // URL or local file path
  x402: true,                     // x402 payment support
  uri: 'ipfs://...',              // skip auto-upload, use this URI
  gasPrice: 10n,                  // override gas price (gwei)
  dryRun: true,                   // simulate only, no tx
})

// Returns: { agentId, identityTuple, cardUri, txHashes, scanUrl }
```

#### `client.update(agentId, opts)`

```typescript
const result = await client.update(5n, {
  services: [{ type: 'mcp', url: 'https://new-endpoint.com/mcp' }],
  x402: true,
  allowFreshCard: false,  // if card fetch fails, throw instead of using blank card
})

// Returns: { agentId, updatedFields, txHashes }
```

Services are merged by type (upsert). Use `removeServices: ['mcp']` to delete a service. The update fetches the existing card from IPFS, merges changes, re-uploads, and updates the on-chain token URI.

> **Note:** Agent burning/deregistration is not supported. The deployed `IdentityRegistry` v2 contract does not expose a burn function. To retire an agent, transfer the NFT to a burn address or clear its `agentURI`.

#### `client.getStatus(agentId)`

```typescript
const status = await client.getStatus(5n)
// Returns: { agentId, name, type, owner, wallet, builderCode, tokenUri, identityTuple }
```

### AgentReadClient

For read-only operations. No private key required.

```typescript
import { AgentReadClient } from '@injective/agent-sdk'

const reader = new AgentReadClient({ network: 'testnet' })
```

#### Health Check

```typescript
const isUp = await reader.ping()             // true | false (never throws)
const details = await reader.pingDetailed()   // { reachable, blockNumber?, latencyMs? }
```

#### Discovery & Listing

```typescript
// Discover all live agent IDs (scans Transfer events, cached for 60s)
const agentIds = await reader.discoverAgentIds()

// Paginated listing
const page = await reader.listAgents({ offset: 0, limit: 20 })
// Returns: { agents: StatusResult[], total, offset, limit, failed: bigint[] }

// Enriched listing (includes reputation + full card per agent)
const enriched = await reader.listAgents({ offset: 0, limit: 10, enrich: true })

// Filter by owner
const myAgents = await reader.getAgentsByOwner('0x...')
```

#### Single Agent

```typescript
const status = await reader.getStatus(5n)
const card = await reader.fetchCard('ipfs://...')
const enriched = await reader.getEnrichedAgent(5n)
// Returns: StatusResult & { reputation: ReputationResult, card: AgentCard | null }
```

#### Reputation

```typescript
const rep = await reader.getReputation(5n)
// Returns: { score: number, count: number }

const feedback = await reader.getFeedbackEntries(5n)
// Returns: FeedbackEntry[] with value (bigint), decimals, tags, revoked status
```

#### Event Watching

```typescript
// Watch for new agent registrations (real-time)
const unwatch = reader.watchRegistrations(({ agentId, owner, txHash }) => {
  console.log(`New agent #${agentId} by ${owner}`)
})

// Stop watching
unwatch()

// Watch for burns
const unwatchBurns = reader.watchDeregistrations(({ agentId, previousOwner }) => {
  console.log(`Agent #${agentId} burned`)
})
```

### Convenience Factory

For Node.js applications that use environment variables:

```typescript
import { createAgentClientFromEnv } from '@injective/agent-sdk'

// Reads INJ_PRIVATE_KEY, INJ_NETWORK, INJ_RPC_URL, PINATA_JWT from process.env
const client = createAgentClientFromEnv()
```

### Storage Providers

The SDK uses a pluggable storage interface for uploading agent cards and images to IPFS.

```typescript
interface StorageProvider {
  uploadJSON(data: unknown, name?: string): Promise<string>  // returns URI
  uploadFile?(content: Uint8Array, filename: string, mimeType: string): Promise<string>
}
```

**Built-in providers:**

```typescript
import { PinataStorage, CustomUrlStorage } from '@injective/agent-sdk'

// Pinata — uploads to IPFS via Pinata API
const storage = new PinataStorage({ jwt: 'your-pinata-jwt' })

// Custom URL — returns a pre-configured URI (no upload)
const storage = new CustomUrlStorage('https://mysite.com/agent-card.json')
```

**Custom provider example:**

```typescript
class S3Storage implements StorageProvider {
  async uploadJSON(data: unknown, name?: string): Promise<string> {
    const key = `agent-cards/${name}.json`
    await s3.putObject({ Bucket: 'my-bucket', Key: key, Body: JSON.stringify(data) })
    return `https://my-bucket.s3.amazonaws.com/${key}`
  }
}
```

### Card Utilities

```typescript
import {
  generateAgentCard,   // Build card JSON from options
  mergeAgentCard,      // Apply partial updates to an existing card
  fetchAgentCard,      // Fetch and validate a card from IPFS/HTTPS
  validateServiceEntry // Validate a service entry object
} from '@injective/agent-sdk'

const card = generateAgentCard({
  name: 'MyBot', type: 'trading', builderCode: 'test',
  operatorAddress: '0x...', services: [...], image: '...', x402: true,
})

const updated = mergeAgentCard(card, {
  services: [{ type: 'a2a', url: 'https://new.com/a2a' }],
  x402: false,
})
```

### Wallet Utilities

```typescript
import { evmToInj, identityTuple, signWalletLink } from '@injective/agent-sdk'

evmToInj('0xf39F...')  // 'inj1...'
identityTuple(config, 5n)  // 'eip155:1439:0x19d1...:5'
```

### Error Types

```typescript
import {
  AgentSdkError,    // Base error class
  ContractError,    // On-chain revert (has .revertReason)
  StorageError,     // Upload failure
  ValidationError,  // Input validation
} from '@injective/agent-sdk'

try {
  await client.register(opts)
} catch (err) {
  if (err instanceof ContractError) {
    console.log(err.revertReason)  // e.g. 'EmptyTokenURI'
  }
}
```

## CLI Reference

### register

```bash
inj-agent register \
  --name "My Agent" --type trading --builder-code acme --wallet 0x... \
  [--description "..."] [--service '{"type":"mcp","url":"..."}'] \
  [--image ./avatar.png] [--x402] [--uri "ipfs://..."] \
  [--gas-price 10] [--dry-run] [--json]
```

### update

```bash
inj-agent update <agentId> \
  [--name "..."] [--type ...] [--builder-code ...] [--wallet 0x...] \
  [--service '{"type":"mcp","url":"..."}'] [--remove-service mcp] \
  [--image ...] [--x402] [--no-x402] [--uri "..."] [--json]
```

Fetches the existing card, merges changes, re-uploads to IPFS, and updates the on-chain URI.

### status

```bash
inj-agent status <agentId> [--json]
```

## Configuration

| Variable | Required | Default | Description |
|----------|:--------:|---------|-------------|
| `INJ_PRIVATE_KEY` | Yes | -- | Hex-encoded private key (with or without `0x` prefix) |
| `INJ_NETWORK` | No | `testnet` | `staging`, `testnet`, or `mainnet` |
| `INJ_RPC_URL` | No | Network default | Override RPC endpoint |
| `PINATA_JWT` | No | -- | Pinata API key for IPFS uploads |

Get testnet INJ from the [Injective faucet](https://testnet.faucet.injective.network/). Get a Pinata JWT at [app.pinata.cloud](https://app.pinata.cloud/developers/api-keys).

## Agent Card Schema

Every registered agent has a JSON card hosted on IPFS conforming to the [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) `registration-v1` schema. See [`docs/EIP-8004-REFERENCE.md`](docs/EIP-8004-REFERENCE.md) for the full specification and best practices.

### Full Example

```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "FundingRateSniper",
  "description": "Autonomous funding rate arbitrage agent on Injective. Monitors perp/spot funding gaps and executes delta-neutral positions. Flat 0.1% fee on profits.",
  "image": "ipfs://QmXyz.../avatar.png",
  "services": [
    { "name": "MCP", "endpoint": "https://bot.acme.dev/mcp", "version": "2025-06-18" },
    { "name": "A2A", "endpoint": "https://bot.acme.dev/.well-known/agent-card.json", "version": "0.3.0" },
    { "name": "web", "endpoint": "https://bot.acme.dev" }
  ],
  "x402Support": true,
  "active": true,
  "supportedTrust": ["reputation", "crypto-economic"],
  "tags": ["trading", "arbitrage", "injective"],
  "version": "1.2.0",
  "license": "ISC",
  "sourceCode": "https://github.com/acme/funding-rate-sniper",
  "documentation": "https://docs.acme.dev/sniper"
}
```

### Top-Level Fields

| Field | Required | Type | Description |
|-------|:--------:|------|-------------|
| `type` | Yes | string | Must be `"https://eips.ethereum.org/EIPS/eip-8004#registration-v1"` |
| `name` | Yes | string | Agent identifier, 1–100 chars |
| `description` | Yes | string | What the agent does, how to use it, pricing |
| `image` | Yes | string | Avatar URL (IPFS preferred) or `""` |
| `services` | Yes | array | Protocol endpoints — see below |
| `x402Support` | No | boolean | x402 payment protocol support |
| `active` | No | boolean | Whether agent is currently active |
| `supportedTrust` | No | string[] | `"reputation"` \| `"crypto-economic"` \| `"tee-attestation"` |
| `tags` | No | string[] | Discovery tags (3–5 recommended) |
| `version` | No | string | Semver version of the agent |
| `license` | No | string | SPDX license (e.g. `"MIT"`, `"ISC"`) |
| `sourceCode` | No | string | Source repository URL |
| `documentation` | No | string | Documentation URL |
| `registrations` | No | array | Cross-chain registration references |

### Service Entry Fields

| Field | Required | Notes |
|-------|:--------:|-------|
| `name` | Yes | Protocol name — see table below |
| `endpoint` | Yes | Service URI (HTTPS strongly preferred) |
| `version` | No | Protocol version |
| `skills` | No | OASF only: skill definitions array |
| `domains` | No | OASF only: domain declarations array |

> The SDK accepts `type` and `url` as input aliases and normalizes them to `name`/`endpoint` in the generated card.

### Service Types

| `name` | Protocol | Best practice |
|--------|----------|---------------|
| `MCP` | Model Context Protocol | Set `version: "2025-06-18"`; serve `/.well-known/mcp.json` |
| `A2A` | Agent-to-Agent | Use `.well-known/agent-card.json` path; `version: "0.3.0"` |
| `OASF` | Open Agent Skill Framework | Must have non-empty `skills` or `domains` |
| `web` | Website/dashboard | Use HTTPS |
| `ENS` | ENS name | ENS name resolving to agent |
| `DID` | Decentralized ID | DID document URI |
| `email` | Email contact | `mailto:` URI |

MCP and A2A endpoints are the highest-value services — agents without either are capped at 30 on the [8004scan](https://8004scan.io) service score.

## Network & Contracts

The SDK supports three environments, selected via `INJ_NETWORK`:

### Mainnet (Chain ID: 1776)

| Contract | Address |
|----------|---------|
| IdentityRegistry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| ReputationRegistry | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |
| ValidationRegistry | Not yet deployed |

RPC: `https://sentry.evm-rpc.injective.network/`

### Testnet (Chain ID: 1439)

| Contract | Address |
|----------|---------|
| IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| ValidationRegistry | Not yet deployed |

RPC: `https://testnet.sentry.chain.json-rpc.injective.network`

### Staging (Chain ID: 1439)

Early deployment on testnet with the original contract set. Useful for development and testing.

| Contract | Address |
|----------|---------|
| IdentityRegistry | `0x19d1916ba1a2ac081b04893563a6ca0c92bc8c8e` |
| ReputationRegistry | `0x019b24a73d493d86c61cc5dfea32e4865eecb922` |
| ValidationRegistry | `0xbd84e152f41e28d92437b4b822b77e7e31bfd2a4` |

RPC: `https://testnet.sentry.chain.json-rpc.injective.network`

### Agent Types

`trading` | `liquidation` | `data` | `portfolio` | `other`

### Service Types

`mcp` | `a2a` | `web` | `oasf` | `rest` | `grpc` | `webhook` | `custom`

## Architecture

```
packages/
  sdk/                          @injective/agent-sdk
    src/
      index.ts                  Public API exports
      client.ts                 AgentClient (register, update, getStatus)
      read-client.ts            AgentReadClient (read-only, no private key)
      types.ts                  All public types & interfaces
      config.ts                 Network config (testnet/mainnet)
      contracts.ts              viem client setup, ABI encoding
      wallet.ts                 Key resolution, EIP-712 signing, evmToInj
      card.ts                   Agent card generation, merging, validation
      errors.ts                 AgentSdkError, ContractError, StorageError, ValidationError
      validation.ts             URL safety (SSRF protection)
      storage/
        pinata.ts               PinataStorage provider
        custom-url.ts           CustomUrlStorage provider
      abi/                      Contract ABIs
  cli/                          injective-agent-cli
    src/
      cli.ts                    Commander entry point
      formatting.ts             Human-readable output
      env.ts                    Environment variable helpers
```

The CLI is a thin wrapper over the SDK. All business logic lives in `@injective/agent-sdk`.

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm --filter @injective/agent-sdk build
pnpm --filter injective-agent-cli build

# Run SDK tests
pnpm --filter @injective/agent-sdk test

# Run CLI in dev mode
cd packages/cli && pnpm dev register --help
```

## Troubleshooting

| Error | Fix |
|-------|-----|
| `command not found: inj-agent` | Run `pnpm setup && source ~/.zshrc && pnpm link --global` |
| `No signing key provided` | Set `INJ_PRIVATE_KEY` in `.env` |
| `No Pinata API key found` | Set `PINATA_JWT` in `.env` or use `--uri` |
| `Invalid wallet address: inj1...` | Use `0x` EVM format, not bech32 |
| `Skipping wallet linkage` | `--wallet` doesn't match your key's address |
| `ValidationRegistry not deployed` | ValidationRegistry is not yet live on testnet/mainnet; validation features are unavailable |
| `Transaction reverted` | Check gas, balance, and that you own the agent |

## Security

- The SDK never reads `process.env` (except `createAgentClientFromEnv`). All config is passed explicitly.
- Private keys are never logged, serialized, or included in any result object.
- Service URLs are validated against private/internal addresses (SSRF protection).
- Fetched IPFS cards are schema-validated before use (no prototype pollution).

## License

ISC
