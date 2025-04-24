import { listCategoriesTool } from './index';
import { formatYnabError, YnabError } from '../../ynabApiUtils';
import { z } from 'zod';
import { ok, err } from 'neverthrow';

// Mock the ynabApiUtils module
jest.mock('../../ynabApiUtils', () => ({
  ...jest.requireActual('../../ynabApiUtils'),
  makeYnabRequest: jest.fn(),
  formatYnabError: jest.fn((error: YnabError | Error, toolName: string) => {
    return { content: [{ type: "text" as const, text: `YNAB API Error: ${error.message || 'Unknown error'}` }], isError: true };
  }),
}));

// Import the mocked function type
import { makeYnabRequest } from '../../ynabApiUtils';
const mockedMakeYnabRequest = makeYnabRequest as jest.Mock;

describe('mcp_ynab_list_categories Tool', () => {
  const { handler, schema } = listCategoriesTool;
  const budgetId = 'test-budget-id';
  const args = { budget_id: budgetId };
  const expectedUrl = `/budgets/${budgetId}/categories`;

  // Define mock categories matching the schema
  const mockCategory1 = {
    id: 'cat-1', category_group_id: 'group-1', category_group_name: 'Group 1', 
    name: 'Category 1', hidden: false, deleted: false, 
    budgeted: 10000, activity: -5000, balance: 5000, goal_target: 0
    // Add other required fields if necessary, ensure goal_target is present
  };
  const mockCategoryHidden = {
    id: 'cat-hidden', category_group_id: 'group-1', category_group_name: 'Group 1',
    name: 'Hidden Category', hidden: true, deleted: false,
     budgeted: 0, activity: 0, balance: 0, goal_target: 0
  };
  const mockCategoryGroup1 = {
    id: 'group-1', name: 'Group 1', hidden: false, deleted: false,
    categories: [mockCategory1, mockCategoryHidden]
  };
  const mockGroupHidden = {
    id: 'group-hidden', name: 'Hidden Group', hidden: true, deleted: false,
    categories: [{ id: 'cat-hidden-group', category_group_id: 'group-hidden', category_group_name: 'Hidden Group', name: 'Cat in Hidden', hidden: false, deleted: false, budgeted: 0, activity: 0, balance: 0, goal_target: 0 }]
  };
  const mockApiResponse = { data: { category_groups: [mockCategoryGroup1, mockGroupHidden], server_knowledge: 234 } };
  
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockedMakeYnabRequest.mockClear();
    (formatYnabError as jest.Mock).mockClear();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('should list categories successfully and return serverKnowledge', async () => {
    mockedMakeYnabRequest.mockResolvedValue(ok(mockApiResponse));
    const result = await handler(args);

    expect(mockedMakeYnabRequest).toHaveBeenCalledWith(expectedUrl);
    const expectedText = `Categories:\n\nGroup 1:\n  - Category 1 (ID: cat-1)`;
    expect(result).toEqual({ 
        content: [{ type: 'text', text: expectedText }],
        serverKnowledge: 234 
    });
    expect(formatYnabError).not.toHaveBeenCalled();
  });

  it('should include last_knowledge_of_server in the request URL', async () => {
    const knowledge = 100;
    const argsWithKnowledge = { ...args, last_knowledge_of_server: knowledge };
    const expectedEndpoint = `${expectedUrl}?last_knowledge_of_server=${knowledge}`;
    mockedMakeYnabRequest.mockResolvedValue(ok(mockApiResponse)); 
    
    await handler(argsWithKnowledge);

    expect(mockedMakeYnabRequest).toHaveBeenCalledWith(expectedEndpoint);
  });

  it('should handle case where no categories are found and return serverKnowledge', async () => {
    const mockEmptyResponse = { data: { category_groups: [], server_knowledge: 567 } }; 
    mockedMakeYnabRequest.mockResolvedValue(ok(mockEmptyResponse));
    const result = await handler(args);

    expect(mockedMakeYnabRequest).toHaveBeenCalledWith(expectedUrl);
    expect(result).toEqual({ 
        content: [{ type: 'text', text: 'No categories found.' }], 
        serverKnowledge: 567
    });
    expect(formatYnabError).not.toHaveBeenCalled();
  });

  it('should handle YNAB API errors gracefully', async () => {
    const apiError: YnabError = { 
        type: 'api', 
        status: 404, 
        detail: 'Budget not found.', 
        message: 'Budget not found.'
    };
    mockedMakeYnabRequest.mockResolvedValue(err(apiError));
    const result = await handler(args);

    expect(mockedMakeYnabRequest).toHaveBeenCalledWith(expectedUrl);
    expect(formatYnabError).toHaveBeenCalledWith(apiError, 'listCategories');
    expect(result).toEqual({ content: [{ type: 'text', text: 'YNAB API Error: Budget not found.' }], isError: true });
  });

  it('should handle validation errors if API response is malformed', async () => {
    const malformedData = { data: { /* category_groups missing */ server_knowledge: 901 } }; 
    mockedMakeYnabRequest.mockResolvedValue(ok(malformedData));

     (formatYnabError as jest.Mock).mockImplementationOnce(() => ({
         content: [{ type: 'text', text: 'YNAB API Error: YNAB API response validation failed.' }],
         isError: true
    }));
    
    const result = await handler(args);

    expect(mockedMakeYnabRequest).toHaveBeenCalledWith(expectedUrl);
    expect(formatYnabError).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'validation' }),
        'listCategories'
    );
    expect(result).toEqual({ content: [{ type: 'text', text: 'YNAB API Error: YNAB API response validation failed.' }], isError: true });
  });

  it('should handle fetch network errors gracefully', async () => {
    const networkError: YnabError = { 
        type: 'network', 
        message: 'Failed to fetch', 
        originalError: new Error('Failed to fetch') 
    };
    mockedMakeYnabRequest.mockResolvedValue(err(networkError));
    const result = await handler(args);

    expect(mockedMakeYnabRequest).toHaveBeenCalledWith(expectedUrl);
    expect(formatYnabError).toHaveBeenCalledWith(networkError, 'listCategories');
    expect(result).toEqual({ content: [{ type: 'text', text: 'YNAB API Error: Failed to fetch' }], isError: true });
  });
}); 