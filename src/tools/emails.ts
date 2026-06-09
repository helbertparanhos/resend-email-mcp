import { z } from "zod";
import { readFileSync, statSync } from "node:fs";
import { basename, resolve, sep } from "node:path";
import {
  defineTool,
  idParam,
  emailRecipient,
  attachmentSchema,
  tagSchema,
  paginationFields,
  customHeadersSchema,
} from "../types.js";

/** Generous upper bound on inline body size to avoid runaway memory use. */
const MAX_BODY_CHARS = 5_000_000;

type Attachment = z.infer<typeof attachmentSchema>;

/** Max size for a locally-read attachment (Resend's hard limit is 40MB total). */
const MAX_LOCAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/**
 * Resolves a `localPath` to an absolute path that is guaranteed to live inside the
 * sandbox directory configured by RESEND_ATTACHMENTS_DIR. Reading from disk is
 * OFF by default — this prevents the model from exfiltrating arbitrary host files
 * (e.g. ~/.ssh/id_rsa, .env) by attaching them to an outbound email.
 */
function resolveLocalAttachmentPath(localPath: string): string {
  const baseDir = process.env.RESEND_ATTACHMENTS_DIR;
  if (!baseDir) {
    throw new Error(
      "Reading attachments from disk (localPath) is disabled. Set RESEND_ATTACHMENTS_DIR to an allowed directory to enable it, or pass the file as base64 `content` / a public `path` URL instead."
    );
  }
  const root = resolve(baseDir);
  const target = resolve(root, localPath);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error(
      `Attachment localPath "${localPath}" resolves outside the allowed directory (${root}). Path traversal is blocked.`
    );
  }
  return target;
}

/** Resolves attachments: a `localPath` is read from the sandbox and base64-encoded. */
function resolveAttachments(attachments: Attachment[]): Record<string, unknown>[] {
  return attachments.map((att) => {
    if (att.localPath) {
      const safePath = resolveLocalAttachmentPath(att.localPath);
      let buf: Buffer;
      try {
        const size = statSync(safePath).size;
        if (size > MAX_LOCAL_ATTACHMENT_BYTES) {
          throw new Error(
            `Attachment "${safePath}" is ${(size / 1024 / 1024).toFixed(1)}MB, over the ${MAX_LOCAL_ATTACHMENT_BYTES / 1024 / 1024}MB limit.`
          );
        }
        buf = readFileSync(safePath);
      } catch (err) {
        throw new Error(
          `Could not read attachment localPath "${att.localPath}": ${(err as Error).message}.`
        );
      }
      const out: Record<string, unknown> = {
        filename: att.filename ?? basename(safePath),
        content: buf.toString("base64"),
      };
      if (att.content_type) out.content_type = att.content_type;
      return out;
    }
    if (!att.content && !att.path) {
      throw new Error(
        `Attachment "${att.filename ?? "(unnamed)"}" needs one of: content (base64), path (URL), or localPath.`
      );
    }
    const out: Record<string, unknown> = { filename: att.filename };
    if (att.content) out.content = att.content;
    if (att.path) out.path = att.path;
    if (att.content_type) out.content_type = att.content_type;
    return out;
  });
}

/** Builds the API body for a single email from friendly camelCase args. */
function buildEmailBody(a: z.infer<typeof singleEmailFields>) {
  const from = a.from ?? process.env.RESEND_FROM;
  if (!from) {
    throw new Error(
      "No `from` address provided and RESEND_FROM is not set. Pass `from` (must use a verified domain) or set RESEND_FROM."
    );
  }
  const replyTo = a.replyTo ?? process.env.RESEND_REPLY_TO;

  const body: Record<string, unknown> = {
    from,
    to: a.to,
    subject: a.subject,
  };
  if (a.html !== undefined) body.html = a.html;
  if (a.text !== undefined) body.text = a.text;
  if (a.cc !== undefined) body.cc = a.cc;
  if (a.bcc !== undefined) body.bcc = a.bcc;
  if (replyTo) body.reply_to = replyTo;
  if (a.scheduledAt !== undefined) body.scheduled_at = a.scheduledAt;
  if (a.attachments !== undefined) body.attachments = resolveAttachments(a.attachments);
  if (a.tags !== undefined) body.tags = a.tags;
  if (a.headers !== undefined) body.headers = a.headers;
  if (a.templateId !== undefined) {
    body.template = { id: a.templateId, ...(a.templateData ? { data: a.templateData } : {}) };
  }
  return body;
}

const singleEmailFields = z.object({
  from: z
    .string()
    .optional()
    .describe('Sender, e.g. "Acme <hello@acme.com>". Falls back to RESEND_FROM. Domain must be verified.'),
  to: emailRecipient,
  subject: z.string().describe("Email subject line"),
  html: z.string().max(MAX_BODY_CHARS).optional().describe("HTML body (provide html and/or text)"),
  text: z.string().max(MAX_BODY_CHARS).optional().describe("Plain-text body (provide html and/or text)"),
  cc: emailRecipient.optional(),
  bcc: emailRecipient.optional(),
  replyTo: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe("Reply-To address(es). Falls back to RESEND_REPLY_TO."),
  scheduledAt: z
    .string()
    .optional()
    .describe('Schedule for later: ISO-8601 or natural language like "in 1 hour" / "tomorrow at 9am"'),
  attachments: z.array(attachmentSchema).optional(),
  tags: z.array(tagSchema).optional(),
  headers: customHeadersSchema.optional(),
  templateId: z.string().optional().describe("Send using a saved template instead of html/text"),
  templateData: z
    .record(z.unknown())
    .optional()
    .describe("Variables to interpolate into the template"),
});

const sendEmailSchema = singleEmailFields.extend({
  idempotencyKey: z
    .string()
    .optional()
    .describe("Optional Idempotency-Key to make retries safe (avoids duplicate sends)"),
});

export const emailTools = [
  defineTool({
    name: "send_email",
    description:
      "Send a single email via Resend. Supports HTML/text, cc/bcc, reply-to, attachments, tags, custom headers, scheduling, and templates. Uses RESEND_FROM as the default sender when `from` is omitted.",
    mutating: true,
    schema: sendEmailSchema,
    handler: async (a, client) => {
      if (!a.html && !a.text && !a.templateId) {
        throw new Error("Provide at least one of: `html`, `text`, or `templateId`.");
      }
      const body = buildEmailBody(a);
      return client.post("/emails", body, a.idempotencyKey);
    },
  }),

  defineTool({
    name: "send_batch_emails",
    description:
      "Send up to 100 distinct emails in one call (one API request). Each entry is a full email object. Note: batch sends do NOT support attachments or scheduling per Resend limits.",
    mutating: true,
    schema: z.object({
      emails: z
        .array(singleEmailFields.omit({ attachments: true, scheduledAt: true }))
        .min(1)
        .max(100)
        .describe("Array of 1-100 email objects"),
      idempotencyKey: z.string().optional().describe("Optional Idempotency-Key for the whole batch"),
    }),
    handler: async (a, client) => {
      const payload = a.emails.map((e) => buildEmailBody(e));
      return client.post("/emails/batch", payload, a.idempotencyKey);
    },
  }),

  defineTool({
    name: "get_email",
    description: "Retrieve a single sent email by ID, including its current delivery status.",
    mutating: false,
    schema: z.object({ id: idParam }),
    handler: async (a, client) => client.get(`/emails/${a.id}`),
  }),

  defineTool({
    name: "list_emails",
    description: "List sent emails (paginated). Useful to find recent sends and their IDs.",
    mutating: false,
    schema: z.object({ ...paginationFields }),
    handler: async (a, client) =>
      client.get("/emails", { limit: a.limit, after: a.after, before: a.before }),
  }),

  defineTool({
    name: "update_email",
    description: "Update a scheduled email — currently only the scheduled send time can be changed.",
    mutating: true,
    schema: z.object({
      id: idParam,
      scheduledAt: z
        .string()
        .describe('New schedule: ISO-8601 or natural language like "in 2 hours"'),
    }),
    handler: async (a, client) => client.patch(`/emails/${a.id}`, { scheduled_at: a.scheduledAt }),
  }),

  defineTool({
    name: "cancel_email",
    description: "Cancel a scheduled email that has not been sent yet.",
    mutating: true,
    schema: z.object({ id: idParam }),
    handler: async (a, client) => client.post(`/emails/${a.id}/cancel`),
  }),

  defineTool({
    name: "preview_email",
    description:
      "Dry-run an email WITHOUT sending it. Resolves the final `from` (incl. RESEND_FROM default), validates the payload, reads/sizes any local attachments, and returns a summary plus warnings. Use to verify a message before calling send_email.",
    mutating: false,
    schema: sendEmailSchema,
    handler: async (a) => {
      const warnings: string[] = [];
      if (!a.html && !a.text && !a.templateId) {
        warnings.push("No html, text, or templateId provided — send_email would reject this.");
      }

      let resolvedFrom: string | null = null;
      try {
        resolvedFrom = (buildEmailBody(a).from as string) ?? null;
      } catch (err) {
        warnings.push((err as Error).message);
      }

      const attachments = (a.attachments ?? []).map((att) => {
        const info: Record<string, unknown> = { filename: att.filename };
        if (att.localPath) {
          info.source = "localPath";
          try {
            const safePath = resolveLocalAttachmentPath(att.localPath);
            const size = statSync(safePath).size;
            info.filename = att.filename ?? basename(safePath);
            info.bytes = size;
            if (size > MAX_LOCAL_ATTACHMENT_BYTES) {
              warnings.push(`Attachment "${att.localPath}" exceeds the size limit.`);
            }
          } catch (err) {
            warnings.push(`Attachment localPath: ${(err as Error).message}`);
            info.error = "unreadable";
          }
        } else if (att.content) {
          info.source = "base64";
          info.bytes = Math.floor((att.content.length * 3) / 4);
        } else if (att.path) {
          info.source = "url";
          info.url = att.path;
        } else {
          warnings.push(`Attachment "${att.filename ?? "(unnamed)"}" has no content/path/localPath.`);
        }
        return info;
      });

      return {
        would_send: warnings.length === 0,
        resolved_from: resolvedFrom,
        to: a.to,
        cc: a.cc ?? null,
        bcc: a.bcc ?? null,
        reply_to: a.replyTo ?? process.env.RESEND_REPLY_TO ?? null,
        subject: a.subject,
        body: {
          has_html: Boolean(a.html),
          html_length: a.html?.length ?? 0,
          has_text: Boolean(a.text),
          text_length: a.text?.length ?? 0,
          template_id: a.templateId ?? null,
        },
        scheduled_at: a.scheduledAt ?? null,
        attachments,
        tags: a.tags ?? [],
        warnings,
        next_step:
          warnings.length === 0
            ? "Looks good — call send_email with the same arguments to deliver."
            : "Resolve the warnings above before sending.",
      };
    },
  }),
];
