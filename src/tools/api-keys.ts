import { z } from "zod";
import { defineTool, idParam } from "../types.js";

export const apiKeyTools = [
  defineTool({
    name: "create_api_key",
    description:
      "Create a new Resend API key. The full key value is returned ONLY once — store it securely. Optionally scope it to sending-only and to a single domain.",
    mutating: true,
    schema: z.object({
      name: z.string().describe("A label for the key, e.g. 'production'"),
      permission: z
        .enum(["full_access", "sending_access"])
        .optional()
        .describe('"full_access" (default) or "sending_access" (can only send emails)'),
      domain_id: z
        .string()
        .optional()
        .describe("Restrict a sending_access key to a single domain ID"),
    }),
    handler: async (a, client) =>
      client.post("/api-keys", {
        name: a.name,
        ...(a.permission ? { permission: a.permission } : {}),
        ...(a.domain_id ? { domain_id: a.domain_id } : {}),
      }),
  }),

  defineTool({
    name: "list_api_keys",
    description: "List all API keys (metadata only — secret values are never returned).",
    mutating: false,
    schema: z.object({}),
    handler: async (_a, client) => client.get("/api-keys"),
  }),

  defineTool({
    name: "delete_api_key",
    description: "Permanently revoke an API key by ID.",
    mutating: true,
    schema: z.object({ id: idParam }),
    handler: async (a, client) => client.delete(`/api-keys/${a.id}`),
  }),
];
