import type { AgentCard, AgentType } from "../types/index.js";

interface GenerateOptions {
  name: string;
  type: AgentType;
  description?: string;
  builderCode: string;
  operatorAddress: string;
}

export function generateAgentCard(opts: GenerateOptions): AgentCard {
  const card: AgentCard = {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: opts.name,
    services: [],
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

export async function fetchAgentCard(uri: string, ipfsGateway: string): Promise<AgentCard> {
  const url = uri.startsWith("ipfs://")
    ? `${ipfsGateway}${uri.slice(7)}`
    : uri;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch agent card from ${url}: ${res.status}`);
  return res.json() as Promise<AgentCard>;
}
