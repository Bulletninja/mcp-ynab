import { getBudgetSummaryTool } from './index';
import { formatYnabError, YnabError } from '../../ynabApiUtils';
import { z } from 'zod';
import { ok, err, Result } from 'neverthrow';

// Mock the ynabApiUtils module, specifically formatYnabError
jest.mock('../../ynabApiUtils', () => ({
  ...jest.requireActual('../../ynabApiUtils'),
  makeYnabRequest: jest.fn(), // Mock makeYnabRequest as it's now used internally
  formatYnabError: jest.fn((error: YnabError | Error, toolName: string) => {
    return { content: [{ type: "text" as const, text: `YNAB API Error: ${error.message || 'Unknown error'}` }], isError: true };
  }),
}));

// Import the mocked function type
import { makeYnabRequest } from '../../ynabApiUtils';
const mockedMakeYnabRequest = makeYnabRequest as jest.Mock;

describe('mcp_ynab_get_budget_summary Tool', () => {
  const { handler, schema } = getBudgetSummaryTool;
  const budgetId = 'test-budget-id';
  
  // Define mock month summaries
  const mockCurrentMonthSummary = {
    month: '2024-07-01', // Represents current month
    note: 'Current month note',
    income: 5000000,
    budgeted: 4500000,
    activity: -3000000,
    to_be_budgeted: 500000,
    age_of_money: 30,
    deleted: false,
    categories: [],
  };
  const mockSpecificMonthSummary = {
    month: '2024-06-01', // Represents a specific past month
    note: 'June budget note',
    income: 5200000,
    budgeted: 4800000,
    activity: -3500000,
    to_be_budgeted: 700000,
    age_of_money: 25,
    deleted: false,
    categories: [],
  };

  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockedMakeYnabRequest.mockClear();
    (formatYnabError as jest.Mock).mockClear();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('should get budget summary for CURRENT month when month is not specified', async () => {
    const args = { budget_id: budgetId };
    const expectedEndpoint = `/budgets/${budgetId}/months/current`;
    const mockApiResponse = { data: { month: mockCurrentMonthSummary } };
    mockedMakeYnabRequest.mockResolvedValue(ok(mockApiResponse));

    const result = await handler(args);

    expect(mockedMakeYnabRequest).toHaveBeenCalledWith(expectedEndpoint);
    const expectedText = 
`Budget Summary for Month: 2024-07-01
-----------------------------------
Income: 5000.00
Budgeted: 4500.00
Activity (Spending): -3000.00
To Be Budgeted (TBB): 500.00
Age of Money (Days): 30

Note: Current month note`;
    expect(result).toEqual({ content: [{ type: 'text', text: expectedText.trim() }] });
    expect(formatYnabError).not.toHaveBeenCalled();
  });

  it('should get budget summary for a SPECIFIC month when month is specified', async () => {
    const specificMonth = '2024-06-01';
    const args = { budget_id: budgetId, month: specificMonth };
    const expectedEndpoint = `/budgets/${budgetId}/months/${specificMonth}`;
    const mockApiResponse = { data: { month: mockSpecificMonthSummary } };
    mockedMakeYnabRequest.mockResolvedValue(ok(mockApiResponse));

    const result = await handler(args);

    expect(mockedMakeYnabRequest).toHaveBeenCalledWith(expectedEndpoint);
    const expectedText = 
`Budget Summary for Month: 2024-06-01
-----------------------------------
Income: 5200.00
Budgeted: 4800.00
Activity (Spending): -3500.00
To Be Budgeted (TBB): 700.00
Age of Money (Days): 25

Note: June budget note`;
    expect(result).toEqual({ content: [{ type: 'text', text: expectedText.trim() }] });
    expect(formatYnabError).not.toHaveBeenCalled();
  });

  it('should handle null age_of_money and null note gracefully', async () => {
    const args = { budget_id: budgetId };
    const expectedEndpoint = `/budgets/${budgetId}/months/current`;
    const mockMonthSummaryNoAom = { ...mockCurrentMonthSummary, age_of_money: null, note: null }; 
    const mockApiResponseNoAom = { data: { month: mockMonthSummaryNoAom } };
    mockedMakeYnabRequest.mockResolvedValue(ok(mockApiResponseNoAom));

    const result = await handler(args);

    expect(mockedMakeYnabRequest).toHaveBeenCalledWith(expectedEndpoint);
    const expectedText = 
`Budget Summary for Month: 2024-07-01
-----------------------------------
Income: 5000.00
Budgeted: 4500.00
Activity (Spending): -3000.00
To Be Budgeted (TBB): 500.00
Age of Money (Days): N/A`; // Note is implicitly excluded by trim()
    expect(result).toEqual({ content: [{ type: 'text', text: expectedText.trim() }] });
    expect(formatYnabError).not.toHaveBeenCalled();
  });

  it('should handle YNAB API errors gracefully', async () => {
    const args = { budget_id: budgetId };
    const expectedEndpoint = `/budgets/${budgetId}/months/current`;
    const apiError: YnabError = {
      type: 'api',
      status: 403,
      detail: 'Forbidden',
      message: 'Forbidden',
      originalError: { error: { id: '403', name: 'forbidden', detail: 'Forbidden' } }
    };
    mockedMakeYnabRequest.mockResolvedValue(err(apiError));

    const result = await handler(args);

    expect(mockedMakeYnabRequest).toHaveBeenCalledWith(expectedEndpoint);
    expect(formatYnabError).toHaveBeenCalledWith(apiError, 'getBudgetSummary');
    expect(result).toEqual({ content: [{ type: 'text', text: 'YNAB API Error: Forbidden' }], isError: true });
  });

  it('should handle validation errors if API response is malformed', async () => {
     const args = { budget_id: budgetId };
    const expectedEndpoint = `/budgets/${budgetId}/months/current`;
    const malformedData = { data: { /* month missing */ } };
    // Use ok() here, as the internal logic will fail validation later
    mockedMakeYnabRequest.mockResolvedValue(ok(malformedData)); 
    
    // Mock formatYnabError implementation for this specific test case
    (formatYnabError as jest.Mock).mockImplementationOnce(() => ({
         content: [{ type: 'text', text: 'YNAB API Error: YNAB API response validation failed.' }],
         isError: true
    }));
    
    const result = await handler(args);

    expect(mockedMakeYnabRequest).toHaveBeenCalledWith(expectedEndpoint);
    expect(formatYnabError).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'validation' }), // Check for validation error type
      'getBudgetSummary'
    );
    // Check the final output based on the mocked formatYnabError
     expect(result).toEqual({ content: [{ type: 'text', text: 'YNAB API Error: YNAB API response validation failed.' }], isError: true });
  });

  it('should handle network errors gracefully', async () => {
    const args = { budget_id: budgetId };
    const expectedEndpoint = `/budgets/${budgetId}/months/current`;
    const networkError: YnabError = { type: 'network', message: 'Server unreachable', originalError: new Error('Server unreachable') };
    mockedMakeYnabRequest.mockResolvedValue(err(networkError));

    const result = await handler(args);

    expect(mockedMakeYnabRequest).toHaveBeenCalledWith(expectedEndpoint);
    expect(formatYnabError).toHaveBeenCalledWith(networkError, 'getBudgetSummary');
    expect(result).toEqual({ content: [{ type: 'text', text: 'YNAB API Error: Server unreachable' }], isError: true });
  });
}); 