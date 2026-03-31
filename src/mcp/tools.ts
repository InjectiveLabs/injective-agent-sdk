import { z } from "zod";
import { register } from "../commands/register.js";
import { update } from "../commands/update.js";
import { deregister } from "../commands/deregister.js";
import { status } from "../commands/status.js";
import { AGENT_TYPES } from "../types/index.js";
import type { AgentType } from "../types/index.js";

const agentIdField = z.string().regex(/^\d+$/, "Agent ID must be a non-negative integer");
const walletField = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Must be a checksummed 0x EVM address");

const registerSchema = z.object({
  name: z.string().min(1).max(100).describe("Agent name (1-100 characters)"),
  type: z.enum(AGENT_TYPES as [AgentType, ...AgentType[]]).describe("Agent type"),
  builderCode: z.string().min(1).describe("Builder code identifier"),
  wallet: walletField.describe("Wallet address to link to this agent"),
  uri: z.string().optional().describe("Agent card URI (if omitted, uploads to IPFS via Pinata)"),
  description: z.string().max(500).optional().describe("Agent description (up to 500 characters)"),
});

const updateSchema = z.object({
  agentId: agentIdField.describe("Agent ID as a decimal string"),
  builderCode: z.string().min(1).optional().describe("New builder code identifier"),
  type: z.enum(AGENT_TYPES as [AgentType, ...AgentType[]]).optional().describe("New agent type"),
  wallet: walletField.optional().describe("New wallet address to link"),
  uri: z.string().optional().describe("New agent card URI"),
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
      const a = args as z.infer<typeof registerSchema>;
      return register({
        name: a.name,
        type: a.type,
        builderCode: a.builderCode,
        wallet: a.wallet as `0x${string}`,
        uri: a.uri,
        description: a.description,
      });
    },
  },
  {
    name: "agent_update",
    description: "Update an existing agent identity on the Injective chain",
    inputSchema: updateSchema.shape,
    handler: async (args: Record<string, unknown>) => {
      const a = args as z.infer<typeof updateSchema>;
      return update({
        agentId: BigInt(a.agentId),
        builderCode: a.builderCode,
        type: a.type,
        wallet: a.wallet as `0x${string}` | undefined,
        uri: a.uri,
      });
    },
  },
  {
    name: "agent_deregister",
    description: "Deregister (burn) an agent identity NFT on the Injective chain. This is IRREVERSIBLE.",
    inputSchema: deregisterSchema.shape,
    handler: async (args: Record<string, unknown>) => {
      const a = args as z.infer<typeof deregisterSchema>;
      return deregister({
        agentId: BigInt(a.agentId),
        force: true,
      });
    },
  },
  {
    name: "agent_status",
    description: "Get the status of an agent identity on the Injective chain",
    inputSchema: statusSchema.shape,
    handler: async (args: Record<string, unknown>) => {
      const a = args as z.infer<typeof statusSchema>;
      return status({
        agentId: BigInt(a.agentId),
      });
    },
  },
] as const;
