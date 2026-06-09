import { z } from "zod";
import type { ResendClient } from "./client.js";

/**
 * A single tool definition. Tool files export arrays of these; the registry in
 * tools/index.ts converts them to MCP tool descriptors and a handler map.
 *
 * `mutating` flags tools that change state — when RESEND_READONLY=true they are
 * rejected before the handler runs.
 */
export interface ToolDef<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  schema: S;
  mutating: boolean;
  handler: (args: z.infer<S>, client: ResendClient) => Promise<unknown>;
}

/** Helper that preserves the inferred schema type when declaring a tool. */
export function defineTool<S extends z.ZodTypeAny>(def: ToolDef<S>): ToolDef {
  return def as unknown as ToolDef;
}

// ─── Shared reusable schemas ──────────────────────────────────────────────

// Resend resource IDs are UUID-like (letters, digits, hyphen/underscore). Restricting
// the charset blocks path-injection via crafted IDs interpolated into request URLs.
export const idParam = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid ID: only letters, numbers, '-' and '_' are allowed")
  .describe("The resource ID");

/** Filters out undefined fields and rejects an update with nothing to change. */
export function buildUpdateBody(
  fields: Record<string, unknown>
): Record<string, unknown> {
  const body = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
  if (Object.keys(body).length === 0) {
    throw new Error("Nothing to update: provide at least one field besides the ID.");
  }
  return body;
}

/** Loose email validation that also accepts the "Name <email@host>" form. */
function looksLikeEmail(s: string): boolean {
  const addr = s.includes("<") ? s.slice(s.indexOf("<") + 1, s.indexOf(">")) : s;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr.trim());
}

export const paginationFields = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Max items to return (1-100)"),
  after: z
    .string()
    .optional()
    .describe("Pagination cursor: return items after this ID"),
  before: z
    .string()
    .optional()
    .describe("Pagination cursor: return items before this ID"),
};

export const emailRecipient = z
  .union([z.string(), z.array(z.string())])
  .refine(
    (v) => (Array.isArray(v) ? v : [v]).every(looksLikeEmail),
    'Each recipient must be a valid email, e.g. "user@example.com" or "Name <user@example.com>"'
  )
  .describe('Recipient address(es), e.g. "user@example.com" or ["a@x.com","b@y.com"]');

/** Custom email headers — values must not contain CR/LF (header-injection guard). */
export const customHeadersSchema = z
  .record(z.string().regex(/^[^\r\n]*$/, "Header values must not contain CR or LF"))
  .describe('Custom headers, e.g. {"X-Entity-Ref-ID": "123"}');

export const attachmentSchema = z
  .object({
    filename: z
      .string()
      .optional()
      .describe("File name shown to the recipient (defaults to the basename of localPath)"),
    content: z
      .string()
      .optional()
      .describe("Base64-encoded file content (use this OR path OR localPath)"),
    path: z
      .string()
      .optional()
      .describe("Public URL to the file (use this OR content OR localPath)"),
    localPath: z
      .string()
      .optional()
      .describe(
        "Path to a file inside RESEND_ATTACHMENTS_DIR — read and base64-encoded automatically. Disabled unless RESEND_ATTACHMENTS_DIR is set (use this OR content OR path)"
      ),
    content_type: z
      .string()
      .optional()
      .describe('MIME type, e.g. "application/pdf"'),
  })
  .describe("An email attachment");

export const tagSchema = z
  .object({
    name: z.string().describe("Tag name (ASCII letters, numbers, _ or -)"),
    value: z.string().describe("Tag value (ASCII letters, numbers, _ or -)"),
  })
  .describe("A custom tag for filtering/analytics");
