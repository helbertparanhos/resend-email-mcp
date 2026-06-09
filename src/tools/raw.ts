import { z } from "zod";
import { defineTool } from "../types.js";

/**
 * Escape hatch: call any Resend endpoint directly. Future-proofs the server
 * against new endpoints not yet wrapped in a dedicated tool.
 */
export const rawTools = [
  defineTool({
    name: "resend_raw",
    description:
      "Advanced escape hatch — make a raw authenticated request to ANY Resend API endpoint not covered by a dedicated tool. Prefer specific tools when one exists. Mutating methods (POST/PATCH/PUT/DELETE) are blocked in readonly mode.",
    mutating: true, // conservatively treated as mutating; GET-only calls are still allowed via the guard below
    schema: z.object({
      method: z
        .enum(["GET", "POST", "PATCH", "PUT", "DELETE"])
        .describe("HTTP method"),
      path: z
        .string()
        .describe('Endpoint path starting with "/", e.g. "/emails" or "/domains/{id}"'),
      body: z
        .record(z.unknown())
        .optional()
        .describe("JSON request body for POST/PATCH/PUT"),
      query: z
        .record(z.union([z.string(), z.number(), z.boolean()]))
        .optional()
        .describe("Query-string parameters"),
    }),
    handler: async (a, client) =>
      client.request(a.method, a.path, { body: a.body, query: a.query }),
  }),
];
