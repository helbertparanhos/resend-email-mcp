import type { ToolDef } from "../types.js";
import { emailTools } from "./emails.js";
import { attachmentTools } from "./attachments.js";
import { receivedTools } from "./received.js";
import { domainTools } from "./domains.js";
import { apiKeyTools } from "./api-keys.js";
import { broadcastTools } from "./broadcasts.js";
import { contactTools } from "./contacts.js";
import { contactPropertyTools } from "./contact-properties.js";
import { segmentTools } from "./segments.js";
import { templateTools } from "./templates.js";
import { topicTools } from "./topics.js";
import { webhookTools } from "./webhooks.js";
import { logTools } from "./logs.js";
import { debugTools } from "./debug.js";
import { rawTools } from "./raw.js";

/** Every tool the server exposes, in a sensible grouping order. */
export const allTools: ToolDef[] = [
  ...emailTools,
  ...attachmentTools,
  ...receivedTools,
  ...domainTools,
  ...apiKeyTools,
  ...broadcastTools,
  ...contactTools,
  ...contactPropertyTools,
  ...segmentTools,
  ...templateTools,
  ...topicTools,
  ...webhookTools,
  ...logTools,
  ...debugTools,
  ...rawTools,
];

// Fail fast on duplicate tool names (catches copy/paste mistakes at startup).
const seen = new Set<string>();
for (const t of allTools) {
  if (seen.has(t.name)) throw new Error(`Duplicate tool name: ${t.name}`);
  seen.add(t.name);
}

export const toolsByName = new Map(allTools.map((t) => [t.name, t]));
