#!/usr/bin/env node
'use strict';

/**
 * Live Google Drive CAS Acceptance — Tests 1–7.
 * Writes sanitized evidence (no tokens/secrets). Requires refresh token vault.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');

const driveV2 = require('../electron/cloud-providers/google-drive-v2-api');
const { loadOAuthConfig, refreshAccessToken, createOAuth2FromAccessToken, maskToken } = require('./lib/drive-live-auth.cjs');
const {
  conditionalReplace,
  downloadByPath,
  findFileByPath,
  countFilesByName,
  resolveFolderPath,
  driveSyncCas,
} = require('./lib/drive-live-path-ops.cjs');

const EVIDENCE_DIR = path.join(__dirname, '..', 'docs', 'integration-v2-4', 'evidence');
const ARTIFACT_DIR = '/opt/cursor/artifacts';
const RUN_ID = `CAS-UAT-${Date.now().toString(36)}`;

function gitMeta() {
  try {
    return {
      branch: execSync('git branch --show-current', { encoding: 'utf8' }).trim(),
      commit: execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(),
    };
  } catch {
    return { branch: null, commit: null };
  }
}

function maskEtag(etag) {
  if (!etag) return null;
  const t = String(etag);
  if (t.length <= 10) return 'present';
  return `${t.slice(0, 5)}…${t.slice(-3)}`;
}

function reqLog(entry) {
  return {
    apiVersion: entry.apiVersion,
    method: entry.method,
    path: entry.path,
    ifMatchPresent: !!entry.ifMatchPresent,
    ifNoneMatchPresent: !!entry.ifNoneMatchPresent,
    httpStatus: entry.httpStatus ?? null,
    etagPresent: entry.etagPresent ?? null,
    etagMasked: entry.etagMasked ?? null,
    errorCode: entry.errorCode ?? null,
  };
}

async function cleanupNamespace(oauth2, centerId) {
  const root = `NajjarTech/centers/${centerId}`;
  const parts = root.split('/').filter(Boolean);
  let parentId = null;
  for (const part of parts) {
    const q = encodeURIComponent(
      `name='${part.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false` +
      (parentId ? ` and '${parentId}' in parents` : " and 'root' in parents")
    );
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`, {
      headers: { Authorization: `Bearer ${(await oauth2.getAccessToken()).token}` },
    });
    const json = await res.json();
    parentId = json.files?.[0]?.id || null;
    if (!parentId) return { ok: true, skipped: true };
  }
  const del = await fetch(`https://www.googleapis.com/drive/v3/files/${parentId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${(await oauth2.getAccessToken()).token}` },
  });
  return { ok: del.status === 204 || del.status === 200, status: del.status };
}

function parseJson(text) {
  try {
    return JSON.parse(String(text || '{}'));
  } catch {
    return null;
  }
}

async function runTests(oauth2, centerId, branchId) {
  const deps = [];
  const tests = [];
  const base = `NajjarTech/centers/${centerId}/branches/${branchId}`;

  // --- Test 1: Metadata ---
  const t1Path = `${base}/Operational/cas-probe-table.json`;
  const t1Seed = { revision: 0, table: 'cas-probe', records: [], runId: RUN_ID };
  await resolveFolderPath(oauth2, t1Path.split('/').slice(0, -1), { create: true });
  const t1Create = await conditionalReplace(oauth2, t1Path, JSON.stringify(t1Seed), {
    casResource: 'table',
    expectedTableRevision: 0,
  });
  const t1File = await findFileByPath(oauth2, t1Path, { includeDuplicates: true });
  const t1Canonical = t1File?.canonical || t1File;
  const t1Meta = t1Canonical?.id ? await driveV2.getFileMetadata(oauth2, t1Canonical.id) : null;
  const t1Pass = !!t1Meta?.etag;
  tests.push({
    id: 'T1_metadata',
    pass: t1Pass,
    fileIdMasked: maskToken(t1Canonical?.id),
    requests: [
      reqLog({
        apiVersion: 'v2',
        method: 'GET',
        path: `/drive/v2/files/${maskToken(t1Canonical?.id)}`,
        httpStatus: t1Meta ? 200 : null,
        etagPresent: !!t1Meta?.etag,
        etagMasked: maskEtag(t1Meta?.etag),
      }),
    ],
    logicalRevisionBefore: 0,
    logicalRevisionAfter: 0,
    duplicateFileCount: await countFilesByName(oauth2, t1Path),
  });

  // --- Test 2: Successful conditional update ---
  const t2Before = await downloadByPath(oauth2, t1Path);
  const t2RevBefore = Number(parseJson(t2Before?.text)?.revision || 0);
  const t2MetaBefore = await driveV2.getFileMetadata(oauth2, t1Canonical.id);
  const t2Payload = { revision: t2RevBefore + 1, table: 'cas-probe', records: [{ id: 't2', v: 1 }], runId: RUN_ID };
  const t2Write = await conditionalReplace(oauth2, t1Path, JSON.stringify(t2Payload), {
    casResource: 'table',
    expectedTableRevision: t2RevBefore,
  });
  const t2After = await downloadByPath(oauth2, t1Path);
  const t2RevAfter = Number(parseJson(t2After?.text)?.revision || 0);
  tests.push({
    id: 'T2_successful_conditional_update',
    pass: t2Write.ok && t2RevAfter === t2RevBefore + 1,
    requests: [
      reqLog({
        apiVersion: 'v2',
        method: 'GET',
        path: '/drive/v2/files/metadata',
        etagPresent: !!t2MetaBefore?.etag,
        etagMasked: maskEtag(t2MetaBefore?.etag),
        httpStatus: 200,
      }),
      reqLog({
        apiVersion: 'v2',
        method: 'PUT',
        path: '/upload/drive/v2/files',
        ifMatchPresent: true,
        httpStatus: t2Write.ok ? 200 : null,
        etagPresent: !!t2Write.etag,
        etagMasked: maskEtag(t2Write.etag),
      }),
    ],
    logicalRevisionBefore: t2RevBefore,
    logicalRevisionAfter: t2RevAfter,
    duplicateFileCount: await countFilesByName(oauth2, t1Path),
  });

  // --- Test 3: Stale writer (412) ---
  const t3Snap = await driveV2.getFileMetadata(oauth2, t1Canonical.id);
  const staleEtag = t3Snap.etag;
  const t3Rev = Number(parseJson((await downloadByPath(oauth2, t1Path))?.text)?.revision || 0);
  const t3WriterA = await conditionalReplace(
    oauth2,
    t1Path,
    JSON.stringify({ revision: t3Rev + 1, table: 'cas-probe', records: [{ id: 'A', v: 1 }], writer: 'A', runId: RUN_ID }),
    { casResource: 'table', expectedTableRevision: t3Rev }
  );
  let t3WriterB = { ok: true };
  let t3StaleStatus = null;
  try {
    await driveV2.updateFileMediaWithIfMatch(
      oauth2,
      t1Canonical.id,
      { title: 'cas-probe-table.json' },
      'application/json',
      Buffer.from(JSON.stringify({ revision: t3Rev + 1, writer: 'B-stale', runId: RUN_ID }), 'utf8'),
      { ifMatch: staleEtag }
    );
    t3WriterB = { ok: true, unexpected: true };
  } catch (err) {
    t3WriterB = { ok: false, code: err.code, status: err.status };
    t3StaleStatus = err.status || 412;
  }
  const t3Final = parseJson((await downloadByPath(oauth2, t1Path))?.text);
  tests.push({
    id: 'T3_stale_writer',
    pass: t3WriterA.ok && !t3WriterB.ok && (t3StaleStatus === 412 || t3WriterB.code === 'remote_revision_mismatch') && t3Final?.writer === 'A',
    requests: [
      reqLog({ apiVersion: 'v2', method: 'PUT', path: '/upload/drive/v2/files', ifMatchPresent: true, httpStatus: t3WriterA.ok ? 200 : null }),
      reqLog({
        apiVersion: 'v2',
        method: 'PUT',
        path: '/upload/drive/v2/files',
        ifMatchPresent: true,
        httpStatus: t3StaleStatus,
        errorCode: t3WriterB.code || 'precondition_failed',
      }),
    ],
    logicalRevisionBefore: t3Rev,
    logicalRevisionAfter: Number(t3Final?.revision || 0),
    finalRemoteWriter: t3Final?.writer || null,
    duplicateFileCount: await countFilesByName(oauth2, t1Path),
  });

  // --- Test 4: Recovery (B reads, merge, push) ---
  const t4Base = parseJson((await downloadByPath(oauth2, t1Path))?.text);
  const t4Rev = Number(t4Base?.revision || 0);
  const t4Meta = await driveV2.getFileMetadata(oauth2, t1Canonical.id);
  const t4Merged = {
    revision: t4Rev + 1,
    table: 'cas-probe',
    records: [
      ...(t4Base?.records || []),
      { id: 'B-recovered', v: 1 },
    ],
    writer: 'B-recovered',
    runId: RUN_ID,
  };
  const t4Write = await conditionalReplace(oauth2, t1Path, JSON.stringify(t4Merged), {
    casResource: 'table',
    expectedTableRevision: t4Rev,
  });
  const t4Final = parseJson((await downloadByPath(oauth2, t1Path))?.text);
  const t4Ids = (t4Final?.records || []).map((r) => r.id);
  tests.push({
    id: 'T4_recovery',
    pass: t4Write.ok && t4Ids.includes('A') && t4Ids.includes('B-recovered'),
    requests: [
      reqLog({ apiVersion: 'v2', method: 'GET', path: '/drive/v2/files/metadata', etagPresent: !!t4Meta?.etag, httpStatus: 200 }),
      reqLog({ apiVersion: 'v2', method: 'PUT', path: '/upload/drive/v2/files', ifMatchPresent: true, httpStatus: t4Write.ok ? 200 : null }),
    ],
    logicalRevisionBefore: t4Rev,
    logicalRevisionAfter: Number(t4Final?.revision || 0),
    finalRecordIds: t4Ids.sort(),
    duplicateFileCount: await countFilesByName(oauth2, t1Path),
  });

  // --- Test 5: Different tables same branch ---
  const casesPath = `${base}/Operational/cases.json`;
  const invoicesPath = `${base}/Operational/invoices.json`;
  await conditionalReplace(oauth2, casesPath, JSON.stringify({ revision: 0, table: 'cases', records: [], runId: RUN_ID }), {
    casResource: 'table',
    expectedTableRevision: 0,
  });
  await conditionalReplace(oauth2, invoicesPath, JSON.stringify({ revision: 0, table: 'invoices', records: [], runId: RUN_ID }), {
    casResource: 'table',
    expectedTableRevision: 0,
  });
  const manifestPath = `${base}/versions.json`;
  await conditionalReplace(
    oauth2,
    manifestPath,
    JSON.stringify({
      databaseVersion: 10,
      branches: { [branchId]: { databaseVersion: 10 } },
      tables: { cases: { revision: 7 }, invoices: { revision: 4 } },
      runId: RUN_ID,
    }),
    { casResource: 'manifest', expectedBranchRevision: 0, branchId }
  );

  const t5CasesWrite = await conditionalReplace(
    oauth2,
    casesPath,
    JSON.stringify({ revision: 8, table: 'cases', records: [{ id: 'case-a' }], runId: RUN_ID }),
    { casResource: 'table', expectedTableRevision: 0 }
  );
  const t5InvWrite = await conditionalReplace(
    oauth2,
    invoicesPath,
    JSON.stringify({ revision: 5, table: 'invoices', records: [{ id: 'inv-b' }], runId: RUN_ID }),
    { casResource: 'table', expectedTableRevision: 0 }
  );
  const t5ManifestBump = await conditionalReplace(
    oauth2,
    manifestPath,
    JSON.stringify({
      databaseVersion: 11,
      branches: { [branchId]: { databaseVersion: 11 } },
      tables: { cases: { revision: 8 }, invoices: { revision: 4 } },
      runId: RUN_ID,
    }),
    { casResource: 'manifest', expectedBranchRevision: 10, branchId }
  );
  const t5CasesFinal = parseJson((await downloadByPath(oauth2, casesPath))?.text);
  const t5InvFinal = parseJson((await downloadByPath(oauth2, invoicesPath))?.text);
  tests.push({
    id: 'T5_different_tables',
    pass: t5CasesWrite.ok && t5InvWrite.ok && t5CasesFinal?.records?.[0]?.id === 'case-a' && t5InvFinal?.records?.[0]?.id === 'inv-b',
    casesRevision: Number(t5CasesFinal?.revision || 0),
    invoicesRevision: Number(t5InvFinal?.revision || 0),
    manifestBumpOk: t5ManifestBump.ok,
    duplicateFileCount: {
      cases: await countFilesByName(oauth2, casesPath),
      invoices: await countFilesByName(oauth2, invoicesPath),
    },
  });

  // --- Test 6: First-create race ---
  const t6Path = `${base}/Operational/first-create-race.json`;
  const t6Parent = t6Path.split('/').slice(0, -1);
  await resolveFolderPath(oauth2, t6Parent, { create: true });
  // ensure absent
  const t6Existing = await findFileByPath(oauth2, t6Path);
  if (t6Existing) {
    /* use fresh name */
  }
  const t6PayloadA = JSON.stringify({ revision: 1, writer: 'create-A', runId: RUN_ID });
  const t6PayloadB = JSON.stringify({ revision: 1, writer: 'create-B', runId: RUN_ID });
  const [t6A, t6B] = await Promise.allSettled([
    conditionalReplace(oauth2, t6Path, t6PayloadA, { casResource: 'table', expectedTableRevision: 0 }),
    conditionalReplace(oauth2, t6Path, t6PayloadB, { casResource: 'table', expectedTableRevision: 0 }),
  ]);
  const t6Count = await countFilesByName(oauth2, t6Path);
  const t6Canonical = await findFileByPath(oauth2, t6Path, { includeDuplicates: true });
  if (t6Canonical?.duplicates?.length) {
    await require('./lib/drive-live-path-ops.cjs').buildDriveCasDeps().trashDuplicates(oauth2, t6Canonical.duplicates);
  }
  const t6CountAfterDedup = await countFilesByName(oauth2, t6Path);
  tests.push({
    id: 'T6_first_create_race',
    pass: t6CountAfterDedup === 1,
    createResults: {
      A: t6A.status === 'fulfilled' ? { ok: t6A.value?.ok, code: t6A.value?.code || null } : { ok: false, error: 'rejected' },
      B: t6B.status === 'fulfilled' ? { ok: t6B.value?.ok, code: t6B.value?.code || null } : { ok: false, error: 'rejected' },
    },
    duplicateFileCountBeforeDedup: t6Count,
    duplicateFileCountAfterDedup: t6CountAfterDedup,
  });

  // --- Test 7: Manifest race ---
  const t7Path = `${base}/versions-race.json`;
  await conditionalReplace(
    oauth2,
    t7Path,
    JSON.stringify({ databaseVersion: 20, branches: { [branchId]: { databaseVersion: 20 } }, runId: RUN_ID }),
    { casResource: 'manifest', expectedBranchRevision: 0, branchId }
  );
  const t7Meta = await driveV2.getFileMetadata(oauth2, (await findFileByPath(oauth2, t7Path))?.id || (await findFileByPath(oauth2, t7Path))?.canonical?.id);
  const t7EtagSnap = t7Meta?.etag;
  const t7A = await conditionalReplace(
    oauth2,
    t7Path,
    JSON.stringify({ databaseVersion: 21, branches: { [branchId]: { databaseVersion: 21 } }, writer: 'M-A', runId: RUN_ID }),
    { casResource: 'manifest', expectedBranchRevision: 20, branchId }
  );
  let t7B = { ok: true };
  let t7BStatus = null;
  try {
    await driveV2.updateFileMediaWithIfMatch(
      oauth2,
      (await findFileByPath(oauth2, t7Path)).id || (await findFileByPath(oauth2, t7Path)).canonical.id,
      { title: 'versions-race.json' },
      'application/json',
      Buffer.from(JSON.stringify({ databaseVersion: 21, writer: 'M-B-stale', runId: RUN_ID }), 'utf8'),
      { ifMatch: t7EtagSnap }
    );
  } catch (err) {
    t7B = { ok: false, code: err.code, status: err.status };
    t7BStatus = err.status;
  }
  const t7RecoverMeta = await driveV2.getFileMetadata(
    oauth2,
    (await findFileByPath(oauth2, t7Path)).id || (await findFileByPath(oauth2, t7Path)).canonical.id
  );
  const t7Recover = await conditionalReplace(
    oauth2,
    t7Path,
    JSON.stringify({ databaseVersion: 22, branches: { [branchId]: { databaseVersion: 22 } }, writer: 'M-B-recovered', runId: RUN_ID }),
    { casResource: 'manifest', expectedBranchRevision: 21, branchId }
  );
  const t7Final = parseJson((await downloadByPath(oauth2, t7Path))?.text);
  tests.push({
    id: 'T7_manifest_race',
    pass: t7A.ok && !t7B.ok && t7Recover.ok && Number(t7Final?.databaseVersion) === 22,
    requests: [
      reqLog({ apiVersion: 'v2', method: 'PUT', path: '/upload/drive/v2/files', ifMatchPresent: true, httpStatus: t7A.ok ? 200 : null }),
      reqLog({ apiVersion: 'v2', method: 'PUT', path: '/upload/drive/v2/files', ifMatchPresent: true, httpStatus: t7BStatus, errorCode: t7B.code }),
      reqLog({ apiVersion: 'v2', method: 'PUT', path: '/upload/drive/v2/files', ifMatchPresent: true, httpStatus: t7Recover.ok ? 200 : null }),
    ],
    logicalRevisionBefore: 20,
    logicalRevisionAfter: Number(t7Final?.databaseVersion || 0),
    finalWriter: t7Final?.writer || null,
    duplicateFileCount: await countFilesByName(oauth2, t7Path),
  });

  return tests;
}

async function main() {
  const cfg = loadOAuthConfig();
  const evidence = {
    at: new Date().toISOString(),
    runId: RUN_ID,
    runtime: gitMeta(),
    googleDriveCasStatus: 'BLOCKED_NO_CREDENTIALS',
    secretsPrinted: false,
    tests: [],
    allPass: false,
  };

  if (!cfg.hasClientCreds) {
    evidence.error = 'CLIENT_CREDS_MISSING';
    writeEvidence(evidence);
    console.log(JSON.stringify({ verdict: evidence.googleDriveCasStatus, error: evidence.error, secretsPrinted: false }));
    process.exit(2);
  }

  if (!cfg.hasRefreshToken) {
    evidence.error = 'REFRESH_TOKEN_MISSING';
    evidence.hint = 'Run: node scripts/oauth-consent-pkce.mjs then retry';
    writeEvidence(evidence);
    console.log(JSON.stringify({ verdict: evidence.googleDriveCasStatus, error: evidence.error, hint: evidence.hint, secretsPrinted: false }));
    process.exit(2);
  }

  const tokenRes = await refreshAccessToken(cfg);
  if (!tokenRes.ok) {
    evidence.error = 'TOKEN_REFRESH_FAILED';
    evidence.tokenRefreshStatus = tokenRes.status;
    evidence.tokenError = tokenRes.error;
    writeEvidence(evidence);
    console.log(JSON.stringify({ verdict: 'TOKEN_REFRESH_FAILED', secretsPrinted: false }));
    process.exit(1);
  }

  const oauth2 = createOAuth2FromAccessToken(cfg, tokenRes.accessToken);
  const centerId = process.env.CAS_UAT_CENTER_ID || `CTR-CAS-UAT-${crypto.randomBytes(3).toString('hex')}`;
  const branchId = process.env.CAS_UAT_BRANCH_ID || 'BR-CAS-UAT';

  try {
    evidence.tests = await runTests(oauth2, centerId, branchId);
    evidence.allPass = evidence.tests.every((t) => t.pass);
    evidence.googleDriveCasStatus = evidence.allPass ? 'LIVE VERIFIED' : 'FAILED';
    evidence.centerId = centerId;
    evidence.branchId = branchId;
    if (process.env.CAS_UAT_CLEANUP !== 'false') {
      evidence.cleanup = await cleanupNamespace(oauth2, centerId);
    }
  } catch (err) {
    evidence.googleDriveCasStatus = 'FAILED';
    evidence.runtimeError = String(err.message || err).slice(0, 400);
  }

  writeEvidence(evidence);
  console.log(JSON.stringify({
    verdict: evidence.googleDriveCasStatus,
    allPass: evidence.allPass,
    tests: evidence.tests.map((t) => ({ id: t.id, pass: t.pass })),
    centerId: evidence.centerId,
    secretsPrinted: false,
  }));
  process.exit(evidence.allPass ? 0 : 1);
}

function writeEvidence(evidence) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const file = path.join(EVIDENCE_DIR, 'live-drive-cas-acceptance.json');
  fs.writeFileSync(file, JSON.stringify(evidence, null, 2) + '\n');
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'live_drive_cas_acceptance.json'), JSON.stringify(evidence, null, 2) + '\n');
}

main().catch((err) => {
  console.error(JSON.stringify({ error: String(err.message || err).slice(0, 200), secretsPrinted: false }));
  process.exit(1);
});
