import { z } from "zod";
import {
  AGENT_TYPES, SERVICE_TYPES,
  assertPublicUrl,
} from "@injective/agent-sdk";
import type { AgentType, ServiceType, AgentClient, AgentReadClient } from "@injective/agent-sdk";
import { createClient, createReadClient } from "../env.js";

let _client: AgentClient | undefined;
let _readClient: AgentReadClient | undefined;

function getClient(): AgentClient {
  return (_client ??= createClient(undefined, "mcp"));
}

function getReadClient(): AgentReadClient {
  return (_readClient ??= createReadClient());
}

const agentIdField = z.string().regex(/^\d+$/, "Agent ID must be a non-negative integer");
const walletField = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Must be a checksummed 0x EVM address");
const publicUrlField = z.string().refine((url) => {
  if (url.startsWith("ipfs://")) return url.length > 7;
  try { new URL(url); } catch { return false; }
  try { assertPublicUrl(url); return true; } catch { return false; }
}, "Must be a valid URL (https://, http://, or ipfs://)");

const serviceEntrySchema = z.object({
  type: z.enum(SERVICE_TYPES as [ServiceType, ...ServiceType[]]).describe("Service protocol type"),
  url: publicUrlField.describe("Service endpoint URL"),
  description: z.string().optional().describe("Service description"),
});

const registerSchema = z.object({
  name: z.string().min(1).max(100).describe("Agent name (1-100 characters)"),
  type: z.enum(AGENT_TYPES as [AgentType, ...AgentType[]]).describe("Agent type"),
  builderCode: z.string().min(1).describe("Builder code identifier"),
  wallet: walletField.describe("Wallet address to link to this agent"),
  uri: z.string().optional().describe("Agent card URI (if omitted, uploads to IPFS via Pinata)"),
  description: z.string().max(500).optional().describe("Agent description (up to 500 characters)"),
  services: z.array(serviceEntrySchema).optional().describe("Service endpoints to register"),
  image: publicUrlField.optional().describe("Agent image URL (https:// or ipfs:// URI only, no local paths)"),
  x402Support: z.boolean().optional().describe("Whether agent supports x402 payments"),
});

const updateSchema = z.object({
  agentId: agentIdField.describe("Agent ID as a decimal string"),
  name: z.string().min(1).max(100).optional().describe("New agent name"),
  description: z.string().max(500).optional().describe("New agent description"),
  builderCode: z.string().min(1).optional().describe("New builder code identifier"),
  type: z.enum(AGENT_TYPES as [AgentType, ...AgentType[]]).optional().describe("New agent type"),
  wallet: walletField.optional().describe("New wallet address to link"),
  uri: z.string().optional().describe("New agent card URI"),
  services: z.array(serviceEntrySchema).optional().describe("Services to add/update (merged by type)"),
  removeServices: z.array(z.enum(SERVICE_TYPES as [ServiceType, ...ServiceType[]])).optional().describe("Service types to remove"),
  image: publicUrlField.optional().describe("New agent image URL (https:// or ipfs:// URI only, no local paths)"),
  x402Support: z.boolean().optional().describe("Enable/disable x402 payment support"),
});

const deregisterSchema = z.object({
  agentId: agentIdField.describe("Agent ID as a decimal string"),
  confirm: z.literal(true).describe("Must be explicitly set to true to confirm irreversible deregistration"),
});

const statusSchema = z.object({
  agentId: agentIdField.describe("Agent ID as a decimal string"),
});

export const tools = [
  {
    name: "agent_register",
    description: "Register a new agent identity on the Injective chain",
    inputSchema: registerSchema.shape,
    handler: async (args: Record<string, unknown>) => {
      const a = registerSchema.parse(args);
      const client = getClient();
      return client.register({
        name: a.name,
        type: a.type,
        builderCode: a.builderCode,
        wallet: a.wallet as `0x${string}`,
        uri: a.uri,
        description: a.description,
        services: a.services,
        image: a.image,
        x402: a.x402Support,
      });
    },
  },
  {
    name: "agent_update",
    description: "Update an existing agent identity on the Injective chain",
    inputSchema: updateSchema.shape,
    handler: async (args: Record<string, unknown>) => {
      const a = updateSchema.parse(args);
      const client = getClient();
      return client.update(BigInt(a.agentId), {
        name: a.name,
        description: a.description,
        builderCode: a.builderCode,
        type: a.type,
        wallet: a.wallet as `0x${string}` | undefined,
        uri: a.uri,
        services: a.services,
        removeServices: a.removeServices,
        image: a.image,
        x402: a.x402Support,
      });
    },
  },
  {
    name: "agent_deregister",
    description: "Deregister (burn) an agent identity NFT on the Injective chain. This is IRREVERSIBLE.",
    inputSchema: deregisterSchema.shape,
    handler: async (args: Record<string, unknown>) => {
      const a = deregisterSchema.parse(args);
      const client = getClient();
      return client.deregister(BigInt(a.agentId));
    },
  },
  {
    name: "agent_status",
    description: "Get the status of an agent identity on the Injective chain",
    inputSchema: statusSchema.shape,
    handler: async (args: Record<string, unknown>) => {
      const a = statusSchema.parse(args);
      const readClient = getReadClient();
      return readClient.getStatus(BigInt(a.agentId));
    },
  },
] as const;
