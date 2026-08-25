#!/usr/bin/env node
/**
 * Build installer BMP assets + NSIS branding defines + Program-Icon.ico from branding.config.json.
 */
import { buildBrandAssets } from './branding-engine.mjs';

async function main() {
  const result = await buildBrandAssets();
  const { source, outputs, iconIco, upscaled } = result;
  console.log(`Branding Engine — build assets`);
  console.log(`Source logo: ${source.path} (${source.width}×${source.height}, ${source.hasAlpha ? 'RGBA' : 'RGB'})`);
  console.log(`Generated NSIS: ${outputs.nsisBranding}`);
  console.log(`Generated BMP: Installer-Sidebar, Uninstaller-Sidebar, Installer-Header`);
  if (upscaled) console.warn('Warning: logo was upscaled (should not happen with withoutEnlargement)');
  else console.log('Logo resize: downscale only (no upscale beyond source resolution)');
  if (iconIco?.generated) {
    console.log(`Generated ICO: ${iconIco.path} from ${iconIco.source} (${iconIco.sizes?.join(', ')}px)`);
  } else if (iconIco) {
    console.log(`App icon preserved: ${iconIco.path} (valid Windows ICO)`);
  } else {
    console.log('Note: build/Program-Icon.ico not generated');
  }
}

main().catch((err) => {
  console.error('generate-brand-assets failed:', err.message);
  process.exit(1);
});
