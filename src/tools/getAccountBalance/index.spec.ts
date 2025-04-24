import { getAccountBalanceTool } from './index';
import { formatYnabError, YnabError } from '../../ynabApiUtils';
import { ok, err } from 'neverthrow';
import { z } from 'zod';
import { makeYnabRequest } from '../../ynabApiUtils';

// Mock the ynabApiUtils module
jest.mock('../../ynabApiUtils', () => ({
  ...jest.requireActual('../../ynabApiUtils'),
  makeYnabRequest: jest.fn(), // Mock makeYnabRequest
  formatYnabError: jest.fn((error: YnabError | Error, toolName: string) => {
    return { content: [{ type: "text" as const, text: `YNAB API Error: ${error.message || 'Unknown error'}` }], isError: true };
  }),
}));

// Import the mocked function type
const mockedMakeYnabRequest = makeYnabRequest as jest.Mock;

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

describe('mcp_ynab_get_account_balance Tool', () => {
  const { handler } = getAccountBalanceTool;
  const budgetId = 'test-budget-id';
  const accountId = 'test-account-id';
  const args = { budget_id: budgetId, account_id: accountId };
  const expectedEndpoint = `/budgets/${budgetId}/accounts/${accountId}`;

  // Define a mock account matching the updated schema in index.ts
  const mockAccount = {
    id: accountId,
    name: 'Test Account',
    balance: 123450, // 123.45
    // Add required fields based on AccountResponseSchema in index.ts
    type: 'checking', // Example type
    on_budget: true,
    closed: false,
    cleared_balance: 123450, // Example
    uncleared_balance: 0, // Example
    transfer_payee_id: null,
    deleted: false, 
    note: null // Explicitly add optional fields present in schema if needed for tests
  };
  const mockApiResponse = { data: { account: mockAccount } };
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockedMakeYnabRequest.mockClear();
    (formatYnabError as jest.Mock).mockClear();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('should get account balance successfully', async () => {
    mockedMakeYnabRequest.mockResolvedValue(ok(mockApiResponse));
    const result = await handler(args);

    expect(mockedMakeYnabRequest).toHaveBeenCalledWith(expectedEndpoint);
    const expectedText = 
`Account: Test Account (ID: ${accountId})
Balance: 123.45`;
    expect(result).toEqual({ content: [{ type: 'text', text: expectedText }] });
    expect(formatYnabError).not.toHaveBeenCalled();
  });

  it('should handle YNAB API errors gracefully (e.g., account not found)', async () => {
    const apiError: YnabError = { 
        type: 'api', 
        status: 404, 
        detail: 'Account not found.', 
        message: 'Account not found.' 
    };
    mockedMakeYnabRequest.mockResolvedValue(err(apiError));
    const result = await handler(args);

    expect(mockedMakeYnabRequest).toHaveBeenCalledWith(expectedEndpoint);
    expect(formatYnabError).toHaveBeenCalledWith(apiError, 'getAccountBalance');
    expect(result).toEqual({ content: [{ type: 'text', text: 'YNAB API Error: Account not found.' }], isError: true });
  });

  it('should handle validation errors if API response is malformed', async () => {
    const malformedData = { data: { /* account missing */ } }; 
    mockedMakeYnabRequest.mockResolvedValue(ok(malformedData));

    (formatYnabError as jest.Mock).mockImplementationOnce(() => ({
         content: [{ type: 'text', text: 'YNAB API Error: YNAB API response validation failed.' }],
         isError: true
    }));

    const result = await handler(args);

    expect(mockedMakeYnabRequest).toHaveBeenCalledWith(expectedEndpoint);
    expect(formatYnabError).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'validation' }),
        'getAccountBalance'
    );
    expect(result).toEqual({ content: [{ type: 'text', text: 'YNAB API Error: YNAB API response validation failed.' }], isError: true });
  });

  it('should handle fetch network errors gracefully', async () => {
     const networkError: YnabError = { 
        type: 'network', 
        message: 'Network issue', 
        originalError: new Error('Network issue') 
    };
    mockedMakeYnabRequest.mockResolvedValue(err(networkError));
    const result = await handler(args);

    expect(mockedMakeYnabRequest).toHaveBeenCalledWith(expectedEndpoint);
    expect(formatYnabError).toHaveBeenCalledWith(networkError, 'getAccountBalance');
    expect(result).toEqual({ content: [{ type: 'text', text: 'YNAB API Error: Network issue' }], isError: true });
  });

}); 