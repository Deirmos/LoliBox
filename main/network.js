const { networkInterfaces } = require('os');

function hasInternetInterface() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal && net.address !== '0.0.0.0') {
        return true;
      }
    }
  }
  return false;
}

let lastStatus = null;

function setupNetworkHandlers(ipcMain, mainWindow) {
  ipcMain.handle('network:get-status', () => {
    const online = hasInternetInterface();
    lastStatus = online;
    return { online };
  });

  setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const online = hasInternetInterface();
    if (online !== lastStatus) {
      lastStatus = online;
      mainWindow.webContents.send('network-status', { online });
    }
  }, 5000);
}

module.exports = { setupNetworkHandlers, hasInternetInterface };
