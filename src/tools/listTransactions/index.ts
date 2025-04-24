import { z } from "zod";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { makeYnabRequest, formatYnabError, YnabError } from "../../ynabApiUtils";
import type { Result } from "neverthrow";
import { ok, err } from "neverthrow";

// Define Zod schema for input arguments
const ListTransactionsArgsSchema = z.object({
    budget_id: z.string().describe("The ID of the budget (e.g., 'last-used' or UUID)."),
    account_id: z.string().optional().describe("Filter by Account ID (optional)."),
    since_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD").optional().describe("Include transactions since this date (YYYY-MM-DD, optional)."),
    type: z.enum(['uncategorized', 'unapproved']).optional().describe("Filter by type: 'uncategorized' or 'unapproved' (optional)."),
    last_knowledge_of_server: z.number().optional().describe("Delta request token (optional).")
});

// Define the expected structure of the API response data
const TransactionDetailSchema = z.object({
    id: z.string(),
    date: z.string(),
    amount: z.number(),
    memo: z.string().nullable().optional(),
    cleared: z.string(), // Consider z.enum(['cleared', 'uncleared', 'reconciled'])
    approved: z.boolean(),
    flag_color: z.string().nullable().optional(), // Consider z.enum
    account_id: z.string(),
    payee_id: z.string().nullable().optional(),
    category_id: z.string().nullable().optional(),
    transfer_account_id: z.string().nullable().optional(),
    transfer_transaction_id: z.string().nullable().optional(),
    matched_transaction_id: z.string().nullable().optional(),
    import_id: z.string().nullable().optional(),
    import_payee_name: z.string().nullable().optional(),
    import_payee_name_original: z.string().nullable().optional(),
    debt_transaction_type: z.string().nullable().optional(), // Consider z.enum
    deleted: z.boolean(),
    account_name: z.string(),
    payee_name: z.string().nullable().optional(),
    category_name: z.string().nullable().optional(),
    subtransactions: z.array(z.object({ /* Define if needed */ })).optional(), // Define subtransaction structure if needed
});

const ListTransactionsResponseSchema = z.object({
    data: z.object({
        transactions: z.array(TransactionDetailSchema),
        server_knowledge: z.number().optional(),
    }),
});

// Define the specific success response type expected from the API endpoint
type TransactionsApiResponse = z.infer<typeof ListTransactionsResponseSchema>;

// Infer types from Zod schemas
type ListTransactionsArgs = z.infer<typeof ListTransactionsArgsSchema>;
type YnabTransaction = z.infer<typeof TransactionDetailSchema>;

// Internal logic function
async function listTransactionsLogicInternal(args: ListTransactionsArgs): Promise<Result<{ transactions: YnabTransaction[], serverKnowledge?: number }, YnabError>> {
    const { budget_id, account_id, since_date, type, last_knowledge_of_server } = args;
    
    const endpoint = account_id
        ? `/budgets/${budget_id}/accounts/${account_id}/transactions`
        : `/budgets/${budget_id}/transactions`;

    const params = new URLSearchParams();
    if (since_date) {
        params.set('since_date', since_date);
    }
    if (type) {
        params.set('type', type);
    }
    if (last_knowledge_of_server) {
        params.set('last_knowledge_of_server', last_knowledge_of_server.toString());
    }
    const queryString = params.toString();
    const fullEndpoint = queryString ? `${endpoint}?${queryString}` : endpoint;

    // Use makeYnabRequest
    const result = await makeYnabRequest<TransactionsApiResponse>(fullEndpoint, { method: 'GET' });

    if (result.isErr()) {
        return err(result.error);
    }

    // Validate the structure of the successful response
    const parseResult = ListTransactionsResponseSchema.safeParse(result.value); 
    if (!parseResult.success) {
        console.error("YNAB API Response validation error (listTransactions):", parseResult.error.issues);
        return err({ 
            type: 'validation', 
            message: 'YNAB API response validation failed.', 
            issues: parseResult.error.issues, 
            originalError: parseResult.error 
        });
    }

    const responseData = parseResult.data.data;
    return ok({
        transactions: responseData.transactions,
        serverKnowledge: responseData.server_knowledge
    });
}

// MCP Tool Handler / CLI function
async function listTransactionsHandler(args: ListTransactionsArgs) {
    const result = await listTransactionsLogicInternal(args);

    if (result.isOk()) {
        const { transactions } = result.value;
        if (transactions.length === 0) {
            return { content: [{ type: "text" as const, text: "No transactions found matching the criteria." }] };
        }
        const transactionList = transactions
            .map((t: YnabTransaction) => `- ${t.date} | ${t.payee_name || 'N/A'} | ${t.category_name || 'N/A'} | ${(t.amount / 1000).toFixed(2)} (ID: ${t.id})`)
            .join('\n');
        return { content: [{ type: "text" as const, text: `Transactions:\n${transactionList}` }] };
    } else {
        return formatYnabError(result.error, "listTransactions");
    }
}

// Export the tool definition
export const listTransactionsTool = {
    name: "mcp_ynab_list_transactions",
    schema: ListTransactionsArgsSchema,
    handler: listTransactionsHandler
}; 