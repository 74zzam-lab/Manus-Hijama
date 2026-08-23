'use strict';

/**
 * electron-builder afterPack hook (Hybrid).
 *
 * Embeds build/Program-Icon.ico into the Windows EXE without enabling
 * signAndEditExecutable / winCodeSign (which fails on Windows without
 * SeCreateSymbolicLinkPrivilege when extracting darwin symlinks).
 *
 * Uses the pure-JS `resedit` library — works on Windows and on Linux
 * cross-builds of win32 targets. Not Authenticode signing (K-32).
 */
const fs = require('fs');
const path = require('path');
const ResEdit = require('resedit');

async function embedWindowsIcon(context) {
  if (context.electronPlatformName !== 'win32') return;

  const productFilename = context.packager.appInfo.productFilename;
  const exePath = path.join(context.appOutDir, `${productFilename}.exe`);
  const iconPath = path.join(context.packager.projectDir, 'build', 'Program-Icon.ico');

  if (!fs.existsSync(exePath)) {
    console.warn(`[afterPack] EXE not found, skip icon embed: ${exePath}`);
    return;
  }
  if (!fs.existsSync(iconPath)) {
    console.warn(`[afterPack] ICO not found, skip icon embed: ${iconPath}`);
    return;
  }

  const exeData = fs.readFileSync(exePath);
  const exe = ResEdit.NtExecutable.from(exeData, { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(exe);
  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(iconPath));
  const iconList = iconFile.icons.map((item) => item.data);

  let groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  if (!groups.length) {
    throw new Error('[afterPack] no IconGroupEntry found in EXE — cannot embed icon');
  }
  for (const group of groups) {
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
      res.entries,
      group.id,
      group.lang,
      iconList
    );
  }

  // Refresh version strings when present (best-effort; do not fail the build).
  try {
    const versionEntries = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
    const version = String(context.packager.appInfo.version || '0.0.0');
    const productName = String(context.packager.appInfo.productName || productFilename);
    const copyright = String(context.packager.appInfo.copyright || '');
    for (const ver of versionEntries) {
      ver.setStringValues(
        { lang: 1033, codepage: 1200 },
        {
          FileDescription: productName,
          ProductName: productName,
          CompanyName: 'NajjarTech',
          LegalCopyright: copyright,
          OriginalFilename: `${productFilename}.exe`,
        }
      );
      if (typeof ver.setFileVersion === 'function') ver.setFileVersion(version);
      if (typeof ver.setProductVersion === 'function') ver.setProductVersion(version);
      ver.outputToResourceEntries(res.entries);
    }
  } catch (err) {
    console.warn('[afterPack] version resource update skipped:', err.message);
  }

  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log(`[afterPack] Embedded Program-Icon.ico into ${productFilename}.exe (resedit; no winCodeSign)`);
}

exports.default = async function afterPack(context) {
  await embedWindowsIcon(context);
};
