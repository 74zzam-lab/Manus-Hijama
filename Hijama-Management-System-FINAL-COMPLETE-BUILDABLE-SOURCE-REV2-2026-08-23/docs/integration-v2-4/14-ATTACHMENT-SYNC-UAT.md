# 14 — Attachment Sync UAT

## Automated (local helpers)

`database/attachment-sync.js` + `test-v2-4-policies-attachments.js`:

- SHA-256 content addressing  
- MIME/extension policy  
- Path traversal / executable blocked  
- Local blob temp→verify→rename  
- Remote path under `centers/{id}/branches/{id}/attachments/{sha256}`

## Real Drive A↔B

| Case | Result |
|------|--------|
| Small image/PDF sync | NOT_STARTED |
| Dedup same hash | NOT_STARTED |
| Interrupted upload | NOT_STARTED |
| Corrupt download quarantine | NOT_STARTED |
| Branch isolation of blobs | NOT_STARTED |
| 0-byte / oversized reject | Automated local PASS |
