import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { tools } from "./tools.js";

export async function startMcpServer() {
  const server = new McpServer({ name: "injective-agent", version: "0.1.0" });
  for (const tool of tools) {
    server.tool(tool.name, tool.description, tool.inputSchema, async (args: Record<string, unknown>) => {
      try {
        const result = await tool.handler(args as Record<string, string>);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    });
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
