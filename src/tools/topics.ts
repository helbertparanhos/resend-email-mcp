import { z } from "zod";
import { defineTool, idParam, buildUpdateBody } from "../types.js";

export const topicTools = [
  defineTool({
    name: "create_topic",
    description:
      "Create a topic — a subscription category (e.g. 'Product updates', 'Promotions') contacts can opt in/out of independently.",
    mutating: true,
    schema: z.object({
      name: z.string().describe("Topic name shown in subscription preferences"),
      description: z.string().optional().describe("Optional description of the topic"),
    }),
    handler: async (a, client) =>
      client.post("/topics", {
        name: a.name,
        ...(a.description ? { description: a.description } : {}),
      }),
  }),

  defineTool({
    name: "get_topic",
    description: "Retrieve a topic by ID.",
    mutating: false,
    schema: z.object({ id: idParam }),
    handler: async (a, client) => client.get(`/topics/${a.id}`),
  }),

  defineTool({
    name: "list_topics",
    description: "List all topics.",
    mutating: false,
    schema: z.object({}),
    handler: async (_a, client) => client.get("/topics"),
  }),

  defineTool({
    name: "update_topic",
    description: "Update a topic's name or description.",
    mutating: true,
    schema: z.object({
      id: idParam,
      name: z.string().optional(),
      description: z.string().optional(),
    }),
    handler: async (a, client) => {
      const { id, ...rest } = a;
      return client.patch(`/topics/${id}`, buildUpdateBody(rest));
    },
  }),

  defineTool({
    name: "delete_topic",
    description: "Delete a topic by ID.",
    mutating: true,
    schema: z.object({ id: idParam }),
    handler: async (a, client) => client.delete(`/topics/${a.id}`),
  }),
];
