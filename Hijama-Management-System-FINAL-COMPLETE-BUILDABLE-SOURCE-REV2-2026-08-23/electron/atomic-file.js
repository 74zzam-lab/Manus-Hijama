'use strict';

const fs = require('fs');
const path = require('path');

function writeFileAtomicSync(target, data, options = {}) {
  const resolved = path.resolve(target);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const temporary = `${resolved}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporary, data, {
      encoding: options.encoding,
      mode: options.mode ?? 0o600,
      flag: 'wx'
    });
    if (options.failpoint === 'after_temp_write') throw new Error('atomic_write_interrupted');
    fs.renameSync(temporary, resolved);
    return resolved;
  } catch (error) {
    try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch { /* best effort */ }
    throw error;
  }
}

module.exports = { writeFileAtomicSync };
