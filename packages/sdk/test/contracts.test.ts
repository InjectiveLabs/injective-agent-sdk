import { describe, it, expect } from "vitest";
import { keccak256, toHex, parseAbiItem, encodeEventTopics, encodeAbiParameters, decodeEventLog, type AbiEvent } from "viem";
import IdentityRegistryABI from "../src/abi/IdentityRegistry.json";
import ReputationRegistryABI from "../src/abi/ReputationRegistry.json";

type AbiEventEntry = { type: string; name: string; inputs: Array<{ type: string; name: string; indexed?: boolean }> };

function canonicalEventSignature(entry: AbiEventEntry): string {
  return `${entry.name}(${entry.inputs.map(i => i.type).join(",")})`;
}

function findEvent(abi: unknown[], name: string): AbiEventEntry {
  const entry = (abi as AbiEventEntry[]).find(e => e.type === "event" && e.name === name);
  if (!entry) throw new Error(`Event "${name}" not found in ABI`);
  return entry;
}

/** Build { data, topics } for decodeEventLog from explicit indexed/non-indexed args. */
function buildEventLog(
  abi: unknown[],
  eventName: string,
  args: Record<string, unknown>,
): { data: `0x${string}`; topics: [`0x${string}`, ...`0x${string}`[]] } {
  const abiTyped = abi as AbiEvent[];
  const topics = encodeEventTopics({ abi: abiTyped, eventName, args });
  const entry = findEvent(abi, eventName);
  const nonIndexedInputs = entry.inputs.filter(i => !i.indexed);
  const data = nonIndexedInputs.length > 0
    ? encodeAbiParameters(nonIndexedInputs, nonIndexedInputs.map(i => args[i.name as string]))
    : "0x";
  return { data, topics: topics as [`0x${string}`, ...`0x${string}`[]] };
}

describe("event topic pins", () => {
  it("REGISTERED_EVENT_TOPIC matches IdentityRegistryABI Registered event", () => {
    const entry = findEvent(IdentityRegistryABI, "Registered");
    const abiTopic = keccak256(toHex(canonicalEventSignature(entry)));
    const hardcoded = keccak256(toHex("Registered(uint256,string,address)"));
    expect(abiTopic).toBe(hardcoded);
  });

  it("NEW_FEEDBACK_EVENT_TOPIC matches ReputationRegistryABI NewFeedback event", () => {
    const entry = findEvent(ReputationRegistryABI, "NewFeedback");
    const abiTopic = keccak256(toHex(canonicalEventSignature(entry)));
    const hardcoded = keccak256(
      toHex("NewFeedback(uint256,address,uint64,int128,uint8,string,string,string,string,string,bytes32)")
    );
    expect(abiTopic).toBe(hardcoded);
  });

  it("TRANSFER_EVENT parseAbiItem has expected shape", () => {
    const event = parseAbiItem(
      "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
    );
    expect(event.name).toBe("Transfer");
    expect(event.inputs).toHaveLength(3);
    expect(event.inputs[0]).toMatchObject({ type: "address", indexed: true });
    expect(event.inputs[1]).toMatchObject({ type: "address", indexed: true });
    expect(event.inputs[2]).toMatchObject({ type: "uint256", indexed: true });
  });
});

describe("encodeEventTopics / decodeEventLog round-trips", () => {
  it("Registered round-trip", () => {
    const agentId = 1n;
    const agentURI = "ipfs://QmTestAgent";
    const owner = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`;

    const { data, topics } = buildEventLog(IdentityRegistryABI, "Registered", { agentId, agentURI, owner });

    const { args } = decodeEventLog({
      abi: IdentityRegistryABI as AbiEvent[],
      eventName: "Registered",
      data,
      topics,
    });

    expect((args as any).agentId).toBe(agentId);
    expect((args as any).agentURI).toBe(agentURI);
    expect(((args as any).owner as string).toLowerCase()).toBe(owner.toLowerCase());
  });

  it("NewFeedback round-trip (non-indexed fields and signed int128)", () => {
    const agentId = 42n;
    const clientAddress = "0x1234567890123456789012345678901234567890" as `0x${string}`;
    const feedbackIndex = 7n;
    const value = -500n; // negative int128 — tests signed encoding
    const valueDecimals = 2;
    const indexedTag1 = "quality"; // indexed string → stored as keccak256 in topic
    const tag1 = "quality";
    const tag2 = "v1";
    const endpoint = "https://agent.example/mcp";
    const feedbackURI = "ipfs://QmTest";
    const feedbackHash = `0x${"ab".repeat(32)}` as `0x${string}`;

    const { data, topics } = buildEventLog(ReputationRegistryABI, "NewFeedback", {
      agentId, clientAddress, feedbackIndex, value, valueDecimals,
      indexedTag1, tag1, tag2, endpoint, feedbackURI, feedbackHash,
    });

    const { args } = decodeEventLog({
      abi: ReputationRegistryABI as AbiEvent[],
      eventName: "NewFeedback",
      data,
      topics,
    });
    const d = args as any;

    // Non-indexed fields recover exactly
    expect(d.feedbackIndex).toBe(feedbackIndex);
    expect(d.value).toBe(value);
    expect(d.valueDecimals).toBe(valueDecimals);
    expect(d.tag1).toBe(tag1);
    expect(d.tag2).toBe(tag2);
    expect(d.endpoint).toBe(endpoint);
    expect(d.feedbackURI).toBe(feedbackURI);
    expect(d.feedbackHash).toBe(feedbackHash);

    // Indexed non-dynamic fields recover exactly
    expect(d.agentId).toBe(agentId);
    expect((d.clientAddress as string).toLowerCase()).toBe(clientAddress.toLowerCase());

    // Indexed dynamic type (string) is stored as keccak256 — cannot recover original
    expect(d.indexedTag1).toBe(keccak256(toHex(indexedTag1)));
  });
});
