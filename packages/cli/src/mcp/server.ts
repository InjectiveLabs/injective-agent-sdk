import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { tools } from "./tools.js";
import { bigintReplacer, AgentSdkError } from "@injective/agent-sdk";

export async function startMcpServer() {
  const server = new McpServer({ name: "injective-agent", version: "0.1.0" });
  for (const tool of tools) {
    server.tool(tool.name, tool.description, tool.inputSchema, async (args: Record<string, unknown>) => {
      try {
        const result = await tool.handler(args);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, bigintReplacer, 2) }] };
      } catch (error) {
        const msg = error instanceof AgentSdkError
          ? error.message
          : "An internal error occurred. Check server logs.";
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    });
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
