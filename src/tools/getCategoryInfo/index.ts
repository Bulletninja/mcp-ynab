import { z } from "zod";
import { makeYnabRequest, formatYnabError, YnabError } from "../../ynabApiUtils";
import { err, ok, Result } from 'neverthrow';

// --- Raw API Response Type Definitions ---
// Reusing RawCategory definition (assuming structure is identical to the one in listCategories/getBudgetSummary)
interface RawCategory {
    id: string;
    category_group_id: string;
    // category_group_name might NOT be included in this specific endpoint, check API docs
    name: string;
    hidden: boolean;
    original_category_group_id?: string | null;
    note?: string | null;
    budgeted: number;
    activity: number;
    balance: number;
    goal_type?: string | null; 
    goal_day?: number | null;
    goal_cadence?: number | null;
    goal_cadence_frequency?: number | null;
    goal_creation_month?: string | null;
    goal_target?: number | null;
    goal_target_month?: string | null;
    goal_percentage_complete?: number | null;
    goal_months_to_budget?: number | null;
    goal_under_funded?: number | null;
    goal_overall_funded?: number | null;
    goal_overall_left?: number | null;
    deleted: boolean;
}

interface RawCategoryInfoApiResponse {
    data: {
        category: RawCategory;
        // server_knowledge might be here too
    };
}
// --- End Raw API Response Type Definitions ---

// Define Zod schema for input arguments
const GetCategoryInfoArgsSchema = z.object({
    budget_id: z.string().describe("Budget ID (e.g., 'last-used' or UUID)."),
    category_id: z.string().describe("Category ID (UUID)."),
    month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Month must be YYYY-MM-DD").optional().describe("Month in YYYY-MM-DD format (optional, defaults to current month)."),
});

// Define Zod schemas based on API structure (should align with Raw types)
// Reuses the schema from listCategories potentially, but ensure it matches THIS endpoint
const CategoryInfoSchema = z.object({
    id: z.string(),
    category_group_id: z.string(),
    // category_group_name: z.string().optional(), // Make optional if not guaranteed by this endpoint
    name: z.string(),
    hidden: z.boolean(),
    original_category_group_id: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
    budgeted: z.number(),
    activity: z.number(),
    balance: z.number(),
    goal_type: z.string().nullable().optional(), 
    goal_day: z.number().nullable().optional(),
    goal_cadence: z.number().nullable().optional(),
    goal_cadence_frequency: z.number().nullable().optional(),
    goal_creation_month: z.string().nullable().optional(), 
    goal_target: z.number().nullable().optional(), // Allow null 
    goal_target_month: z.string().nullable().optional(), 
    goal_percentage_complete: z.number().nullable().optional(),
    goal_months_to_budget: z.number().nullable().optional(),
    goal_under_funded: z.number().nullable().optional(),
    goal_overall_funded: z.number().nullable().optional(),
    goal_overall_left: z.number().nullable().optional(),
    deleted: z.boolean(),
});

const GetCategoryInfoResponseSchema = z.object({
    data: z.object({
        category: CategoryInfoSchema,
        // server_knowledge: z.number().optional(), // Add if supported
    }),
});

// Infer validated type
type YnabCategoryInfo = z.infer<typeof CategoryInfoSchema>;

// Infer args type
type GetCategoryInfoArgs = z.infer<typeof GetCategoryInfoArgsSchema>;

// Internal logic function
async function getCategoryInfoLogicInternal(args: GetCategoryInfoArgs): Promise<Result<YnabCategoryInfo, YnabError>> {
    const { budget_id, category_id, month = 'current' } = args;
    const endpoint = `/budgets/${budget_id}/months/${month}/categories/${category_id}`;

    // Use makeYnabRequest with the Raw API Response Type
    const result = await makeYnabRequest<RawCategoryInfoApiResponse>(endpoint);

    if (result.isErr()) {
        return err(result.error);
    }

    if (!result.value) {
        return err({ type: 'unknown', message: 'Received null response from makeYnabRequest' });
    }

    // Validate the raw structure using Zod
    const parseResult = GetCategoryInfoResponseSchema.safeParse(result.value);
    if (!parseResult.success) {
        console.error("YNAB API Response validation error (getCategoryInfo):", parseResult.error.issues);
        return err({ 
            type: 'validation', 
            message: 'YNAB API response validation failed.', 
            issues: parseResult.error.issues, 
            originalError: result.value // Pass raw value
        });
    }

    // Return the validated category data
    return ok(parseResult.data.data.category);
}

// Helper to format currency
const formatCurrency = (value: number) => (value / 1000).toFixed(2);

// MCP Tool Handler - remains the same
async function getCategoryInfoHandler(args: GetCategoryInfoArgs) {
    const result = await getCategoryInfoLogicInternal(args);

    if (result.isOk()) {
        const cat = result.value;
        const info = `
Category Info: ${cat.name} (ID: ${cat.id})
----------------------------------------
Budgeted: ${formatCurrency(cat.budgeted)}
Activity: ${formatCurrency(cat.activity)}
Balance: ${formatCurrency(cat.balance)}
Goal Type: ${cat.goal_type || 'N/A'}
Goal Target: ${formatCurrency(cat.goal_target ?? 0)}
Goal Percentage Complete: ${cat.goal_percentage_complete ?? 'N/A'}%
${cat.note ? `Note: ${cat.note}` : ''}
        `.trim();
        return { content: [{ type: "text" as const, text: info }] };
    } else {
        return formatYnabError(result.error, "getCategoryInfo");
    }
}

// Export the tool definition
export const getCategoryInfoTool = {
    name: "mcp_ynab_get_category_info",
    schema: GetCategoryInfoArgsSchema,
    handler: getCategoryInfoHandler
}; 