import { z } from "zod";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { makeYnabRequest, formatYnabError, YnabError } from "../../ynabApiUtils";
import type { Result } from "neverthrow";
import { ok, err } from "neverthrow";

// Define Zod schema for input arguments
const CreateTransactionArgsSchema = z.object({
    budget_id: z.string().describe("Budget ID."),
    account_id: z.string().describe("Account ID."),
    amount: z.number().int().describe("Amount in **milliunits** (integer, e.g., $12.34 = 12340. Negative for outflow)."),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD").describe("Transaction date (YYYY-MM-DD)."),
    payee_name: z.string().max(50).optional().describe("Payee name (max 50 chars)."),
    category_id: z.string().uuid().optional().describe("Category ID (UUID format). Use mcp_ynab_list_categories to find IDs."),
    memo: z.string().max(200).optional().describe("Optional memo (max 200 chars)."),
    cleared: z.enum(['cleared', 'uncleared', 'reconciled']).optional().describe("Cleared status."),
    approved: z.boolean().optional().describe("Approved status."),
    // Add other transaction fields like flag_color if needed
});

// Define the expected structure for the response (might vary based on single vs multiple)
const CreateTransactionResponseSchema = z.object({
    data: z.object({
        transaction_ids: z.array(z.string()).optional(),
        transaction: z.object({ id: z.string() }).optional(), // For single transaction creation
        duplicate_import_ids: z.array(z.string()).optional(),
        server_knowledge: z.number().optional(),
    }),
});

// Define the specific success response type expected from the API endpoint
type CreateTransactionApiResponse = z.infer<typeof CreateTransactionResponseSchema>;

// Infer types from Zod schemas
type CreateTransactionArgs = z.infer<typeof CreateTransactionArgsSchema>;

// Internal logic function
async function createTransactionLogicInternal(args: CreateTransactionArgs): Promise<Result<{ createdTransactionId: string }, YnabError>> {
    const { budget_id, ...transactionData } = args;
    const endpoint = `/budgets/${budget_id}/transactions`;
    const payload = { transaction: transactionData }; // YNAB API expects the data nested under 'transaction'

    // Use makeYnabRequest with POST method and payload
    const result = await makeYnabRequest<CreateTransactionApiResponse>(endpoint, { method: 'POST' }, payload);

    if (result.isErr()) {
        return err(result.error);
    }

    // Handle potentially null response (e.g., if API returns 204 on success sometimes)
    if (!result.value) {
        console.error("Received null or empty response from createTransaction endpoint");
        return err({
            type: 'api', // Or 'unknown'?
            message: 'Received empty response from YNAB API after creating transaction.',
        });
    }

    // Validate the structure of the successful response
    const parseResult = CreateTransactionResponseSchema.safeParse(result.value);
    if (!parseResult.success) {
        console.error("YNAB API Response validation error (createTransaction):", parseResult.error.issues);
        return err({ 
            type: 'validation', 
            message: 'YNAB API response validation failed.', 
            issues: parseResult.error.issues, 
            originalError: parseResult.error 
        });
    }

    const responseData = parseResult.data.data;
    const createdTransactionId = responseData.transaction_ids?.[0] || responseData.transaction?.id;

    if (!createdTransactionId) {
            console.error("Could not extract transaction ID from response:", responseData);
            return err({ 
                type: 'parse', // Treat as parsing issue
                message: 'Could not find created transaction ID in YNAB response.',
                originalError: responseData // Include the data we got for context
            });
    }

    return ok({ createdTransactionId });
}

// MCP Tool Handler / CLI function
async function createTransactionHandler(args: CreateTransactionArgs) {
    const result = await createTransactionLogicInternal(args);

    if (result.isOk()) {
        const { createdTransactionId } = result.value;
        return { content: [{ type: "text" as const, text: `Transaction created successfully. ID: ${createdTransactionId}` }] };
    } else {
        return formatYnabError(result.error, "createTransaction");
    }
}

// Export the tool definition
export const createTransactionTool = {
    name: "mcp_ynab_create_transaction",
    schema: CreateTransactionArgsSchema,
    handler: createTransactionHandler
}; 