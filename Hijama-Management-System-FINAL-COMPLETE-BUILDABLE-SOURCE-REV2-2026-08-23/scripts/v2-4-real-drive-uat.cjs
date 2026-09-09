#!/usr/bin/env node
'use strict';

/**
 * Real Google Drive UAT harness for V2-4 (Device A ↔ Device B via Drive).
 * Loads secrets from env, /tmp/v24-real-cloud.env, or 0600 vault — never logs secret values.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { createDevice } = require('../database/peer-sync-engine');
const { GoogleDriveRemote } = require('../database/google-drive-remote');

function mask(s) {
  const t = String(s || '');
  if (t.length < 8) return '***';
  return `${t.slice(0, 3)}…${t.slice(-3)}`;
}

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (process.env[m[1]]) continue;
    process.env[m[1]] = m[2];
  }
}

function loadSecrets() {
  loadDotEnv('/tmp/v24-real-cloud.env');
  loadDotEnv(path.join(os.homedir(), '.config/NajjarTech/v24-real-cloud.env'));

  let vault = null;
  try {
    vault = JSON.parse(fs.readFileSync('/tmp/v24-oauth-vault.json', 'utf8'));
  } catch {
    vault = null;
  }

  let machine = null;
  try {
    machine = JSON.parse(
      fs.readFileSync(path.join(os.homedir(), '.config/NajjarTech/cloud-oauth.local.json'), 'utf8')
    );
  } catch {
    machine = null;
  }

  const id =
    process.env.GOOGLE_OAUTH_CLIENT_ID ||
    vault?.client_id ||
    machine?.google?.clientId ||
    '';
  const secret =
    process.env.GOOGLE_OAUTH_CLIENT_SECRET ||
    vault?.client_secret ||
    machine?.google?.clientSecret ||
    '';
  const refresh =
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN ||
    vault?.refresh_token ||
    machine?.google?.refreshToken ||
    machine?.google?.refresh_token ||
    '';

  if (!id || !secret) {
    console.error(JSON.stringify({ error: 'CLIENT_CREDS_MISSING', secretsPrinted: false }));
    process.exit(1);
  }
  if (!refresh) {
    console.error(
      JSON.stringify({
        error: 'REFRESH_TOKEN_MISSING',
        hint: 'Complete Google consent (scripts waiting on loopback :42813)',
        clientIdPresent: true,
        clientSecretPresent: true,
        secretsPrinted: false,
      })
    );
    process.exit(2);
  }
  return { id, secret, refresh };
}

async function refreshAccessToken(cfg) {
  const body = new URLSearchParams({
    client_id: cfg.id,
    client_secret: cfg.secret,
    refresh_token: cfg.refresh,
    grant_type: 'refresh_token',
  }).toString();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    return { ok: false, status: res.status, error: json.error || 'token_refresh_failed' };
  }
  return { ok: true, accessToken: json.access_token, expiresIn: json.expires_in };
}

async function main() {
  const cfg = loadSecrets();
  const evidenceDir = path.join(__dirname, '..', 'docs', 'integration-v2-4', 'evidence');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const centerId = process.env.V24_TEST_CENTER_ID || `CTR-UAT-V24-${crypto.randomBytes(3).toString('hex')}`;
  const started = new Date().toISOString();

  const tokenRes = await refreshAccessToken(cfg);
  const evidence = {
    at: started,
    centerId,
    oauthClientMasked: mask(cfg.id),
    tokenRefresh: tokenRes.ok ? 'PASS' : 'FAIL',
    tokenRefreshStatus: tokenRes.status || null,
    tokenError: tokenRes.error || null,
    driveAtoB: 'NOT_RUN',
    driveBtoA: 'NOT_RUN',
    conflictPath: 'NOT_RUN',
    branchIsolation: 'NOT_RUN',
    cleanup: 'NOT_RUN',
    remoteFileIds: [],
    secretsPrinted: false,
  };

  if (!tokenRes.ok) {
    evidence.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(evidenceDir, 'real-cloud-uat.json'), JSON.stringify(evidence, null, 2));
    console.error(JSON.stringify({ tokenRefresh: 'FAIL', error: evidence.tokenError, secretsPrinted: false }));
    process.exit(1);
  }

  const remote = new GoogleDriveRemote({ accessToken: tokenRes.accessToken });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v24-drive-'));
  const A = createDevice({
    userDataDir: path.join(tmp, 'A'),
    centerId,
    branchId: 'BR-A',
    deviceId: 'DEV-A',
  });
  const B = createDevice({
    userDataDir: path.join(tmp, 'B'),
    centerId,
    branchId: 'BR-A',
    deviceId: 'DEV-B',
  });
  const BRB = createDevice({
    userDataDir: path.join(tmp, 'BRB'),
    centerId,
    branchId: 'BR-B',
    deviceId: 'DEV-BRB',
  });

  try {
    A.upsertRecord('clientsRegistry', {
      id: 'uat-c1',
      name: 'UAT Client One',
      phone: '0500000001',
      branchId: 'BR-A',
    });
    const flushA = await A.flush(remote);
    const okA = flushA.some((x) => x.ok);
    evidence.driveAtoB = okA ? 'IN_PROGRESS' : 'FAIL';
    if (okA) {
      const fileId = flushA.find((x) => x.ok)?.fileId;
      if (fileId) evidence.remoteFileIds.push({ role: 'clients_push_a', id: mask(fileId) });
    }

    const pullB = await B.pull(remote);
    const got = B.getAll('clientsRegistry').some((c) => c.id === 'uat-c1' && c.name === 'UAT Client One');
    evidence.driveAtoB = okA && got ? 'PASS' : 'FAIL';
    evidence.pullBApplied = pullB.applied || [];

    B.upsertRecord('clientsRegistry', {
      id: 'uat-c2',
      name: 'UAT Client Two',
      phone: '0500000002',
      branchId: 'BR-A',
    });
    await B.flush(remote);
    await A.pull(remote);
    evidence.driveBtoA = A.getAll('clientsRegistry').some((c) => c.id === 'uat-c2') ? 'PASS' : 'FAIL';

    // Branch isolation
    await BRB.pull(remote);
    evidence.branchIsolation = BRB.getAll('clientsRegistry').length === 0 ? 'PASS' : 'FAIL';

    // Conflict: same base edit
    const X = createDevice({
      userDataDir: path.join(tmp, 'X'),
      centerId,
      branchId: 'BR-A',
      deviceId: 'DEV-X',
    });
    const Y = createDevice({
      userDataDir: path.join(tmp, 'Y'),
      centerId,
      branchId: 'BR-A',
      deviceId: 'DEV-Y',
    });
    X.setAll('clientsRegistry', [{ id: 'cx', name: 'Base', branchId: 'BR-A' }]);
    await X.flush(remote);
    await Y.pull(remote);
    X.upsertRecord('clientsRegistry', { id: 'cx', name: 'From-X', branchId: 'BR-A' });
    Y.upsertRecord('clientsRegistry', { id: 'cx', name: 'From-Y', branchId: 'BR-A' });
    await X.flush(remote);
    const flushY = await Y.flush(remote);
    const openConflicts = Y.db.prepare(`SELECT COUNT(*) AS c FROM sync_conflicts WHERE status='open'`).get().c;
    evidence.conflictPath = flushY.some((x) => x.conflict) && openConflicts >= 1 ? 'PASS' : 'FAIL';
    X.close();
    Y.close();

    if (process.env.V24_CLEANUP !== 'false') {
      const cleaned = await remote.cleanupTestNamespace(centerId);
      evidence.cleanup = cleaned.ok ? 'PASS' : 'FAIL';
      evidence.cleanupStatus = cleaned.status || null;
    } else {
      evidence.cleanup = 'SKIPPED';
    }
  } catch (err) {
    evidence.runtimeError = String(err.message || err).slice(0, 300);
  } finally {
    A.close();
    B.close();
    BRB.close();
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  evidence.finishedAt = new Date().toISOString();
  const pass =
    evidence.tokenRefresh === 'PASS' &&
    evidence.driveAtoB === 'PASS' &&
    evidence.driveBtoA === 'PASS' &&
    evidence.branchIsolation === 'PASS' &&
    evidence.conflictPath === 'PASS';

  fs.writeFileSync(path.join(evidenceDir, 'real-cloud-uat.json'), JSON.stringify(evidence, null, 2));
  console.log(
    JSON.stringify({
      pass,
      tokenRefresh: evidence.tokenRefresh,
      driveAtoB: evidence.driveAtoB,
      driveBtoA: evidence.driveBtoA,
      branchIsolation: evidence.branchIsolation,
      conflictPath: evidence.conflictPath,
      centerId: evidence.centerId,
      secretsPrinted: false,
    })
  );
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(JSON.stringify({ error: String(err.message || err).slice(0, 200), secretsPrinted: false }));
  process.exit(1);
});
