import { z } from "zod";
import { defineTool, idParam, paginationFields, buildUpdateBody } from "../types.js";

const emailField = z
  .string()
  .email("Must be a valid email address")
  .describe("Contact email address");

export const contactTools = [
  defineTool({
    name: "create_contact",
    description:
      "Create a contact. Provide email plus optional name and custom properties. `unsubscribed` controls subscription state.",
    mutating: true,
    schema: z.object({
      email: emailField,
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      unsubscribed: z.boolean().optional().describe("Mark as unsubscribed (default false)"),
      properties: z
        .record(z.unknown())
        .optional()
        .describe("Custom property values keyed by property name"),
    }),
    handler: async (a, client) => {
      const body: Record<string, unknown> = { email: a.email };
      if (a.first_name !== undefined) body.first_name = a.first_name;
      if (a.last_name !== undefined) body.last_name = a.last_name;
      if (a.unsubscribed !== undefined) body.unsubscribed = a.unsubscribed;
      if (a.properties !== undefined) body.properties = a.properties;
      return client.post("/contacts", body);
    },
  }),

  defineTool({
    name: "get_contact",
    description: "Retrieve a contact by ID or by email address.",
    mutating: false,
    schema: z.object({
      id: z.string().describe("Contact ID or email address"),
    }),
    handler: async (a, client) => client.get(`/contacts/${encodeURIComponent(a.id)}`),
  }),

  defineTool({
    name: "list_contacts",
    description: "List contacts (paginated).",
    mutating: false,
    schema: z.object({ ...paginationFields }),
    handler: async (a, client) =>
      client.get("/contacts", { limit: a.limit, after: a.after, before: a.before }),
  }),

  defineTool({
    name: "update_contact",
    description: "Update a contact's name, subscription state, or custom properties.",
    mutating: true,
    schema: z.object({
      id: z.string().describe("Contact ID or email address"),
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      unsubscribed: z.boolean().optional(),
      properties: z.record(z.unknown()).optional(),
    }),
    handler: async (a, client) => {
      const { id, ...rest } = a;
      return client.patch(`/contacts/${encodeURIComponent(id)}`, buildUpdateBody(rest));
    },
  }),

  defineTool({
    name: "delete_contact",
    description: "Delete a contact by ID or email address.",
    mutating: true,
    schema: z.object({ id: z.string().describe("Contact ID or email address") }),
    handler: async (a, client) => client.delete(`/contacts/${encodeURIComponent(a.id)}`),
  }),

  defineTool({
    name: "get_contact_topics",
    description: "List the topic subscriptions of a contact.",
    mutating: false,
    schema: z.object({ id: idParam.describe("Contact ID") }),
    handler: async (a, client) => client.get(`/contacts/${a.id}/topics`),
  }),

  defineTool({
    name: "update_contact_topics",
    description:
      "Update a contact's topic subscriptions (opt-in / opt-out of specific topics).",
    mutating: true,
    schema: z.object({
      id: idParam.describe("Contact ID"),
      topics: z
        .array(
          z.object({
            topic_id: z.string().describe("Topic ID"),
            status: z.enum(["subscribed", "unsubscribed"]).describe("Subscription state"),
          })
        )
        .describe("Topic subscription updates"),
    }),
    handler: async (a, client) => client.patch(`/contacts/${a.id}/topics`, { topics: a.topics }),
  }),

  defineTool({
    name: "list_contact_segments",
    description: "List the segments a contact belongs to.",
    mutating: false,
    schema: z.object({ id: idParam.describe("Contact ID") }),
    handler: async (a, client) => client.get(`/contacts/${a.id}/segments`),
  }),

  defineTool({
    name: "add_contact_to_segment",
    description: "Add a contact to a segment.",
    mutating: true,
    schema: z.object({
      id: idParam.describe("Contact ID"),
      segment_id: idParam.describe("Segment ID"),
    }),
    handler: async (a, client) => client.post(`/contacts/${a.id}/segments/${a.segment_id}`),
  }),

  defineTool({
    name: "remove_contact_from_segment",
    description: "Remove a contact from a segment.",
    mutating: true,
    schema: z.object({
      id: idParam.describe("Contact ID"),
      segment_id: idParam.describe("Segment ID"),
    }),
    handler: async (a, client) => client.delete(`/contacts/${a.id}/segments/${a.segment_id}`),
  }),
];
