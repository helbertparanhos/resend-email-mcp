import { z } from "zod";
import { defineTool, idParam, buildUpdateBody } from "../types.js";

const httpsUrl = z
  .string()
  .url()
  .refine((u) => u.startsWith("https://"), "Webhook endpoint must be an https:// URL");

const WEBHOOK_EVENTS = [
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.complained",
  "email.bounced",
  "email.opened",
  "email.clicked",
  "email.failed",
  "contact.created",
  "contact.updated",
  "contact.deleted",
  "domain.created",
  "domain.updated",
  "domain.deleted",
] as const;

export const webhookTools = [
  defineTool({
    name: "create_webhook",
    description:
      "Create a webhook endpoint that receives Resend events. Returns a signing secret used to verify payloads.",
    mutating: true,
    schema: z.object({
      endpoint: httpsUrl.describe("HTTPS URL that will receive event POSTs"),
      events: z
        .array(z.enum(WEBHOOK_EVENTS))
        .min(1)
        .describe("Event types to subscribe to"),
    }),
    handler: async (a, client) =>
      client.post("/webhooks", { endpoint: a.endpoint, events: a.events }),
  }),

  defineTool({
    name: "get_webhook",
    description: "Retrieve a webhook by ID (including its subscribed events and status).",
    mutating: false,
    schema: z.object({ id: idParam }),
    handler: async (a, client) => client.get(`/webhooks/${a.id}`),
  }),

  defineTool({
    name: "list_webhooks",
    description: "List all configured webhooks.",
    mutating: false,
    schema: z.object({}),
    handler: async (_a, client) => client.get("/webhooks"),
  }),

  defineTool({
    name: "update_webhook",
    description: "Update a webhook's endpoint URL, subscribed events, or enabled status.",
    mutating: true,
    schema: z.object({
      id: idParam,
      endpoint: httpsUrl.optional(),
      events: z.array(z.enum(WEBHOOK_EVENTS)).optional(),
      status: z.enum(["enabled", "disabled"]).optional(),
    }),
    handler: async (a, client) => {
      const { id, ...rest } = a;
      return client.patch(`/webhooks/${id}`, buildUpdateBody(rest));
    },
  }),

  defineTool({
    name: "delete_webhook",
    description: "Delete a webhook by ID.",
    mutating: true,
    schema: z.object({ id: idParam }),
    handler: async (a, client) => client.delete(`/webhooks/${a.id}`),
  }),
];
