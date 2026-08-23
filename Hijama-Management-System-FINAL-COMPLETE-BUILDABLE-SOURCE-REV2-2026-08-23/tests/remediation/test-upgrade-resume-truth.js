'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'database', 'upgrade-migration-orchestrator.js'), 'utf8');
assert.match(source, /const resumeRunId = String\(options\.resumeRunId \|\| ''\)\.trim\(\)/, 'upgrade pipeline must identify a requested resume run');
assert.match(source, /SELECT \* FROM upgrade_migration_runs WHERE id = \? AND status = 'in_progress'/, 'resume must target the existing in-progress run');
assert.match(source, /upgrade_resume_backup_missing/, 'resume without original rollback backup must fail closed');
assert.match(source, /priorRun\.backup_path/, 'resume must reuse the original backup path rather than take a partial-state backup');
assert.match(source, /const verify = verifyInvariants\(db, repos\);/, 'completed-on-resume must verify database invariants first');
assert.match(source, /resumeRunId: inProgress\.id/, 'resume entry must pass the existing run id into the pipeline');
console.log('PASS remediation:upgrade-resume-truth');
