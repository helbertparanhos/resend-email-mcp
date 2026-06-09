import { z } from "zod";
import { defineTool, idParam } from "../types.js";

export const contactPropertyTools = [
  defineTool({
    name: "create_contact_property",
    description:
      "Create a custom contact property (a field you can store on every contact, e.g. 'plan' or 'signup_date').",
    mutating: true,
    schema: z.object({
      name: z.string().describe("Property name (key)"),
      type: z
        .enum(["string", "number", "boolean", "date"])
        .describe("Data type of the property"),
    }),
    handler: async (a, client) =>
      client.post("/contact-properties", { name: a.name, type: a.type }),
  }),

  defineTool({
    name: "get_contact_property",
    description: "Retrieve a contact property by ID.",
    mutating: false,
    schema: z.object({ id: idParam }),
    handler: async (a, client) => client.get(`/contact-properties/${a.id}`),
  }),

  defineTool({
    name: "list_contact_properties",
    description: "List all custom contact properties defined on the account.",
    mutating: false,
    schema: z.object({}),
    handler: async (_a, client) => client.get("/contact-properties"),
  }),

  defineTool({
    name: "update_contact_property",
    description: "Rename a contact property.",
    mutating: true,
    schema: z.object({
      id: idParam,
      name: z.string().describe("New property name"),
    }),
    handler: async (a, client) => client.patch(`/contact-properties/${a.id}`, { name: a.name }),
  }),

  defineTool({
    name: "delete_contact_property",
    description: "Delete a contact property by ID.",
    mutating: true,
    schema: z.object({ id: idParam }),
    handler: async (a, client) => client.delete(`/contact-properties/${a.id}`),
  }),
];
