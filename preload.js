const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),

  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  launchGame: (options) => ipcRenderer.invoke('launch-game', options),
  getPremiumUuid: (username) => ipcRenderer.invoke('get-premium-uuid', username),
  saveCustomSkin: (options) => ipcRenderer.invoke('save-custom-skin', options),
  downloadMods: (options) => ipcRenderer.invoke('download-mods', options),
  installLoader: (options) => ipcRenderer.invoke('install-loader', options),
  geminiChat: (options) => ipcRenderer.invoke('gemini-chat', options),
  installAiMod: (options) => ipcRenderer.invoke('install-ai-mod', options),
  fetchImageBase64: (url) => ipcRenderer.invoke('fetch-image-base64', url),
  uploadSkinOnline: (base64) => ipcRenderer.invoke('upload-skin-online', base64),
  isDeveloper: () => ipcRenderer.invoke('is-developer'),
  releaseUpdate: () => ipcRenderer.invoke('release-update'),
  
  onReleaseStatus: (callback) => ipcRenderer.on('release-status', (event, value) => callback(value)),
  onLaunchStatus: (callback) => ipcRenderer.on('launch-status', (event, value) => callback(value)),
  onLaunchProgress: (callback) => {
    ipcRenderer.on('launch-progress', (event, value) => callback(value));
  },
  onLaunchLogs: (callback) => ipcRenderer.on('launch-logs', (event, value) => callback(value)),
  onLaunchError: (callback) => ipcRenderer.on('launch-error', (event, value) => callback(value)),
  onLaunchFinished: (callback) => ipcRenderer.on('launch-finished', (event, value) => callback(value)),
  
  removeListeners: () => {
    ipcRenderer.removeAllListeners('launch-status');
    ipcRenderer.removeAllListeners('launch-progress');
    ipcRenderer.removeAllListeners('launch-logs');
    ipcRenderer.removeAllListeners('launch-error');
    ipcRenderer.removeAllListeners('launch-finished');
  }
});
