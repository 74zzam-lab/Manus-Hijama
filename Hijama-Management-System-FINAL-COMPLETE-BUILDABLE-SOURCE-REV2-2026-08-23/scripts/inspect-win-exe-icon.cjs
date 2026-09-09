#!/usr/bin/env node
'use strict';

/**
 * Inspect PE icon resources of a Windows EXE using resedit (no GUI).
 * Writes JSON summary for ICON-004 evidence.
 */
const fs = require('fs');
const path = require('path');

async function main() {
  const exePath = process.argv[2];
  if (!exePath || !fs.existsSync(exePath)) {
    console.error(JSON.stringify({ ok: false, error: 'exe_missing', exePath }));
    process.exit(1);
  }
  const ResEdit = require('resedit');
  const exeData = fs.readFileSync(exePath);
  const exe = ResEdit.NtExecutable.from(exeData, { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(exe);
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const iconEntries = res.entries.filter((e) => e.type === 3 /* RT_ICON */ || e.type === 14 /* RT_GROUP_ICON */);
  const summary = {
    ok: groups.length > 0,
    exePath,
    sizeBytes: exeData.length,
    iconGroupCount: groups.length,
    iconResourceEntries: iconEntries.length,
    groups: groups.map((g) => ({
      id: g.id,
      lang: g.lang,
      iconCount: Array.isArray(g.icons) ? g.icons.length : (g.icons ? Object.keys(g.icons).length : null),
    })),
    inspectedAt: new Date().toISOString(),
  };
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.ok ? 0 : 2);
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e && e.message || e) }));
  process.exit(1);
});
