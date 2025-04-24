import { z } from "zod";
import { makeYnabRequest, formatYnabError, YnabError } from "../../ynabApiUtils";
import { err, ok, Result } from 'neverthrow';

// Define Zod schema for input arguments
const ListAccountsArgsSchema = z.object({
    budget_id: z.string().describe("Budget ID."),
});

// Define the expected structure of the API response data
const AccountSchema = z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(), // Consider z.enum for known account types
    on_budget: z.boolean(),
    closed: z.boolean(),
    note: z.string().nullable().optional(),
    balance: z.number(), // Milliunits
    cleared_balance: z.number(), // Milliunits
    uncleared_balance: z.number(), // Milliunits
    transfer_payee_id: z.string().nullable().optional(),
    direct_import_linked: z.boolean().optional(),
    direct_import_in_error: z.boolean().optional(),
    last_reconciled_at: z.string().nullable().optional(), // ISO Date string
    debt_original_balance: z.number().nullable().optional(), // Milliunits
    debt_interest_rates: z.record(z.number()).optional(), 
    debt_minimum_payments: z.record(z.number()).optional(),
    debt_escrow_amounts: z.record(z.number()).optional(),
    deleted: z.boolean(),
});

const ListAccountsResponseSchema = z.object({
    data: z.object({
        accounts: z.array(AccountSchema),
        server_knowledge: z.number().optional(),
    }),
});

// Define the specific success response type expected from the API endpoint
type AccountsApiResponse = z.infer<typeof ListAccountsResponseSchema>;

// Infer types from Zod schemas
type ListAccountsArgs = z.infer<typeof ListAccountsArgsSchema>;
type YnabAccount = z.infer<typeof AccountSchema>;

// Internal logic function
async function listAccountsLogicInternal(args: ListAccountsArgs): Promise<Result<{ accounts: YnabAccount[], serverKnowledge?: number }, YnabError>> {
    // Use makeYnabRequest
    const result = await makeYnabRequest<AccountsApiResponse>(`/budgets/${args.budget_id}/accounts`);

    if (result.isErr()) {
        return err(result.error);
    }

    // Validate the structure of the successful response
    const parseResult = ListAccountsResponseSchema.safeParse(result.value);
    if (!parseResult.success) {
        console.error("YNAB API Response validation error (listAccounts):", parseResult.error.issues);
        return err({ 
            type: 'validation', 
            message: 'YNAB API response validation failed.', 
            issues: parseResult.error.issues, 
            originalError: parseResult.error 
        });
    }

    const responseData = parseResult.data.data;
    return ok({
        accounts: responseData.accounts,
        serverKnowledge: responseData.server_knowledge
    });
}

// MCP Tool Handler / CLI function
async function listAccountsHandler(args: ListAccountsArgs) {
    const result = await listAccountsLogicInternal(args);

    if (result.isOk()) {
        const { accounts } = result.value;
        // Filter out closed accounts
        const openAccounts = accounts.filter(acc => !acc.closed);

        if (openAccounts.length === 0) {
            return { content: [{ type: "text" as const, text: "No open accounts found for this budget." }] };
        }
        const accountList = openAccounts
            .map((acc: YnabAccount) => `- ${acc.name} (Type: ${acc.type}, Balance: ${(acc.balance / 1000).toFixed(2)}, ID: ${acc.id})`)
            .join('\n');
        return { content: [{ type: "text" as const, text: `Open Accounts:\n${accountList}` }] };
    } else {
        return formatYnabError(result.error, "listAccounts");
    }
}

// Export the tool definition
export const listAccountsTool = {
    name: "mcp_ynab_list_accounts",
    schema: ListAccountsArgsSchema,
    handler: listAccountsHandler
}; 