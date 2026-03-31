# IPFS Agent Card Upload — Implementation Spec

**Status:** Ready for implementation
**Owner:** Engineering
**Context:** The `inj-agent register` command generates an EIP-8004 agent card JSON internally but has no way to host it. Users must manually create the file, host it somewhere, and pass the URL via `--uri`. This spec removes that friction by adding automatic IPFS upload using Pinata.

## Problem

Registering an agent currently requires five steps that should be one:

1. Understand the agent card JSON schema
2. Create the JSON file manually
3. Find an IPFS pinning service or static host
4. Upload the file and get a public URL
5. Pass the URL to `--uri`

The CLI already generates the correct agent card JSON in `agent-card.ts`. The only missing piece is uploading it to IPFS and returning the URI.

## Decision: Use Pinata

**Pinata wins for our use case.** It's the only production-ready IPFS pinning service with a traditional REST API that works with raw `fetch`. No SDK dependency needed.

Other options considered:

**Storacha (formerly web3.storage)** requires a mandatory SDK (`@storacha/client`) because its UCAN authentication model is too complex for raw HTTP. Adds a heavy dependency and an interactive email login step that breaks CLI automation.

**Filecoin Pin** is alpha software on the Calibration testnet. Not production-ready.

**NFT.Storage** decommissioned uploads in June 2024. Dead end.

**Lighthouse** lacks clear API documentation and has a 14-day retention limit on the free tier.

## Scope

### Files to change

**`src/lib/ipfs.ts`** — Replace the stub with actual Pinata upload logic. This is the only file that needs significant changes.

**`src/lib/config.ts`** — Add `pinataApiUrl` to the `NetworkConfig` type (or keep it as a constant in `ipfs.ts` since it's not network-specific).

**`src/types/index.ts`** — No changes needed. The `AgentCard` type and `uploadAgentCard` signature already match what we need.

**`src/commands/register.ts`** — No changes needed. Line 30 already calls `uploadAgentCard(card)` when `--uri` is not provided. It just works once ipfs.ts returns a real URI instead of throwing.

**`src/cli.ts`** — No changes needed. The `--uri` flag is already optional.

**`.env.example`** — Add `PINATA_JWT` variable with documentation.

**`README.md`** — Update the "Host your agent card" section. Document both flows: automatic (with Pinata key) and manual (`--uri`).

### Files that do NOT change

`register.ts`, `cli.ts`, `agent-card.ts`, `types/index.ts` — the integration point already exists and expects `uploadAgentCard` to return a `Promise<string>` containing the URI. No plumbing work needed.

## Implementation Details

### 1. Pinata upload function (`src/lib/ipfs.ts`)

Replace the current stub:

```typescript
import type { AgentCard } from "../types/index.js";
import { CliError } from "./errors.js";

const PINATA_API_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";

function getPinataJwt(): string {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    throw new CliError(
      "No Pinata API key found. Set PINATA_JWT in your .env file.\n" +
      "Get a free key at https://app.pinata.cloud/developers/api-keys\n" +
      "Or use --uri to provide your own hosted agent card URL."
    );
  }
  return jwt;
}

export async function uploadAgentCard(card: AgentCard): Promise<string> {
  const jwt = getPinataJwt();

  const response = await fetch(PINATA_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      pinataContent: card,
      pinataMetadata: {
        name: `agent-card-${card.name.toLowerCase().replace(/\s+/g, "-")}`,
      },
      pinataOptions: {
        cidVersion: 1,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new CliError(
      `Pinata upload failed (${response.status}): ${body}\n` +
      "Check that your PINATA_JWT is valid."
    );
  }

  const result = await response.json() as { IpfsHash: string };
  return `ipfs://${result.IpfsHash}`;
}
```

Key design decisions in this implementation:

**Use `pinJSONToIPFS` instead of `pinFileToIPFS`.** The agent card is already a JSON object. The JSON endpoint is simpler (no multipart form encoding) and avoids `FormData` quirks in Node.js.

**Return `ipfs://` URI, not an HTTP gateway URL.** The contract stores the URI, and `ipfs://` is the canonical format per EIP-8004. The CLI's `fetchAgentCard` function in the same file already handles converting `ipfs://` to a gateway URL when reading back.

**CID version 1.** Returns a `bafy...` CID instead of the older `Qm...` format. This is the current standard.

**Error messages guide the user.** If `PINATA_JWT` is missing, the error tells them exactly where to get a key and offers `--uri` as a fallback. If the upload fails, it includes the HTTP status and response body for debugging.

### 2. Environment variable (`.env.example`)

Add after the RPC section:

```
# Pinata IPFS pinning (optional — needed for automatic agent card hosting)
# Get a free JWT at https://app.pinata.cloud/developers/api-keys
# If not set, you must provide --uri when registering
PINATA_JWT=
```

### 3. README changes

Replace the current "Host your agent card" section with two paths:

**Automatic (recommended):** Sign up at pinata.cloud, generate an API key, add `PINATA_JWT` to `.env`. The CLI handles the rest. When you run `register` without `--uri`, it uploads the card to IPFS and uses the returned CID automatically.

**Manual:** If you prefer to host the card yourself, create the JSON file (show schema), host it anywhere, pass the URL via `--uri`. Same as today.

## User Experience (Before and After)

### Before (current)

```bash
# Step 1: Read docs to understand agent card schema
# Step 2: Write agent-card.json by hand
# Step 3: Upload to some hosting service
# Step 4: Copy the URL
# Step 5: Run register with --uri

inj-agent register \
  --name "Portfolio Balancer" \
  --type trading \
  --builder-code acme-corp \
  --wallet 0x76aa1373e66ce53821073910f732a65fd7c6357a \
  --uri "https://example.com/agent-card.json"
```

### After (with Pinata key configured)

```bash
# Just register. The CLI builds and uploads the card for you.

inj-agent register \
  --name "Portfolio Balancer" \
  --type trading \
  --builder-code acme-corp \
  --wallet 0x76aa1373e66ce53821073910f732a65fd7c6357a
```

The `--uri` flag remains available for users who want to host their own card. No breaking changes.

## Edge Cases

**What if Pinata is down?** The upload fails with a clear error message including the HTTP status. The user can retry or fall back to `--uri`.

**What if the JWT is expired or invalid?** Pinata returns a 401. The error handler surfaces this with "Check that your PINATA_JWT is valid."

**What if the user provides both `PINATA_JWT` and `--uri`?** The `--uri` flag takes precedence. Line 30 of `register.ts` already checks `if (opts.uri)` before calling `uploadAgentCard`. No change needed.

**What about `--dry-run`?** Dry-run currently uses the `cardUri` from either `--uri` or `uploadAgentCard`. With this change, dry-run would actually upload to IPFS before simulating the contract call. This is acceptable since the card needs to exist at the URI for the contract to validate it. If we want to avoid the upload during dry-run, we can add a guard in `register.ts`:

```typescript
if (opts.dryRun && !opts.uri) {
  cardUri = "ipfs://dry-run-placeholder";
} else if (opts.uri) {
  cardUri = opts.uri;
} else {
  cardUri = await uploadAgentCard(card);
}
```

This keeps dry-run free of side effects. Recommend implementing this guard.

**What about `update` command?** The `update` command in `update.ts` accepts `--uri` but doesn't generate a new card automatically. If the user changes `--name` or `--type` during an update, should we regenerate and re-upload the card? Out of scope for this ticket. Document as a follow-up.

## Testing

**Unit test for `uploadAgentCard`:** Mock `fetch` to return a successful Pinata response. Verify the function returns `ipfs://{hash}`. Mock a 401 and verify it throws `CliError` with the right message.

**Unit test for missing JWT:** Call `uploadAgentCard` without `PINATA_JWT` set. Verify it throws with the setup instructions.

**Integration test (manual):** With a real Pinata JWT, run `inj-agent register --dry-run` without `--uri` and verify the card appears on IPFS.

## Dependencies

**None added.** The implementation uses Node.js built-in `fetch` (available since Node 18) and `JSON.stringify`. No new npm packages.

## Effort Estimate

This is a small, well-scoped change. The integration point already exists and the contract surface is zero (no new flags, no new types, no plumbing). The actual implementation is ~40 lines of code in `ipfs.ts` plus documentation updates.

**Estimated effort:** 1-2 hours for a developer familiar with the codebase, including tests and README updates.
