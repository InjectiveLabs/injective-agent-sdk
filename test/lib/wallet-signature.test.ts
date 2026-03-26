import { describe, it, expect } from "vitest";
import { signWalletLink } from "../../src/lib/wallet-signature.js";
import { privateKeyToAccount } from "viem/accounts";
import { recoverTypedDataAddress } from "viem";

const WALLET_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const OWNER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;

describe("signWalletLink", () => {
  it("produces an EIP-712 signature recoverable to the wallet address", async () => {
    const walletAccount = privateKeyToAccount(WALLET_KEY);
    const ownerAccount = privateKeyToAccount(OWNER_KEY);
    const agentId = 1n;
    const deadline = 9999999999n;
    const chainId = 31337;
    const contractAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as `0x${string}`;

    const sig = await signWalletLink({
      agentId,
      wallet: walletAccount.address,
      ownerAddress: ownerAccount.address,
      deadline,
      walletPrivateKey: WALLET_KEY,
      chainId,
      contractAddress,
    });

    const recovered = await recoverTypedDataAddress({
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
        newWallet: walletAccount.address,
        owner: ownerAccount.address,
        deadline,
      },
      signature: sig,
    });

    expect(recovered.toLowerCase()).toBe(walletAccount.address.toLowerCase());
  });
});
