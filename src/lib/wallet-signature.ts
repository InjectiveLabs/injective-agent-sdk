import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

interface SignWalletLinkParams {
  agentId: bigint;
  wallet: `0x${string}`;
  ownerAddress: `0x${string}`;
  deadline: bigint;
  walletPrivateKey: `0x${string}`;
  chainId: number;
  contractAddress: `0x${string}`;
}

/**
 * Sign a wallet linkage using EIP-712 structured typed data.
 * Matches the canonical ERC-8004 IdentityRegistry's AGENT_WALLET_SET_TYPEHASH:
 *   AgentWalletSet(uint256 agentId, address newWallet, address owner, uint256 deadline)
 */
export async function signWalletLink(params: SignWalletLinkParams): Promise<Hex> {
  const { agentId, wallet, ownerAddress, deadline, walletPrivateKey, chainId, contractAddress } = params;

  const account = privateKeyToAccount(walletPrivateKey);

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
