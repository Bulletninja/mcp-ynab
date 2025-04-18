// src/__tests__/server.test.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
// Remove Client/Transport imports
// import { Client } from '@modelcontextprotocol/sdk/client/index.js';
// import { MemoryTransport } from '@modelcontextprotocol/sdk/transport.js';
import { AxiosError } from 'axios';
import { z } from 'zod'; // Import z
import { ZodError } from "zod";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Store captured handlers
const capturedToolHandlers: Record<string, Function> = {};

// Mock the McpServer class
jest.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  const mockTool = jest.fn((name: string, schemaOrCb: any, cb?: Function) => {
    // Determine the actual handler based on the arguments provided
    const handler = typeof schemaOrCb === 'function' ? schemaOrCb : cb;
    console.log(`[Mock McpServer] Attempting to capture tool: ${name}`); // DEBUG LOG
    if (handler && typeof handler === 'function') {
      console.log(`[Mock McpServer]   Handler captured for ${name}`); // DEBUG LOG
      capturedToolHandlers[name] = handler; // Store the callback
    } else {
      console.warn(`[Mock McpServer]   Could NOT capture handler for ${name}. schemaOrCb type: ${typeof schemaOrCb}, cb type: ${typeof cb}`); // DEBUG LOG
    }
  });
  return {
    McpServer: jest.fn().mockImplementation((options) => {
      console.log('[Mock McpServer] Instantiating mocked McpServer...'); // DEBUG LOG
      return {
        _options: options,
        tool: mockTool, // Use the refined mock function
        connect: jest.fn().mockResolvedValue(undefined),
        resource: jest.fn(),
        prompt: jest.fn(),
      };
    }),
    mockTool, // Expose the mock for assertion
  };
});

// Mock environment variables (needs to be after McpServer mock potentially)
jest.mock('dotenv', () => ({
  config: jest.fn(),
}));
process.env.YNAB_API_TOKEN = 'test-token';

// Mock the SDK modules BEFORE importing the server
jest.mock("@modelcontextprotocol/sdk/server/stdio.js", () => {
  return {
    StdioServerTransport: jest.fn(),
  };
});

// Mock axios BEFORE importing the server
jest.mock("axios", () => ({
  create: jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn(),
    // Add other methods like put, delete if needed
  })),
}));

// Now import the server components AFTER mocks are set up
// Use the correct relative path './server'
import { server, ynabApi } from './server';

// Helper to access the mocked McpServer instance and tool mock
const MockMcpServer = McpServer as jest.MockedClass<typeof McpServer>;

describe('MCP YNAB Server', () => {
  it('should instantiate the mocked McpServer and capture tool handlers', () => {
    // The import itself triggers the McpServer constructor mock
    expect(McpServer).toHaveBeenCalled();
    // Check if our main tool handler was captured
    expect(capturedToolHandlers['mcp_ynab_list_accounts']).toBeDefined();
    expect(typeof capturedToolHandlers['mcp_ynab_list_accounts']).toBe('function');
  });
});

// --- Tool Tests --- 
describe('mcp_ynab_list_accounts Tool', () => {
  const toolName = 'mcp_ynab_list_accounts';
  const budgetId = 'test-budget-id';
  let handler: Function;

  beforeAll(() => {
    // Get the handler from our captured store
    handler = capturedToolHandlers[toolName];
    if (!handler) {
      throw new Error(`Handler for tool ${toolName} was not captured by the mock.`);
    }
  });

  // No afterAll needed for this approach

  beforeEach(() => {
    // Clear mocks before each test
    (ynabApi.get as jest.Mock).mockClear();
    // Clear Axios POST mock if testing write tools later
    // (ynabApi.post as jest.Mock).mockClear();
  });

  // --- Tests remain largely the same, just using the reliably captured handler ---
  it('should list accounts successfully', async () => {
    const mockAccounts = [
      { id: 'acc1', name: 'Checking', type: 'checking', balance: 100000 },
      { id: 'acc2', name: 'Savings', type: 'savings', balance: 500000 },
    ];
    (ynabApi.get as jest.Mock).mockResolvedValue({
      data: { data: { accounts: mockAccounts } },
    });

    const result = await handler({ budget_id: budgetId });

    expect(ynabApi.get).toHaveBeenCalledWith(`/budgets/${budgetId}/accounts`);
    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: 'Accounts:\n- Checking (ID: acc1, Type: checking, Balance: 100.00)\n- Savings (ID: acc2, Type: savings, Balance: 500.00)',
        },
      ],
    });
  });

  it('should handle no accounts found', async () => {
    (ynabApi.get as jest.Mock).mockResolvedValue({
      data: { data: { accounts: [] } },
    });

    const result = await handler({ budget_id: budgetId });

    expect(ynabApi.get).toHaveBeenCalledWith(`/budgets/${budgetId}/accounts`);
    expect(result).toEqual({
      content: [{ type: 'text', text: 'No accounts found for this budget.' }],
    });
  });

  it('should handle YNAB API errors gracefully', async () => {
    const apiError = new Error('YNAB API Forbidden') as AxiosError;
    apiError.response = {
      data: { error: { detail: 'Not authorized' } },
      status: 403,
      statusText: 'Forbidden',
      headers: {},
      config: {} as any,
    };
    apiError.isAxiosError = true;
    (ynabApi.get as jest.Mock).mockRejectedValue(apiError);

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    const result = await handler({ budget_id: budgetId });

    expect(ynabApi.get).toHaveBeenCalledWith(`/budgets/${budgetId}/accounts`);
    expect(result).toEqual({
      content: [{ type: 'text', text: 'YNAB API Error: Not authorized' }],
      isError: true,
    });

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

   it('should handle unexpected errors gracefully', async () => {
    const unexpectedError = new Error('Something went wrong');
    (ynabApi.get as jest.Mock).mockRejectedValue(unexpectedError);

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    const result = await handler({ budget_id: budgetId });

    expect(ynabApi.get).toHaveBeenCalledWith(`/budgets/${budgetId}/accounts`);
    expect(result).toEqual({
      content: [{ type: 'text', text: `YNAB API Error: ${unexpectedError.message}` }],
      isError: true,
    });
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

// --- Test mcp_ynab_list_transactions --- 
describe('mcp_ynab_list_transactions Tool', () => {
  const toolName = 'mcp_ynab_list_transactions';
  const budgetId = 'test-budget-id';
  const accountId = 'test-account-id';
  let handler: Function;

  const mockTransaction = {
    id: 't1',
    date: '2024-04-10',
    amount: -12340, // -12.34
    memo: 'Test Memo',
    cleared: 'uncleared',
    approved: false,
    payee_name: 'Test Payee',
    category_name: 'Test Category',
    account_id: accountId,
    // ... other fields if needed
  };

  beforeAll(() => {
    handler = capturedToolHandlers[toolName];
    if (!handler) {
      throw new Error(`Handler for tool ${toolName} was not captured by the mock.`);
    }
  });

  beforeEach(() => {
    (ynabApi.get as jest.Mock).mockClear();
  });

  it('should list transactions for a budget successfully', async () => {
    (ynabApi.get as jest.Mock).mockResolvedValue({
      data: { data: { transactions: [mockTransaction] } },
    });

    const result = await handler({ budget_id: budgetId });

    expect(ynabApi.get).toHaveBeenCalledWith(`/budgets/${budgetId}/transactions`, { params: {} });
    expect(result.content[0].text).toContain('Date: 2024-04-10');
    expect(result.content[0].text).toContain('Payee: Test Payee');
    expect(result.content[0].text).toContain('Amount: -12.34');
    expect(result.content[0].text).toContain('Memo: Test Memo');
    expect(result.isError).toBeFalsy();
  });

  it('should list transactions for a specific account successfully', async () => {
    (ynabApi.get as jest.Mock).mockResolvedValue({
      data: { data: { transactions: [mockTransaction] } },
    });

    const result = await handler({ budget_id: budgetId, account_id: accountId });

    expect(ynabApi.get).toHaveBeenCalledWith(`/budgets/${budgetId}/accounts/${accountId}/transactions`, { params: {} });
    expect(result.content[0].text).toContain('Amount: -12.34');
    expect(result.isError).toBeFalsy();
  });

  it('should filter transactions by since_date', async () => {
    const sinceDate = '2024-04-01';
    (ynabApi.get as jest.Mock).mockResolvedValue({ data: { data: { transactions: [] } } });

    await handler({ budget_id: budgetId, since_date: sinceDate });

    expect(ynabApi.get).toHaveBeenCalledWith(`/budgets/${budgetId}/transactions`, { params: { since_date: sinceDate } });
  });

  it('should filter transactions by type', async () => {
    const type = 'unapproved';
    (ynabApi.get as jest.Mock).mockResolvedValue({ data: { data: { transactions: [] } } });

    await handler({ budget_id: budgetId, type: type });

    expect(ynabApi.get).toHaveBeenCalledWith(`/budgets/${budgetId}/transactions`, { params: { type: type } });
  });

  it('should filter transactions by account, since_date, and type', async () => {
    const sinceDate = '2024-03-01';
    const type = 'uncategorized';
    (ynabApi.get as jest.Mock).mockResolvedValue({ data: { data: { transactions: [] } } });

    await handler({ budget_id: budgetId, account_id: accountId, since_date: sinceDate, type: type });

    expect(ynabApi.get).toHaveBeenCalledWith(`/budgets/${budgetId}/accounts/${accountId}/transactions`, { params: { since_date: sinceDate, type: type } });
  });


  it('should handle no transactions found', async () => {
    (ynabApi.get as jest.Mock).mockResolvedValue({
      data: { data: { transactions: [] } },
    });

    const result = await handler({ budget_id: budgetId });

    expect(ynabApi.get).toHaveBeenCalledWith(`/budgets/${budgetId}/transactions`, { params: {} });
    expect(result).toEqual({
      content: [{ type: 'text', text: 'No transactions found matching the criteria.' }],
    });
  });

  it('should handle YNAB API errors gracefully', async () => {
    const apiError = new Error('Bad Request') as AxiosError;
    apiError.response = { data: { error: { detail: 'Invalid date format' } }, status: 400, statusText: 'Bad Request', headers: {}, config: {} as any };
    apiError.isAxiosError = true;
    (ynabApi.get as jest.Mock).mockRejectedValue(apiError);
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    const result = await handler({ budget_id: budgetId });

    expect(result).toEqual({
      content: [{ type: 'text', text: 'YNAB API Error: Invalid date format' }],
      isError: true,
    });
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

// --- Test mcp_ynab_get_account_balance --- 
describe('mcp_ynab_get_account_balance Tool', () => {
  const toolName = 'mcp_ynab_get_account_balance';
  const budgetId = 'test-budget-id';
  const accountId = 'test-account-id';
  let handler: Function;

  const mockAccount = {
    id: accountId,
    name: 'Test Checking Account',
    type: 'checking',
    balance: 123450, // 123.45
    // ... other fields
  };

  beforeAll(() => {
    handler = capturedToolHandlers[toolName];
    if (!handler) {
      throw new Error(`Handler for tool ${toolName} was not captured by the mock.`);
    }
  });

  beforeEach(() => {
    (ynabApi.get as jest.Mock).mockClear();
  });

  it('should return account balance successfully', async () => {
    (ynabApi.get as jest.Mock).mockResolvedValue({ data: { data: { account: mockAccount } } });

    const result = await handler({ budget_id: budgetId, account_id: accountId });

    expect(ynabApi.get).toHaveBeenCalledWith(`/budgets/${budgetId}/accounts/${accountId}`);
    expect(result).toEqual({
      content: [{ type: 'text', text: `Current balance for ${mockAccount.name}: 123.45` }],
    });
  });

  it('should handle account not found', async () => {
    // Simulate account not found by returning null/undefined account data
    (ynabApi.get as jest.Mock).mockResolvedValue({ data: { data: { account: null } } });

    const result = await handler({ budget_id: budgetId, account_id: accountId });

    expect(ynabApi.get).toHaveBeenCalledWith(`/budgets/${budgetId}/accounts/${accountId}`);
    expect(result).toEqual({
      content: [{ type: 'text', text: `Account with ID ${accountId} not found.` }],
      isError: true,
    });
  });

  it('should handle YNAB API errors gracefully', async () => {
    const apiError = new Error('Server Error') as AxiosError;
    apiError.response = { data: { error: { detail: 'Internal Server Error' } }, status: 500, statusText: 'Internal Server Error', headers: {}, config: {} as any };
    apiError.isAxiosError = true;
    (ynabApi.get as jest.Mock).mockRejectedValue(apiError);
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    const result = await handler({ budget_id: budgetId, account_id: accountId });

    expect(result).toEqual({
      content: [{ type: 'text', text: 'YNAB API Error: Internal Server Error' }],
      isError: true,
    });
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

// --- Test mcp_ynab_list_categories --- 
describe('mcp_ynab_list_categories Tool', () => {
  const toolName = 'mcp_ynab_list_categories';
  const budgetId = 'test-budget-id';
  let handler: Function;

  const mockCategoryGroups = [
    {
      id: 'cg1',
      name: 'Everyday Expenses',
      hidden: false,
      categories: [
        { id: 'cat1', name: 'Groceries', hidden: false },
        { id: 'cat2', name: 'Transportation', hidden: false },
        { id: 'cat3', name: 'Eating Out', hidden: true }, // Hidden category
      ],
    },
    {
      id: 'cg2',
      name: 'Monthly Bills',
      hidden: false,
      categories: [
        { id: 'cat4', name: 'Rent/Mortgage', hidden: false },
        { id: 'cat5', name: 'Utilities', hidden: false },
      ],
    },
    {
      id: 'cg3',
      name: 'Hidden Group',
      hidden: true, // Hidden group
      categories: [
        { id: 'cat6', name: 'Secret Stuff', hidden: false },
      ],
    },
     {
      id: 'cg4',
      name: 'Empty Group',
      hidden: false,
      categories: [], // Group with no categories
    },
  ];

  beforeAll(() => {
    handler = capturedToolHandlers[toolName];
    if (!handler) {
      throw new Error(`Handler for tool ${toolName} was not captured by the mock.`);
    }
  });

  beforeEach(() => {
    (ynabApi.get as jest.Mock).mockClear();
  });

  it('should list categories successfully, filtering hidden ones', async () => {
    (ynabApi.get as jest.Mock).mockResolvedValue({ 
      data: { data: { category_groups: mockCategoryGroups } } 
    });

    const result = await handler({ budget_id: budgetId });

    expect(ynabApi.get).toHaveBeenCalledWith(`/budgets/${budgetId}/categories`);
    const expectedOutput = 
`Categories:

Group: Everyday Expenses (ID: cg1)
  - Groceries (ID: cat1)
  - Transportation (ID: cat2)

Group: Monthly Bills (ID: cg2)
  - Rent/Mortgage (ID: cat4)
  - Utilities (ID: cat5)
`; // Note trailing newline is implicit from the loop structure
    expect(result).toEqual({
      content: [{ type: 'text', text: expectedOutput }],
    });
  });

  it('should handle no categories found', async () => {
    (ynabApi.get as jest.Mock).mockResolvedValue({ 
      data: { data: { category_groups: [] } } // Empty array
    });

    const result = await handler({ budget_id: budgetId });

    expect(ynabApi.get).toHaveBeenCalledWith(`/budgets/${budgetId}/categories`);
    expect(result).toEqual({
      content: [{ type: 'text', text: 'No categories found for this budget.' }],
    });
  });

  it('should handle YNAB API errors gracefully', async () => {
    const apiError = new Error('Not Found') as AxiosError;
    apiError.response = { data: { error: { detail: 'Budget not found.' } }, status: 404, statusText: 'Not Found', headers: {}, config: {} as any };
    apiError.isAxiosError = true;
    (ynabApi.get as jest.Mock).mockRejectedValue(apiError);
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    const result = await handler({ budget_id: budgetId });

    expect(result).toEqual({
      content: [{ type: 'text', text: 'YNAB API Error: Budget not found.' }],
      isError: true,
    });
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

// --- Test mcp_ynab_get_budget_summary --- 
describe('mcp_ynab_get_budget_summary Tool', () => {
  const toolName = 'mcp_ynab_get_budget_summary';
  const budgetId = 'test-budget-id';
  let handler: Function;

  const mockMonthDetail = {
    month: '2024-04-01',
    income: 5000000, // 5000.00
    budgeted: 4500000, // 4500.00
    activity: -4321000, // -4321.00
    to_be_budgeted: 500000, // 500.00
    // ... other fields
  };

  beforeAll(() => {
    handler = capturedToolHandlers[toolName];
    if (!handler) {
      throw new Error(`Handler for tool ${toolName} was not captured by the mock.`);
    }
  });

  beforeEach(() => {
    (ynabApi.get as jest.Mock).mockClear();
  });

  it('should return budget summary successfully', async () => {
    (ynabApi.get as jest.Mock).mockResolvedValue({ data: { data: { month: mockMonthDetail } } });

    const result = await handler({ budget_id: budgetId });

    expect(ynabApi.get).toHaveBeenCalledWith(`/budgets/${budgetId}/months/current`);
    const expectedText = 
`Current Month Summary (${mockMonthDetail.month}):
- Income: 5000.00
- Budgeted: 4500.00
- Activity (Spending): -4321.00
- To Be Budgeted: 500.00`;
    expect(result).toEqual({
      content: [{ type: 'text', text: expectedText }],
    });
  });

  it('should handle missing month detail in response', async () => {
    (ynabApi.get as jest.Mock).mockResolvedValue({ data: { data: { month: null } } });

    const result = await handler({ budget_id: budgetId });

    expect(ynabApi.get).toHaveBeenCalledWith(`/budgets/${budgetId}/months/current`);
    expect(result).toEqual({
      content: [{ type: 'text', text: 'Could not retrieve budget summary for the current month.' }],
      isError: true,
    });
  });

  it('should handle YNAB API errors gracefully', async () => {
    const apiError = new Error('Unauthorized') as AxiosError;
    apiError.response = { data: { error: { detail: 'Invalid API token.' } }, status: 401, statusText: 'Unauthorized', headers: {}, config: {} as any };
    apiError.isAxiosError = true;
    (ynabApi.get as jest.Mock).mockRejectedValue(apiError);
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    const result = await handler({ budget_id: budgetId });

    expect(result).toEqual({
      content: [{ type: 'text', text: 'YNAB API Error: Invalid API token.' }],
      isError: true,
    });
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

// --- Test mcp_ynab_get_category_info --- 
describe('mcp_ynab_get_category_info Tool', () => {
  const toolName = 'mcp_ynab_get_category_info';
  const budgetId = 'test-budget-id';
  const categoryId = 'c4a7f7b1-9fde-4c9f-9c4f-8e3b1efc6a56'; // Example UUID
  let handler: Function;

  const mockCategory = {
    id: categoryId,
    category_group_id: 'cg1',
    name: 'Groceries',
    budgeted: 100000, // 100.00
    activity: -50000, // -50.00
    balance: 50000, // 50.00
    // ... other fields
  };

  beforeAll(() => {
    handler = capturedToolHandlers[toolName];
    if (!handler) {
      throw new Error(`Handler for tool ${toolName} was not captured by the mock.`);
    }
  });

  beforeEach(() => {
    (ynabApi.get as jest.Mock).mockClear();
  });

  it('should return category info successfully', async () => {
    (ynabApi.get as jest.Mock).mockResolvedValue({ data: { data: { category: mockCategory } } });

    const result = await handler({ budget_id: budgetId, category_id: categoryId });

    expect(ynabApi.get).toHaveBeenCalledWith(`/budgets/${budgetId}/months/current/categories/${categoryId}`);
    const expectedText = 
`Category: ${mockCategory.name}
- Budgeted: 100.00
- Activity (Spending): -50.00
- Balance: 50.00`;
    expect(result).toEqual({
      content: [{ type: 'text', text: expectedText }],
    });
  });

  it('should handle category not found', async () => {
    (ynabApi.get as jest.Mock).mockResolvedValue({ data: { data: { category: null } } });

    const result = await handler({ budget_id: budgetId, category_id: categoryId });

    expect(ynabApi.get).toHaveBeenCalledWith(`/budgets/${budgetId}/months/current/categories/${categoryId}`);
    expect(result).toEqual({
      content: [{ type: 'text', text: `Category with ID ${categoryId} not found for the current month.` }],
      isError: true,
    });
  });

  it('should handle YNAB API errors gracefully', async () => {
    const apiError = new Error('Not Found') as AxiosError;
    apiError.response = { data: { error: { detail: 'Category not found.' } }, status: 404, statusText: 'Not Found', headers: {}, config: {} as any };
    apiError.isAxiosError = true;
    (ynabApi.get as jest.Mock).mockRejectedValue(apiError);
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    const result = await handler({ budget_id: budgetId, category_id: categoryId });

    expect(result).toEqual({
      content: [{ type: 'text', text: 'YNAB API Error: Category not found.' }],
      isError: true,
    });
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

// --- Test mcp_ynab_create_transaction --- 
describe('mcp_ynab_create_transaction Tool', () => {
  const toolName = 'mcp_ynab_create_transaction';
  const budgetId = 'test-budget-id';
  const accountId = 'acc1';
  let handler: Function;

  const mockTransactionData = {
    account_id: accountId,
    date: '2024-04-11',
    amount: -50000, // -50.00
    payee_name: 'Coffee Shop',
    category_id: 'cat1',
    memo: 'Morning coffee',
    cleared: 'uncleared',
    approved: false,
  };

  // Combine with budget_id for the arguments passed to the handler
  const handlerArgs = { ...mockTransactionData, budget_id: budgetId };

  const mockApiResponse = {
    data: {
      data: {
        transaction_ids: ['new-tx-id-123'],
        transaction: { id: 'new-tx-id-123', ...mockTransactionData }
      }
    }
  };

  beforeAll(() => {
    handler = capturedToolHandlers[toolName];
    if (!handler) {
      throw new Error(`Handler for tool ${toolName} was not captured by the mock.`);
    }
  });

  beforeEach(() => {
    // Clear POST mock
    (ynabApi.post as jest.Mock).mockClear();
  });

  it('should create a transaction successfully', async () => {
    (ynabApi.post as jest.Mock).mockResolvedValue(mockApiResponse);

    const result = await handler(handlerArgs);

    // Verify the POST call payload
    expect(ynabApi.post).toHaveBeenCalledWith(
      `/budgets/${budgetId}/transactions`,
      { transaction: mockTransactionData } // Ensure data is nested under 'transaction'
    );
    expect(result).toEqual({
      content: [{ type: 'text', text: 'Transaction created successfully. ID: new-tx-id-123' }],
    });
  });

  it('should handle YNAB API errors during creation', async () => {
    const apiError = new Error('Conflict') as AxiosError;
    apiError.response = { data: { error: { detail: 'Duplicate transaction detected.' } }, status: 409, statusText: 'Conflict', headers: {}, config: {} as any };
    apiError.isAxiosError = true;
    (ynabApi.post as jest.Mock).mockRejectedValue(apiError);
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    const result = await handler(handlerArgs);

    expect(ynabApi.post).toHaveBeenCalledWith(
      `/budgets/${budgetId}/transactions`,
      { transaction: mockTransactionData }
    );
    expect(result).toEqual({
      content: [{ type: 'text', text: 'YNAB API Error: Duplicate transaction detected.' }],
      isError: true,
    });
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

// --- Test mcp_ynab_list_budgets ---
describe('mcp_ynab_list_budgets Tool', () => {
  const toolName = 'mcp_ynab_list_budgets';
  let handler: Function;

  // Mock budget data
  const mockBudgets = [
    { id: 'b1', name: 'Personal Budget' },
    { id: 'b2', name: 'Business Budget' },
    { id: 'last-used', name: 'Last Used Budget Placeholder' }, // YNAB often includes this
  ];

  beforeAll(() => {
    // Expect the handler to be captured by the mock server when server.ts is loaded
    handler = capturedToolHandlers[toolName];
    // We can't reliably test *before* server.ts runs in this setup easily,
    // so we check if it *was* captured after the fact.
    if (!handler) {
       console.warn(`WARN: Handler for tool ${toolName} was not captured. This might indicate the tool is not defined in server.ts yet.`);
       // Define a dummy handler to prevent crashes in tests below,
       // the real test is whether the tool definition exists in server.ts
       handler = async () => ({ content: [{ type: 'text', text: 'Error: Handler not implemented' }], isError: true });
    }
  });

   // Test if the handler was captured (a proxy for testing if the tool was defined)
   it('should have captured the tool handler', () => {
      expect(capturedToolHandlers[toolName]).toBeDefined();
      expect(typeof capturedToolHandlers[toolName]).toBe('function');
   });


  beforeEach(() => {
    // Clear GET mock before each test in this suite
    (ynabApi.get as jest.Mock).mockClear();
  });

  it('should list budgets successfully', async () => {
    (ynabApi.get as jest.Mock).mockResolvedValue({
      data: { data: { budgets: mockBudgets } },
    });

    // The tool takes no arguments
    const result = await handler({});

    expect(ynabApi.get).toHaveBeenCalledWith('/budgets');
    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: `Available Budgets:
- Personal Budget (ID: b1)
- Business Budget (ID: b2)
- Last Used Budget Placeholder (ID: last-used)`,
        },
      ],
      // isError should be undefined or false for success
    });
    expect(result.isError).toBeFalsy(); // Explicit check for no error
  });

  it('should handle no budgets found', async () => {
    (ynabApi.get as jest.Mock).mockResolvedValue({
      data: { data: { budgets: [] } }, // Return empty array
    });

    const result = await handler({});

    expect(ynabApi.get).toHaveBeenCalledWith('/budgets');
    expect(result).toEqual({
      content: [{ type: 'text', text: 'No budgets found.' }],
    });
     expect(result.isError).toBeFalsy();
  });

   it('should handle null budget data in response', async () => {
    (ynabApi.get as jest.Mock).mockResolvedValue({
      data: { data: { budgets: null } }, // Simulate potential null response
    });

    const result = await handler({});

    expect(ynabApi.get).toHaveBeenCalledWith('/budgets');
    expect(result).toEqual({
      content: [{ type: 'text', text: 'No budgets found.' }], // Should treat null as empty
    });
     expect(result.isError).toBeFalsy();
  });

  it('should handle YNAB API errors gracefully', async () => {
    const apiError = new Error('YNAB API Unauthorized') as AxiosError;
    apiError.response = {
      data: { error: { detail: 'Invalid access token' } },
      status: 401,
      statusText: 'Unauthorized',
      headers: {},
      config: {} as any, // Use type assertion for config
    };
    apiError.isAxiosError = true;
    (ynabApi.get as jest.Mock).mockRejectedValue(apiError);

    // Spy on console.error before calling the handler
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    const result = await handler({});

    expect(ynabApi.get).toHaveBeenCalledWith('/budgets');
    expect(result).toEqual({
      content: [{ type: 'text', text: 'YNAB API Error: Invalid access token' }],
      isError: true,
    });

    // Verify console.error was called (optional but good practice)
    expect(consoleErrorSpy).toHaveBeenCalled();
    // Restore console.error to its original implementation
    consoleErrorSpy.mockRestore();
  });
});
