import type { ClientErrorCode } from "../api/client";

/** A short heading for an error banner; the server's message gives the details. */
export function errorTitle(code: ClientErrorCode): string {
  switch (code) {
    case "NETWORK_ERROR":
      return "Can't reach the server";
    case "INVALID_RESPONSE":
      return "Unexpected response from the server";
    case "ABORTED":
      return "Request cancelled";
    case "VALIDATION_ERROR":
      return "The request was rejected";
    case "FILE_TOO_LARGE":
      return "Upload too large";
    case "UNSUPPORTED_FILE":
      return "Unsupported file";
    case "EXTRACTION_FAILED":
      return "Could not read the document";
    case "NOT_FOUND":
      return "Not found";
    case "NOTHING_TO_ANALYZE":
      return "Nothing could be analyzed";
    case "RATE_LIMITED":
      return "Too many requests";
    case "LLM_ERROR":
      return "The AI provider failed";
    case "INTERNAL_ERROR":
    case "UNEXPECTED_ERROR":
      return "Something went wrong";
  }
}
