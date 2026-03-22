import type { AgentCard } from "../types/index.js";

export async function uploadAgentCard(_card: AgentCard): Promise<string> {
  throw new Error(
    "IPFS upload is not yet available. Use --uri to provide your own hosted agent card URL."
  );
}
