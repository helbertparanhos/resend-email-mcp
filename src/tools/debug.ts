import { z } from "zod";
import { defineTool, idParam } from "../types.js";
import type { ResendClient } from "../client.js";

/* ────────────────────────────────────────────────────────────────────────
 * The debug/diagnostics layer — the differentiator of this MCP.
 * Each tool composes multiple raw API calls into a human-readable diagnosis.
 * All are READ-ONLY except test_send (which sends to Resend sandbox addresses).
 * ──────────────────────────────────────────────────────────────────────── */

type AnyRec = Record<string, any>;

/** Resend list endpoints return either {data:[...]} or a bare array. Normalize. */
function asArray(res: any): AnyRec[] {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.data)) return res.data;
  if (res && Array.isArray(res.data?.data)) return res.data.data;
  return [];
}

export const debugTools = [
  // 1 ─────────────────────────────────────────────────────────────────────
  defineTool({
    name: "diagnose_domain",
    description:
      "Deep DNS/verification diagnosis for a sending domain. Fetches the domain, inspects every required DNS record (SPF, DKIM, DMARC, MX, Return-Path), reports what is verified vs. pending/missing, and gives concrete fix steps. Use this whenever sending fails with 'domain not verified' or before going live.",
    mutating: false,
    schema: z.object({ id: idParam.describe("Domain ID (from list_domains)") }),
    handler: async (a, client: ResendClient) => {
      const domain: AnyRec = await client.get(`/domains/${a.id}`);
      const records: AnyRec[] = Array.isArray(domain.records) ? domain.records : [];

      const verified: AnyRec[] = [];
      const pending: AnyRec[] = [];
      for (const r of records) {
        const status = String(r.status ?? "").toLowerCase();
        (status === "verified" ? verified : pending).push(r);
      }

      const issues: string[] = [];
      const fixes: string[] = [];

      if (String(domain.status).toLowerCase() !== "verified") {
        issues.push(`Domain status is "${domain.status}" (not verified).`);
      }
      for (const r of pending) {
        issues.push(
          `Record ${r.record ?? r.type} (${r.name ?? "?"}) is "${r.status}".`
        );
        fixes.push(
          `Add a ${r.type} record at host "${r.name}" with value "${r.value}"${
            r.priority ? ` (priority ${r.priority})` : ""
          } in your DNS provider, then run verify_domain.`
        );
      }
      const hasSpf = records.some((r) => /spf|return|mx/i.test(`${r.record}${r.type}${r.value}`));
      const hasDkim = records.some((r) => /dkim|domainkey/i.test(`${r.record}${r.name}`));
      if (!hasSpf) issues.push("No SPF/Return-Path record found in the domain config.");
      if (!hasDkim) issues.push("No DKIM record found — emails will likely be marked as spam.");

      return {
        domain: { id: domain.id, name: domain.name, status: domain.status, region: domain.region },
        summary:
          issues.length === 0
            ? "✅ Domain is fully verified and ready to send."
            : `⚠️ ${issues.length} issue(s) found — domain not ready.`,
        records_verified: verified.length,
        records_pending: pending.length,
        issues,
        fixes,
        next_step:
          issues.length === 0
            ? "You can send from this domain."
            : "Apply the DNS fixes above, wait for propagation (minutes–48h), then call verify_domain.",
      };
    },
  }),

  // 2 ─────────────────────────────────────────────────────────────────────
  defineTool({
    name: "analyze_deliverability",
    description:
      "Aggregate the MOST RECENT sent emails (up to 100 — a single page, not the full history) into deliverability metrics: delivered / bounced / complained / suppressed / opened / clicked counts and rates, plus a health verdict and recommendations. Use to answer 'how is my email health?' or to investigate a recent drop in delivery.",
    mutating: false,
    schema: z.object({
      sample: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("How many recent emails to analyze (default 100)"),
    }),
    handler: async (a, client: ResendClient) => {
      const limit = a.sample ?? 100;
      const res = await client.get("/emails", { limit });
      const emails = asArray(res);

      const counts: AnyRec = {
        total: emails.length,
        delivered: 0,
        sent: 0,
        bounced: 0,
        complained: 0,
        opened: 0,
        clicked: 0,
        delivery_delayed: 0,
        failed: 0,
        suppressed: 0,
        scheduled: 0,
        queued: 0,
        canceled: 0,
        other: 0,
      };
      for (const e of emails) {
        let ev = String(e.last_event ?? e.status ?? "other").toLowerCase().replace(/^email\./, "");
        if (ev === "cancelled") ev = "canceled"; // normalize spelling
        if (ev in counts) counts[ev]++;
        else counts.other++;
      }
      const pct = (n: number) => (counts.total ? `${((n / counts.total) * 100).toFixed(1)}%` : "0%");
      // opened/clicked imply the message reached the inbox, so they count as delivered too.
      const reachedInbox = counts.delivered + counts.opened + counts.clicked;
      // In-flight states aren't terminal — exclude them from health rates.
      const inFlight = counts.sent + counts.scheduled + counts.queued + counts.delivery_delayed;
      const terminal = Math.max(counts.total - inFlight, 0);
      const bounceRate = terminal ? counts.bounced / terminal : 0;
      const complaintRate = terminal ? counts.complained / terminal : 0;

      const recommendations: string[] = [];
      let verdict = "✅ Healthy";
      if (bounceRate > 0.05) {
        verdict = "🔴 At risk";
        recommendations.push(
          `Bounce rate ${pct(counts.bounced)} exceeds 5% — clean your list and stop mailing invalid addresses (use explain_bounce on recent bounces).`
        );
      } else if (bounceRate > 0.02) {
        verdict = "🟡 Watch";
        recommendations.push(`Bounce rate ${pct(counts.bounced)} is elevated — monitor closely.`);
      }
      if (complaintRate > 0.001) {
        verdict = "🔴 At risk";
        recommendations.push(
          `Complaint rate ${pct(counts.complained)} exceeds 0.1% — review consent and unsubscribe handling immediately.`
        );
      }
      if (counts.suppressed > 0) {
        if (verdict === "✅ Healthy") verdict = "🟡 Watch";
        recommendations.push(
          `${counts.suppressed} email(s) were suppressed (recipient on the suppression list from a prior bounce/complaint). Stop mailing these addresses — remove them from your list.`
        );
      }
      if (counts.failed > 0) {
        recommendations.push(
          `${counts.failed} email(s) failed before delivery — inspect_email on them and check the from-domain/payload.`
        );
      }
      if (counts.total === 0) recommendations.push("No emails found to analyze.");

      return {
        sample_size: counts.total,
        verdict,
        counts,
        terminal_emails: terminal,
        in_flight: inFlight,
        rates: {
          reached_inbox: pct(reachedInbox),
          delivered: pct(counts.delivered),
          opened: pct(counts.opened),
          clicked: pct(counts.clicked),
          bounced: terminal ? `${((counts.bounced / terminal) * 100).toFixed(1)}% (of terminal)` : "0%",
          complained: terminal ? `${((counts.complained / terminal) * 100).toFixed(1)}% (of terminal)` : "0%",
        },
        note:
          inFlight > 0
            ? `${inFlight} email(s) are still in-flight (sent/scheduled/queued/delayed) and excluded from bounce/complaint rates.`
            : undefined,
        recommendations: recommendations.length ? recommendations : ["No issues detected in this sample."],
      };
    },
  }),

  // 3 ─────────────────────────────────────────────────────────────────────
  defineTool({
    name: "inspect_email",
    description:
      "Full lifecycle view of one email: fetches it and renders a readable timeline of its events (sent → delivered → opened → clicked, or bounced/complained), highlighting the final state and any problem. Use to answer 'what happened to this email?'.",
    mutating: false,
    schema: z.object({ id: idParam.describe("The sent email ID") }),
    handler: async (a, client: ResendClient) => {
      const e: AnyRec = await client.get(`/emails/${a.id}`);
      const lastEvent = String(e.last_event ?? e.status ?? "unknown").replace(/^email\./, "");

      const problem =
        /bounce|complain|fail/i.test(lastEvent)
          ? `⚠️ This email ended in "${lastEvent}". ${
              /bounce/i.test(lastEvent)
                ? "Run explain_bounce for the cause and next action."
                : "Review recipient consent and content."
            }`
          : null;

      return {
        id: e.id,
        from: e.from,
        to: e.to,
        subject: e.subject,
        created_at: e.created_at,
        last_event: lastEvent,
        scheduled_at: e.scheduled_at ?? null,
        timeline: [
          e.created_at && `created_at: ${e.created_at}`,
          `current_state: ${lastEvent}`,
        ].filter(Boolean),
        status_meaning: explainState(lastEvent),
        problem,
        raw: e,
      };
    },
  }),

  // 4 ─────────────────────────────────────────────────────────────────────
  defineTool({
    name: "explain_bounce",
    description:
      "Diagnose why an email bounced. Fetches the email, classifies the bounce as hard / soft / block / suppressed, explains it in plain language, and recommends the correct action (remove address, retry later, fix content, etc.).",
    mutating: false,
    schema: z.object({ id: idParam.describe("The bounced email ID") }),
    handler: async (a, client: ResendClient) => {
      const e: AnyRec = await client.get(`/emails/${a.id}`);
      const last = String(e.last_event ?? e.status ?? "").toLowerCase();
      const bounce = e.bounce ?? e.bounce_details ?? {};
      const type = String(bounce.type ?? bounce.subType ?? "").toLowerCase();
      const reason = bounce.message ?? bounce.reason ?? e.reason ?? "No detailed reason provided by Resend.";

      if (!/bounce/i.test(last) && !type) {
        return {
          id: e.id,
          classification: "not_bounced",
          summary: `This email's last event is "${last || "unknown"}", not a bounce. Nothing to explain.`,
        };
      }

      let classification = "unknown";
      let action = "";
      if (/hard|permanent|invalid|no.?such|does.?not.?exist/i.test(type + reason)) {
        classification = "hard_bounce";
        action = "Permanently remove this address from your list. It does not exist or rejects mail permanently.";
      } else if (/block|reputation|spam|content|policy/i.test(type + reason)) {
        classification = "block";
        action = "The receiving server blocked the message (reputation/content/policy). Improve sending reputation, warm up, and review content/links.";
      } else if (/soft|mailbox.?full|temporary|timeout|defer/i.test(type + reason)) {
        classification = "soft_bounce";
        action = "Temporary issue (full mailbox / transient). Safe to retry later; if it persists, treat as hard bounce.";
      } else {
        action = "Review the raw reason below. If the address is clearly invalid, remove it; otherwise retry once.";
      }

      return {
        id: e.id,
        to: e.to,
        classification,
        reason,
        recommended_action: action,
        raw_bounce: bounce,
      };
    },
  }),

  // 5 ─────────────────────────────────────────────────────────────────────
  defineTool({
    name: "audit_account",
    description:
      "One-shot health check of the whole Resend account: lists domains (and whether they're verified), API keys, and recent deliverability (most recent 100 emails), then returns a prioritized list of problems and recommendations. Great first call when 'emails aren't working'.",
    mutating: false,
    schema: z.object({}),
    handler: async (_a, client: ResendClient) => {
      const [domainsRes, keysRes, emailsRes] = await Promise.all([
        client.get("/domains").catch((e) => ({ error: String(e?.message ?? e) })),
        client.get("/api-keys").catch((e) => ({ error: String(e?.message ?? e) })),
        client.get("/emails", { limit: 100 }).catch((e) => ({ error: String(e?.message ?? e) })),
      ]);

      const domains = asArray(domainsRes);
      const keys = asArray(keysRes);
      const emails = asArray(emailsRes);

      const verifiedDomains = domains.filter(
        (d) => String(d.status).toLowerCase() === "verified"
      );
      const unverifiedDomains = domains.filter(
        (d) => String(d.status).toLowerCase() !== "verified"
      );

      let bounced = 0;
      let complained = 0;
      for (const e of emails) {
        const ev = String(e.last_event ?? e.status ?? "").toLowerCase();
        if (/bounce/.test(ev)) bounced++;
        if (/complain/.test(ev)) complained++;
      }

      const problems: string[] = [];
      if (domains.length === 0) problems.push("No domains configured — you can only send from onboarding@resend.dev (testing).");
      if (verifiedDomains.length === 0 && domains.length > 0)
        problems.push("No verified domain — sending from your own domain will fail. Run diagnose_domain.");
      for (const d of unverifiedDomains)
        problems.push(`Domain "${d.name}" is "${d.status}" — run diagnose_domain on id ${d.id}.`);
      if (keys.length === 0) problems.push("No API keys listed (or the current key lacks permission to list keys).");
      if (emails.length && bounced / emails.length > 0.05)
        problems.push(`High bounce rate in last ${emails.length} emails (${bounced} bounced). Run analyze_deliverability.`);
      if (complained > 0)
        problems.push(`${complained} spam complaint(s) in the recent sample — review consent.`);

      return {
        verdict: problems.length === 0 ? "✅ Account looks healthy" : `⚠️ ${problems.length} issue(s) found`,
        domains: {
          total: domains.length,
          verified: verifiedDomains.map((d) => d.name),
          unverified: unverifiedDomains.map((d) => ({ id: d.id, name: d.name, status: d.status })),
        },
        api_keys: keys.length,
        recent_sample: { analyzed: emails.length, bounced, complained },
        problems,
        recommendations:
          problems.length === 0
            ? ["Nothing to fix. Optionally run analyze_deliverability for trends."]
            : ["Address the problems above in order. Start with domain verification."],
      };
    },
  }),

  // 6 ─────────────────────────────────────────────────────────────────────
  defineTool({
    name: "search_logs",
    description:
      "Smart search over API request logs: fetch recent logs and filter by HTTP status, status class (e.g. only errors), endpoint path substring, and/or recipient. Returns matching entries plus a breakdown of error types. Use to find why requests are failing.",
    mutating: false,
    schema: z.object({
      sample: z.number().int().min(1).max(100).optional().describe("How many recent logs to scan (default 100)"),
      status: z.number().int().optional().describe("Exact HTTP status to match, e.g. 422"),
      only_errors: z.boolean().optional().describe("Keep only entries with status >= 400"),
      path_contains: z.string().optional().describe('Substring of the endpoint path, e.g. "/emails"'),
      recipient_contains: z.string().optional().describe("Substring to match against recipient/email fields"),
    }),
    handler: async (a, client: ResendClient) => {
      const res = await client.get("/logs", { limit: a.sample ?? 100 });
      const logs = asArray(res);

      const matched = logs.filter((l) => {
        const status = Number(l.status ?? l.status_code ?? l.response_status ?? 0);
        const path = String(l.path ?? l.endpoint ?? l.url ?? "");
        const blob = JSON.stringify(l).toLowerCase();
        if (a.status !== undefined && status !== a.status) return false;
        if (a.only_errors && status < 400) return false;
        if (a.path_contains && !path.includes(a.path_contains)) return false;
        if (a.recipient_contains && !blob.includes(a.recipient_contains.toLowerCase())) return false;
        return true;
      });

      const byStatus: Record<string, number> = {};
      for (const l of matched) {
        const s = String(l.status ?? l.status_code ?? l.response_status ?? "unknown");
        byStatus[s] = (byStatus[s] ?? 0) + 1;
      }

      return {
        scanned: logs.length,
        matched: matched.length,
        status_breakdown: byStatus,
        entries: matched.slice(0, 25),
        note: matched.length > 25 ? "Showing first 25 matches. Narrow the filters for more precision." : undefined,
      };
    },
  }),

  // 7 ─────────────────────────────────────────────────────────────────────
  defineTool({
    name: "test_send",
    description:
      "Validate your sending setup by sending to Resend's sandbox addresses, which deterministically simulate outcomes WITHOUT hurting your reputation. Choose 'delivered', 'bounced', or 'complained'. Returns the resulting email ID so you can inspect_email it.",
    mutating: true,
    schema: z.object({
      outcome: z
        .enum(["delivered", "bounced", "complained"])
        .describe("Which scenario to simulate"),
      from: z
        .string()
        .optional()
        .describe("Sender (defaults to RESEND_FROM, else onboarding@resend.dev)"),
      subject: z.string().optional().describe("Subject (default: 'resend-email-mcp test send')"),
    }),
    handler: async (a, client: ResendClient) => {
      const sandbox = {
        delivered: "delivered@resend.dev",
        bounced: "bounced@resend.dev",
        complained: "complained@resend.dev",
      } as const;
      const from = a.from ?? process.env.RESEND_FROM ?? "onboarding@resend.dev";
      const to = sandbox[a.outcome];

      const result: any = await client.post("/emails", {
        from,
        to,
        subject: a.subject ?? "resend-email-mcp test send",
        html: `<p>Test send simulating <strong>${a.outcome}</strong> via resend-email-mcp.</p>`,
        text: `Test send simulating ${a.outcome} via resend-email-mcp.`,
      });

      return {
        simulated_outcome: a.outcome,
        sent_to: to,
        from,
        email_id: result?.id ?? result?.data?.id ?? null,
        next_step: `Use inspect_email with this email_id to watch it reach the "${a.outcome}" state.`,
        result,
      };
    },
  }),
];

function explainState(state: string): string {
  const s = state.toLowerCase();
  if (s.includes("delivered")) return "Successfully delivered to the recipient's mail server.";
  if (s.includes("sent")) return "Accepted by Resend and handed off; awaiting a delivery event.";
  if (s.includes("bounce")) return "Rejected by the recipient server. Run explain_bounce.";
  if (s.includes("complain")) return "Recipient marked it as spam. Review consent and content.";
  if (s.includes("opened")) return "Recipient opened the email (open tracking).";
  if (s.includes("clicked")) return "Recipient clicked a link (click tracking).";
  if (s.includes("delay")) return "Delivery delayed; the server will retry.";
  if (s.includes("suppress")) return "Blocked: the recipient is on your suppression list (prior bounce/complaint). Remove them from your list.";
  if (s.includes("fail")) return "Sending failed before delivery. Check from-domain and payload.";
  if (s.includes("scheduled") || s.includes("queue")) return "Scheduled/queued for future delivery.";
  if (s.includes("canceled") || s.includes("cancelled")) return "The scheduled send was canceled.";
  return "Unrecognized state — see raw payload.";
}
