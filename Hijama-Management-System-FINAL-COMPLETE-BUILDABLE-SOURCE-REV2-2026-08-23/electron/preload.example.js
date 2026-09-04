/**
 * انسخ هذا الملف إلى electron/preload.js وعدّل المسارات حسب مشروعك.
 */
const { contextBridge, ipcRenderer } = require('electron');

const cuppingApi = {
  backup: {
    saveLocal: (payload, filename, localPath) =>
      ipcRenderer.invoke('backup:saveLocal', payload, filename, localPath),
    uploadCloud: (payload, filename, provider) =>
      ipcRenderer.invoke('backup:uploadCloud', payload, filename, provider),
    uploadSyncFile: (payload, filename, provider, folder) =>
      ipcRenderer.invoke('backup:uploadSyncFile', payload, filename, provider, folder),
    downloadSyncFile: (filename, provider, folder) =>
      ipcRenderer.invoke('backup:downloadSyncFile', filename, provider, folder),
    connectGoogle: () => ipcRenderer.invoke('backup:connectGoogle'),
  },
  devices: {
    listPrinters: () => ipcRenderer.invoke('devices:listPrinters'),
    printThermal: (html, opts) => ipcRenderer.invoke('devices:printThermal', html, opts),
    printA4: (html, opts) => ipcRenderer.invoke('devices:printA4', html, opts),
    openCashDrawer: (opts) => ipcRenderer.invoke('devices:openCashDrawer', opts),
    openCashDrawerDirect: (opts) => ipcRenderer.invoke('devices:openCashDrawerDirect', opts),
    getStatus: () => ipcRenderer.invoke('devices:getStatus'),
    writeRaw: (printerName, buffer) =>
      ipcRenderer.invoke('devices:writeRaw', printerName, buffer),
  },
  messaging: {
    sendWhatsApp: (phone, text) =>
      ipcRenderer.invoke('messaging:sendWhatsApp', phone, text),
    sendSMS: (phone, text) =>
      ipcRenderer.invoke('messaging:sendSMS', phone, text),
    getStatus: () => ipcRenderer.invoke('messaging:getStatus'),
  },
};

// الاسم الجديد — مع alias للتوافق مع الإصدارات السابقة
contextBridge.exposeInMainWorld('cuppingElectron', cuppingApi);
contextBridge.exposeInMainWorld('cuppingElectron', cuppingApi);

contextBridge.exposeInMainWorld('cashDrawer', {
  open: (opts) => ipcRenderer.invoke('devices:openCashDrawer', opts || {}),
});
