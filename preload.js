const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('diMonitor', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  getLogs: () => ipcRenderer.invoke('get-logs'),
  selectWowFolder: () => ipcRenderer.invoke('select-wow-folder'),
  selectRclFile: () => ipcRenderer.invoke('select-rcl-file'),
  selectAttendanceFile: () => ipcRenderer.invoke('select-attendance-file'),
  validateAddon: (wowPath) => ipcRenderer.invoke('validate-addon', wowPath),
  openLogsFolder: () => ipcRenderer.invoke('open-logs-folder'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  sendLootData: () => ipcRenderer.invoke('send-loot-data'),
  getWowAccounts: (wowPath) => ipcRenderer.invoke('get-wow-accounts', wowPath),
  getAccountFiles: (data) => ipcRenderer.invoke('get-account-files', data),
  onLogUpdate: (callback) => {
    ipcRenderer.on('log-update', (event, entry) => callback(entry));
  },
  onPollStatus: (callback) => {
    ipcRenderer.on('poll-status', (event, status) => callback(status));
  }
});
