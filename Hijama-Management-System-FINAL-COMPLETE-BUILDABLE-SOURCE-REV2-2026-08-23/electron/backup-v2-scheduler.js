'use strict';

const fs = require('fs');
const path = require('path');
const { writeFileAtomicSync } = require('./atomic-file');

/** @deprecated Plaintext V2 backups no longer use a schedule password — kept for vault cleanup only. */
const PASSWORD_CREDENTIAL = 'backup-v2-schedule-password';
const DEFAULT_INTERVAL_MINUTES = 15;
const MIN_INTERVAL_MINUTES = 15;
const MAX_INTERVAL_MINUTES = 7 * 24 * 60;
const DEFAULT_RETENTION_COUNT = 1;
const DEFAULT_CLOUD_RETENTION_COUNT = 1;

function boundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function safeError(error) {
  return String(error?.message || 'scheduled_backup_failed').replace(/[\r\n\t]/g, ' ').slice(0, 300);
}

class BackupV2Scheduler {
  constructor(options) {
    if (!options?.userDataDir || typeof options.runBackup !== 'function' || !options.credentialVault) {
      throw new Error('backup_scheduler_options_invalid');
    }
    this.userDataDir = path.resolve(options.userDataDir);
    this.configPath = path.join(this.userDataDir, 'settings', 'backup-v2-schedule.json');
    this.runBackup = options.runBackup;
    this.credentialVault = options.credentialVault;
    this.now = options.nowProvider || (() => Date.now());
    this.setInterval = options.setInterval || global.setInterval;
    this.clearInterval = options.clearInterval || global.clearInterval;
    this.minimumInterval = options.minimumIntervalMinutes || MIN_INTERVAL_MINUTES;
    this.timer = null;
    this.running = false;
  }

  readConfig() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      return this.normalize(parsed);
    } catch {
      return this.normalize({ enabled: false });
    }
  }

  normalize(input) {
    const config = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    return {
      version: 2,
      enabled: config.enabled === true,
      intervalMinutes: boundedInteger(config.intervalMinutes, DEFAULT_INTERVAL_MINUTES, this.minimumInterval, MAX_INTERVAL_MINUTES),
      retentionCount: boundedInteger(config.retentionCount, DEFAULT_RETENTION_COUNT, 1, 100),
      cloudRetentionCount: boundedInteger(config.cloudRetentionCount, DEFAULT_CLOUD_RETENTION_COUNT, 1, 20),
      localPath: typeof config.localPath === 'string' ? config.localPath.slice(0, 500) : '',
      cloudEnabled: config.cloudEnabled === true,
      provider: typeof config.provider === 'string' ? config.provider.slice(0, 50) : 'google',
      centerName: typeof config.centerName === 'string' ? config.centerName.slice(0, 200) : '',
      deviceName: typeof config.deviceName === 'string' ? config.deviceName.slice(0, 200) : '',
      lastAttemptAt: typeof config.lastAttemptAt === 'string' ? config.lastAttemptAt : null,
      lastSuccessAt: typeof config.lastSuccessAt === 'string' ? config.lastSuccessAt : null,
      lastStatus: typeof config.lastStatus === 'string' ? config.lastStatus.slice(0, 50) : 'idle',
      lastError: typeof config.lastError === 'string' ? config.lastError.slice(0, 300) : null,
    };
  }

  writeConfig(config) {
    const normalized = this.normalize(config);
    writeFileAtomicSync(this.configPath, `${JSON.stringify(normalized, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    return normalized;
  }

  configure(input = {}) {
    const current = this.readConfig();
    const next = this.writeConfig({ ...current, ...input, lastStatus: input.enabled === false ? 'disabled' : current.lastStatus });
    // Plaintext V2: purge any legacy schedule password from vault.
    this.credentialVault.remove(PASSWORD_CREDENTIAL);
    return this.status(next);
  }

  status(config = this.readConfig()) {
    const last = Date.parse(config.lastAttemptAt || config.lastSuccessAt || '');
    const nextRunAt = config.enabled
      ? new Date((Number.isFinite(last) ? last : this.now()) + config.intervalMinutes * 60 * 1000).toISOString()
      : null;
    return { ...config, running: this.running, nextRunAt };
  }

  isDue(config = this.readConfig()) {
    if (!config.enabled) return false;
    const last = Date.parse(config.lastAttemptAt || config.lastSuccessAt || '');
    if (!Number.isFinite(last)) return true;
    return this.now() - last >= config.intervalMinutes * 60 * 1000;
  }

  async tick(force = false) {
    if (this.running) return { ok: false, skipped: 'already_running' };
    let config = this.readConfig();
    if (!config.enabled) return { ok: false, skipped: 'disabled' };
    if (!force && !this.isDue(config)) return { ok: false, skipped: 'not_due', status: this.status(config) };
    this.running = true;
    const attemptedAt = new Date(this.now()).toISOString();
    config = this.writeConfig({ ...config, lastAttemptAt: attemptedAt, lastStatus: 'running', lastError: null });
    try {
      const result = await this.runBackup({ ...config, trigger: 'scheduled', backupMode: 'scheduled' });
      if (!result?.ok) throw new Error(result?.message || result?.error || 'scheduled_backup_failed');
      const completedAt = new Date(this.now()).toISOString();
      config = this.writeConfig({ ...config, lastSuccessAt: completedAt, lastStatus: result.cloudOk === false && config.cloudEnabled ? 'local_only' : 'success', lastError: result.uploadError || null });
      return { ok: true, result, status: this.status(config) };
    } catch (error) {
      config = this.writeConfig({ ...config, lastStatus: 'failed', lastError: safeError(error) });
      return { ok: false, error: safeError(error), status: this.status(config) };
    } finally {
      this.running = false;
    }
  }

  start() {
    if (this.timer) return this.status();
    this.timer = this.setInterval(() => { this.tick().catch(() => {}); }, 60 * 1000);
    this.timer?.unref?.();
    setTimeout(() => { this.tick().catch(() => {}); }, 1000).unref?.();
    return this.status();
  }

  stop() {
    if (this.timer) this.clearInterval(this.timer);
    this.timer = null;
  }
}

module.exports = {
  BackupV2Scheduler,
  PASSWORD_CREDENTIAL,
  DEFAULT_INTERVAL_MINUTES,
  MIN_INTERVAL_MINUTES,
  MAX_INTERVAL_MINUTES,
  DEFAULT_RETENTION_COUNT,
  DEFAULT_CLOUD_RETENTION_COUNT,
};
