import { keccak256, encodePacked, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

interface SignWalletLinkParams {
  agentId: bigint;
  wallet: `0x${string}`;
  deadline: bigint;
  walletPrivateKey: `0x${string}`;
  chainId: number;
  contractAddress: `0x${string}`;
}

export async function signWalletLink(params: SignWalletLinkParams): Promise<Hex> {
  const { agentId, wallet, deadline, walletPrivateKey, chainId, contractAddress } = params;
  const digest = keccak256(
    encodePacked(
      ["uint256", "address", "uint256", "uint256", "address"],
      [agentId, wallet, deadline, BigInt(chainId), contractAddress]
    )
  );
  const account = privateKeyToAccount(walletPrivateKey);
  // signMessage applies ERC-191 prefix internally
  return account.signMessage({ message: { raw: digest } });
}
