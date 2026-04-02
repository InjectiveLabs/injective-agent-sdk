import { describe, it, expect, vi } from "vitest";
import { simulateOnly, simulateAndWrite } from "../src/simulate.js";
import { SimulationError } from "../src/errors.js";
import { BaseError, ContractFunctionRevertedError } from "viem";

function mockPublicClient(overrides?: { simulateResult?: unknown; gasEstimate?: bigint; simulateError?: Error }) {
  return {
    simulateContract: vi.fn().mockImplementation(() => {
      if (overrides?.simulateError) throw overrides.simulateError;
      return Promise.resolve({ result: overrides?.simulateResult ?? 42n });
    }),
    estimateContractGas: vi.fn().mockResolvedValue(overrides?.gasEstimate ?? 100_000n),
  };
}

function mockWalletClient() {
  return {
    writeContract: vi.fn().mockResolvedValue("0xabc123" as `0x${string}`),
  };
}

const baseParams = {
  address: "0x1234567890123456789012345678901234567890" as `0x${string}`,
  abi: [{ type: "function", name: "register", inputs: [], outputs: [] }],
  functionName: "register",
  args: ["ipfs://test", []] as readonly unknown[],
  account: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as unknown,
};

describe("simulateOnly", () => {
  it("calls simulateContract and returns result with gas estimate", async () => {
    const pub = mockPublicClient({ simulateResult: 7n, gasEstimate: 200_000n });

    const result = await simulateOnly(pub, baseParams);

    expect(pub.simulateContract).toHaveBeenCalledOnce();
    expect(pub.estimateContractGas).toHaveBeenCalledOnce();
    expect(result).toEqual({ method: "register", gasEstimate: 200_000n, result: 7n });
  });

  it("fires onProgress callbacks", async () => {
    const pub = mockPublicClient();
    const onProgress = vi.fn();

    await simulateOnly(pub, baseParams, { onProgress });

    expect(onProgress).toHaveBeenCalledWith("Simulating register...");
    expect(onProgress).toHaveBeenCalledWith(expect.stringContaining("Simulation passed for register"));
  });

  it("returns gasEstimate 0n when estimateContractGas fails", async () => {
    const pub = mockPublicClient();
    pub.estimateContractGas.mockRejectedValue(new Error("estimate failed"));

    const result = await simulateOnly(pub, baseParams);

    expect(result.gasEstimate).toBe(0n);
  });

  it("throws SimulationError on BaseError revert", async () => {
    const revertError = Object.create(BaseError.prototype);
    revertError.message = "execution reverted";
    revertError.shortMessage = "execution reverted: EmptyTokenURI";
    revertError.walk = (fn: (e: unknown) => boolean) => {
      const inner = Object.create(ContractFunctionRevertedError.prototype);
      inner.data = { errorName: "EmptyTokenURI" };
      return fn(inner) ? inner : null;
    };

    const pub = mockPublicClient({ simulateError: revertError });

    await expect(simulateOnly(pub, baseParams)).rejects.toThrow(SimulationError);

    try {
      await simulateOnly(pub, baseParams);
    } catch (err) {
      expect(err).toBeInstanceOf(SimulationError);
      expect((err as SimulationError).revertReason).toBe("EmptyTokenURI");
    }
  });

  it("throws SimulationError on non-BaseError", async () => {
    const pub = mockPublicClient({ simulateError: new Error("network down") });

    await expect(simulateOnly(pub, baseParams)).rejects.toThrow(SimulationError);
  });
});

describe("simulateAndWrite", () => {
  it("simulates then writes on success", async () => {
    const pub = mockPublicClient();
    const wallet = mockWalletClient();

    const hash = await simulateAndWrite(pub, wallet, { ...baseParams, nonce: 5, gasPrice: 1000n });

    expect(pub.simulateContract).toHaveBeenCalledOnce();
    expect(wallet.writeContract).toHaveBeenCalledOnce();
    expect(wallet.writeContract).toHaveBeenCalledWith(expect.objectContaining({
      functionName: "register",
      nonce: 5,
      gasPrice: 1000n,
    }));
    expect(hash).toBe("0xabc123");
  });

  it("does NOT write when simulation fails", async () => {
    const revertError = Object.create(BaseError.prototype);
    revertError.message = "reverted";
    revertError.shortMessage = "reverted";
    revertError.walk = () => null;

    const pub = mockPublicClient({ simulateError: revertError });
    const wallet = mockWalletClient();

    await expect(simulateAndWrite(pub, wallet, baseParams)).rejects.toThrow(SimulationError);
    expect(wallet.writeContract).not.toHaveBeenCalled();
  });

  it("fires broadcast progress callback", async () => {
    const pub = mockPublicClient();
    const wallet = mockWalletClient();
    const onProgress = vi.fn();

    await simulateAndWrite(pub, wallet, baseParams, { onProgress });

    expect(onProgress).toHaveBeenCalledWith("Broadcasting register...");
  });
});
