# 09 — Security Threat Model and UAT

## Trust boundaries

1. Renderer — untrusted for authorization decisions  
2. Preload allowlist IPC — trusted channel with validation  
3. Main process services — enforce role/branch/center  
4. Google OAuth identity ≠ Owner role  
5. Drive JSON — untrusted until schema/checksum validated  

## Mitigations implemented / in progress

| Threat | Mitigation | Status |
|--------|------------|--------|
| Refresh token theft from Renderer | safeStorage token-store main-only | Code present; Windows inspect pending |
| Path traversal attachments | `attachment-sync.validateAttachment` | Automated PASS in unit test |
| Executable attachment | Blocked extensions | Automated PASS |
| Cross-branch read | BranchScope + outbox branch_id + ID paths | Peer harness PASS; IPC attack UAT pending |
| Half-written remote JSON | `atomicReplaceJson` | Code present; real Drive UAT pending |
| Secrets in logs | Redaction policy; harness masks | Workflow forbids logging secrets |
| CSP / external fonts / QR | Must not regress V2-3.5 | REG required |
| Tampered remote JSON | Quarantine + classify corrupt | Policy in error classify; runtime pending |
| Forged role via DevTools | Trusted-layer checks | DeviceRegistry approve owner-only; more pending |

## Negative tests required

Tampered JSON, wrong center/branch, oversized payload, replayed event, forged device ID, unauthorized Google account — mark PASS only with evidence.
