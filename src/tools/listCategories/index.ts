import { z } from "zod";
import { makeYnabRequest, formatYnabError, YnabError } from "../../ynabApiUtils";
import { err, ok, Result } from 'neverthrow';

// --- Raw API Response Type Definitions ---
interface RawCategory {
    id: string;
    category_group_id: string;
    category_group_name: string; // Note: Included based on the API documentation
    name: string;
    hidden: boolean;
    original_category_group_id?: string | null;
    note?: string | null;
    budgeted: number;
    activity: number;
    balance: number;
    goal_type?: string | null; // Consider specific string literals
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

interface RawCategoryGroup {
    id: string;
    name: string;
    hidden: boolean;
    deleted: boolean;
    categories: RawCategory[];
}

interface RawCategoriesApiResponse {
    data: {
        category_groups: RawCategoryGroup[];
        server_knowledge: number;
    };
}
// --- End Raw API Response Type Definitions ---

// Define Zod schema for input arguments
const ListCategoriesArgsSchema = z.object({
    budget_id: z.string().describe("Budget ID."),
    last_knowledge_of_server: z.number().optional().describe("Fetch delta since last knowledge."),
});

// Define Zod schemas based on API structure (should align with Raw types)
const CategorySchema = z.object({
    id: z.string(),
    category_group_id: z.string(),
    category_group_name: z.string(), // Ensure this is validated
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
    goal_target: z.number().nullable().optional(), // Allow null goal targets
    goal_target_month: z.string().nullable().optional(),
    goal_percentage_complete: z.number().nullable().optional(),
    goal_months_to_budget: z.number().nullable().optional(),
    goal_under_funded: z.number().nullable().optional(),
    goal_overall_funded: z.number().nullable().optional(),
    goal_overall_left: z.number().nullable().optional(),
    deleted: z.boolean(),
});

const CategoryGroupSchema = z.object({
    id: z.string(),
    name: z.string(),
    hidden: z.boolean(),
    deleted: z.boolean(),
    categories: z.array(CategorySchema),
});

const CategoriesResponseSchema = z.object({
    data: z.object({
        category_groups: z.array(CategoryGroupSchema),
        server_knowledge: z.number(),
    }),
});

// Infer validated types from Zod schemas
type YnabCategoryGroup = z.infer<typeof CategoryGroupSchema>;
type YnabCategory = z.infer<typeof CategorySchema>;

// Infer args type
type ListCategoriesArgs = z.infer<typeof ListCategoriesArgsSchema>;

// Type for the successful result
type ListCategoriesResult = {
  categoryGroups: YnabCategoryGroup[];
  serverKnowledge: number;
}

// Internal logic function
async function listCategoriesLogicInternal(args: ListCategoriesArgs): Promise<Result<ListCategoriesResult, YnabError>> {
    let endpoint = `/budgets/${args.budget_id}/categories`;
    if (args.last_knowledge_of_server) {
        endpoint += `?last_knowledge_of_server=${args.last_knowledge_of_server}`;
    }

    // Use makeYnabRequest with the Raw API Response Type
    const result = await makeYnabRequest<RawCategoriesApiResponse>(endpoint);

    if (result.isErr()) {
        return err(result.error);
    }

    if (!result.value) {
        return err({ type: 'unknown', message: 'Received null response from makeYnabRequest' });
    }

    // Validate the raw structure using Zod
    const parseResult = CategoriesResponseSchema.safeParse(result.value);
    if (!parseResult.success) {
        console.error("YNAB API Response validation error (listCategories):", parseResult.error.issues);
        return err({ 
            type: 'validation', 
            message: 'YNAB API response validation failed.', 
            issues: parseResult.error.issues, 
            originalError: result.value // Pass raw value
        });
    }

    return ok({
        categoryGroups: parseResult.data.data.category_groups,
        serverKnowledge: parseResult.data.data.server_knowledge,
    });
}

// MCP Tool Handler
async function listCategoriesHandler(args: ListCategoriesArgs) {
    const result = await listCategoriesLogicInternal(args);

    if (result.isOk()) {
        const { categoryGroups, serverKnowledge } = result.value;
        let outputText = "";

        if (categoryGroups.length === 0) {
             outputText = args.last_knowledge_of_server
                ? "No new or updated categories found since last knowledge."
                : "No categories found.";
        } else {
             const categoriesText = categoryGroups
                .filter(group => !group.hidden && !group.deleted)
                .map(group => {
                    const categoriesList = group.categories
                        .filter(cat => !cat.hidden && !cat.deleted)
                        .map(cat => `  - ${cat.name} (ID: ${cat.id})`)
                        .join('\n');
                    return categoriesList ? `${group.name}:\n${categoriesList}` : null;
                })
                .filter(Boolean) // Remove empty groups
                .join('\n\n');
            outputText = `Categories:\n\n${categoriesText}`;
        }

        return {
            content: [{ type: "text" as const, text: outputText }],
            serverKnowledge
        };
    } else {
        return formatYnabError(result.error, "listCategories");
    }
}

// Export the tool definition
export const listCategoriesTool = {
    name: "mcp_ynab_list_categories",
    schema: ListCategoriesArgsSchema,
    handler: listCategoriesHandler
}; 