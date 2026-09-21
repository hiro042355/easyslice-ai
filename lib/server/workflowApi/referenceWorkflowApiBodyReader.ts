import type { WorkflowApiCommand } from "@/lib/workflowApi/types";
import { isPlainObject } from "@/lib/workflowApi/workflowApiUtils";
import { parseWorkflowApiContentLength } from "./referenceWorkflowApiHeaderParser";

const START_ABSOLUTE_MAX = 512 * 1024;
const START_STANDARD_MAX = 128 * 1024;
const COMMAND_MAX = 8 * 1024;

export type ReferenceWorkflowApiBodyReadResult =
  | { status: "parsed"; bytes: number; value: Record<string, unknown> }
  | { status: "invalid"; bytes: number }
  | { status: "too-large"; bytes: number };

export async function readReferenceWorkflowApiBody(request: Request, command: WorkflowApiCommand): Promise<ReferenceWorkflowApiBodyReadResult> {
  const absoluteMax = command === "start" ? START_ABSOLUTE_MAX : COMMAND_MAX;
  const declared = parseWorkflowApiContentLength(request.headers);
  if (declared.status === "invalid") return { status: "invalid", bytes: 0 };
  if (declared.status === "valid" && declared.value > absoluteMax) return { status: "too-large", bytes: 0 };
  // Reference-only: Request.arrayBuffer() buffers before actual-byte validation.
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > absoluteMax) return { status: "too-large", bytes: bytes.byteLength };
  if (bytes.byteLength === 0) return { status: "invalid", bytes: 0 };
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { return { status: "invalid", bytes: bytes.byteLength }; }
  if (text.charCodeAt(0) === 0xfeff) return { status: "invalid", bytes: bytes.byteLength };
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { return { status: "invalid", bytes: bytes.byteLength }; }
  if (!isPlainObject(value)) return { status: "invalid", bytes: bytes.byteLength };
  if (command === "start" && value.operation !== "generate-mv" && bytes.byteLength > START_STANDARD_MAX) return { status: "too-large", bytes: bytes.byteLength };
  return { status: "parsed", bytes: bytes.byteLength, value };
}