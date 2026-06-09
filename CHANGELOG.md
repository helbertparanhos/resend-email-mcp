# Changelog

All notable changes to this project are documented here. Format based on
[Keep a Changelog](https://keepachangelog.com/); this project follows [SemVer](https://semver.org/).

## [1.0.1] - 2026-06-08

### Added
- `mcpName` field in package.json (`io.github.helbertparanhos/resend-email-mcp`) to enable
  listing on the official MCP Registry (and downstream directories like PulseMCP, mcp.so).
- `server.json` manifest for the official MCP Registry.

## [1.0.0] - 2026-06-08

Initial public release.

### Added
- **75 tools** covering the full Resend API: emails (send/batch/get/list/update/cancel/preview),
  sent & received attachments, domains, API keys, broadcasts, contacts, contact properties,
  segments, templates, topics, webhooks, and request logs.
- **Debug/diagnostics layer (7 tools):** `diagnose_domain`, `analyze_deliverability`,
  `inspect_email`, `explain_bounce`, `audit_account`, `search_logs`, `test_send`.
- **2 MCP resources:** `resend://account` and `resend://domains` for read-only context.
- `resend_raw` escape hatch for any endpoint not yet wrapped in a dedicated tool.
- Local-file attachments via `localPath` (sandboxed to `RESEND_ATTACHMENTS_DIR`).
- `RESEND_READONLY` mode that blocks every mutating tool.
- Per-tool MCP annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`).
- Automatic retry with backoff and rich, actionable error messages with hints.
- Configuration for Claude Code, Cursor, and Claude Desktop.

### Security
- `buildUrl` asserts the request origin matches the configured base URL — a crafted
  raw path can never redirect the `Authorization` header to another host.
- `RESEND_BASE_URL` is validated (https required; http allowed only for localhost).
- Disk reads via `localPath` are disabled by default and restricted to an explicit,
  traversal-checked directory with a size cap.
- Resource IDs are charset-restricted; emails, webhook URLs, and custom headers are
  validated (CRLF rejected) to prevent injection.
