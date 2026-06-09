# Test Report — resend-email-mcp v1.0.0

**Date:** 2026-06-08
**Environment:** Node 18+ · Windows 11
**Server:** `node dist/index.js` (75 tools + 2 resources)
**Account:** live Resend account with 1 verified domain (`notification.stratacademy.com.br`, sa-east-1)

## Methodology

Read tools and the debug layer were exercised against the **live Resend API** through the
built server's real handlers. Mutating tools that create/delete account state (domains, API keys,
broadcasts, contacts, templates, webhooks, segments, topics) were **validated by code review +
schema/build validation** rather than executed against the production account, to avoid mutating
real data. Sending was validated safely via Resend sandbox addresses (`*.resend.dev`).

## Results — exercised live ✅

| Tool / capability | Status | Notes |
|-------------------|--------|-------|
| `audit_account` | ✅ OK | Returned verdict, 1 verified domain, 5 API keys, 88-email sample |
| `list_domains` | ✅ OK | Verified domain, region sa-east-1 |
| `diagnose_domain` | ✅ OK | Parsed 3 verified DNS records, "ready to send" |
| `list_api_keys` | ✅ OK | 5 keys (metadata only) |
| `analyze_deliverability` | ✅ OK | 98.9% delivered; **detected 1 suppressed address** → verdict "Watch" |
| `list_emails` | ✅ OK | Pagination params honored |
| `send_email` (via `test_send`) | ✅ OK | Real send from verified domain to sandbox |
| `test_send` (delivered) | ✅ OK | Returned email_id |
| `inspect_email` | ✅ OK | Timeline rendered `delivered` with status meaning |
| `preview_email` | ✅ OK | Resolved sender, sized local attachment, 0 warnings |
| MCP server boot | ✅ OK | "ready — 75 tools" on stderr |
| ListTools annotations | ✅ OK | readOnly/destructive/idempotent hints emitted |

## Security hardening — verified ✅

| Check | Status |
|-------|--------|
| Crafted raw path cannot change host (Bearer never leaks) | ✅ 5 attack vectors all stayed on api.resend.com |
| `RESEND_BASE_URL` http (non-localhost) rejected | ✅ |
| `localPath` disabled without `RESEND_ATTACHMENTS_DIR` | ✅ |
| `localPath` path traversal blocked | ✅ |
| `localPath` legitimate file inside sandbox read | ✅ |
| `idParam` injection (`../../x`) rejected by schema | ✅ |
| Invalid email rejected by schema | ✅ |
| Empty `update_*` rejected ("Nothing to update") | ✅ |

## Validated by review (not run against prod) ⓘ

CRUD mutating tools for domains, API keys, broadcasts, contacts, contact properties, segments,
templates, topics, webhooks, and `resend_raw`. All share the same `defineTool` pattern, Zod
schemas, and client path construction that were exercised by the live read/debug tools above,
and passed the code + security review (see `REVIEW.md`).

## Summary

- **Live-exercised:** 12 tools/capabilities + 8 security checks — all ✅
- **Validated by review:** remaining mutating CRUD tools
- **Critical errors:** none
- **Known limitations:** deliverability tools sample the most recent 100 emails (one page);
  `localPath` requires `RESEND_ATTACHMENTS_DIR`.

Full quality + security audit: see [REVIEW.md](REVIEW.md). Certificate: 🏆 Approved for production.
