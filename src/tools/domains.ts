import { z } from "zod";
import { defineTool, idParam, buildUpdateBody } from "../types.js";

const REGIONS = ["us-east-1", "eu-west-1", "sa-east-1", "ap-northeast-1"] as const;

export const domainTools = [
  defineTool({
    name: "create_domain",
    description:
      "Add a sending domain to Resend. Returns the DNS records (SPF, DKIM, optional DMARC) you must add to your DNS provider before verifying.",
    mutating: true,
    schema: z.object({
      name: z.string().describe('Domain name, e.g. "acme.com" or "mail.acme.com"'),
      region: z
        .enum(REGIONS)
        .optional()
        .describe("Sending region (default us-east-1)"),
      custom_return_path: z
        .string()
        .optional()
        .describe('Custom Return-Path subdomain (default "send")'),
    }),
    handler: async (a, client) =>
      client.post("/domains", {
        name: a.name,
        ...(a.region ? { region: a.region } : {}),
        ...(a.custom_return_path ? { custom_return_path: a.custom_return_path } : {}),
      }),
  }),

  defineTool({
    name: "get_domain",
    description:
      "Retrieve a domain by ID, including verification status and the full list of DNS records with their current state.",
    mutating: false,
    schema: z.object({ id: idParam }),
    handler: async (a, client) => client.get(`/domains/${a.id}`),
  }),

  defineTool({
    name: "list_domains",
    description: "List all domains on the account with their verification status.",
    mutating: false,
    schema: z.object({}),
    handler: async (_a, client) => client.get("/domains"),
  }),

  defineTool({
    name: "update_domain",
    description:
      "Update a domain's settings: open/click tracking and TLS enforcement.",
    mutating: true,
    schema: z.object({
      id: idParam,
      open_tracking: z.boolean().optional().describe("Enable open tracking"),
      click_tracking: z.boolean().optional().describe("Enable click tracking"),
      tls: z
        .enum(["opportunistic", "enforced"])
        .optional()
        .describe('TLS policy: "opportunistic" (default) or "enforced"'),
    }),
    handler: async (a, client) => {
      const body = buildUpdateBody({
        open_tracking: a.open_tracking,
        click_tracking: a.click_tracking,
        tls: a.tls,
      });
      return client.patch(`/domains/${a.id}`, body);
    },
  }),

  defineTool({
    name: "delete_domain",
    description: "Permanently delete a domain from Resend.",
    mutating: true,
    schema: z.object({ id: idParam }),
    handler: async (a, client) => client.delete(`/domains/${a.id}`),
  }),

  defineTool({
    name: "verify_domain",
    description:
      "Trigger verification for a domain after adding its DNS records. Re-checks SPF/DKIM. Use diagnose_domain for a human-readable report of what is still missing.",
    mutating: true,
    schema: z.object({ id: idParam }),
    handler: async (a, client) => client.post(`/domains/${a.id}/verify`),
  }),
];
