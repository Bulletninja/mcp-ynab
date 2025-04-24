import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Tool imports
import { listBudgetsTool } from "./tools/listBudgets";
import { listAccountsTool } from "./tools/listAccounts";
import { listTransactionsTool } from "./tools/listTransactions";
import { getAccountBalanceTool } from "./tools/getAccountBalance";
import { listCategoriesTool } from "./tools/listCategories";
import { getBudgetSummaryTool } from "./tools/getBudgetSummary";
import { getCategoryInfoTool } from "./tools/getCategoryInfo";
import { createTransactionTool } from "./tools/createTransaction";

// Types
type YnabToolDefinition = {
  name: string;
  schema?: z.ZodObject<any>;
  handler: (argsOrExtra?: any, extra?: any) => Promise<any>;
};

// Constants
const SERVER_CONFIG = {
  name: "ynab",
  version: "1.0.0",
  description: "Custom MCP server for interacting with the YNAB API using TypeScript."
};

const TOOLS: YnabToolDefinition[] = [
  listBudgetsTool,
  listAccountsTool,
  listTransactionsTool,
  getAccountBalanceTool,
  listCategoriesTool,
  getBudgetSummaryTool,
  getCategoryInfoTool,
  createTransactionTool,
];

// Server setup
const server = new McpServer(SERVER_CONFIG);

// Tool registration
const registerTools = () => {
  TOOLS.forEach(tool => 
    tool.schema 
      ? server.tool(tool.name, tool.schema.shape, tool.handler)
      : server.tool(tool.name, tool.handler)
  );
};

// Server lifecycle
const startServer = async () => {
  console.log("Starting MCP YNAB Server...");
  const transport = new StdioServerTransport();
  
  try {
    await server.connect(transport);
    console.log("YNAB MCP Server connected and listening via stdio.");
  } catch (error) {
    console.error("Failed to connect YNAB MCP server:", error);
    process.exit(1);
  }
};

// Process management
const setupProcessHandlers = () => {
  const shutdown = (signal: string) => {
    console.log(`Received ${signal}, shutting down...`);
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
};

// Initialize
const initialize = () => {
  registerTools();
  setupProcessHandlers();
  
  if (require.main === module) {
    console.log("Initializing MCP server...");
    startServer();
  }
};

initialize();

export { server };
