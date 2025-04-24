import { err, ok, Result } from "neverthrow";

// --- Configuration ---
const YNAB_API_TOKEN = process.env.YNAB_API_TOKEN;
const YNAB_BASE_URL = "https://api.ynab.com/v1";

// --- Type Definitions ---
export type YnabError = {
  type: "network" | "api" | "validation" | "parse" | "unknown";
  message: string;
  status?: number;
  detail?: string;
  issues?: any[];
  originalError?: any;
};

/**
 * Makes a request to the YNAB API using fetch.
 * Handles common error scenarios and returns a Result.
 */
export async function makeYnabRequest<TResponse>(
  endpoint: string,
  options: RequestInit = {},
  payload?: any
): Promise<Result<TResponse, YnabError>> {
  const url = `${YNAB_BASE_URL}${endpoint}`;

  const fetchOptions: RequestInit = {
    ...options,
    headers: {
      Authorization: `Bearer ${YNAB_API_TOKEN}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  };

  if (payload) {
    fetchOptions.body = JSON.stringify(payload);
  }

  try {
    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      return handleErrorResponse(response);
    }

    return handleSuccessResponse<TResponse>(response);
  } catch (error) {
    return handleNetworkError(error);
  }
}

/**
 * Handles error responses from the YNAB API
 */
async function handleErrorResponse(
  response: Response
): Promise<Result<never, YnabError>> {
  let errorDetail = `Request failed with status ${response.status}`;
  let errorJson: any = {};

  try {
    errorJson = await response.json();
    errorDetail = errorJson?.error?.detail || errorDetail;
  } catch (parseError) {
    console.warn("Could not parse API error response as JSON", parseError);
  }

  return err({
    type: "api",
    message: `YNAB API Error: ${errorDetail}`,
    status: response.status,
    detail: errorDetail,
    originalError: errorJson,
  });
}

/**
 * Handles successful responses from the YNAB API
 */
async function handleSuccessResponse<TResponse>(
  response: Response
): Promise<Result<TResponse, YnabError>> {
  const responseText = await response.text();

  if (!responseText) {
    return ok(null as unknown as TResponse);
  }

  try {
    const data: TResponse = JSON.parse(responseText);
    return ok(data);
  } catch (parseError) {
    console.error(
      "Failed to parse YNAB API success response:",
      parseError,
      "Response text:",
      responseText
    );
    return err({
      type: "parse",
      message: "Failed to parse successful YNAB API response.",
      originalError: parseError,
    });
  }
}

/**
 * Handles network errors or other fetch-related issues
 */
function handleNetworkError(error: unknown): Result<never, YnabError> {
  console.error("Network or fetch error making YNAB request:", error);
  return err({
    type: "network",
    message: error instanceof Error ? error.message : "Network request failed.",
    originalError: error,
  });
}

/**
 * Formats YnabError or other errors into a standardized structure.
 */
export function formatYnabError(
  error: YnabError | Error | any,
  toolName: string
): {
  content: { type: "text"; text: string }[];
  isError: true;
} {
  const displayMessage =
    typeof error === "object" && error !== null && "message" in error
      ? String(error.message)
      : "An unknown error occurred";

  console.error(`Error in ${toolName}:`, displayMessage, error);

  return {
    content: [
      { type: "text" as const, text: `YNAB API Error: ${displayMessage}` },
    ],
    isError: true,
  };
}
