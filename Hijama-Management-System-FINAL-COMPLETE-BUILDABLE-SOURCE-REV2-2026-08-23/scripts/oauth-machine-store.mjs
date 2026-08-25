#!/usr/bin/env node
/**
 * Machine-level Google OAuth secrets store (outside git / outside each branch folder).
 * Windows: %APPDATA%\NajjarTech\cloud-oauth.local.json
 * Others:  ~/.config/NajjarTech/cloud-oauth.local.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

export const PROJECT_LOCAL = join(ROOT, 'electron', 'cloud-oauth.config.local.json');
export const PROJECT_EXAMPLE = join(ROOT, 'electron', 'cloud-oauth.config.local.example.json');
export const PROJECT_TARGET = join(ROOT, 'electron', 'cloud-oauth.config.json');

export function machineStorePath() {
  if (process.platform === 'win32') {
    const base = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');
    return join(base, 'NajjarTech', 'cloud-oauth.local.json');
  }
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(base, 'NajjarTech', 'cloud-oauth.local.json');
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function hasGoogleCreds(cfg) {
  const g = cfg?.google || cfg;
  const secret = String(g?.clientSecret || '');
  const clientId = String(g?.clientId || '');
  return !!(clientId && secret &&
    !clientId.includes('YOUR_') &&
    !clientId.includes('REPLACE_ME') &&
    !secret.includes('YOUR_') &&
    !secret.includes('PASTE_YOUR') &&
    !secret.includes('REPLACE_ME') &&
    !secret.includes('BOOTSTRAP_AT_BUILD'));
}

export function ensureMachineDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

export function loadMachineConfig() {
  const p = machineStorePath();
  if (!existsSync(p)) return null;
  try {
    const cfg = readJson(p);
    return hasGoogleCreds(cfg) ? cfg : null;
  } catch {
    return null;
  }
}

export function saveMachineConfig(cfg) {
  const p = machineStorePath();
  ensureMachineDir(p);
  writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  return p;
}

export function syncMachineToProject() {
  const machine = loadMachineConfig();
  if (!machine) return { ok: false, error: 'machine_store_missing' };
  writeFileSync(PROJECT_LOCAL, JSON.stringify(machine, null, 2) + '\n', 'utf8');
  copyFileSync(PROJECT_LOCAL, PROJECT_TARGET);
  return { ok: true, machinePath: machineStorePath(), projectLocal: PROJECT_LOCAL };
}

export function buildConfigFromSecret(clientSecret, clientId) {
  let base = { google: {}, onedrive: {}, dropbox: {} };
  if (existsSync(PROJECT_EXAMPLE)) {
    try { base = readJson(PROJECT_EXAMPLE); } catch { /* keep */ }
  }
  base.google = {
    ...(base.google || {}),
    clientId: clientId || base.google?.clientId,
    clientSecret,
    redirectPort: Number(base.google?.redirectPort || 42813),
  };
  return base;
}
