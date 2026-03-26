# inj-agent

CLI and MCP server for managing agent identities on the Injective chain.

## Overview

`inj-agent` provides four commands to manage on-chain agent identity NFTs via the IdentityRegistry contract:

| Command | Description |
|---------|-------------|
| `register` | Mint a new agent identity NFT with an agent card |
| `update` | Update metadata for an existing agent |
| `deregister` | Burn an agent identity NFT |
| `status` | Query on-chain agent identity details |

It also exposes the same operations as an **MCP tool server** (`inj-agent mcp`) for integration with AI agents and orchestration frameworks.

## Install

```bash
npm install
npm run build
```

## Configuration

Copy `.env.example` to `.env` and set:

```
INJ_PRIVATE_KEY=<hex private key>
INJ_NETWORK=testnet          # testnet (default) or mainnet
INJ_RPC_URL=                 # optional RPC override
```

## Usage

### Register

```bash
inj-agent register \
  --name "My Agent" \
  --type trading \
  --builder-code my-builder \
  --wallet 0x... \
  --description "A trading agent" \
  --json
```

Options: `--uri` (skip IPFS upload), `--gas-price`, `--dry-run`, `--json`

### Update

```bash
inj-agent update <agentId> --name "New Name" --type data
```

All fields are optional. Only provided fields are updated.

### Deregister

```bash
inj-agent deregister <agentId> --force
```

### Status

```bash
inj-agent status <agentId> --json
```

### MCP Server

```bash
inj-agent mcp
```

Starts a stdio-based MCP server exposing `agent_register`, `agent_update`, `agent_deregister`, and `agent_status` tools.

## Agent Types

`trading` | `liquidation` | `data` | `portfolio` | `other`

## Contract Addresses (Testnet)

| Contract | Address |
|----------|---------|
| IdentityRegistry | `0x257FFC254F57c71c620E4BC300Cf531F2fBed39D` |
| ReputationRegistry | `0xd8d45AB304df118C72FDb840FAC9f4563806fdF1` |
| ValidationRegistry | `0xE56D35201D0a0E195FAde1A9CEEF369eD88D0A0C` |

## Development

```bash
npm run dev -- register --help   # run without building
npm test                         # run tests (vitest)
npm run test:watch               # watch mode
```

## Architecture

```
src/
  cli.ts              # commander entry point
  commands/            # register, update, deregister, status
  lib/
    agent-card.ts      # agent card JSON generation
    config.ts          # network configuration
    contracts.ts       # viem contract interactions
    errors.ts          # typed CLI errors
    formatting.ts      # human-readable output
    ipfs.ts            # IPFS upload
    keys.ts            # private key / address derivation
    wallet-signature.ts # EIP-712 wallet link signatures
  mcp/
    server.ts          # MCP stdio server
    tools.ts           # MCP tool definitions
  types/
    index.ts           # shared types and interfaces
```

## License

ISC
