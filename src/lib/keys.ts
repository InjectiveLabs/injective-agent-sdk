import { privateKeyToAccount } from "viem/accounts";
import { bech32 } from "bech32";

export interface ResolvedKey {
  address: `0x${string}`;
  injAddress: string;
  account: ReturnType<typeof privateKeyToAccount>;
}

export function resolveKey(): ResolvedKey {
  const raw = process.env.INJ_PRIVATE_KEY;
  if (!raw) {
    throw new Error("No signing key provided. Set INJ_PRIVATE_KEY environment variable.");
  }
  const privateKey: `0x${string}` = raw.startsWith("0x")
    ? (raw as `0x${string}`)
    : (`0x${raw}` as `0x${string}`);
  const account = privateKeyToAccount(privateKey);
  const injAddress = evmToInj(account.address);
  return { address: account.address, injAddress, account };
}

// On Injective, the 20-byte EVM address and the 20-byte Cosmos address are identical
// (both derived from the same secp256k1 public key). Bech32-encoding the EVM address
// directly produces the correct inj1... address without needing ripemd160(sha256(pubkey)).
export function evmToInj(address: `0x${string}`): string {
  const bytes = Buffer.from(address.slice(2), "hex");
  const words = bech32.toWords(bytes);
  return bech32.encode("inj", words);
}
