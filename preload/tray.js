const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('loliboxTray', {
  getState: () => ipcRenderer.invoke('tray:get-state'),
  onState: (cb) => {
    if (typeof cb !== 'function') return;
    ipcRenderer.on('tray:state', (event, state) => cb(state));
  },
  removeStateListener: () => ipcRenderer.removeAllListeners('tray:state'),
  command: (command, payload) =>
    ipcRenderer.send('tray:popup-command', { command, ...(payload || {}) }),
  showMain: () => ipcRenderer.send('tray:popup-command', { command: 'show-main' }),
  hide: () => ipcRenderer.send('tray:popup-command', { command: 'hide' }),
  quit: () => ipcRenderer.send('tray:popup-command', { command: 'quit' }),
});
