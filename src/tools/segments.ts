import { z } from "zod";
import { defineTool, idParam, paginationFields } from "../types.js";

export const segmentTools = [
  defineTool({
    name: "create_segment",
    description:
      "Create a segment — a saved, optionally rule-based grouping of contacts you can target with broadcasts.",
    mutating: true,
    schema: z.object({
      name: z.string().describe("Segment name"),
      filter: z
        .record(z.unknown())
        .optional()
        .describe("Optional filter rules object defining segment membership"),
    }),
    handler: async (a, client) =>
      client.post("/segments", {
        name: a.name,
        ...(a.filter ? { filter: a.filter } : {}),
      }),
  }),

  defineTool({
    name: "get_segment",
    description: "Retrieve a segment by ID.",
    mutating: false,
    schema: z.object({ id: idParam }),
    handler: async (a, client) => client.get(`/segments/${a.id}`),
  }),

  defineTool({
    name: "list_segments",
    description: "List all segments.",
    mutating: false,
    schema: z.object({}),
    handler: async (_a, client) => client.get("/segments"),
  }),

  defineTool({
    name: "delete_segment",
    description: "Delete a segment by ID.",
    mutating: true,
    schema: z.object({ id: idParam }),
    handler: async (a, client) => client.delete(`/segments/${a.id}`),
  }),

  defineTool({
    name: "list_segment_contacts",
    description: "List the contacts that belong to a segment (paginated).",
    mutating: false,
    schema: z.object({ id: idParam.describe("Segment ID"), ...paginationFields }),
    handler: async (a, client) =>
      client.get(`/segments/${a.id}/contacts`, {
        limit: a.limit,
        after: a.after,
        before: a.before,
      }),
  }),
];
