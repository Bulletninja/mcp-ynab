import { z } from "zod";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { makeYnabRequest, formatYnabError, YnabError } from "../../ynabApiUtils";
import type { Result } from "neverthrow";
import { ok, err } from "neverthrow";

// Define Zod schema for input arguments
const GetAccountBalanceArgsSchema = z.object({
    budget_id: z.string().describe("Budget ID."),
    account_id: z.string().describe("Account ID."),
});

// Define the expected structure of the API response data
// We only need the balance from the account object
const AccountResponseSchema = z.object({
    data: z.object({
        account: z.object({
            id: z.string(),
            name: z.string(),
            balance: z.number(),
            // Add other fields if needed for context or validation
        }),
    }),
});

// Define the specific success response type expected from the API endpoint
type AccountApiResponse = z.infer<typeof AccountResponseSchema>;

// Infer types from Zod schemas
type GetAccountBalanceArgs = z.infer<typeof GetAccountBalanceArgsSchema>;
type YnabAccountBalanceInfo = z.infer<typeof AccountResponseSchema.shape.data.shape.account>;

// Internal logic function
async function getAccountBalanceLogicInternal(args: GetAccountBalanceArgs): Promise<Result<YnabAccountBalanceInfo, YnabError>> {
    // Use makeYnabRequest
    const result = await makeYnabRequest<AccountApiResponse>(`/budgets/${args.budget_id}/accounts/${args.account_id}`);

    if (result.isErr()) {
        return err(result.error);
    }

    // Validate the structure of the successful response
    const parseResult = AccountResponseSchema.safeParse(result.value);
    if (!parseResult.success) {
        console.error("YNAB API Response validation error (getAccountBalance):", parseResult.error.issues);
        return err({ 
            type: 'validation', 
            message: 'YNAB API response validation failed.', 
            issues: parseResult.error.issues, 
            originalError: parseResult.error 
        });
    }

    return ok(parseResult.data.data.account);
}

// MCP Tool Handler / CLI function
async function getAccountBalanceHandler(args: GetAccountBalanceArgs) {
    const result = await getAccountBalanceLogicInternal(args);

    if (result.isOk()) {
        const account = result.value;
        // Convert milliunits to dollars/euros/etc.
        const balance = (account.balance / 1000).toFixed(2);
        return { content: [{ type: "text" as const, text: `Account: ${account.name} (ID: ${account.id})\nBalance: ${balance}` }] };
    } else {
        return formatYnabError(result.error, "getAccountBalance");
    }
}

// Export the tool definition
export const getAccountBalanceTool = {
    name: "mcp_ynab_get_account_balance",
    schema: GetAccountBalanceArgsSchema,
    handler: getAccountBalanceHandler
}; 