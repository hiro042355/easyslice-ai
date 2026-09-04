const HEADERS = Object.freeze({ "Cache-Control": "no-store, max-age=0", Pragma: "no-cache",
  "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
const messages: Record<string, string> = {
  invalid_request: "The request could not be processed.", unauthorized: "Authentication is required.",
  forbidden: "The operation is not permitted.", csrf_invalid: "The operation is not permitted.",
  unsupported_source: "The source is not supported.", duplicate_conflict: "The request conflicts with an earlier request.",
  internal_failure: "The asset import could not be completed.",
};
export const assetImportJson = (status: number, body: object): Response => new Response(JSON.stringify(body), { status, headers: HEADERS });
export const assetImportError = (status: number, code: keyof typeof messages): Response => assetImportJson(status,
  { responseVersion: "1.0", status: "failed", code, message: messages[code], retryable: false });
