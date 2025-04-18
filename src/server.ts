// mcp_servers/mcp-ynab/src/server.ts

// console.log("[mcp-ynab] Script execution started."); // REMOVED VERY TOP LOG

// Import necessary modules
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios, { AxiosError } from "axios"; // Use Axios for HTTP requests
// import dotenv from "dotenv"; // REMOVED dotenv import
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"; // Revert import path
import yargs from 'yargs/yargs'; // Added Yargs
import { hideBin } from 'yargs/helpers'; // Added Yargs helper

/* // REMOVED dotenv loading and check
// Load environment variables from .env file in the project root
dotenv.config(); // Load .env from CWD (project root)
console.log(`[mcp-ynab] dotenv loaded. YNAB_API_TOKEN value: ${process.env.YNAB_API_TOKEN ? '******' : 'UNDEFINED or EMPTY'}`); // ADDED ENV CHECK LOG (masking value)
*/

// --- Configuration ---
const YNAB_API_TOKEN = process.env.YNAB_API_TOKEN;
const YNAB_BASE_URL = "https://api.ynab.com/v1";

/* // REMOVED manual validation block
// Validate essential configuration
if (!YNAB_API_TOKEN || YNAB_API_TOKEN === "TU_YNAB_API_KEY_REAL_AQUI") {
  console.error(
    "FATAL ERROR: YNAB_API_TOKEN environment variable is not set or is placeholder. " +
    "Please create/edit the .env file in the project root (/Users/luis/projects/mcp_servers/mcp-ynab/.env) " +
    "with your YNAB Personal Access Token."
  );
  process.exit(1); // Exit if the token is missing or placeholder
}
*/

// --- MCP Server Setup ---
const server = new McpServer({
  // Define server metadata
  name: "ynab", // Use the desired name 'ynab'
  version: "1.0.0",
  description: "Custom MCP server for interacting with the YNAB API using TypeScript.",
  // Capabilities definition might not be needed here with the new API
  // We define tools directly below
});

// --- API Client Helper ---
// Create an Axios instance configured for YNAB API calls
export const ynabApi = axios.create({
  baseURL: YNAB_BASE_URL,
  headers: { Authorization: `Bearer ${YNAB_API_TOKEN}` },
});

// --- Tool Definitions ---

/**
 * Helper function to format YNAB API errors for the LLM / CLI
 * NOTE: Reverted to always return ToolResult structure for MCP compatibility.
 * CLI output formatting will be handled separately.
 */
function formatYnabError(error: unknown, toolName: string) {
  const axiosError = error as AxiosError<any>; // Type assertion
  const detail = axiosError.response?.data?.error?.detail;
  const message = detail || axiosError.message || "An unknown error occurred";
  console.error(`YNAB API Error (${toolName}):`, message, axiosError.response?.data || '');

  // Always return structure matching SDK v1.9.0 ToolResult
  return { content: [{ type: "text" as const, text: `YNAB API Error: ${message}` }], isError: true };
}

// --- Logic Functions (Refactored from Tools) ---

// Logic: List Budgets
async function listBudgetsLogic() {
  try {
    const response = await ynabApi.get(`/budgets`);
    const budgets = response.data?.data?.budgets ?? [];

    if (budgets.length === 0) {
      // Return ToolResult structure
      return { content: [{ type: "text" as const, text: "No budgets found." }] };
    }

    const budgetList = budgets
      .map((budget: any) => `- ${budget.name} (ID: ${budget.id})`)
      .join("\n");
    // Return ToolResult structure
    return { content: [{ type: "text" as const, text: `Available Budgets:\n${budgetList}` }] };
  } catch (error) {
    // Call original formatYnabError which returns ToolResult
    return formatYnabError(error, "listBudgetsLogic");
  }
}

// Logic: List Accounts
async function listAccountsLogic(args: { budget_id: string }) {
    const { budget_id } = args;
    try {
      const response = await ynabApi.get(`/budgets/${budget_id}/accounts`);
      const accounts = response.data?.data?.accounts || [];

      if (accounts.length === 0) {
        return { content: [{ type: "text" as const, text: "No accounts found for this budget." }] };
      }

      const accountList = accounts
        .map((acc: any) => `- ${acc.name} (ID: ${acc.id}, Type: ${acc.type}, Balance: ${(acc.balance / 1000).toFixed(2)})`)
        .join("\n");
      return { content: [{ type: "text" as const, text: `Accounts:\n${accountList}` }] };
    } catch (error) {
      return formatYnabError(error, "listAccountsLogic");
    }
}

// Logic: List Transactions
async function listTransactionsLogic(args: {
  budget_id: string;
  account_id?: string;
  since_date?: string;
  type?: 'uncategorized' | 'unapproved';
}) {
    const { budget_id, account_id, since_date, type } = args;
    try {
      const url = account_id
        ? `/budgets/${budget_id}/accounts/${account_id}/transactions`
        : `/budgets/${budget_id}/transactions`;

      const params: Record<string, string> = {};
      if (since_date) params.since_date = since_date;
      if (type) params.type = type;

      const response = await ynabApi.get(url, { params });
      const transactions = response.data?.data?.transactions || [];

      if (transactions.length === 0) {
        return { content: [{ type: "text" as const, text: "No transactions found matching the criteria." }] };
      }

      const transactionList = transactions
        .map((t: any) =>
          `Date: ${t.date}, Payee: ${t.payee_name || 'N/A'}, Category: ${t.category_name || 'N/A'}, Amount: ${(t.amount / 1000).toFixed(2)}, Cleared: ${t.cleared}, Approved: ${t.approved}${t.memo ? `, Memo: ${t.memo}` : ''}`
        )
        .join("\n");
      return { content: [{ type: "text" as const, text: `Transactions:\n${transactionList}` }] };
    } catch (error) {
      return formatYnabError(error, "listTransactionsLogic");
    }
}

// Logic: Get Account Balance
async function getAccountBalanceLogic(args: { budget_id: string, account_id: string }) {
    const { budget_id, account_id } = args;
    try {
      const response = await ynabApi.get(`/budgets/${budget_id}/accounts/${account_id}`);
      const account = response.data?.data?.account;
      if (!account) {
         return { content: [{ type: "text" as const, text: `Account with ID ${account_id} not found.` }], isError: true };
      }
      return {
          content: [
              { type: "text" as const, text: `Current balance for ${account.name}: ${(account.balance / 1000).toFixed(2)}` }
          ]
      };
    } catch (error) {
       return formatYnabError(error, "getAccountBalanceLogic");
    }
}

// Logic: List Categories
async function listCategoriesLogic(args: { budget_id: string }) {
    const { budget_id } = args;
    try {
      const response = await ynabApi.get(`/budgets/${budget_id}/categories`);
      const categoryGroups = response.data?.data?.category_groups || [];

      if (categoryGroups.length === 0) {
         return { content: [{ type: "text" as const, text: "No categories found for this budget." }] };
      }

      let output = "Categories:\n";
      categoryGroups.forEach((group: any) => {
          if (!group.hidden && group.categories?.length > 0) {
             output += `\nGroup: ${group.name} (ID: ${group.id})\n`;
             group.categories.forEach((cat: any) => {
                 if (!cat.hidden) {
                     output += `  - ${cat.name} (ID: ${cat.id})\n`;
                 }
             });
          }
      });
      return { content: [{ type: "text" as const, text: output }] };
    } catch (error) {
       return formatYnabError(error, "listCategoriesLogic");
    }
}

// Logic: Get Budget Summary
async function getBudgetSummaryLogic(args: { budget_id: string }) {
    const { budget_id } = args;
    try {
      const response = await ynabApi.get(`/budgets/${budget_id}/months/current`);
      const monthDetail = response.data?.data?.month;
      if (!monthDetail) {
         return { content: [{ type: "text" as const, text: "Could not retrieve budget summary for the current month." }], isError: true };
      }
      const summary = `Current Month Summary (${monthDetail.month}):\n` +
                      `- Income: ${(monthDetail.income / 1000).toFixed(2)}\n` +
                      `- Budgeted: ${(monthDetail.budgeted / 1000).toFixed(2)}\n` +
                      `- Activity (Spending): ${(monthDetail.activity / 1000).toFixed(2)}\n` +
                      `- To Be Budgeted: ${(monthDetail.to_be_budgeted / 1000).toFixed(2)}`;
      return { content: [{ type: "text" as const, text: summary }] };
    } catch (error) {
      return formatYnabError(error, "getBudgetSummaryLogic");
    }
}

// Logic: Get Category Info
async function getCategoryInfoLogic(args: { budget_id: string, category_id: string }) {
    const { budget_id, category_id } = args;
    try {
      const response = await ynabApi.get(`/budgets/${budget_id}/months/current/categories/${category_id}`);
       const category = response.data?.data?.category;
       if (!category) {
         return { content: [{ type: "text" as const, text: `Category with ID ${category_id} not found for the current month.` }], isError: true };
       }
       const info = `Category: ${category.name}\n` +
                    `- Budgeted: ${(category.budgeted / 1000).toFixed(2)}\n` +
                    `- Activity (Spending): ${(category.activity / 1000).toFixed(2)}\n` +
                    `- Balance: ${(category.balance / 1000).toFixed(2)}`;
       return { content: [{ type: "text" as const, text: info }] };
    } catch (error) {
       return formatYnabError(error, "getCategoryInfoLogic");
    }
}

// Logic: Create Transaction
async function createTransactionLogic(args: {
    budget_id: string;
    account_id: string;
    amount: number; // Assumes milliunits
    date: string; // Assumes YYYY-MM-DD
    payee_name?: string;
    category_id?: string;
    memo?: string;
    cleared?: 'cleared' | 'uncleared' | 'reconciled';
    approved?: boolean;
}) {
    const { budget_id, ...transactionData } = args;
    try {
      const response = await ynabApi.post(
        `/budgets/${budget_id}/transactions`,
        { transaction: transactionData }
      );
      const createdTransactionId = response.data?.data?.transaction_ids?.[0] || response.data?.data?.transaction?.id || 'N/A';
      return { content: [{ type: "text" as const, text: `Transaction created successfully. ID: ${createdTransactionId}` }] };
    } catch (error) {
      return formatYnabError(error, "createTransactionLogic");
    }
}

// --- Read Tools ---

// Tool: List Budgets
server.tool(
  "mcp_ynab_list_budgets",
  async () => {
    // Simply call the logic function and return its result
    return await listBudgetsLogic();
  }
);

// Tool: List Accounts
server.tool(
  "mcp_ynab_list_accounts",
  { budget_id: z.string().describe("The ID of the budget (e.g., 'last-used' or a specific UUID).") },
  async (args) => {
    return await listAccountsLogic(args);
  }
);

// Tool: List Transactions
server.tool(
  "mcp_ynab_list_transactions",
  {
    budget_id: z.string().describe("The ID of the budget (e.g., 'last-used' or UUID)."),
    account_id: z.string().optional().describe("Filter by Account ID (optional)."),
    since_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD").optional().describe("Include transactions since this date (YYYY-MM-DD, optional)."),
    type: z.enum(['uncategorized', 'unapproved']).optional().describe("Filter by type: 'uncategorized' or 'unapproved' (optional)."),
  },
  async (args) => {
    return await listTransactionsLogic(args);
  }
);

// Tool: Get Account Balance
server.tool(
  "mcp_ynab_get_account_balance",
  {
    budget_id: z.string().describe("Budget ID."),
    account_id: z.string().describe("Account ID."),
  },
  async (args) => {
    return await getAccountBalanceLogic(args);
  }
);

// Tool: List Categories
server.tool(
  "mcp_ynab_list_categories",
   { budget_id: z.string().describe("Budget ID.") },
  async (args) => {
    return await listCategoriesLogic(args);
  }
);

// Tool: Get Budget Summary (Simplified for current month)
server.tool(
  "mcp_ynab_get_budget_summary",
  { budget_id: z.string().describe("Budget ID.") },
  async (args) => {
    return await getBudgetSummaryLogic(args);
  }
);

// Tool: Get Category Info (Simplified for current month)
server.tool(
  "mcp_ynab_get_category_info",
  {
    budget_id: z.string().describe("Budget ID."),
    category_id: z.string().uuid().describe("Category ID (UUID format)."),
  },
  async (args) => {
    return await getCategoryInfoLogic(args);
  }
);


// --- Write Tools ---

// Tool: Create Transaction
server.tool(
  "mcp_ynab_create_transaction",
  {
    budget_id: z.string().describe("Budget ID."),
    account_id: z.string().describe("Account ID."),
    amount: z.number().int().describe("Amount in **milliunits** (integer, e.g., $12.34 = 12340. Negative for outflow)."),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD").describe("Transaction date (YYYY-MM-DD)."),
    payee_name: z.string().max(50).optional().describe("Payee name (max 50 chars)."),
    category_id: z.string().uuid().optional().describe("Category ID (UUID format). Use mcp_ynab_list_categories to find IDs."),
    memo: z.string().max(200).optional().describe("Optional memo (max 200 chars)."),
    cleared: z.enum(['cleared', 'uncleared', 'reconciled']).optional().describe("Cleared status."),
    approved: z.boolean().optional().describe("Approved status."),
  },
  async (args) => {
    return await createTransactionLogic(args);
  }
);


// --- Server Execution --- 
async function main() {
  // console.log("[mcp-ynab] Entering main() function..."); // REMOVED log
  console.log("Starting MCP YNAB Server..."); // Restored original log
  const transport = new StdioServerTransport();
  // console.log("[mcp-ynab] StdioServerTransport created."); // REMOVED log
  try {
    // console.log("[mcp-ynab] Attempting server.connect(transport)... DONT STOP..."); // REMOVED log
    await server.connect(transport);
    console.log("YNAB MCP Server connected and listening via stdio."); // Restored original log
  } catch (error) {
    console.error("Failed to connect YNAB MCP server:", error); // Restored original log
    process.exit(1);
  }
}

// --- CLI Execution ---
// /* // REMOVE commenting out yargs CLI setup
const cli = yargs(hideBin(process.argv))
  .command('list-budgets', 'List available YNAB budgets', {}, async (argv) => {
    const result = await listBudgetsLogic();
    console.log(result.content[0].text);
    if ('isError' in result && result.isError) process.exitCode = 1;
  })
  .command('list-accounts <budget-id>', 'List accounts for a budget', (yargs) => {
    return yargs.positional('budget-id', {
      describe: 'Budget ID (e.g., last-used or UUID)',
      type: 'string',
      demandOption: true,
    });
  }, async (argv) => {
    const result = await listAccountsLogic({ budget_id: argv.budgetId as string });
    console.log(result.content[0].text);
    if ('isError' in result && result.isError) process.exitCode = 1;
  })
  .command('list-transactions <budget-id>', 'List transactions for a budget or account', (yargs) => {
    return yargs
      .positional('budget-id', { describe: 'Budget ID', type: 'string', demandOption: true })
      .option('account-id', { describe: 'Filter by Account ID', type: 'string' })
      .option('since-date', { describe: 'Filter since date (YYYY-MM-DD)', type: 'string' })
      .option('type', { describe: 'Filter by type', choices: ['uncategorized', 'unapproved'] as const });
  }, async (argv) => {
    const result = await listTransactionsLogic({
      budget_id: argv.budgetId as string,
      account_id: argv.accountId,
      since_date: argv.sinceDate,
      type: argv.type,
    });
    console.log(result.content[0].text);
    if ('isError' in result && result.isError) process.exitCode = 1;
  })
  .command('get-balance <budget-id> <account-id>', 'Get balance for a specific account', (yargs) => {
    return yargs
      .positional('budget-id', { describe: 'Budget ID', type: 'string', demandOption: true })
      .positional('account-id', { describe: 'Account ID', type: 'string', demandOption: true });
  }, async (argv) => {
    const result = await getAccountBalanceLogic({
      budget_id: argv.budgetId as string,
      account_id: argv.accountId as string,
    });
    console.log(result.content[0].text);
    if ('isError' in result && result.isError) process.exitCode = 1;
  })
  .command('list-categories <budget-id>', 'List categories for a budget', (yargs) => {
    return yargs.positional('budget-id', { describe: 'Budget ID', type: 'string', demandOption: true });
  }, async (argv) => {
    const result = await listCategoriesLogic({ budget_id: argv.budgetId as string });
    console.log(result.content[0].text);
    if ('isError' in result && result.isError) process.exitCode = 1;
  })
  .command('get-summary <budget-id>', 'Get current month budget summary', (yargs) => {
    return yargs.positional('budget-id', { describe: 'Budget ID', type: 'string', demandOption: true });
  }, async (argv) => {
    const result = await getBudgetSummaryLogic({ budget_id: argv.budgetId as string });
    console.log(result.content[0].text);
    if ('isError' in result && result.isError) process.exitCode = 1;
  })
  .command('get-category-info <budget-id> <category-id>', 'Get info for a specific category (current month)', (yargs) => {
    return yargs
      .positional('budget-id', { describe: 'Budget ID', type: 'string', demandOption: true })
      .positional('category-id', { describe: 'Category ID (UUID)', type: 'string', demandOption: true });
  }, async (argv) => {
    const result = await getCategoryInfoLogic({
      budget_id: argv.budgetId as string,
      category_id: argv.categoryId as string,
    });
    console.log(result.content[0].text);
    if ('isError' in result && result.isError) process.exitCode = 1;
  })
  .command('create-transaction <budget-id> <account-id> <amount> <date>', 'Create a new transaction', (yargs) => {
    return yargs
      .positional('budget-id', { describe: 'Budget ID', type: 'string', demandOption: true })
      .positional('account-id', { describe: 'Account ID', type: 'string', demandOption: true })
      .positional('amount', { describe: 'Amount in milliunits (integer, e.g., -12340 for -$12.34)', type: 'number', demandOption: true })
      .positional('date', { describe: 'Date (YYYY-MM-DD)', type: 'string', demandOption: true })
      .option('payee-name', { describe: 'Payee name', type: 'string' })
      .option('category-id', { describe: 'Category ID (UUID)', type: 'string' })
      .option('memo', { describe: 'Memo', type: 'string' })
      .option('cleared', { describe: 'Cleared status', choices: ['cleared', 'uncleared', 'reconciled'] as const })
      .option('approved', { describe: 'Approved status', type: 'boolean' });
  }, async (argv) => {
    // Basic validation (more robust could be added)
    if (!Number.isInteger(argv.amount)) {
        console.error("Error: Amount must be an integer (milliunits).");
        process.exit(1);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(argv.date as string)) {
        console.error("Error: Date must be in YYYY-MM-DD format.");
        process.exit(1);
    }

    const result = await createTransactionLogic({
      budget_id: argv.budgetId as string,
      account_id: argv.accountId as string,
      amount: argv.amount as number,
      date: argv.date as string,
      payee_name: argv.payeeName,
      category_id: argv.categoryId,
      memo: argv.memo,
      cleared: argv.cleared,
      approved: argv.approved,
    });
    console.log(result.content[0].text);
    if ('isError' in result && result.isError) process.exitCode = 1;
  })
  .demandCommand(1, 'Please specify a command to run.')
  .strict()
  .help()
  .alias('help', 'h');
// */ // REMOVE commenting out yargs CLI setup

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down...');
  process.exit(0);
});
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...');
  process.exit(0);
});

// Start the server or run the CLI
if (require.main === module) {
    /* // KEEP YARGS COMMENTED OUT FOR NOW to ensure MCP server mode works
    // Check arguments BEFORE invoking yargs
    if (process.argv.length <= 2) {
        // No extra arguments provided, assume server mode
        console.log("No CLI arguments detected, starting MCP server mode...");
        main();
    } else {
        // Extra arguments exist, process them as CLI commands
        console.log("CLI arguments detected, starting CLI mode...");
        (async () => { 
            await cli.parse(); // Let yargs handle CLI commands and process exit
        })();
    }
    */
    // Force main() call - This configuration was working reliably for MCP
    console.log("Forcing main() execution to ensure MCP server starts...");
    main();
}

// Export the server instance for testing
export { server };
