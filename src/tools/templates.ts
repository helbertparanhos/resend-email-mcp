import { z } from "zod";
import { defineTool, idParam, paginationFields, buildUpdateBody } from "../types.js";

export const templateTools = [
  defineTool({
    name: "create_template",
    description:
      "Create a reusable email template. Use {{variable}} placeholders in html/text and pass values via send_email's templateData.",
    mutating: true,
    schema: z.object({
      name: z.string().describe("Template name"),
      subject: z.string().optional().describe("Default subject line"),
      html: z.string().optional().describe("HTML body with {{placeholders}}"),
      text: z.string().optional().describe("Plain-text body with {{placeholders}}"),
    }),
    handler: async (a, client) => {
      const body: Record<string, unknown> = { name: a.name };
      if (a.subject !== undefined) body.subject = a.subject;
      if (a.html !== undefined) body.html = a.html;
      if (a.text !== undefined) body.text = a.text;
      return client.post("/templates", body);
    },
  }),

  defineTool({
    name: "get_template",
    description: "Retrieve a template by ID.",
    mutating: false,
    schema: z.object({ id: idParam }),
    handler: async (a, client) => client.get(`/templates/${a.id}`),
  }),

  defineTool({
    name: "list_templates",
    description: "List all templates (paginated).",
    mutating: false,
    schema: z.object({ ...paginationFields }),
    handler: async (a, client) =>
      client.get("/templates", { limit: a.limit, after: a.after, before: a.before }),
  }),

  defineTool({
    name: "update_template",
    description: "Update a template's name, subject, or body. Creates a new draft version.",
    mutating: true,
    schema: z.object({
      id: idParam,
      name: z.string().optional(),
      subject: z.string().optional(),
      html: z.string().optional(),
      text: z.string().optional(),
    }),
    handler: async (a, client) => {
      const { id, ...rest } = a;
      return client.patch(`/templates/${id}`, buildUpdateBody(rest));
    },
  }),

  defineTool({
    name: "delete_template",
    description: "Delete a template by ID.",
    mutating: true,
    schema: z.object({ id: idParam }),
    handler: async (a, client) => client.delete(`/templates/${a.id}`),
  }),

  defineTool({
    name: "publish_template",
    description:
      "Publish a template's draft so it becomes the live version used by sends.",
    mutating: true,
    schema: z.object({ id: idParam }),
    handler: async (a, client) => client.post(`/templates/${a.id}/publish`),
  }),

  defineTool({
    name: "duplicate_template",
    description: "Duplicate an existing template into a new one.",
    mutating: true,
    schema: z.object({
      id: idParam,
      name: z.string().optional().describe("Name for the duplicated template"),
    }),
    handler: async (a, client) =>
      client.post(`/templates/${a.id}/duplicate`, a.name ? { name: a.name } : undefined),
  }),
];
