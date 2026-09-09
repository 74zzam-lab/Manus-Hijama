# Repository Transition — status

**Previous policy:** deferred until Production Candidate YES.  
**Owner request (2026-08-02):** start migration **before** personal live UAT; UAT will run on the new repo.  
**Agent execution:** **BLOCKED on GitHub `createRepository`** — integration token cannot create or initialize the new repo.

## What is ready in this archive repo

| Item | Path |
|------|------|
| Migration plan | `RELEASE-MIGRATION-PLAN.md` |
| New-chat prompt | `NEW-CHAT-PROMPT-AFTER-MIGRATION.md` |
| Seed export script | `scripts/repository-transition/export-production-seed.sh` |
| Prep checklist | `PREPARED-TRANSITION-CHECKLIST.md` |

## Current Source of Truth (until you cut over)

This repository (`Cupping-System-Management`) remains SoT until code exists on the new production repo and you declare cutover in that repo’s `CURRENT-STATUS.md`.

## Still true after early move

- Production Candidate remains **NO** until A–E evidence  
- Do not delete this archive repo  
- Do not inflate scores without new independent review  

## Owner next step

1. Create empty GitHub repo (Private, no README) under `7uzzam`  
2. Push seed tip **or** open new Cursor chat on that repo with `NEW-CHAT-PROMPT-AFTER-MIGRATION.md`  
3. Run personal A–E on Setup EXE from the **new** repo Releases  
