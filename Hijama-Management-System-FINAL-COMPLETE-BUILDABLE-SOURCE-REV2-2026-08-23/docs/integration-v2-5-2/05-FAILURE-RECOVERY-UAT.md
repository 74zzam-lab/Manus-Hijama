# V2-5.2 — Failure & Recovery Plan

**Status:** NOT_STARTED

| Scenario | Expected |
|----------|----------|
| Upload interrupt | resume or local-ok; no valid partial remote |
| Quota exceeded | classified; local backup kept |
| Token expiry mid-sync | refresh + continue or clear recoverable error |
| 429 | backoff; queue retained |
| Corrupt remote | quarantine; no empty overwrite |
| Logout | pending outbox retained |
