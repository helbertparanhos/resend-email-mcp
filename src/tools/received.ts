import { z } from "zod";
import { defineTool, idParam, paginationFields } from "../types.js";

/** Inbound (received) emails — requires inbound/receiving configured on the account. */
export const receivedTools = [
  defineTool({
    name: "list_received_emails",
    description:
      "List inbound (received) emails. Requires email receiving to be configured on your Resend account.",
    mutating: false,
    schema: z.object({ ...paginationFields }),
    handler: async (a, client) =>
      client.get("/emails/received", { limit: a.limit, after: a.after, before: a.before }),
  }),

  defineTool({
    name: "get_received_email",
    description: "Retrieve a single received email by ID, including parsed headers and body.",
    mutating: false,
    schema: z.object({ id: idParam }),
    handler: async (a, client) => client.get(`/emails/received/${a.id}`),
  }),

  defineTool({
    name: "list_received_attachments",
    description: "List the attachments of a received email.",
    mutating: false,
    schema: z.object({ email_id: idParam.describe("The received email ID") }),
    handler: async (a, client) => client.get(`/emails/received/${a.email_id}/attachments`),
  }),

  defineTool({
    name: "get_received_attachment",
    description: "Retrieve a single attachment of a received email by attachment ID.",
    mutating: false,
    schema: z.object({
      email_id: idParam.describe("The received email ID"),
      attachment_id: idParam.describe("The attachment ID"),
    }),
    handler: async (a, client) =>
      client.get(`/emails/received/${a.email_id}/attachments/${a.attachment_id}`),
  }),
];
