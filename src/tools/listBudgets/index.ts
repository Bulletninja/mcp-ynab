import { z } from "zod";
import { makeYnabRequest, formatYnabError, YnabError } from "../../ynabApiUtils";
import { err, ok, Result } from 'neverthrow';

// --- Raw API Response Type Definitions ---
interface RawBudgetDateFormat {
  format: string;
}

interface RawBudgetCurrencyFormat {
  iso_code: string;
}

interface RawBudget {
  id: string;
  name: string;
  last_modified_on?: string | null;
  first_month?: string | null;
  last_month?: string | null;
  date_format?: RawBudgetDateFormat | null;
  currency_format?: RawBudgetCurrencyFormat | null;
}

interface RawBudgetsApiResponse {
  data: {
    budgets: RawBudget[];
    default_budget?: any | null; // Keep as any or define if needed
    server_knowledge: number;
  };
}
// --- End Raw API Response Type Definitions ---

// Define Zod schema for optional input arguments
const ListBudgetsArgsSchema = z.object({
  last_knowledge_of_server: z.number().optional().describe("The server knowledge for delta requests. Optional."),
}); // Make the whole object optional

// Define the expected structure of the API response data for budgets using Zod
// Should align with RawBudgetsApiResponse
const BudgetsResponseSchema = z.object({
  data: z.object({
    budgets: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        last_modified_on: z.string().nullable().optional(),
        first_month: z.string().nullable().optional(),
        last_month: z.string().nullable().optional(),
        date_format: z.object({ format: z.string() }).nullable().optional(),
        currency_format: z.object({ iso_code: z.string() }).nullable().optional(),
      })
    ),
    default_budget: z.any().nullable().optional(),
    server_knowledge: z.number().optional(),
  }),
});

// Define the Zod-inferred type (used AFTER validation)
// type BudgetsApiResponse = z.infer<typeof BudgetsResponseSchema>; 

// Infer the validated budget type from the schema
type YnabBudget = z.infer<typeof BudgetsResponseSchema.shape.data.shape.budgets.element>;

// Infer args type
type ListBudgetsArgs = z.infer<typeof ListBudgetsArgsSchema>;

// Type for the successful result including server knowledge
type ListBudgetsResult = {
  budgets: YnabBudget[];
  serverKnowledge?: number;
}

// Internal logic function updated for delta requests
async function listBudgetsLogicInternal(args?: ListBudgetsArgs): Promise<Result<ListBudgetsResult, YnabError>> {
  let endpoint = "/budgets";
  if (args?.last_knowledge_of_server) {
    endpoint += `?last_knowledge_of_server=${args.last_knowledge_of_server}`;
  }

  // Use makeYnabRequest with the Raw API Response Type
  const result = await makeYnabRequest<RawBudgetsApiResponse>(endpoint);

  if (result.isErr()) {
    return err(result.error);
  }
  
  // result.value is now typed as RawBudgetsApiResponse | null
  if (!result.value) {
     return err({ type: 'unknown', message: 'Received null response from makeYnabRequest' });
  }

  // Validate the raw structure using Zod
  console.log('[listBudgetsLogicInternal] Raw API response received:', JSON.stringify(result.value, null, 2)); // DEBUG: Log raw response
  const parseResult = BudgetsResponseSchema.safeParse(result.value); 
  if (!parseResult.success) {
    console.error("\n--- ZOD VALIDATION FAILURE START ---");
    console.error("Tool: listBudgets");
    console.error("Reason:", parseResult.error.message);
    console.error("Detailed Issues:", JSON.stringify(parseResult.error.issues, null, 2));
    console.error("Raw Response that failed validation:", JSON.stringify(result.value, null, 2)); 
    console.error("--- ZOD VALIDATION FAILURE END ---\n");
    // Pass the raw value that failed validation
    return err({ 
        type: 'validation',
        message: 'YNAB API response validation failed.', 
        issues: parseResult.error.issues, 
        originalError: result.value 
    });
  }
  
  // Return the validated data including server knowledge
  // parseResult.data is typed according to BudgetsResponseSchema
  return ok({
    budgets: parseResult.data.data.budgets,
    serverKnowledge: parseResult.data.data.server_knowledge,
  });
}

// MCP Tool Handler / CLI function - updated for args and serverKnowledge
async function listBudgetsHandler(args?: ListBudgetsArgs) {
    const result = await listBudgetsLogicInternal(args); 

    if (result.isOk()) {
        const { budgets, serverKnowledge } = result.value;
        let outputText = "";
        if (budgets.length === 0) {
            outputText = "No new or updated budgets found since last knowledge.";
        } else {
          const budgetList = budgets.map((b: YnabBudget) => `- ${b.name} (ID: ${b.id})`).join('\n');
          outputText = `Available Budgets:\n${budgetList}`;
        }
        // Return content and serverKnowledge
        return { 
            content: [{ type: "text" as const, text: outputText }],
            serverKnowledge // Include server knowledge in the response
        };
    } else {
        return formatYnabError(result.error, "listBudgets"); 
    }
}

// Export the tool definition
export const listBudgetsTool = {
    name: "mcp_ynab_list_budgets",
    schema: undefined,
    handler: listBudgetsHandler
}; 