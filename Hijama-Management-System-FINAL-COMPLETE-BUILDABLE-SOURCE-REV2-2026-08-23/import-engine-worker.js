/**
 * Client import worker — Excel parsing off the main UI thread.
 */
'use strict';

try {
  importScripts('import-engine-core.js');
  importScripts('node_modules/xlsx/dist/xlsx.full.min.js');
} catch (err) {
  self.postMessage({ type: 'WORKER_INIT_ERROR', error: err.message || String(err) });
}

const Core = typeof ImportEngineCore !== 'undefined' ? ImportEngineCore : null;

self.onmessage = function (event) {
  const msg = event.data || {};
  const { type, id } = msg;

  if (!Core) {
    self.postMessage({ id, ok: false, error: 'ImportEngineCore unavailable in worker' });
    return;
  }

  try {
    if (type === 'PARSE_WORKBOOK') {
      const matrix = Core.parseWorkbookBuffer(msg.buffer);
      const { headers, rows } = Core.rowsToImportData(matrix);
      self.postMessage({ id, ok: true, matrix, headers, rowCount: rows.length });
      return;
    }

    if (type === 'MAP_ROWS') {
      const records = (msg.rawRows || []).map(r => Core.mapRowToRecord(r, msg.mapping, msg.headers));
      self.postMessage({ id, ok: true, records });
      return;
    }

    if (type === 'BUILD_ROW_HASHES') {
      const hashes = (msg.rawRows || []).map(r => Core.importRowHash(Core.mapRowToRecord(r, msg.mapping, msg.headers)));
      self.postMessage({ id, ok: true, hashes });
      return;
    }

    self.postMessage({ id, ok: false, error: 'Unknown worker message: ' + type });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err.message || String(err) });
  }
};
