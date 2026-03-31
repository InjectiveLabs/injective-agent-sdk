import type { AgentCard } from "../types/index.js";
import { CliError } from "./errors.js";

const PINATA_API_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";

function getPinataJwt(): string {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    throw new CliError(
      "No Pinata API key found. Set PINATA_JWT in your .env file.\n" +
      "Get a free key at https://app.pinata.cloud/developers/api-keys\n" +
      "Or use --uri to provide your own hosted agent card URL."
    );
  }
  return jwt;
}

export async function uploadAgentCard(card: AgentCard): Promise<string> {
  const jwt = getPinataJwt();

  let response: Response;
  try {
    response = await fetch(PINATA_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        pinataContent: card,
        pinataMetadata: {
          name: `agent-card-${card.name.toLowerCase().replace(/\s+/g, "-")}`,
        },
        pinataOptions: {
          cidVersion: 1,
        },
      }),
    });
  } catch (err) {
    throw new CliError(
      `Could not reach Pinata API: ${err instanceof Error ? err.message : String(err)}\n` +
      "Check your internet connection and try again."
    );
  }

  if (!response.ok) {
    const body = await response.text();
    const truncated = body.length > 200 ? body.slice(0, 200) + "..." : body;
    throw new CliError(
      `Pinata upload failed (${response.status}): ${truncated}\n` +
      "Check that your PINATA_JWT is valid."
    );
  }

  const result = await response.json() as { IpfsHash?: string };
  if (!result.IpfsHash) {
    throw new CliError(
      `Pinata returned an unexpected response: ${JSON.stringify(result)}`
    );
  }
  return `ipfs://${result.IpfsHash}`;
}
