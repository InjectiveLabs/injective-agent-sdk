import { describe, it, expect } from "vitest";
import { signWalletLink } from "../../src/lib/wallet-signature.js";
import { privateKeyToAccount } from "viem/accounts";
import { recoverAddress, keccak256, encodePacked, hashMessage } from "viem";

const WALLET_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;

describe("signWalletLink", () => {
  it("produces a signature recoverable to the wallet address", async () => {
    const walletAccount = privateKeyToAccount(WALLET_KEY);
    const agentId = 1n;
    const deadline = 9999999999n;
    const chainId = 31337;
    const contractAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as `0x${string}`;

    const sig = await signWalletLink({
      agentId, wallet: walletAccount.address, deadline,
      walletPrivateKey: WALLET_KEY, chainId, contractAddress,
    });

    const digest = keccak256(
      encodePacked(
        ["uint256", "address", "uint256", "uint256", "address"],
        [agentId, walletAccount.address, deadline, BigInt(chainId), contractAddress]
      )
    );
    const ethHash = hashMessage({ raw: digest });
    const recovered = await recoverAddress({ hash: ethHash, signature: sig });
    expect(recovered.toLowerCase()).toBe(walletAccount.address.toLowerCase());
  });
});
