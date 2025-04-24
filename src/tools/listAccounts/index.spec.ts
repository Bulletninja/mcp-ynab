// Import the tool and utilities
import { listAccountsTool } from './index';
import { formatYnabError, YnabError } from '../../ynabApiUtils';
import { z } from 'zod';

// Mock the ynabApiUtils module, specifically formatYnabError
jest.mock('../../ynabApiUtils', () => ({
  ...jest.requireActual('../../ynabApiUtils'),
  formatYnabError: jest.fn((error: YnabError | Error, toolName: string) => {
    return { content: [{ type: "text" as const, text: `YNAB API Error: ${error.message || 'Unknown error'}` }], isError: true };
  }),
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Helper to create mock fetch responses
const createMockResponse = (body: any, ok: boolean, status: number = 200) => {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
};

describe('mcp_ynab_list_accounts Tool', () => {
  const { handler, schema } = listAccountsTool;
  const budgetId = 'test-budget-id';
  const args = { budget_id: budgetId };
  const expectedUrl = `https://api.ynab.com/v1/budgets/${budgetId}/accounts`;

  // Define mock accounts matching the schema
  const mockAccount1 = {
    id: 'acc1', name: 'Checking', type: 'checking', on_budget: true, closed: false, 
    balance: 1000000, cleared_balance: 900000, uncleared_balance: 100000,
    deleted: false, 
    // Add other required fields with default/null values
    note: null, transfer_payee_id: null, last_reconciled_at: null, 
    debt_original_balance: null
  };
  const mockAccount2 = {
    id: 'acc2', name: 'Savings', type: 'savings', on_budget: true, closed: false,
    balance: 5000000, cleared_balance: 5000000, uncleared_balance: 0,
    deleted: false, 
    note: null, transfer_payee_id: null, last_reconciled_at: null, 
    debt_original_balance: null
  };
   const mockClosedAccount = {
    id: 'acc3', name: 'Old Credit Card', type: 'creditCard', on_budget: true, closed: true, // Closed account
    balance: 0, cleared_balance: 0, uncleared_balance: 0,
    deleted: false, 
    note: null, transfer_payee_id: null, last_reconciled_at: null, 
    debt_original_balance: null
  };
  const mockApiResponse = { data: { accounts: [mockAccount1, mockAccount2, mockClosedAccount] } };

  beforeEach(() => {
    mockFetch.mockClear();
    (formatYnabError as jest.Mock).mockClear();
  });

  it('should list open accounts successfully', async () => {
    mockFetch.mockReturnValue(createMockResponse(mockApiResponse, true));
    const result = await handler(args);

    expect(mockFetch).toHaveBeenCalledWith(expectedUrl, expect.any(Object));
    const expectedText = 
`Open Accounts:
- Checking (Type: checking, Balance: 1000.00, ID: acc1)
- Savings (Type: savings, Balance: 5000.00, ID: acc2)`;
    expect(result).toEqual({ content: [{ type: 'text', text: expectedText }] });
    expect(formatYnabError).not.toHaveBeenCalled();
  });

  it('should handle no open accounts found', async () => {
    const emptyResponse = { data: { accounts: [mockClosedAccount] } }; // Only closed account
    mockFetch.mockReturnValue(createMockResponse(emptyResponse, true));
    const result = await handler(args);

    expect(mockFetch).toHaveBeenCalledWith(expectedUrl, expect.any(Object));
    expect(result).toEqual({ content: [{ type: 'text', text: 'No open accounts found for this budget.' }] });
    expect(formatYnabError).not.toHaveBeenCalled();
  });

  it('should handle YNAB API errors gracefully', async () => {
    const apiErrorResponse = { error: { detail: 'Budget not found.' } };
    mockFetch.mockReturnValue(createMockResponse(apiErrorResponse, false, 404));

    const result = await handler(args);

    expect(mockFetch).toHaveBeenCalledWith(expectedUrl, expect.any(Object));
    expect(formatYnabError).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'api', status: 404, detail: 'Budget not found.' }),
        'listAccounts'
    );
    // Check the error structure returned by the mock formatYnabError
    expect(result).toEqual({ content: [{ type: 'text', text: 'YNAB API Error: YNAB API Error: Budget not found.' }], isError: true });
  });

  it('should handle validation errors if API response is malformed', async () => {
    const malformedData = { data: { /* accounts missing */ } }; 
    mockFetch.mockReturnValue(createMockResponse(malformedData, true));

    const result = await handler(args);

    expect(mockFetch).toHaveBeenCalledWith(expectedUrl, expect.any(Object));
    expect(formatYnabError).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'validation', message: 'YNAB API response validation failed.' }),
        'listAccounts'
    );
    expect(result).toEqual({ content: [{ type: 'text', text: 'YNAB API Error: YNAB API response validation failed.' }], isError: true });
  });

  it('should handle fetch network errors gracefully', async () => {
    const networkError = new Error('Network Error');
    mockFetch.mockRejectedValue(networkError);

    const result = await handler(args);

    expect(mockFetch).toHaveBeenCalledWith(expectedUrl, expect.any(Object));
    expect(formatYnabError).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'network', message: 'Network Error' }),
        'listAccounts'
    );
    expect(result).toEqual({ content: [{ type: 'text', text: 'YNAB API Error: Network Error' }], isError: true });
  });
}); 