import { z } from "zod";
import { defineTool, idParam } from "../types.js";

/** Attachments of emails you have SENT. */
export const attachmentTools = [
  defineTool({
    name: "list_email_attachments",
    description: "List the attachments of a sent email.",
    mutating: false,
    schema: z.object({ email_id: idParam.describe("The sent email ID") }),
    handler: async (a, client) => client.get(`/emails/${a.email_id}/attachments`),
  }),

  defineTool({
    name: "get_email_attachment",
    description:
      "Retrieve a single attachment of a sent email by attachment ID (returns metadata / download info).",
    mutating: false,
    schema: z.object({
      email_id: idParam.describe("The sent email ID"),
      attachment_id: idParam.describe("The attachment ID"),
    }),
    handler: async (a, client) =>
      client.get(`/emails/${a.email_id}/attachments/${a.attachment_id}`),
  }),
];
