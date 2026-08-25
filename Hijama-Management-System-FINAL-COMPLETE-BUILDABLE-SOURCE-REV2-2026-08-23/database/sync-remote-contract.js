'use strict';

/**
 * File-remote and (optional) Google Drive remote share this contract.
 */
module.exports = {
  /**
   * @typedef {object} RemoteVersions
   * @property {number} schemaVersion
   * @property {number} formatVersion
   * @property {string} centerId
   * @property {string} branchId
   * @property {Record<string,{revision:number,checksum:string,fileId:string,updatedAt:string,lastWriter:string}>} tables
   */

  /**
   * Required methods on any V2-4 sync remote:
   * - getVersions(centerId, branchId)
   * - putTable(centerId, branchId, table, revision, records, deviceId)
   * - getTable(centerId, branchId, table)
   */
  requiredMethods: ['getVersions', 'putTable', 'getTable'],
};
