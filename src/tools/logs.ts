import { z } from "zod";
import { defineTool, idParam, paginationFields } from "../types.js";

export const logTools = [
  defineTool({
    name: "list_logs",
    description:
      "List API request logs — every request made to your Resend account with status code, endpoint and timing. The backbone for debugging. For smart filtering use search_logs.",
    mutating: false,
    schema: z.object({ ...paginationFields }),
    handler: async (a, client) =>
      client.get("/logs", { limit: a.limit, after: a.after, before: a.before }),
  }),

  defineTool({
    name: "get_log",
    description: "Retrieve a single API request log entry by ID, with full request/response detail.",
    mutating: false,
    schema: z.object({ id: idParam }),
    handler: async (a, client) => client.get(`/logs/${a.id}`),
  }),
];
