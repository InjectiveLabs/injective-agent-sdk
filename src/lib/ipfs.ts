import { readFile } from "node:fs/promises";
import { extname, basename } from "node:path";
import type { AgentCard } from "../types/index.js";
import { CliError } from "./errors.js";

const PINATA_API_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
const PINATA_FILE_API_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".svg", ".webp"];
const MIME_TYPES: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml", ".webp": "image/webp",
};

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

async function pinataPost(url: string, init: RequestInit): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, init);
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

export async function uploadAgentCard(card: AgentCard): Promise<string> {
  const jwt = getPinataJwt();
  return pinataPost(PINATA_API_URL, {
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
      pinataOptions: { cidVersion: 1 },
    }),
  });
}

export async function uploadImageToIpfs(filePath: string): Promise<string> {
  const jwt = getPinataJwt();

  const ext = extname(filePath).toLowerCase();
  if (!ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
    throw new CliError(`Unsupported image type "${ext}". Must be one of: ${ALLOWED_IMAGE_EXTENSIONS.join(", ")}.`);
  }

  const fileBuffer = await readFile(filePath).catch(() => {
    throw new CliError(`Image file not found: ${filePath}`);
  });
  if (fileBuffer.byteLength > MAX_IMAGE_SIZE) {
    console.warn(`Warning: Image file exceeds 2MB limit (${(fileBuffer.byteLength / 1024 / 1024).toFixed(1)}MB). Registering without image.`);
    return "";
  }

  console.log("Uploading image to IPFS...");

  const safeName = basename(filePath).replace(/[^a-zA-Z0-9._-]/g, "_");
  const blob = new Blob([fileBuffer], { type: MIME_TYPES[ext] });
  const form = new FormData();
  form.append("file", blob, safeName);
  form.append("pinataMetadata", JSON.stringify({ name: `agent-image-${safeName}` }));
  form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

  return pinataPost(PINATA_FILE_API_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${jwt}` },
    body: form,
  });
}

export async function resolveImageUri(imageInput: string): Promise<string> {
  if (imageInput.startsWith("ipfs://") || imageInput.startsWith("https://") || imageInput.startsWith("http://")) {
    return imageInput;
  }
  if (!process.env.PINATA_JWT) {
    console.warn("Warning: Cannot upload image — PINATA_JWT not configured. Registering without image.");
    return "";
  }
  return uploadImageToIpfs(imageInput);
}
