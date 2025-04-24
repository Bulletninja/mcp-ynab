# MCP YNAB Server 💰

Welcome to the MCP server for YNAB (TypeScript version)! 🎉 This project allows you to connect Cursor (or another MCP client) to your You Need A Budget (YNAB) account to interact with your financial data directly from your editor.

## 1. What is this? 🤔 (Purpose)

This is an implementation of the [Model Context Protocol (MCP)](https://docs.cursor.com/context/model-context-protocol) in TypeScript that acts as a bridge to the official YNAB API. The goal is to provide standardized tools for reading and writing YNAB data from MCP-compatible environments, allowing AI assistants like Cursor's to help you with your finances.

## 2. Available Tools 🛠️

This server provides the following tools, each with its own detailed documentation:

*   [`listBudgets`](src/tools/listBudgets/README.md): Lists your available budgets.
*   [`listAccounts`](src/tools/listAccounts/README.md): Lists accounts within a specified budget.
*   [`getAccountBalance`](src/tools/getAccountBalance/README.md): Fetches the current balance for a specific account.
*   [`listCategories`](src/tools/listCategories/README.md): Lists categories within a specified budget.
*   [`getCategoryInfo`](src/tools/getCategoryInfo/README.md): Gets detailed information about a specific category for a given month.
*   [`getBudgetSummary`](src/tools/getBudgetSummary/README.md): Provides a budget summary (income, budgeted, activity) for a specific month.
*   [`listTransactions`](src/tools/listTransactions/README.md): Lists transactions for a budget, with filtering options (by account, category, date, etc.).
*   [`createTransaction`](src/tools/createTransaction/README.md): Creates a new transaction or split transaction within a budget.

See each tool's `README.md` for detailed information on arguments, output, and usage context.

## 3. Setup 🚀

1.  **Clone the Repository:**
    ```bash
    # git clone https://github.com/Bulletninja/mcp-ynab # If you haven't already
    cd mcp-ynab 
    ```
2.  **Install Dependencies:**
    ```bash
    npm install
    ```
3.  **Configure Your YNAB API Token:** You need a [Personal Access Token](https://app.ynab.com/settings/developer) from YNAB. The **recommended and tested** way for Cursor integration is:
    *   Edit your global Cursor configuration file `~/.cursor/mcp.json`.
    *   Add or modify the entry for `mcp-ynab`, ensuring the `command`, `args`, `cwd`, and `env` are correct:
        ```json
        {
          "mcpServers": {
            // ... other servers ...
            "mcp-ynab": {
              "command": "node",
              // 👇 Path to the compiled script
              "args": ["<path-to-your-project>/mcp-ynab/dist/server.js"], 
              "cwd": "<path-to-your-project>/mcp-ynab", // Path to this project
              "enabled": true,
              "env": {
                // 👇 Your YNAB token here, with the correct name!
                "YNAB_API_TOKEN": "YOUR_YNAB_TOKEN_HERE" 
              }
            }
            // ... other servers ...
          }
        }
        ```
    *   *Alternative (requires code modification):* You could use a `.env` file in the project root, but you would need to uncomment the `dotenv` logic in `src/server.ts` and ensure it doesn't interfere with server mode.

4.  **Compile the Code:**
    ```bash
    npm run build
    ```

## 4. Usage with Cursor 💡

1.  Ensure the configuration in `~/.cursor/mcp.json` is correct and `"enabled": true`.
2.  **Restart Cursor** to load the updated configuration and launch the server.
3.  Done! In Cursor's MCP settings, you should see `mcp-ynab` with a green dot and the list of available tools.
4.  You can now ask the AI assistant to use the tools:
    *   "List my YNAB budgets"
    *   "Use `mcp_ynab_list_accounts` with budget_id 'last-used'"
    *   "What's the balance of my account X (ID: YYY) in budget Z?" (Might use `mcp_ynab_get_account_balance`)

## 5. Development 🧑‍💻

*   **Run server in development mode (with hot-reload):** `npm run dev`
*   **Run tests:** `npm test`
*   **Compile for production/MCP:** `npm run build`
*   **CLI Mode (Commented Out):** The logic to run commands like `node dist/server.js list-budgets` is commented out in `src/server.ts` because it interfered with Cursor's MCP server mode. You can uncomment it for local testing if needed, but remember to comment it back out and recompile for Cursor integration.

---

[![Star History Chart](https://api.star-history.com/svg?repos=bulletninja/mcp-ynab&type=Date)](https://star-history.com/#bulletninja/mcp-ynab&Date) 
