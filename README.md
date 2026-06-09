# resend-email-mcp

**The most complete [Resend](https://resend.com) MCP server** — full coverage of the Resend API (emails, domains, contacts, broadcasts, templates, segments, topics, webhooks, logs) **plus a unique debug/diagnostics layer** no other Resend MCP offers: deliverability analysis, DNS troubleshooting, email lifecycle inspection, bounce explanation, and account auditing.

Works with **Claude Code, Cursor, Claude Desktop**, and any other MCP client.

[![npm](https://img.shields.io/npm/v/resend-email-mcp.svg)](https://www.npmjs.com/package/resend-email-mcp)
![license](https://img.shields.io/badge/license-MIT-green.svg)

---

## Why this MCP

| | resend-email-mcp | Official `resend-mcp` | Minimal MCPs |
|---|:---:|:---:|:---:|
| Send / batch / schedule | ✅ | ✅ | partial |
| Domains, contacts, broadcasts, templates, segments, topics, webhooks | ✅ | ✅ | ❌ |
| API request **logs** tools | ✅ | ❌ | ❌ |
| **Debug layer** (diagnose, analyze, inspect, explain, audit) | ✅ **7 tools** | ❌ | ❌ |
| Readonly safety mode | ✅ | ❌ | ❌ |
| Raw escape hatch for new endpoints | ✅ | ❌ | ❌ |
| Idempotency-key support | ✅ | partial | ❌ |

**75 tools + 2 resources.**

---

## Quick start

### 1. Get a Resend API key
Create one at **https://resend.com/api-keys**.

### 2. Add to your MCP client

#### Claude Code (CLI)
```bash
claude mcp add resend -e RESEND_API_KEY=re_xxxxxxxx -- npx -y resend-email-mcp
```

#### Cursor / Claude Desktop / generic (`mcp.json` / `claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "resend": {
      "command": "npx",
      "args": ["-y", "resend-email-mcp"],
      "env": {
        "RESEND_API_KEY": "re_xxxxxxxx",
        "RESEND_FROM": "Acme <hello@acme.com>"
      }
    }
  }
}
```

Config file locations:
- **Claude Desktop (Windows):** `%APPDATA%\Claude\claude_desktop_config.json`
- **Claude Desktop (macOS):** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Cursor:** `~/.cursor/mcp.json` (or per-project `.cursor/mcp.json`)

Restart the client and ask: *"Send a test email to delivered@resend.dev"* or *"Audit my Resend account."*

---

## Configuration

| Env var | Required | Description |
|---------|:---:|-------------|
| `RESEND_API_KEY` | ✅ | Your Resend API key |
| `RESEND_FROM` | – | Default sender for `send_email` when `from` is omitted (must be a verified domain) |
| `RESEND_REPLY_TO` | – | Default Reply-To address |
| `RESEND_READONLY` | – | `true` blocks every mutating tool (send/create/update/delete). Safe exploration of production |
| `RESEND_ATTACHMENTS_DIR` | – | Directory that `send_email`'s `localPath` attachments are restricted to. **Unset = disk reads disabled** (safe default; path traversal is blocked) |
| `RESEND_BASE_URL` | – | Override API base URL (default `https://api.resend.com`). Must be https (http only for localhost) |
| `RESEND_MAX_RETRIES` | – | Retries on 429/5xx (default `3`) |

---

## Tools

### Emails
`send_email` · `send_batch_emails` · `get_email` · `list_emails` · `update_email` · `cancel_email` · `preview_email`

> `send_email` accepts attachments by base64 `content`, public `path` (URL), or **`localPath`** (a file on disk, read and base64-encoded automatically — only enabled when `RESEND_ATTACHMENTS_DIR` is set, and restricted to that directory). `preview_email` dry-runs a message — resolving the final sender, sizing attachments, and surfacing warnings — **without sending**.

### Attachments (sent & received)
`list_email_attachments` · `get_email_attachment` · `list_received_emails` · `get_received_email` · `list_received_attachments` · `get_received_attachment`

### Domains
`create_domain` · `get_domain` · `list_domains` · `update_domain` · `delete_domain` · `verify_domain`

### API keys
`create_api_key` · `list_api_keys` · `delete_api_key`

### Broadcasts
`create_broadcast` · `get_broadcast` · `list_broadcasts` · `update_broadcast` · `send_broadcast` · `delete_broadcast`

### Contacts
`create_contact` · `get_contact` · `list_contacts` · `update_contact` · `delete_contact` · `get_contact_topics` · `update_contact_topics` · `list_contact_segments` · `add_contact_to_segment` · `remove_contact_from_segment`

### Contact properties
`create_contact_property` · `get_contact_property` · `list_contact_properties` · `update_contact_property` · `delete_contact_property`

### Segments
`create_segment` · `get_segment` · `list_segments` · `delete_segment` · `list_segment_contacts`

### Templates
`create_template` · `get_template` · `list_templates` · `update_template` · `delete_template` · `publish_template` · `duplicate_template`

### Topics
`create_topic` · `get_topic` · `list_topics` · `update_topic` · `delete_topic`

### Webhooks
`create_webhook` · `get_webhook` · `list_webhooks` · `update_webhook` · `delete_webhook`

### Logs
`list_logs` · `get_log`

### 🔍 Debug & diagnostics (the differentiator)
| Tool | What it does |
|------|--------------|
| `diagnose_domain` | Inspects every DNS record (SPF/DKIM/DMARC) and reports what's missing + how to fix it |
| `analyze_deliverability` | Aggregates recent sends into delivery/bounce/complaint rates with a health verdict |
| `inspect_email` | Renders one email's full lifecycle timeline and flags problems |
| `explain_bounce` | Classifies a bounce (hard/soft/block) and recommends the action |
| `audit_account` | One-shot health check of domains, keys, and deliverability |
| `search_logs` | Smart filtering of API logs by status/path/recipient to find failures |
| `test_send` | Safely simulates delivered/bounced/complained via Resend sandbox addresses |

### Escape hatch
`resend_raw` — call any Resend endpoint not yet wrapped in a dedicated tool.

## Resources

Beyond tools, the server exposes two read-only **MCP resources** so a client can pull account context without spending a tool call:

| URI | Content |
|-----|---------|
| `resend://account` | Domains + API keys snapshot |
| `resend://domains` | All sending domains with verification status |

Every tool is annotated with MCP hints (`readOnlyHint`, `destructiveHint`, `idempotentHint`) so clients can show which operations are safe and which need confirmation.

---

## Example prompts

- *"Diagnose why acme.com isn't verified."* → `diagnose_domain`
- *"How healthy is my email sending this week?"* → `analyze_deliverability`
- *"What happened to email re_abc123?"* → `inspect_email`
- *"Why did that email bounce and what should I do?"* → `explain_bounce`
- *"Something's wrong with my Resend setup — check everything."* → `audit_account`
- *"Send our launch newsletter to the 'beta' segment."* → `create_broadcast` + `send_broadcast`

---

## Testing safely

Use Resend's sandbox addresses (no reputation impact):
- `delivered@resend.dev` — simulates delivery
- `bounced@resend.dev` — simulates a hard bounce
- `complained@resend.dev` — simulates a spam complaint

Or just run `test_send` and then `inspect_email` on the returned ID.

Enable `RESEND_READONLY=true` to explore a production account without any risk of sending or deleting.

---

## Troubleshooting

This MCP is built to debug itself — when something fails, reach for the diagnostic tools instead of guessing.

| Symptom / error | Likely cause | What to run |
|-----------------|--------------|-------------|
| `validation_error: from domain is not verified` | Your `from`/`RESEND_FROM` domain isn't verified | `list_domains` → `diagnose_domain` (shows missing DNS records + fixes) → `verify_domain` |
| Emails send but never arrive | Deliverability / reputation issue | `analyze_deliverability` then `inspect_email` on a sample ID |
| `missing_api_key` / `invalid_api_key` (HTTP 401) | `RESEND_API_KEY` unset or wrong | Check the `.env`; create a key at resend.com/api-keys |
| `restricted_api_key` / `not_authorized` (403) | Key scoped to sending-only or one domain | Use a `full_access` key (`list_api_keys` to inspect) |
| `rate_limit_exceeded` (429) | Too many requests | The client auto-retries with backoff; reduce volume |
| `daily_quota_exceeded` | Plan send limit reached | Upgrade plan or wait for reset |
| A specific email bounced | Invalid/blocking recipient | `explain_bounce` (classifies hard/soft/block + action) |
| "Is anything wrong with my setup?" | — | `audit_account` (one-shot health check) |
| Request fails for unknown reason | — | `search_logs` with `only_errors: true` |

Every error returned by this server includes the HTTP status, Resend's error name, and an actionable **Hint** line.

---

## Local development

```bash
git clone https://github.com/helbertparanhos/resend-email-mcp.git
cd resend-email-mcp
npm install
npm run build
cp .env.example .env   # add your RESEND_API_KEY
npm run inspector      # opens the MCP Inspector against the built server
```

---

## License

MIT © [Helbert Paranhos / Strat Academy](https://stratacademy.com.br)

Built with the [Model Context Protocol](https://modelcontextprotocol.io). Not affiliated with Resend.
