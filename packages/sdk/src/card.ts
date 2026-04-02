import type { AgentCard, AgentType, ServiceEntry, ServiceType, GenerateCardOptions, CardUpdates } from "./types.js";
import { SERVICE_TYPES } from "./types.js";
import { assertPublicUrl } from "./validation.js";
import { ValidationError } from "./errors.js";

export function generateAgentCard(opts: GenerateCardOptions): AgentCard {
  const card: AgentCard = {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: opts.name,
    services: opts.services ?? [],
    image: opts.image ?? "",
    x402Support: opts.x402 ?? false,
    metadata: {
      chain: "injective",
      chainId: "1776",
      agentType: opts.type,
      builderCode: opts.builderCode,
      operatorAddress: opts.operatorAddress,
    },
  };
  if (opts.description) {
    card.description = opts.description;
  }
  return card;
}

export function mergeAgentCard(existing: AgentCard, updates: CardUpdates): AgentCard {
  const card: AgentCard = {
    ...existing,
    services: existing.services ?? [],
    image: existing.image ?? "",
    x402Support: existing.x402Support ?? false,
  };

  if (updates.name) card.name = updates.name;
  if (updates.description !== undefined) card.description = updates.description;
  if (updates.image !== undefined) card.image = updates.image;
  if (updates.x402 !== undefined) card.x402Support = updates.x402;

  if (updates.services) {
    let merged = [...card.services];
    for (const entry of updates.services) {
      const idx = merged.findIndex(s => s.type === entry.type);
      if (idx >= 0) {
        merged[idx] = entry;
      } else {
        merged.push(entry);
      }
    }
    card.services = merged;
  }

  if (updates.removeServices) {
    card.services = card.services.filter(s => !updates.removeServices!.includes(s.type));
  }

  return card;
}

export async function checkServiceReachability(url: string): Promise<string | null> {
  try {
    assertPublicUrl(url, "Service URL");
  } catch (err) {
    if (err instanceof ValidationError) return null;
    throw err;
  }
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(5000) });
    if (!res.ok) return `Service URL ${url} returned ${res.status}. Registration will proceed.`;
    return null;
  } catch {
    return `Service URL ${url} is not reachable. Registration will proceed.`;
  }
}

export function validateServiceEntry(raw: unknown): ServiceEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.type !== "string" || !SERVICE_TYPES.includes(obj.type as ServiceType)) return null;
  if (typeof obj.url !== "string") return null;
  const entry: ServiceEntry = { type: obj.type as ServiceType, url: obj.url };
  if (typeof obj.description === "string") entry.description = obj.description;
  return entry;
}

export function validateFetchedCard(raw: unknown): AgentCard {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Fetched agent card is not a valid JSON object.");
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.name !== "string") {
    throw new Error("Fetched agent card has invalid or missing 'name' field.");
  }
  const meta = typeof obj.metadata === "object" && obj.metadata !== null
    ? obj.metadata as Record<string, unknown>
    : null;
  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: obj.name,
    description: typeof obj.description === "string" ? obj.description : undefined,
    services: Array.isArray(obj.services)
      ? obj.services.map(validateServiceEntry).filter((s): s is ServiceEntry => s !== null)
      : [],
    image: typeof obj.image === "string" ? obj.image : "",
    x402Support: typeof obj.x402Support === "boolean" ? obj.x402Support : false,
    metadata: meta
      ? {
          chain: "injective",
          chainId: "1776",
          agentType: (typeof meta.agentType === "string" ? meta.agentType : "other") as AgentType,
          builderCode: typeof meta.builderCode === "string" ? meta.builderCode : "",
          operatorAddress: typeof meta.operatorAddress === "string" ? meta.operatorAddress : "",
        }
      : { chain: "injective", chainId: "1776", agentType: "other" as AgentType, builderCode: "", operatorAddress: "" },
  };
}

export async function fetchAgentCard(uri: string, ipfsGateway = "https://w3s.link/ipfs/"): Promise<AgentCard> {
  let url: string;
  if (uri.startsWith("ipfs://")) {
    url = `${ipfsGateway}${uri.slice(7)}`;
  } else {
    const parsed = new URL(uri);
    if (!["https:", "http:"].includes(parsed.protocol)) {
      throw new Error(`Unsupported URI scheme: ${parsed.protocol}. Only https, http, and ipfs are allowed.`);
    }
    url = uri;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch agent card from ${url}: ${res.status}`);
  const raw = await res.json();
  return validateFetchedCard(raw);
}
