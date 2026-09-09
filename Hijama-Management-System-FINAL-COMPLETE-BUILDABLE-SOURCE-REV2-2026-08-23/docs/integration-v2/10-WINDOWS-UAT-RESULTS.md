# 10 — Windows UAT Results

Generated: 2026-07-29T23:47:27.0270436+00:00
Runner: runnervmlazl1
Installer SHA-256: 577c1f3900d83de45395216e2ce94c20a696ea754eac0c9ddc7936bd01d9d010

## Commands
- Silent install: `HijamaManagement-Setup-*.exe /S`
- Silent uninstall app-only: Uninstall.exe /S (no /FULLWIPE)
- Full wipe silent: Uninstall.exe /S /FULLWIPE=1

## Outcomes
- Clean install median: 11.822s
- Update median: 12.597s
- Uninstall median: 1.612s
- Update data preserved: True
- Update license preserved: True
- App-only uninstall kept userData: True
- App-only kept license marker: True
- Full wipe removed userData: True
- Overall Ok: True

Raw JSON: `docs/integration-v2/evidence/lifecycle-results.json`
