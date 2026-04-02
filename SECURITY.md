# Security

## Supply Chain

All production dependencies in the signing path are pinned to exact versions:

| Package | Pinned Version | Why |
|---------|---------------|-----|
| `viem` | `2.47.6` | EVM signing, transaction simulation, contract interaction |
| `bech32` | `2.0.0` | Address encoding (EVM to Cosmos bech32) |
| `commander` | `14.0.3` | CLI framework (executes signing commands) |
| `dotenv` | `17.3.1` | Environment variable loading (reads key material) |
| `@modelcontextprotocol/sdk` | `1.29.0` | MCP server (invokes signing operations) |
| `zod` | `4.3.6` | Schema validation for MCP tool inputs |

### Peer dependency: viem

The SDK declares `viem` as a peer dependency with range `~2.47.6`. This allows patch updates (2.47.7, 2.47.8) but blocks minor version jumps (2.48.0+). Minor versions of viem can change signing behavior (`signTypedData`, `simulateContract`), so we restrict to the patch range we've tested against.

If your project uses a different viem version, npm/pnpm will warn. This is intentional. To resolve, either:
- Align your viem version to `2.47.x`
- Or accept the risk and add an override in your package.json

### Updating pinned versions

1. Update the version in `package.json`
2. Run `pnpm install` to regenerate the lockfile
3. Run the full test suite: `pnpm -r build && pnpm -r test`
4. Review the dependency changelog for breaking changes in the signing path
5. Commit both `package.json` and `pnpm-lock.yaml`

Dev dependencies (`typescript`, `vitest`, `tsx`) are not pinned — they don't ship to consumers.

## Transaction Safety

Every `writeContract` call in the SDK is preceded by a `simulateContract` call. If simulation fails (revert, invalid state, bad args), the transaction is **not broadcast** and a `SimulationError` is thrown. Zero gas is spent on failed simulations.

This behavior cannot be disabled. The `dryRun` option on `register()`, `update()`, and `deregister()` runs simulation only and returns gas estimates without broadcasting.

## Audit Logging

Every signing operation is logged to `~/.injective-agent/audit.log` in JSONL format (one JSON object per line). This path is configurable via `AuditLoggerConfig.logPath` and exported as `DEFAULT_AUDIT_LOG_PATH` from the SDK.

**What is logged:** timestamp, event type, network, chain ID, signer address, target contract, method name, sanitized arguments, simulation result (pass/fail, gas estimate, revert reason), transaction result (hash, gas used, block number), errors, duration.

**What is never logged:** private keys, passwords, keystore ciphertext, EIP-712 signatures, full agent card JSON (only the URI is logged).

The log file is created with `0600` permissions (owner read/write only). The directory `~/.injective-agent/` is created with `0700`.

To view recent entries: `inj-agent audit` (last 20) or `inj-agent audit --tail 50 --json`.

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it responsibly:

- Email: security@injective.com
- Do not open a public GitHub issue for security vulnerabilities
- We will acknowledge receipt within 48 hours
