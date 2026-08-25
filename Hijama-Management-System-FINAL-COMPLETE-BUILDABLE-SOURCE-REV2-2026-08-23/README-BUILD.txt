FINAL COMPLETE BUILDABLE SOURCE — REV2

This archive contains the complete current product source: application modules,
assets, database/migration code, Electron, cloud/licensing code, tests, scripts,
build configuration, package.json, package-lock.json, and docs/ required by npm test.

Clean build commands on Windows:
  npm ci
  npm test
  npm run build

The source archive deliberately has no node_modules/ or dist/. Those are generated
by npm ci and npm run build. Source-only Windows UAT wrappers report SKIPPED until
dist/ exists; they do not claim UAT PASS before a Windows build.
