import { describe, it, expect } from "vitest";
import { resolveKey, evmToInj, signWalletLink } from "../src/wallet.js";
import { privateKeyToAccount } from "viem/accounts";
import { recoverTypedDataAddress } from "viem";

const TEST_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;

describe("resolveKey", () => {
  it("resolves key to address and injAddress", () => {
    const key = resolveKey(TEST_KEY);
    expect(key.address).toMatch(/^0x/);
    expect(key.injAddress).toMatch(/^inj1/);
    expect(key.account).toBeDefined();
  });
});

describe("evmToInj", () => {
  it("converts EVM address to inj1 bech32", () => {
    const result = evmToInj("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
    expect(result).toMatch(/^inj1/);
  });
});

describe("signWalletLink", () => {
  it("produces a recoverable EIP-712 signature", async () => {
    const walletKey = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
    const walletAccount = privateKeyToAccount(walletKey);
    const ownerAccount = privateKeyToAccount(TEST_KEY);
    const sig = await signWalletLink({
      agentId: 1n, wallet: walletAccount.address, ownerAddress: ownerAccount.address,
      deadline: 9999999999n, account: walletAccount, chainId: 31337,
      contractAddress: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    });
    const recovered = await recoverTypedDataAddress({
      domain: { name: "ERC8004IdentityRegistry", version: "1", chainId: 31337, verifyingContract: "0x5FbDB2315678afecb367f032d93F642f64180aa3" },
      types: { AgentWalletSet: [{ name: "agentId", type: "uint256" }, { name: "newWallet", type: "address" }, { name: "owner", type: "address" }, { name: "deadline", type: "uint256" }] },
      primaryType: "AgentWalletSet",
      message: { agentId: 1n, newWallet: walletAccount.address, owner: ownerAccount.address, deadline: 9999999999n },
      signature: sig,
    });
    expect(recovered.toLowerCase()).toBe(walletAccount.address.toLowerCase());
  });
});
