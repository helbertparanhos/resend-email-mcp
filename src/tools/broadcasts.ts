import { z } from "zod";
import { defineTool, idParam, paginationFields, buildUpdateBody } from "../types.js";

export const broadcastTools = [
  defineTool({
    name: "create_broadcast",
    description:
      "Create a broadcast (newsletter / campaign) targeted at an audience or segment. Created as a draft — use send_broadcast to deliver or schedule it.",
    mutating: true,
    schema: z.object({
      audience_id: z
        .string()
        .optional()
        .describe("Target audience ID (audience or segment must be provided)"),
      segment_id: z.string().optional().describe("Target segment ID"),
      from: z.string().describe('Sender, e.g. "Acme <news@acme.com>" (verified domain)'),
      subject: z.string().describe("Email subject line"),
      reply_to: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe("Reply-To address(es)"),
      html: z.string().optional().describe("HTML body (use {{{RESEND_UNSUBSCRIBE_URL}}} for the unsubscribe link)"),
      text: z.string().optional().describe("Plain-text body"),
      name: z.string().optional().describe("Internal name for the broadcast"),
      preview_text: z.string().optional().describe("Inbox preview/preheader text"),
    }),
    handler: async (a, client) => {
      const body: Record<string, unknown> = { from: a.from, subject: a.subject };
      if (a.audience_id) body.audience_id = a.audience_id;
      if (a.segment_id) body.segment_id = a.segment_id;
      if (a.reply_to) body.reply_to = a.reply_to;
      if (a.html !== undefined) body.html = a.html;
      if (a.text !== undefined) body.text = a.text;
      if (a.name !== undefined) body.name = a.name;
      if (a.preview_text !== undefined) body.preview_text = a.preview_text;
      return client.post("/broadcasts", body);
    },
  }),

  defineTool({
    name: "get_broadcast",
    description: "Retrieve a broadcast by ID, including its status (draft/scheduled/sent) and stats.",
    mutating: false,
    schema: z.object({ id: idParam }),
    handler: async (a, client) => client.get(`/broadcasts/${a.id}`),
  }),

  defineTool({
    name: "list_broadcasts",
    description: "List all broadcasts (paginated).",
    mutating: false,
    schema: z.object({ ...paginationFields }),
    handler: async (a, client) =>
      client.get("/broadcasts", { limit: a.limit, after: a.after, before: a.before }),
  }),

  defineTool({
    name: "update_broadcast",
    description: "Update a draft broadcast's content or settings (from, subject, html, text, etc.).",
    mutating: true,
    schema: z.object({
      id: idParam,
      from: z.string().optional(),
      subject: z.string().optional(),
      reply_to: z.union([z.string(), z.array(z.string())]).optional(),
      html: z.string().optional(),
      text: z.string().optional(),
      name: z.string().optional(),
      preview_text: z.string().optional(),
    }),
    handler: async (a, client) => {
      const { id, ...rest } = a;
      return client.patch(`/broadcasts/${id}`, buildUpdateBody(rest));
    },
  }),

  defineTool({
    name: "send_broadcast",
    description:
      "Send a broadcast now, or schedule it for later. Omit scheduledAt to send immediately.",
    mutating: true,
    schema: z.object({
      id: idParam,
      scheduledAt: z
        .string()
        .optional()
        .describe('ISO-8601 or natural language like "tomorrow at 9am". Omit to send now.'),
    }),
    handler: async (a, client) =>
      client.post(`/broadcasts/${a.id}/send`, a.scheduledAt ? { scheduled_at: a.scheduledAt } : undefined),
  }),

  defineTool({
    name: "delete_broadcast",
    description: "Delete a broadcast (only drafts and scheduled broadcasts can be deleted).",
    mutating: true,
    schema: z.object({ id: idParam }),
    handler: async (a, client) => client.delete(`/broadcasts/${a.id}`),
  }),
];
