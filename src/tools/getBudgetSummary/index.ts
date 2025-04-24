import { z } from "zod";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { makeYnabRequest, formatYnabError, YnabError } from "../../ynabApiUtils";
import type { Result } from "neverthrow";
import { ok, err } from "neverthrow";

// Define Zod schema for input arguments
const GetBudgetSummaryArgsSchema = z.object({
    budget_id: z.string().describe("Budget ID."),
    month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD").optional()
        .describe("Month to get summary for (YYYY-MM-DD). Defaults to current month."),
});

// Define the expected structure for the budget month summary
const CategorySchema = z.object({ // Reusing Category definition might be better if available
    id: z.string(),
    category_group_id: z.string(),
    name: z.string(),
    hidden: z.boolean(),
    original_category_group_id: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
    budgeted: z.number(),
    activity: z.number(),
    balance: z.number(),
    goal_type: z.string().nullable().optional(),
    goal_creation_month: z.string().nullable().optional(),
    goal_target: z.number(),
    goal_target_month: z.string().nullable().optional(),
    goal_percentage_complete: z.number().nullable().optional(),
    deleted: z.boolean(),
    // ... other category fields if needed
});

const BudgetMonthSchema = z.object({
    month: z.string(), // YYYY-MM-DD format
    note: z.string().nullable().optional(),
    income: z.number(),
    budgeted: z.number(),
    activity: z.number(),
    to_be_budgeted: z.number(),
    age_of_money: z.number().nullable().optional(),
    deleted: z.boolean(),
    categories: z.array(CategorySchema),
});

const GetBudgetSummaryResponseSchema = z.object({
    data: z.object({
        month: BudgetMonthSchema,
        // server_knowledge might be here too
    }),
});

// Define the specific success response type expected from the API endpoint
type BudgetSummaryApiResponse = z.infer<typeof GetBudgetSummaryResponseSchema>;

// Infer types from Zod schemas
type GetBudgetSummaryArgs = z.infer<typeof GetBudgetSummaryArgsSchema>;
type YnabBudgetMonth = z.infer<typeof BudgetMonthSchema>;

// Internal logic function
async function getBudgetSummaryLogicInternal(args: GetBudgetSummaryArgs): Promise<Result<YnabBudgetMonth, YnabError>> {
    const monthParam = args.month ?? 'current'; // Use provided month or default to 'current'
    const endpoint = `/budgets/${args.budget_id}/months/${monthParam}`;
    // Use makeYnabRequest
    const result = await makeYnabRequest<BudgetSummaryApiResponse>(endpoint); // Use dynamic endpoint

    if (result.isErr()) {
        return err(result.error);
    }

    // Validate the structure of the successful response
    const parseResult = GetBudgetSummaryResponseSchema.safeParse(result.value);
    if (!parseResult.success) {
        console.error("YNAB API Response validation error (getBudgetSummary):", parseResult.error.issues);
        return err({ 
            type: 'validation', 
            message: 'YNAB API response validation failed.', 
            issues: parseResult.error.issues, 
            originalError: parseResult.error 
        });
    }

    return ok(parseResult.data.data.month);
}

// Helper to format currency
const formatCurrency = (value: number) => (value / 1000).toFixed(2);

// MCP Tool Handler / CLI function
async function getBudgetSummaryHandler(args: GetBudgetSummaryArgs) {
    const result = await getBudgetSummaryLogicInternal(args);

    if (result.isOk()) {
        const monthData = result.value;
        const summary = `
Budget Summary for Month: ${monthData.month}
-----------------------------------
Income: ${formatCurrency(monthData.income)}
Budgeted: ${formatCurrency(monthData.budgeted)}
Activity (Spending): ${formatCurrency(monthData.activity)}
To Be Budgeted (TBB): ${formatCurrency(monthData.to_be_budgeted)}
Age of Money (Days): ${monthData.age_of_money ?? 'N/A'}
${monthData.note ? `\nNote: ${monthData.note}` : ''}
        `.trim();
        // Optionally include category details if desired
        // const categoryDetails = monthData.categories.map(c => ...).join('\n');
        return { content: [{ type: "text" as const, text: summary }] };
    } else {
        // Use formatYnabError for ALL errors
        return formatYnabError(result.error, "getBudgetSummary"); 
    }
}

// Export the tool definition
export const getBudgetSummaryTool = {
    name: "mcp_ynab_get_budget_summary",
    schema: GetBudgetSummaryArgsSchema,
    handler: getBudgetSummaryHandler
}; 