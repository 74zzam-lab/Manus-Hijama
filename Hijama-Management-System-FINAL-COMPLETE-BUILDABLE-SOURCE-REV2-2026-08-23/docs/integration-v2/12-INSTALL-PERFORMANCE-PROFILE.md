# 12 — Install Performance Profile

Runner: runnervmlazl1
Installer: HijamaManagement-Setup-2.0.1.exe

| العملية | Run 1 | Run 2 | Run 3 | Median | الهدف | الحكم |
|---|---:|---:|---:|---:|---:|---|
| Installer startup | 0.721 | 0.464 | 0.438 | 0.464 | ≤5s | PASS |
| Clean install | 14.281 | 11.822 | 11.593 | 11.822 | ≤30s | PASS |
| Update | 12.565 | 12.597 | 12.847 | 12.597 | ≤30s | PASS |
| App-only uninstall | 2.138 | 1.612 | 1.581 | 1.612 | ≤15s | PASS |
| Repair | 12.883 | - | - | 12.883 | ≤30s | PASS |

Installer startup = process launch to MainWindowHandle (or early exit) on interactive open (killed after ready).
Silent apply times include extraction+copy.
Step log: `performance-timings.json`
