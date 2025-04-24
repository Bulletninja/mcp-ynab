import { getCategoryInfoTool } from "./index";
import { formatYnabError, YnabError } from "../../ynabApiUtils";
import { z } from "zod";
import { ok, err } from "neverthrow"; // Import ok and err

// Mock the ynabApiUtils module
jest.mock("../../ynabApiUtils", () => ({
  ...jest.requireActual("../../ynabApiUtils"),
  makeYnabRequest: jest.fn(), // Mock makeYnabRequest
  formatYnabError: jest.fn((error: YnabError | Error, toolName: string) => {
    // Keep the simple mock for formatYnabError
    return {
      content: [
        {
          type: "text" as const,
          text: `YNAB API Error: ${error.message || "Unknown error"}`,
        },
      ],
      isError: true,
    };
  }),
}));

// Import the mocked function type
import { makeYnabRequest } from "../../ynabApiUtils";
const mockedMakeYnabRequest = makeYnabRequest as jest.Mock;

describe("mcp_ynab_get_category_info Tool", () => {
  const { handler, schema } = getCategoryInfoTool;
  const budgetId = "test-budget-id";
  const categoryId = "a1b2c3d4-e5f6-7890-1234-567890abcdef";

  // Define mock categories for different months/scenarios
  const mockCurrentMonthCategory = {
    id: categoryId,
    category_group_id: "group-1",
    name: "Test Category Current",
    hidden: false,
    note: "Category note - current",
    budgeted: 200000,
    activity: -50000,
    balance: 150000,
    goal_type: "TB",
    goal_target: 300000,
    goal_percentage_complete: 50,
    deleted: false,
  };
  const mockSpecificMonthCategory = {
    id: categoryId,
    category_group_id: "group-1",
    name: "Test Category June",
    hidden: false,
    note: "Category note - June",
    budgeted: 250000,
    activity: -60000,
    balance: 190000,
    goal_type: "TB",
    goal_target: 300000,
    goal_percentage_complete: 63,
    deleted: false,
  };

  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockedMakeYnabRequest.mockClear();
    (formatYnabError as jest.Mock).mockClear();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("should get category info for CURRENT month when month is not specified", async () => {
    const args = { budget_id: budgetId, category_id: categoryId };
    const expectedEndpoint = `/budgets/${budgetId}/months/current/categories/${categoryId}`;
    const mockApiResponse = { data: { category: mockCurrentMonthCategory } };
    mockedMakeYnabRequest.mockResolvedValue(ok(mockApiResponse));

    const result = await handler(args);

    expect(mockedMakeYnabRequest).toHaveBeenCalledWith(expectedEndpoint);
    const expectedText = 
`Category Info: Test Category Current (ID: ${categoryId})
----------------------------------------
Budgeted: 200.00
Activity: -50.00
Balance: 150.00
Goal Type: TB
Goal Target: 300.00
Goal Percentage Complete: 50%
Note: Category note - current`;
    expect(result).toEqual({
      content: [{ type: "text", text: expectedText.trim() }],
    });
    expect(formatYnabError).not.toHaveBeenCalled();
  });

  it("should get category info for a SPECIFIC month when month is specified", async () => {
    const specificMonth = "2024-06-01";
    const args = {
      budget_id: budgetId,
      category_id: categoryId,
      month: specificMonth,
    };
    const expectedEndpoint = `/budgets/${budgetId}/months/${specificMonth}/categories/${categoryId}`;
    const mockApiResponse = { data: { category: mockSpecificMonthCategory } };
    mockedMakeYnabRequest.mockResolvedValue(ok(mockApiResponse));

    const result = await handler(args);

    expect(mockedMakeYnabRequest).toHaveBeenCalledWith(expectedEndpoint);
    const expectedText = 
`Category Info: Test Category June (ID: ${categoryId})
----------------------------------------
Budgeted: 250.00
Activity: -60.00
Balance: 190.00
Goal Type: TB
Goal Target: 300.00
Goal Percentage Complete: 63%
Note: Category note - June`;
    expect(result).toEqual({
      content: [{ type: "text", text: expectedText.trim() }],
    });
    expect(formatYnabError).not.toHaveBeenCalled();
  });

  it("should get category info successfully when optional fields are null", async () => {
    const args = { budget_id: budgetId, category_id: categoryId };
    const expectedEndpoint = `/budgets/${budgetId}/months/current/categories/${categoryId}`;
    const mockCategoryOptionalNull = {
      ...mockCurrentMonthCategory, // Use current month as base
      name: "Test Category Optional Null", // Different name for clarity
      note: null,
      goal_type: null,
      goal_target: 0,
      goal_percentage_complete: null,
    };
    const mockApiResponseOptionalNull = {
      data: { category: mockCategoryOptionalNull },
    };
    mockedMakeYnabRequest.mockResolvedValue(ok(mockApiResponseOptionalNull));

    const result = await handler(args);

    expect(mockedMakeYnabRequest).toHaveBeenCalledWith(expectedEndpoint);
    const expectedText = 
`Category Info: Test Category Optional Null (ID: ${categoryId})
----------------------------------------
Budgeted: 200.00
Activity: -50.00
Balance: 150.00
Goal Type: N/A
Goal Target: 0.00
Goal Percentage Complete: N/A%`;
    expect(result).toEqual({
      content: [{ type: "text", text: expectedText.trim() }],
    });
    expect(formatYnabError).not.toHaveBeenCalled();
  });

  it("should handle YNAB API errors gracefully (e.g., category not found)", async () => {
    const args = { budget_id: budgetId, category_id: categoryId };
    const expectedEndpoint = `/budgets/${budgetId}/months/current/categories/${categoryId}`;
    const apiError: YnabError = {
      type: "api",
      status: 404,
      detail: "Category not found.",
      message: "Category not found.", // No prefix needed here
      originalError: {
        error: { id: "404", name: "not_found", detail: "Category not found." },
      },
    };
    mockedMakeYnabRequest.mockResolvedValue(err(apiError));

    const result = await handler(args);

    expect(mockedMakeYnabRequest).toHaveBeenCalledWith(expectedEndpoint);
    expect(formatYnabError).toHaveBeenCalledWith(apiError, "getCategoryInfo");
    expect(result).toEqual({
      content: [{ type: "text", text: "YNAB API Error: Category not found." }],
      isError: true,
    });
  });

  it("should handle validation errors if API response is malformed", async () => {
    const args = { budget_id: budgetId, category_id: categoryId };
    const expectedEndpoint = `/budgets/${budgetId}/months/current/categories/${categoryId}`;
    const malformedData = {
      data: {
        /* category missing */
      },
    };
    mockedMakeYnabRequest.mockResolvedValue(ok(malformedData));

    // Mock formatYnabError implementation for this specific test case
    (formatYnabError as jest.Mock).mockImplementationOnce(() => ({
      content: [
        {
          type: "text",
          text: "YNAB API Error: YNAB API response validation failed.",
        },
      ],
      isError: true,
    }));

    const result = await handler(args);

    expect(mockedMakeYnabRequest).toHaveBeenCalledWith(expectedEndpoint);
    expect(formatYnabError).toHaveBeenCalledWith(
      expect.objectContaining({ type: "validation" }),
      "getCategoryInfo"
    );
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "YNAB API Error: YNAB API response validation failed.",
        },
      ],
      isError: true,
    });
  });

  it("should handle network errors gracefully", async () => {
    const args = { budget_id: budgetId, category_id: categoryId };
    const expectedEndpoint = `/budgets/${budgetId}/months/current/categories/${categoryId}`;
    const networkError: YnabError = {
      type: "network",
      message: "Timeout",
      originalError: new Error("Timeout"),
    };
    mockedMakeYnabRequest.mockResolvedValue(err(networkError));

    const result = await handler(args);

    expect(mockedMakeYnabRequest).toHaveBeenCalledWith(expectedEndpoint);
    expect(formatYnabError).toHaveBeenCalledWith(
      networkError,
      "getCategoryInfo"
    );
    expect(result).toEqual({
      content: [{ type: "text", text: "YNAB API Error: Timeout" }],
      isError: true,
    });
  });
});
