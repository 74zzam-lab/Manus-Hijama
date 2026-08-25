# 09 — Backend Selection

## Options

| Option | Pros | Cons |
|--------|------|------|
| **Codex Fastify + Postgres (`server/`)** | Already sketched auth/sync/attachments; TypeScript | Not in Hybrid tree; deploy ops needed |
| Drive-only (status quo) | Works offline-ish; no server | Not authoritative RBAC; not true sync |
| New custom backend | Clean slate | Cost/time |

## Decision (planning)

**Adopt Codex Fastify/Postgres as the Owner Hub + Sync control plane**, adapted into Hybrid gradually (V2-4+). Keep Drive as optional file transport / backup upload — not the source of truth for membership/devices.

## Reuse checklist

- Auth login/refresh/sessions routes
- Sync mutations/changes/conflicts
- Attachment signed URLs
- Postgres migrations for tenants/branches/devices/events
- Row-level branch isolation middleware
- Rate limiting + audit logging (extend)

## Hybrid integration constraints

- Do not loosen Electron CSP broadly.
- API base URL from env / packaged config allowlist only.
- Desktop remains usable offline with queued outbox.
