#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ResendClient, ResendError } from "./client.js";
import { allTools, toolsByName } from "./tools/index.js";

const VERSION = "1.0.1";

/**
 * Minimal zero-dependency .env loader. Looks for a `.env` next to the package
 * root (../ from dist/) and in the current working directory. Values already
 * present in process.env always win, so explicit MCP-client env overrides files.
 */
function loadDotEnv(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, "..", ".env"), join(process.cwd(), ".env")];
  for (const file of candidates) {
    let raw: string;
    try {
      raw = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      if (key.startsWith("#")) continue;
      let value = m[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

loadDotEnv();

function bool(v: string | undefined): boolean {
  return v !== undefined && ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

const READONLY = bool(process.env.RESEND_READONLY);

const client = new ResendClient(process.env.RESEND_API_KEY ?? "", {
  baseUrl: process.env.RESEND_BASE_URL,
  maxRetries: process.env.RESEND_MAX_RETRIES ? Number(process.env.RESEND_MAX_RETRIES) : undefined,
});

const server = new Server(
  { name: "resend-email-mcp", version: VERSION },
  { capabilities: { tools: {}, resources: {} } }
);

/** Title-cases a snake_case tool name, e.g. "send_email" -> "Send Email". */
function humanizeTitle(name: string): string {
  return name
    .split("_")
    .map((w) => (w === "api" ? "API" : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/** Destructive = irreversibly removes or cancels data. */
function isDestructive(name: string): boolean {
  return /^(delete_|destroy_|cancel_|remove_)/.test(name);
}

/** Idempotent = repeating the call yields the same end state (no extra side effects). */
function isIdempotent(name: string, mutating: boolean): boolean {
  if (!mutating) return true; // reads are idempotent
  // delete/update/add-to/remove-from converge to the same state; creates/sends do not.
  return /^(delete_|update_|verify_|publish_|add_contact_to_segment|remove_contact_from_segment)/.test(
    name
  );
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: allTools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(t.schema, { target: "jsonSchema7" }) as Record<string, unknown>,
    annotations: {
      title: humanizeTitle(t.name),
      readOnlyHint: !t.mutating,
      destructiveHint: t.mutating ? isDestructive(t.name) : false,
      idempotentHint: isIdempotent(t.name, t.mutating),
      openWorldHint: true, // every tool talks to the external Resend API
    },
  })),
}));

// ─── MCP Resources: read-only account context the client can discover ──────
const RESOURCES = [
  {
    uri: "resend://account",
    name: "Resend account overview",
    description: "Domains and API keys on the connected Resend account (read-only snapshot).",
    mimeType: "application/json",
  },
  {
    uri: "resend://domains",
    name: "Resend domains",
    description: "All sending domains with their verification status.",
    mimeType: "application/json",
  },
];

server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: RESOURCES }));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  let payload: unknown;
  try {
    if (uri === "resend://domains") {
      payload = await client.get("/domains");
    } else if (uri === "resend://account") {
      const [domains, apiKeys] = await Promise.all([
        client.get("/domains").catch((e) => ({ error: String((e as Error).message) })),
        client.get("/api-keys").catch((e) => ({ error: String((e as Error).message) })),
      ]);
      payload = { domains, api_keys: apiKeys };
    } else {
      throw new McpError(ErrorCode.InvalidParams, `Unknown resource: ${uri}`);
    }
  } catch (err) {
    if (err instanceof McpError) throw err;
    const message = err instanceof ResendError ? err.toReadable() : (err as Error).message;
    throw new McpError(ErrorCode.InternalError, message);
  }
  return {
    contents: [{ uri, mimeType: "application/json", text: JSON.stringify(payload, null, 2) }],
  };
});

/** A mutating call is blocked in readonly mode, with one exception:
 *  resend_raw with a GET method is effectively read-only and stays allowed. */
function isBlockedByReadonly(name: string, args: Record<string, unknown>): boolean {
  if (!READONLY) return false;
  const tool = toolsByName.get(name);
  if (!tool || !tool.mutating) return false;
  if (name === "resend_raw" && String(args.method).toUpperCase() === "GET") return false;
  return true;
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: rawArgs } = request.params;
  const tool = toolsByName.get(name);
  if (!tool) {
    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  }

  const args = rawArgs ?? {};

  if (isBlockedByReadonly(name, args as Record<string, unknown>)) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Tool "${name}" is a mutating operation and RESEND_READONLY is enabled. Unset RESEND_READONLY to allow it.`
    );
  }

  // Validate arguments against the tool's Zod schema.
  const parsed = tool.schema.safeParse(args);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new McpError(ErrorCode.InvalidParams, `Invalid arguments for "${name}":\n${issues}`);
  }

  try {
    const result = await tool.handler(parsed.data, client);
    return {
      content: [
        { type: "text", text: typeof result === "string" ? result : JSON.stringify(result, null, 2) },
      ],
    };
  } catch (err) {
    if (err instanceof ResendError) {
      // Return a tool-level error so the model can read the hint and self-correct.
      return {
        isError: true,
        content: [{ type: "text", text: err.toReadable() }],
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: "text", text: `Error in ${name}: ${message}` }] };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Logged to stderr so it never corrupts the stdio JSON-RPC stream.
  console.error(
    `resend-email-mcp v${VERSION} ready — ${allTools.length} tools${READONLY ? " (READONLY mode)" : ""}.`
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
