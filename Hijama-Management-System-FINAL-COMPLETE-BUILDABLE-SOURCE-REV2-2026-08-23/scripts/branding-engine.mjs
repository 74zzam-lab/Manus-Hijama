/**
 * Branding Engine — single source of truth for company/product identity.
 * Used by: generate-brand-assets, branding-audit, electron/main.js (via JSON require).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { Jimp } from 'jimp';
import toIco from 'to-ico';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
export const CONFIG_PATH = path.join(ROOT, 'branding.config.json');
export const BUILD_DIR = path.join(ROOT, 'build');

/** Branding asset paths — see branding/README.md */
export const BRAND_PATHS = {
  programIcon: 'build/Program-Icon.ico',
  installerSidebar: 'build/Installer-Sidebar.bmp',
  uninstallerSidebar: 'build/Uninstaller-Sidebar.bmp',
  installerHeader: 'build/Installer-Header.bmp',
  companyLogo: 'assets/NajjarTech-Logo.png',
  centerLogo: 'branding/Center-Logo.png',
};

export function loadBrandingConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Missing branding config: ${CONFIG_PATH}`);
  }
  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  return normalizeConfig(raw);
}

export function normalizeConfig(raw) {
  const year = new Date().getFullYear();
  const company = raw.company || {};
  const product = raw.product || {};
  return {
    company: {
      name: company.name || 'NajjarTech',
      tagline: company.tagline || 'Software Solutions',
      website: company.website || 'https://najjartech.com',
      websiteDisplay: company.websiteDisplay || 'www.najjartech.com',
      supportEmail: company.supportEmail || 'support@najjartech.com',
      copyright: company.copyright || `© ${year} NajjarTech. All rights reserved.`,
    },
    product: {
      name: product.name || 'Hijama Management System',
      nameAr: product.nameAr || 'نظام إدارة الحجامة',
      description: product.description || '',
      descriptionAr: product.descriptionAr || '',
      dbSchemaVersion: product.dbSchemaVersion ?? 3,
    },
    assets: {
      companyLogo: raw.assets?.companyLogo || raw.assets?.logo || BRAND_PATHS.companyLogo,
      centerLogo: raw.assets?.centerLogo || BRAND_PATHS.centerLogo,
      logo: raw.assets?.logo || raw.assets?.companyLogo || BRAND_PATHS.companyLogo,
      logoAlt: raw.assets?.logoAlt || company.name || 'Company',
    },
    buildIcons: {
      programIcon: raw.buildIcons?.programIcon || BRAND_PATHS.programIcon,
    },
    ui: {
      showPublicContact: !!raw.ui?.showPublicContact,
    },
    installer: raw.installer || {},
  };
}

export function resolveLogoPath(config) {
  const rel = config.assets.companyLogo || config.assets.logo || BRAND_PATHS.companyLogo;
  return path.join(ROOT, rel.replace(/^\//, ''));
}

export function resolveIconSourcePath(config) {
  const rel = config.buildIcons?.iconSource || config.assets.centerLogo || config.assets.companyLogo || BRAND_PATHS.centerLogo;
  return path.join(ROOT, rel.replace(/^\//, ''));
}

/** True when file is a Windows .ico container (not JPEG/PNG renamed). */
export function isValidIcoFile(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return false;
    const buf = fs.readFileSync(filePath);
    if (buf.length < 6) return false;
    if (buf[0] === 0xff && buf[1] === 0xd8) return false;
    if (buf[0] === 0x89 && buf[1] === 0x50) return false;
    return buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0;
  } catch {
    return false;
  }
}

export async function generateProgramIconIco(srcPath, outPath, sizes = [16, 24, 32, 48, 64, 128, 256]) {
  if (!fs.existsSync(srcPath)) {
    throw new Error(`Icon source not found: ${srcPath}`);
  }
  const pngBuffers = await Promise.all(
    sizes.map((size) =>
      sharp(srcPath)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
          kernel: sharp.kernel.lanczos3,
        })
        .png()
        .toBuffer()
    )
  );
  const ico = await toIco(pngBuffers);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, ico);
  return { outPath, sizes, bytes: ico.length };
}

function nsisEscape(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n/g, '$\\r$\\n')
    .replace(/"/g, '$\\"');
}

export function generateNsisBranding(config) {
  const c = config.company;
  const p = config.product;
  const w = config.installer.welcome || {};
  const f = config.installer.finish || {};
  const footer = `Developed by ${c.name} - ${c.tagline}$\\r$\\n${c.websiteDisplay}`;
  const welcomeText = [
    w.bodyEn || `Welcome to ${p.name}`,
    '',
    w.bodyAr || '',
    '',
    footer,
  ].join('\n');
  const finishText = [
    f.bodyEn || `${p.name} has been installed successfully.`,
    '',
    footer,
    '',
    f.bodyAr || '',
  ].join('\n');

  const lines = [
    '; AUTO-GENERATED from branding.config.json — do not edit manually',
    `!define BRAND_COMPANY "${nsisEscape(c.name).replace(/\$\\r\$\\n/g, '')}"`,
    `!define BRAND_TAGLINE "${nsisEscape(c.tagline).replace(/\$\\r\$\\n/g, '')}"`,
    `!define BRAND_WEBSITE "${nsisEscape(c.websiteDisplay).replace(/\$\\r\$\\n/g, '')}"`,
    `!define BRAND_PRODUCT "${nsisEscape(p.name).replace(/\$\\r\$\\n/g, '')}"`,
    `!define BRAND_WELCOME_TITLE "${nsisEscape(w.titleEn || `Welcome to ${p.name}`).replace(/\$\\r\$\\n/g, '')}"`,
    `!define BRAND_WELCOME_TEXT "${nsisEscape(welcomeText)}"`,
    `!define BRAND_FINISH_TITLE "${nsisEscape(f.titleEn || 'Installation Complete').replace(/\$\\r\$\\n/g, '')}"`,
    `!define BRAND_FINISH_TEXT "${nsisEscape(finishText)}"`,
    `!define BRAND_FINISH_RUN "Launch ${nsisEscape(p.name).replace(/\$\\r\$\\n/g, '')}"`,
    '',
  ];
  const out = path.join(BUILD_DIR, 'installer-branding.nsh');
  fs.mkdirSync(BUILD_DIR, { recursive: true });
  fs.writeFileSync(out, lines.join('\n'), 'utf8');
  return out;
}

async function makeGradientBg(width, height, installerCfg) {
  const bg = installerCfg.background || {};
  const dark = bg.dark || { r: 12, g: 16, b: 22 };
  const blue = bg.accentBlue || { r: 0, g: 140, b: 255, a: 0.12 };
  const orange = bg.accentOrange || { r: 255, g: 120, b: 40, a: 0.1 };
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="rgb(${dark.r},${dark.g},${dark.b})"/>
        <stop offset="55%" stop-color="rgb(18,24,34)"/>
        <stop offset="100%" stop-color="rgb(28,18,12)"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <circle cx="${Math.round(width * 0.2)}" cy="${Math.round(height * 0.15)}" r="${Math.round(width * 0.35)}" fill="rgba(${blue.r},${blue.g},${blue.b},${blue.a ?? 0.12})"/>
    <circle cx="${Math.round(width * 0.85)}" cy="${Math.round(height * 0.88)}" r="${Math.round(width * 0.4)}" fill="rgba(${orange.r},${orange.g},${orange.b},${orange.a ?? 0.1})"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function resizeLogoDown(srcPath, maxW, maxH, srcMeta) {
  const targetW = Math.min(maxW, srcMeta.width);
  const targetH = Math.min(maxH, srcMeta.height);
  return sharp(srcPath)
    .resize({
      width: targetW,
      height: targetH,
      fit: 'inside',
      withoutEnlargement: true,
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();
}

async function composeInstallerCanvas({ width, height, logoMaxW, logoMaxH, padding, srcPath, srcMeta, installerCfg, outPath }) {
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  const bg = await makeGradientBg(width, height, installerCfg);
  const logo = await resizeLogoDown(srcPath, Math.min(logoMaxW, innerW), Math.min(logoMaxH, innerH), srcMeta);
  const logoMeta = await sharp(logo).metadata();
  const left = Math.round((width - logoMeta.width) / 2);
  const top = Math.round((height - logoMeta.height) / 2);
  const pngBuf = await sharp(bg)
    .composite([{ input: logo, left, top, blend: 'over' }])
    .png({ compressionLevel: 6, quality: 100 })
    .toBuffer();
  const img = await Jimp.read(pngBuf);
  await img.write(outPath);
  return {
    canvas: { width, height },
    logo: { width: logoMeta.width, height: logoMeta.height, left, top },
    upscaled: logoMeta.width > srcMeta.width || logoMeta.height > srcMeta.height,
  };
}

export async function buildBrandAssets(options = {}) {
  const config = options.config || loadBrandingConfig();
  const srcPath = resolveLogoPath(config);
  if (!fs.existsSync(srcPath)) {
    throw new Error(`Logo not found: ${srcPath}`);
  }
  const srcMeta = await sharp(srcPath).metadata();
  if (!srcMeta.width || !srcMeta.height) {
    throw new Error('Invalid logo dimensions');
  }

  fs.mkdirSync(BUILD_DIR, { recursive: true });
  const nsisPath = generateNsisBranding(config);
  const installerCfg = config.installer || {};
  const sidebarCfg = installerCfg.sidebar || { width: 164, height: 314, logoMaxWidth: 130, logoMaxHeight: 220, padding: 8 };
  const headerCfg = installerCfg.header || { width: 150, height: 57, logoMaxWidth: 120, logoMaxHeight: 44, padding: 4 };

  const sidebar = await composeInstallerCanvas({
    width: sidebarCfg.width,
    height: sidebarCfg.height,
    logoMaxW: sidebarCfg.logoMaxWidth,
    logoMaxH: sidebarCfg.logoMaxHeight,
    padding: sidebarCfg.padding ?? 8,
    srcPath,
    srcMeta,
    installerCfg,
    outPath: path.join(BUILD_DIR, 'Installer-Sidebar.bmp'),
  });
  const unSidebar = await composeInstallerCanvas({
    ...sidebarCfg,
    width: sidebarCfg.width,
    height: sidebarCfg.height,
    logoMaxW: sidebarCfg.logoMaxWidth,
    logoMaxH: sidebarCfg.logoMaxHeight,
    padding: sidebarCfg.padding ?? 8,
    srcPath,
    srcMeta,
    installerCfg,
    outPath: path.join(BUILD_DIR, 'Uninstaller-Sidebar.bmp'),
  });
  const header = await composeInstallerCanvas({
    width: headerCfg.width,
    height: headerCfg.height,
    logoMaxW: headerCfg.logoMaxWidth,
    logoMaxH: headerCfg.logoMaxHeight,
    padding: headerCfg.padding ?? 4,
    srcPath,
    srcMeta,
    installerCfg,
    outPath: path.join(BUILD_DIR, 'Installer-Header.bmp'),
  });

  const iconIcoPath = path.join(ROOT, config.buildIcons?.programIcon || BRAND_PATHS.programIcon);
  const iconSourcePath = resolveIconSourcePath(config);
  let iconIco = null;
  const shouldWriteIcon = options.forceIcon || !isValidIcoFile(iconIcoPath);
  if (shouldWriteIcon) {
    const generated = await generateProgramIconIco(iconSourcePath, iconIcoPath);
    const stat = fs.statSync(iconIcoPath);
    iconIco = {
      path: iconIcoPath,
      source: iconSourcePath,
      generated: true,
      sizes: generated.sizes,
      bytes: generated.bytes,
      mtime: stat.mtime.toISOString(),
    };
  } else {
    const stat = fs.statSync(iconIcoPath);
    iconIco = { path: iconIcoPath, generated: false, mtime: stat.mtime.toISOString(), size: stat.size };
  }

  return {
    config,
    source: { path: srcPath, width: srcMeta.width, height: srcMeta.height, hasAlpha: !!srcMeta.hasAlpha },
    outputs: {
      installerSidebar: sidebar,
      uninstallerSidebar: unSidebar,
      installerHeader: header,
      nsisBranding: nsisPath,
    },
    iconIco,
    upscaled: sidebar.upscaled || header.upscaled,
  };
}

export function getAppMetaFromConfig(config, pkgVersion) {
  const c = config.company;
  const p = config.product;
  const v = pkgVersion || process.env.npm_package_version || '2.0.0';
  return {
    productName: p.name,
    productNameAr: p.nameAr,
    company: c.name,
    companyTagline: c.tagline,
    version: v,
    buildVersion: v,
    dbSchemaVersion: p.dbSchemaVersion,
    copyright: c.copyright,
    supportEmail: c.supportEmail,
    website: c.website,
    showPublicContact: config.ui.showPublicContact,
    description: p.description,
    descriptionAr: p.descriptionAr,
    logo: config.assets.companyLogo || config.assets.logo,
    centerLogo: config.assets.centerLogo,
    logoAlt: config.assets.logoAlt,
    logoWidth: null,
    logoHeight: null,
  };
}
