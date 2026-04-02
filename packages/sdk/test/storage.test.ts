import { describe, it, expect, vi, afterEach } from "vitest";
import { PinataStorage } from "../src/storage/pinata.js";
import { CustomUrlStorage } from "../src/storage/custom-url.js";
import { StorageError } from "../src/errors.js";

describe("PinataStorage", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("uploadJSON returns ipfs URI on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ IpfsHash: "bafytest" }), { status: 200 }),
    );
    const storage = new PinataStorage({ jwt: "test-jwt" });
    const uri = await storage.uploadJSON({ name: "test" }, "test");
    expect(uri).toBe("ipfs://bafytest");
  });

  it("uploadJSON throws StorageError on failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401 }),
    );
    const storage = new PinataStorage({ jwt: "bad-jwt" });
    const err = await storage.uploadJSON({}).catch(e => e);
    expect(err).toBeInstanceOf(StorageError);
    expect(err.message).toContain("Pinata upload failed (401)");
  });

  it("uploadJSON throws StorageError on network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("fetch failed"));
    const storage = new PinataStorage({ jwt: "test-jwt" });
    const err = await storage.uploadJSON({}).catch(e => e);
    expect(err).toBeInstanceOf(StorageError);
    expect(err.message).toContain("Could not reach Pinata API");
  });
});

describe("CustomUrlStorage", () => {
  it("returns configured URI", async () => {
    const storage = new CustomUrlStorage("https://example.com/card.json");
    const uri = await storage.uploadJSON({ anything: true });
    expect(uri).toBe("https://example.com/card.json");
  });
});
