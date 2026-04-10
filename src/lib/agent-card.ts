import type { AgentCard, AgentType, ServiceEntry, ServiceType, Registration } from "../types/index.js";
import { AGENT_CARD_TYPE, LEGACY_SERVICE_NAME_MAP } from "../types/index.js";
import { assertPublicUrl } from "./url.js";
import { CliError } from "./errors.js";

interface GenerateOptions {
  name: string;
  type: AgentType;
  description?: string;
  builderCode: string;
  operatorAddress: string;
  services?: ServiceEntry[];
  image?: string;
  x402?: boolean;
  chainId?: number | string;
  registryAddress?: `0x${string}`;
}

export function generateAgentCard(opts: GenerateOptions): AgentCard {
  const card: AgentCard = {
    type: AGENT_CARD_TYPE,
    name: opts.name,
    services: opts.services ?? [],
    image: opts.image ?? "",
    x402Support: opts.x402 ?? false,
    active: true,
    updatedAt: Math.floor(Date.now() / 1000),
    metadata: {
      chain: "injective",
      chainId: String(opts.chainId ?? "unknown"),
      agentType: opts.type,
      builderCode: opts.builderCode,
      operatorAddress: opts.operatorAddress,
    },
  };
  if (opts.registryAddress && opts.chainId !== undefined && opts.chainId !== "") {
    card.registrations = [{ agentId: null, agentRegistry: `eip155:${opts.chainId}:${opts.registryAddress}` }];
  }
  if (opts.description) {
    card.description = opts.description;
  }
  return card;
}

interface MergeUpdates {
  name?: string;
  description?: string;
  services?: ServiceEntry[];
  removeServices?: string[];
  image?: string;
  x402?: boolean;
  active?: boolean;
}

export function mergeAgentCard(existing: AgentCard, updates: MergeUpdates): AgentCard {
  const card: AgentCard = {
    ...existing,
    services: existing.services ?? [],
    image: existing.image ?? "",
    x402Support: existing.x402Support ?? false,
  };

  const hasChanges =
    updates.name !== undefined || updates.description !== undefined ||
    updates.image !== undefined || updates.x402 !== undefined ||
    updates.active !== undefined ||
    (updates.services?.length ?? 0) > 0 ||
    (updates.removeServices?.length ?? 0) > 0;

  if (updates.name !== undefined) card.name = updates.name;
  if (updates.description !== undefined) card.description = updates.description;
  if (updates.image !== undefined) card.image = updates.image;
  if (updates.x402 !== undefined) card.x402Support = updates.x402;
  if (updates.active !== undefined) card.active = updates.active;

  if (hasChanges) card.updatedAt = Math.floor(Date.now() / 1000);

  if (updates.services) {
    let merged = [...card.services];
    for (const entry of updates.services) {
      const idx = merged.findIndex(s => s.name === entry.name);
      if (idx >= 0) {
        merged[idx] = entry;
      } else {
        merged.push(entry);
      }
    }
    card.services = merged;
  }

  if (updates.removeServices) {
    card.services = card.services.filter(s => !updates.removeServices!.includes(s.name));
  }

  return card;
}

export async function warnIfUnreachable(url: string): Promise<void> {
  try {
    assertPublicUrl(url, "Service URL");
  } catch (err) {
    if (err instanceof CliError) return;
    throw err;
  }
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(5000) });
    if (!res.ok) console.warn(`Warning: Service URL ${url} returned ${res.status}. Registration will proceed.`);
  } catch {
    console.warn(`Warning: Service URL ${url} is not reachable. Registration will proceed.`);
  }
}

function validateServiceEntry(raw: unknown): ServiceEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;

  // New format: name + endpoint
  if (typeof obj.name === "string" && typeof obj.endpoint === "string") {
    const entry: ServiceEntry = { name: obj.name, endpoint: obj.endpoint };
    if (typeof obj.description === "string") entry.description = obj.description;
    if (typeof obj.version === "string") entry.version = obj.version;
    return entry;
  }

  // Legacy format: type + url → convert to name + endpoint
  if (typeof obj.type === "string" && typeof obj.url === "string") {
    const name = LEGACY_SERVICE_NAME_MAP[obj.type as ServiceType] ?? obj.type;
    const entry: ServiceEntry = { name, endpoint: obj.url };
    if (typeof obj.description === "string") entry.description = obj.description;
    return entry;
  }

  return null;
}

function validateFetchedCard(raw: unknown): AgentCard {
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
  const card: AgentCard = {
    type: typeof obj.type === "string" ? obj.type : AGENT_CARD_TYPE,
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
          chainId: typeof meta.chainId === "string" ? meta.chainId : "unknown",
          agentType: (typeof meta.agentType === "string" ? meta.agentType : "other") as AgentType,
          builderCode: typeof meta.builderCode === "string" ? meta.builderCode : "",
          operatorAddress: typeof meta.operatorAddress === "string" ? meta.operatorAddress : "",
        }
      : { chain: "injective", chainId: "unknown", agentType: "other" as AgentType, builderCode: "", operatorAddress: "" },
  };
  if (typeof obj.active === "boolean") card.active = obj.active;
  if (typeof obj.updatedAt === "number") card.updatedAt = obj.updatedAt;
  if (Array.isArray(obj.registrations)) {
    const regs = (obj.registrations as unknown[]).flatMap((r): Registration[] => {
      if (typeof r !== "object" || r === null) return [];
      const rec = r as Record<string, unknown>;
      if (typeof rec.agentRegistry !== "string") return [];
      const rawId = rec.agentId;
      const agentId: bigint | null = rawId === null || rawId === undefined ? null : BigInt(rawId as bigint);
      return [{ agentId, agentRegistry: rec.agentRegistry }];
    });
    if (regs.length > 0) card.registrations = regs;
  }
  return card;
}

export async function fetchAgentCard(uri: string, ipfsGateway: string): Promise<AgentCard> {
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
