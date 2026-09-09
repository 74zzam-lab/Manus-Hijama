'use strict';

/**
 * Minimal preload for print / PDF preview / queue display child windows.
 * Does NOT expose backup, license, cache, or messaging privileges.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cuppingPrint', {
  listPrinters: () => ipcRenderer.invoke('devices:listPrinters'),
  printThermal: (html, opts) => ipcRenderer.invoke('devices:printThermal', html, opts),
  printA4: (html, opts) => ipcRenderer.invoke('devices:printA4', html, opts),
  exportA4Pdf: (html, opts) => ipcRenderer.invoke('devices:exportA4Pdf', html, opts),
  printWithDialog: (html, opts) => ipcRenderer.invoke('devices:printWithDialog', html, opts),
});
