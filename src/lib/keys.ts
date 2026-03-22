import { privateKeyToAccount } from "viem/accounts";
import { bech32 } from "bech32";

export interface ResolvedKey {
  privateKey: `0x${string}`;
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
  return { privateKey, address: account.address, injAddress, account };
}

export function evmToInj(address: `0x${string}`): string {
  const bytes = Buffer.from(address.slice(2), "hex");
  const words = bech32.toWords(bytes);
  return bech32.encode("inj", words);
}
