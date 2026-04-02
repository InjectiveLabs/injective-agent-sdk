import type { Hex } from "viem";
import { privateKeyToAccount, type LocalAccount } from "viem/accounts";
import { bech32 } from "bech32";
import type { SignWalletLinkParams } from "./types.js";

export interface ResolvedKey {
  address: `0x${string}`;
  injAddress: string;
  account: ReturnType<typeof privateKeyToAccount>;
}

export function resolveKey(privateKey: `0x${string}`): ResolvedKey {
  const account = privateKeyToAccount(privateKey);
  const injAddress = evmToInj(account.address);
  return { address: account.address, injAddress, account };
}

export function evmToInj(address: `0x${string}`): string {
  const bytes = Buffer.from(address.slice(2), "hex");
  const words = bech32.toWords(bytes);
  return bech32.encode("inj", words);
}

export async function signWalletLink(params: SignWalletLinkParams): Promise<Hex> {
  const { agentId, wallet, ownerAddress, deadline, account, chainId, contractAddress } = params;

  return account.signTypedData({
    domain: {
      name: "ERC8004IdentityRegistry",
      version: "1",
      chainId,
      verifyingContract: contractAddress,
    },
    types: {
      AgentWalletSet: [
        { name: "agentId", type: "uint256" },
        { name: "newWallet", type: "address" },
        { name: "owner", type: "address" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "AgentWalletSet",
    message: {
      agentId,
      newWallet: wallet,
      owner: ownerAddress,
      deadline,
    },
  });
}
