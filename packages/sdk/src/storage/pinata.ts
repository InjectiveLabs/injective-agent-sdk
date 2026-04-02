import type { StorageProvider } from "../types.js";
import { StorageError } from "../errors.js";

const PINATA_JSON_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
const PINATA_FILE_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";

async function pinataPost(url: string, init: RequestInit): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    throw new StorageError(
      `Could not reach Pinata API: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!response.ok) {
    const body = await response.text();
    const truncated = body.length > 200 ? body.slice(0, 200) + "..." : body;
    throw new StorageError(
      `Pinata upload failed (${response.status}): ${truncated}`
    );
  }

  const result = await response.json() as { IpfsHash?: string };
  if (!result.IpfsHash) {
    throw new StorageError(
      `Pinata returned an unexpected response: ${JSON.stringify(result)}`
    );
  }
  return `ipfs://${result.IpfsHash}`;
}

export class PinataStorage implements StorageProvider {
  private jwt: string;

  constructor(opts: { jwt: string }) {
    this.jwt = opts.jwt;
  }

  async uploadJSON(data: unknown, name?: string): Promise<string> {
    const slug = typeof name === "string" ? name.toLowerCase().replace(/\s+/g, "-") : "agent-card";
    return pinataPost(PINATA_JSON_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.jwt}`,
      },
      body: JSON.stringify({
        pinataContent: data,
        pinataMetadata: { name: `agent-card-${slug}` },
        pinataOptions: { cidVersion: 1 },
      }),
    });
  }

  async uploadFile(content: Uint8Array, filename: string, mimeType: string): Promise<string> {
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const blob = new Blob([content as BlobPart], { type: mimeType });
    const form = new FormData();
    form.append("file", blob, safeName);
    form.append("pinataMetadata", JSON.stringify({ name: `agent-image-${safeName}` }));
    form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

    return pinataPost(PINATA_FILE_URL, {
      method: "POST",
      headers: { "Authorization": `Bearer ${this.jwt}` },
      body: form,
    });
  }
}
