# V2-5.3 — Performance / Timing

Owner/identity/license paths are local CAS + hash operations. Scenario suite (8) completes in well under 1s on Linux CI agents. Token TTL evaluated via `Date.parse` / `ttlHours`. Offline grace uses day-diff against `lastSuccessfulOnlineValidation`. No new remote polling loops introduced.
