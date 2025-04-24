import { listBudgetsTool } from './index';
import { formatYnabError, YnabError } from '../../ynabApiUtils';
import { z } from 'zod';

// Mock the ynabApiUtils module, specifically formatYnabError
// makeYnabRequest is implicitly mocked by mocking fetch below
jest.mock('../../ynabApiUtils', () => ({
  // Keep the original module structure but mock formatYnabError
  ...jest.requireActual('../../ynabApiUtils'),
  formatYnabError: jest.fn((error: YnabError | Error, toolName: string) => {
    // Mock implementation consistent with the handler's expectation
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

describe('mcp_ynab_list_budgets Tool', () => {
  const { handler } = listBudgetsTool; // Destructure handler
  const expectedUrl = `https://api.ynab.com/v1/budgets`; // Base URL + endpoint

  beforeEach(() => {
    // Clear mocks before each test
    mockFetch.mockClear();
    (formatYnabError as jest.Mock).mockClear();
  });

  it('should list budgets successfully', async () => {
    const mockBudgets = [
      { id: 'b1', name: 'Budget 1', last_modified_on: '2023-01-01T12:00:00Z' }, // Added missing fields from schema
      { id: 'b2', name: 'Budget 2', last_modified_on: '2023-01-02T12:00:00Z' },
    ];
    const mockApiResponse = { data: { budgets: mockBudgets, default_budget: null, server_knowledge: 12345 } }; // Added server_knowledge and missing budget fields
    mockFetch.mockReturnValue(createMockResponse(mockApiResponse, true));

    const result = await handler(); // Call the handler directly

    expect(mockFetch).toHaveBeenCalledWith(expectedUrl, expect.any(Object)); // Check fetch called
    
    const expectedText = 
`Available Budgets:
- Budget 1 (ID: b1)
- Budget 2 (ID: b2)`;
    expect(result).toEqual({ 
      content: [{ type: 'text', text: expectedText }],
      serverKnowledge: 12345
    });
     expect(formatYnabError).not.toHaveBeenCalled();
  });

  it('should handle no budgets found', async () => {
    const mockApiResponse = { data: { budgets: [], default_budget: null, server_knowledge: 54321 } }; // Added server_knowledge
    mockFetch.mockReturnValue(createMockResponse(mockApiResponse, true));

    const result = await handler();

    expect(mockFetch).toHaveBeenCalledWith(expectedUrl, expect.any(Object));
    expect(result).toEqual({
      content: [{ type: 'text', text: 'No new or updated budgets found since last knowledge.' }],
      serverKnowledge: 54321
    });
     expect(formatYnabError).not.toHaveBeenCalled();
  });

  it('should handle YNAB API errors gracefully (403 Forbidden)', async () => {
    const apiErrorResponse = { error: { id: '403', name: 'forbidden', detail: 'Not authorized' } };
    mockFetch.mockReturnValue(createMockResponse(apiErrorResponse, false, 403)); // ok: false

    const result = await handler();

    expect(mockFetch).toHaveBeenCalledWith(expectedUrl, expect.any(Object));
    // Check that formatYnabError was called with the structured API error
    expect(formatYnabError).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'api', status: 403, detail: 'Not authorized' }),
        'listBudgets' // The handler name passed to formatYnabError
    );
    // Check the final structure returned by the mock
    expect(result).toEqual({
        content: [{ type: 'text', text: 'YNAB API Error: YNAB API Error: Not authorized' }], // Mock adds prefix
        isError: true,
    });
  });

   it('should handle fetch network errors gracefully', async () => {
    const networkError = new Error('Network failed');
    mockFetch.mockRejectedValue(networkError); // Simulate fetch throwing

    const result = await handler();

    expect(mockFetch).toHaveBeenCalledWith(expectedUrl, expect.any(Object));
    expect(formatYnabError).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'network', message: 'Network failed' }),
        'listBudgets'
    );
    expect(result).toEqual({
        content: [{ type: 'text', text: 'YNAB API Error: Network failed' }], // Check mock output
        isError: true,
    });
  });

  it('should handle validation errors if API response is malformed', async () => {
    const malformedData = { data: { /* budgets missing */ default_budget: null, server_knowledge: 98765 } }; // Added server_knowledge
    mockFetch.mockReturnValue(createMockResponse(malformedData, true));

    const result = await handler();

    expect(mockFetch).toHaveBeenCalledWith(expectedUrl, expect.any(Object));
    // Internal logic catches validation error, passes it to handler, which calls formatYnabError
    expect(formatYnabError).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'validation', message: 'YNAB API response validation failed.' }),
        'listBudgets'
    );
    expect(result).toEqual({
        content: [{ type: 'text', text: 'YNAB API Error: YNAB API response validation failed.' }],
        isError: true,
    });
  });

}); 