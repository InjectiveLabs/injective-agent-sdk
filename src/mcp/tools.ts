import { z } from "zod";
import { register } from "../commands/register.js";
import { update } from "../commands/update.js";
import { deregister } from "../commands/deregister.js";
import { status } from "../commands/status.js";
import { AGENT_TYPES } from "../types/index.js";
import type { AgentType } from "../types/index.js";

const bigintReplacer = (_: string, v: unknown) =>
  typeof v === "bigint" ? v.toString() : v;

export const tools = [
  {
    name: "agent_register",
    description: "Register a new agent identity on the Injective chain",
    inputSchema: {
      name: z.string().describe("Agent name (1-100 characters)"),
      type: z.enum(AGENT_TYPES as [AgentType, ...AgentType[]]).describe("Agent type"),
      builderCode: z.string().describe("Builder code identifier"),
      wallet: z.string().describe("Wallet address to link to this agent"),
      uri: z.string().describe("Agent card URI"),
      description: z.string().optional().describe("Agent description (up to 500 characters)"),
    },
    handler: async (args: Record<string, string>) => {
      const result = await register({
        name: args.name,
        type: args.type as AgentType,
        builderCode: args.builderCode,
        wallet: args.wallet as `0x${string}`,
        uri: args.uri,
        description: args.description,
      });
      return JSON.parse(JSON.stringify(result, bigintReplacer));
    },
  },
  {
    name: "agent_update",
    description: "Update an existing agent identity on the Injective chain",
    inputSchema: {
      agentId: z.string().describe("Agent ID as a decimal string"),
      builderCode: z.string().optional().describe("New builder code identifier"),
      type: z.enum(AGENT_TYPES as [AgentType, ...AgentType[]]).optional().describe("New agent type"),
      wallet: z.string().optional().describe("New wallet address to link"),
      uri: z.string().optional().describe("New agent card URI"),
    },
    handler: async (args: Record<string, string>) => {
      const result = await update({
        agentId: BigInt(args.agentId),
        builderCode: args.builderCode,
        type: args.type as AgentType | undefined,
        wallet: args.wallet as `0x${string}` | undefined,
        uri: args.uri,
      });
      return JSON.parse(JSON.stringify(result, bigintReplacer));
    },
  },
  {
    name: "agent_deregister",
    description: "Deregister (burn) an agent identity NFT on the Injective chain",
    inputSchema: {
      agentId: z.string().describe("Agent ID as a decimal string"),
    },
    handler: async (args: Record<string, string>) => {
      const result = await deregister({
        agentId: BigInt(args.agentId),
        force: true,
      });
      return JSON.parse(JSON.stringify(result, bigintReplacer));
    },
  },
  {
    name: "agent_status",
    description: "Get the status of an agent identity on the Injective chain",
    inputSchema: {
      agentId: z.string().describe("Agent ID as a decimal string"),
    },
    handler: async (args: Record<string, string>) => {
      const result = await status({
        agentId: BigInt(args.agentId),
      });
      return JSON.parse(JSON.stringify(result, bigintReplacer));
    },
  },
] as const;
