# V2-5.1 — Performance / Timing

**Status:** Recorded from scenario runner

See `evidence/timing-scenarios.json` for per-scenario durations (create/restore/pick/resume on host).

Representative (linux host, local SSD/tmp):

- Clean install restore ~75–90ms for seeded DB
- Pick latest authorized ~600ms (multiple inspect decrypts)
- Resume after interrupt ~60ms

Cloud download timings depend on Drive network and are measured on GHA/Windows when remote files are used.
