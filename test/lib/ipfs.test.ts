import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { uploadAgentCard, resolveImageUri } from "../../src/lib/ipfs.js";
import { CliError } from "../../src/lib/errors.js";
import type { AgentCard } from "../../src/types/index.js";

const mockCard: AgentCard = {
  type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  name: "Test Agent",
  services: [],
  image: "",
  x402Support: false,
  metadata: {
    chain: "injective",
    chainId: "1776",
    agentType: "trading",
    builderCode: "test-builder",
    operatorAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  },
};

describe("uploadAgentCard", () => {
  beforeEach(() => {
    process.env.PINATA_JWT = "test-jwt-token";
  });

  afterEach(() => {
    delete process.env.PINATA_JWT;
    vi.restoreAllMocks();
  });

  it("returns ipfs:// URI on successful upload", async () => {
    const mockHash = "bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtensmqhgie";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ IpfsHash: mockHash }), { status: 200 }),
    );

    const uri = await uploadAgentCard(mockCard);
    expect(uri).toBe(`ipfs://${mockHash}`);
  });

  it("sends correct request to Pinata", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ IpfsHash: "bafytest" }), { status: 200 }),
    );

    await uploadAgentCard(mockCard);

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.pinata.cloud/pinning/pinJSONToIPFS",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer test-jwt-token",
        },
      }),
    );

    const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    expect(body.pinataContent).toEqual(mockCard);
    expect(body.pinataMetadata.name).toBe("agent-card-test-agent");
    expect(body.pinataOptions.cidVersion).toBe(1);
  });

  it("throws CliError when PINATA_JWT is not set", async () => {
    delete process.env.PINATA_JWT;

    const err = await uploadAgentCard(mockCard).catch((e) => e);
    expect(err).toBeInstanceOf(CliError);
    expect(err.message).toContain("No Pinata API key found");
  });

  it("throws CliError on 401 response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401 }),
    );

    const err = await uploadAgentCard(mockCard).catch((e) => e);
    expect(err).toBeInstanceOf(CliError);
    expect(err.message).toContain("Pinata upload failed (401)");
  });

  it("throws CliError on network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("fetch failed"));

    const err = await uploadAgentCard(mockCard).catch((e) => e);
    expect(err).toBeInstanceOf(CliError);
    expect(err.message).toContain("Could not reach Pinata API");
  });

  it("throws CliError when response is missing IpfsHash", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "queued" }), { status: 200 }),
    );

    const err = await uploadAgentCard(mockCard).catch((e) => e);
    expect(err).toBeInstanceOf(CliError);
    expect(err.message).toContain("unexpected response");
  });
});

describe("resolveImageUri", () => {
  afterEach(() => {
    delete process.env.PINATA_JWT;
    vi.restoreAllMocks();
  });

  it("returns https URL unchanged", async () => {
    const uri = await resolveImageUri("https://example.com/avatar.png");
    expect(uri).toBe("https://example.com/avatar.png");
  });

  it("returns ipfs URI unchanged", async () => {
    const uri = await resolveImageUri("ipfs://QmTest123");
    expect(uri).toBe("ipfs://QmTest123");
  });

  it("returns http URL unchanged", async () => {
    const uri = await resolveImageUri("http://example.com/avatar.png");
    expect(uri).toBe("http://example.com/avatar.png");
  });

  it("warns and returns empty string for local file without PINATA_JWT", async () => {
    delete process.env.PINATA_JWT;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const uri = await resolveImageUri("./avatar.png");
    expect(uri).toBe("");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("PINATA_JWT not configured"));
  });
});
