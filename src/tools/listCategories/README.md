# Tool: listCategories

## Purpose & Usage Context

Fetches a list of categories associated with a specific budget. Useful for getting `categoryId` values needed for other tools like `getCategoryInfo` or `createTransaction`. It supports delta requests using `last_knowledge_of_server` to fetch only changes since the last call for the specified budget.

## Key Arguments

*   `budget_id` (string, required): The ID of the budget for which to list categories.
*   `last_knowledge_of_server` (number, optional): The `serverKnowledge` value returned from a previous call for the *same budget*. If provided, only changes since that point are returned.

## Key Output

Returns an object containing:

*   `content`: An array of category group objects, each containing an array of its categories. Categories typically include `id`, `name`, `budgeted`, `activity`, `balance`, `goal_type`, and `deleted` status.
*   `serverKnowledge` (number): The current server knowledge value for this budget's categories. Pass this in `last_knowledge_of_server` on subsequent calls for the *same budget*.

*(Refer to the YNAB API documentation or tool schema for the full list of fields. Note the nested structure: groups contain categories).*

## Simplified Flow

```mermaid
graph LR
    A["Input: {budget_id, last_knowledge_of_server?}"] --> B(Tool: listCategories);
    B --> C{YNAB API: GET /budgets/.../categories};
    C --> D("Output: {content: [...category_groups_with_categories], serverKnowledge}");
```