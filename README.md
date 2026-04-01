# inj-agent

CLI and MCP server for managing agent identities on the Injective blockchain.

Register, update, query, and burn on-chain agent identity NFTs via the [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) IdentityRegistry contract. All operations are also available as MCP tools for integration with AI agents and orchestration frameworks.

## Table of Contents

- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Commands](#commands)
  - [register](#register)
  - [update](#update)
  - [deregister](#deregister)
  - [status](#status)
  - [mcp](#mcp-server)
- [Agent Card Hosting](#agent-card-hosting)
- [MCP Integration](#mcp-integration)
- [Contract Addresses](#contract-addresses)
- [Development](#development)
- [Architecture](#architecture)
- [Troubleshooting](#troubleshooting)

## Quick Start

```bash
# Clone and build
git clone <repo-url> && cd injective-agent-cli
pnpm install
pnpm run build

# Link the CLI globally
pnpm setup
source ~/.zshrc          # or restart your terminal
pnpm link --global

# Verify
inj-agent --version
```

> **No global install?** Run commands with `pnpm exec inj-agent <command>` instead.

```bash
# Configure
cp .env.example .env
# Edit .env with your private key and Pinata JWT (see IPFS Setup below)

# Register an agent with full metadata
inj-agent register \
  --name "Portfolio Balancer" \
  --type trading \
  --builder-code acme-corp \
  --wallet 0xAbCdEf0123456789AbCdEf0123456789AbCdEf01 \
  --description "Autonomous portfolio rebalancing agent" \
  --service '{"type":"mcp","url":"https://agent.acme.dev/mcp"}' \
  --service '{"type":"a2a","url":"https://agent.acme.dev/a2a","description":"Agent-to-agent endpoint"}' \
  --image ./avatar.png \
  --x402
```

On success, the CLI prints your agent ID, transaction hashes, and a link to [8004scan](https://8004scan.com).

## Configuration

Copy `.env.example` to `.env` and fill in your values:

| Variable | Required | Default | Description |
|----------|:--------:|---------|-------------|
| `INJ_PRIVATE_KEY` | Yes | -- | Hex-encoded private key (with or without `0x` prefix). Controls agent ownership and pays gas. |
| `INJ_NETWORK` | No | `testnet` | `testnet` or `mainnet` |
| `INJ_RPC_URL` | No | Network default | Override the default RPC endpoint |
| `PINATA_JWT` | No | -- | Pinata API key for automatic IPFS upload. If unset, you must provide `--uri` when registering. |

Your private key derives an EVM address that becomes the owner of any agents you register. On testnet, get INJ from the [Injective faucet](https://testnet.faucet.injective.network/).

## Commands

### register

Mint a new agent identity NFT.

```bash
inj-agent register \
  --name "My Agent" \
  --type trading \
  --builder-code acme-corp \
  --wallet 0x... \
  --description "Optional description"
```

**Required flags:**

| Flag | Value | Notes |
|------|-------|-------|
| `--name <name>` | 1-100 characters | Wrap in quotes if it contains spaces |
| `--type <type>` | `trading` `liquidation` `data` `portfolio` `other` | On-chain agent category |
| `--builder-code <code>` | Any non-empty string | Identifies the builder or organization |
| `--wallet <address>` | Checksummed `0x` EVM address | Wallet to link to this agent |

**Optional flags:**

| Flag | Description |
|------|-------------|
| `--description <desc>` | Up to 500 characters |
| `--service <json>` | Service endpoint as JSON (repeatable). See [Service Endpoints](#service-endpoints) below. |
| `--image <pathOrUrl>` | Agent avatar. Local file path (uploaded to IPFS via Pinata) or URL (`https://`, `ipfs://`). |
| `--x402` | Declare support for x402 payments |
| `--uri <uri>` | Pre-hosted agent card URL (skips IPFS upload) |
| `--gas-price <gwei>` | Override gas price |
| `--dry-run` | Simulate without sending transactions |
| `--json` | Output as JSON |

**How registration works:**

1. An agent card JSON is generated from your inputs
2. The card is uploaded to IPFS via Pinata (unless `--uri` is provided)
3. Two transactions are sent:
   - `register()` — mints the identity NFT with metadata
   - `setAgentWallet()` — links the wallet via an EIP-712 signature
4. The CLI prints the agent ID, card URI, tx hashes, and 8004scan link

**Address format:** The `--wallet` flag expects a checksummed `0x` EVM address, not `inj1...` bech32. Convert at the [Injective explorer](https://explorer.injective.network/) if needed.

**Wallet linkage:** The wallet link transaction only executes if `--wallet` matches the address derived from your `INJ_PRIVATE_KEY`. If they differ, registration still succeeds but the wallet is not linked, and you'll see a warning.

### update

Update metadata for an existing agent.

```bash
inj-agent update <agentId> [flags]
```

| Flag | Description |
|------|-------------|
| `--name <name>` | New name |
| `--description <desc>` | New description |
| `--builder-code <code>` | New builder code |
| `--type <type>` | New agent type |
| `--wallet <address>` | New wallet (self-linking only) |
| `--service <json>` | Add or replace a service endpoint (repeatable, merges by type) |
| `--remove-service <type>` | Remove a service by protocol type (repeatable) |
| `--image <pathOrUrl>` | New avatar (local file or URL) |
| `--x402` | Enable x402 payment support |
| `--no-x402` | Disable x402 payment support |
| `--uri <uri>` | New agent card URI (skips fetch-merge-upload) |
| `--json` | Output as JSON |

Only the caller who owns the agent can update it. The update command fetches the existing agent card from IPFS, merges your changes, re-uploads, and updates the on-chain token URI. If the existing card can't be fetched, the CLI prompts for confirmation before proceeding with a fresh card.

### deregister

Burn an agent identity NFT permanently.

```bash
inj-agent deregister <agentId>
inj-agent deregister <agentId> --force    # skip confirmation
```

Without `--force`, the CLI fetches the agent card, shows the agent name, and asks you to confirm by typing it.

### status

Query on-chain details for an agent.

```bash
inj-agent status <agentId>
inj-agent status <agentId> --json
```

Displays the agent's name, type, builder code, owner, linked wallet, token URI, and identity tuple.

### MCP Server

Start a stdio-based MCP server:

```bash
inj-agent mcp
```

This exposes the same operations as MCP tools for use by AI agents and orchestration frameworks. See [MCP Integration](#mcp-integration) for details.

## Service Endpoints

The `--service` flag takes a JSON object with `type`, `url`, and an optional `description`:

```bash
--service '{"type":"mcp","url":"https://agent.example.com/mcp"}'
--service '{"type":"a2a","url":"https://agent.example.com/a2a","description":"Agent-to-agent endpoint"}'
```

Valid service types: `mcp`, `a2a`, `web`, `oasf`.

The flag is repeatable. Pass it multiple times to register multiple endpoints. On `update`, services are merged by type: if you update with `--service '{"type":"mcp","url":"https://new-url.com/mcp"}'` and an MCP entry already exists, it gets replaced. Use `--remove-service mcp` to remove a service entirely.

The CLI validates that each URL is well-formed and attempts an HTTP HEAD request to check reachability. Unreachable URLs produce a warning but do not block registration.

## IPFS Setup (Pinata)

The CLI uses [Pinata](https://www.pinata.cloud/) to upload agent cards and images to IPFS. Each builder uses their own Pinata account.

1. Create a free account at [app.pinata.cloud](https://app.pinata.cloud)
2. Go to **API Keys** and click **+ New Key**
3. Name it (e.g. `inj-agent-testnet`)
4. Under **V3 Resources**, set **Files** to **Write** (covers both `pinFileToIPFS` and `pinJSONToIPFS`)
5. Click **Create** and copy the **JWT** (the long string starting with `eyJ...`)
6. Add it to your `.env`:

```
PINATA_JWT=eyJhbGciOiJIUzI1NiIs...
```

The free tier provides 500MB storage and 100 uploads/month, which is sufficient for testnet. For production, builders can use any IPFS pinning service and pass the resulting URI via `--uri`.

If `PINATA_JWT` is not set, the CLI still works for registration with `--uri`, and for local image paths it will warn and skip the image rather than blocking the registration.

## Agent Card Hosting

The CLI generates agent card JSON automatically during registration. You choose how to host it:

**Automatic (recommended):** Set `PINATA_JWT` in your `.env`. The CLI uploads the card to IPFS via [Pinata](https://www.pinata.cloud/) and uses the returned `ipfs://` URI.

**Manual:** Host a JSON file matching the ERC-8004 schema at any public URL, then pass it via `--uri`:

```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "Portfolio Balancer",
  "description": "Autonomous portfolio rebalancing agent",
  "services": [
    { "type": "mcp", "url": "https://agent.acme.dev/mcp" },
    { "type": "a2a", "url": "https://agent.acme.dev/a2a", "description": "Agent-to-agent endpoint" }
  ],
  "image": "ipfs://QmXyz.../avatar.png",
  "x402Support": true,
  "metadata": {
    "chain": "injective",
    "chainId": "1776",
    "agentType": "trading",
    "builderCode": "acme-corp",
    "operatorAddress": "0xYourEvmAddress"
  }
}
```

```bash
inj-agent register --uri "https://example.com/card.json" ...
```

## MCP Integration

The MCP server exposes four tools:

| Tool | Description |
|------|-------------|
| `agent_register` | Register a new agent identity |
| `agent_update` | Update agent metadata |
| `agent_deregister` | Burn an agent (requires `confirm: true`) |
| `agent_status` | Query agent details |

All tools accept the same parameters as their CLI counterparts and return structured JSON. Configure your MCP client to launch the server:

```json
{
  "mcpServers": {
    "inj-agent": {
      "command": "inj-agent",
      "args": ["mcp"]
    }
  }
}
```

## Contract Addresses

### Testnet (Chain ID: 1439)

| Contract | Address |
|----------|---------|
| IdentityRegistry | `0x19d1916ba1a2ac081b04893563a6ca0c92bc8c8e` |
| ReputationRegistry | `0x019b24a73d493d86c61cc5dfea32e4865eecb922` |
| ValidationRegistry | `0xbd84e152f41e28d92437b4b822b77e7e31bfd2a4` |

Mainnet contracts are not yet deployed.

### Agent Types

`trading` | `liquidation` | `data` | `portfolio` | `other`

## Development

```bash
pnpm dev register --help      # run without building (uses tsx)
pnpm test                     # run tests
pnpm test:watch               # watch mode
pnpm run build                # compile TypeScript to dist/
```

## Architecture

```
src/
  cli.ts                # Commander entry point
  commands/
    register.ts         # Mint agent identity NFT
    update.ts           # Update agent metadata
    deregister.ts       # Burn agent NFT
    status.ts           # Query agent state
  lib/
    agent-card.ts       # ERC-8004 agent card generation
    config.ts           # Network configuration (testnet/mainnet)
    contracts.ts        # viem contract interactions
    errors.ts           # Typed CLI errors + revert parsing
    formatting.ts       # Human-readable output helpers
    ipfs.ts             # IPFS upload via Pinata
    keys.ts             # Private key + address derivation
    wallet-signature.ts # EIP-712 wallet linkage signatures
  mcp/
    server.ts           # MCP stdio server
    tools.ts            # MCP tool definitions (Zod schemas)
  types/
    index.ts            # Shared types and interfaces
  abi/
    IdentityRegistry.json
    ReputationRegistry.json
    ValidationRegistry.json
```

Both the CLI and MCP server call the same command functions, keeping behavior consistent across interfaces.

## Troubleshooting

| Error | Fix |
|-------|-----|
| `command not found: inj-agent` | Run `pnpm setup && source ~/.zshrc && pnpm link --global` from the project directory |
| `ERR_PNPM_NO_GLOBAL_BIN_DIR` | Run `pnpm setup`, then `source ~/.zshrc` before `pnpm link --global` |
| `required option '--wallet' not specified` | Ensure all four required flags are present: `--name`, `--type`, `--builder-code`, `--wallet` |
| `No Pinata API key found` | Set `PINATA_JWT` in `.env` or provide `--uri` manually |
| `Invalid wallet address: inj1...` | Convert your bech32 address to `0x` format at the [Injective explorer](https://explorer.injective.network/) |
| `Skipping wallet linkage` | Your `--wallet` doesn't match your `INJ_PRIVATE_KEY` address. The agent registered but the wallet was not linked. |
| `No signing key provided` | `INJ_PRIVATE_KEY` is not set. Check your `.env` file. |
| Shell shows `dquote>` or `quote>` | You have unclosed or smart quotes. Press `Ctrl+C` and re-type using straight quotes from your keyboard. |

## License

ISC
