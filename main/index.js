const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const path = require('path');

const isDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';

app.setName('LoliBox');
if (process.platform === 'win32') {
  app.setAppUserModelId('com.deimon.lolibox');
}

let setupSearchHandlers, setupNetworkHandlers,
  setupPlaylistHandlers, setupSettingsHandlers;

try {
  setupSearchHandlers = require('./search').setupSearchHandlers;
} catch (e) {
  console.error('[Main] Не удалось загрузить search.js:', e.message);
}
try {
  setupNetworkHandlers = require('./network').setupNetworkHandlers;
} catch (e) {
  console.error('[Main] Не удалось загрузить network.js:', e.message);
}
try {
  setupPlaylistHandlers = require('./playlists').setupPlaylistHandlers;
} catch (e) {
  console.error('[Main] Не удалось загрузить playlists.js:', e.message);
}
try {
  setupSettingsHandlers = require('./settings').setupSettingsHandlers;
} catch (e) {
  console.error('[Main] Не удалось загрузить settings.js:', e.message);
}
let setupStreamHandlers;
try {
  setupStreamHandlers = require('./stream').setupStreamHandlers;
} catch (e) {
  console.error('[Main] Не удалось загрузить stream.js:', e.message);
}

let setupTray;
try {
  setupTray = require('./tray').setupTray;
} catch (e) {
  console.error('[Main] Не удалось загрузить tray.js:', e.message);
}

let mainWindow = null;
let trayApi = null;
let isQuitting = false;

let setupWaveHandlers;
try {
  setupWaveHandlers = require('./wave').setupWaveHandlers;
} catch (e) {
  console.error('[Main] Не удалось загрузить wave.js:', e.message);
}

let setupLoudnessHandlers;
try {
  setupLoudnessHandlers = require('./loudness').setupLoudnessHandlers;
} catch (e) {
  console.error('[Main] Не удалось загрузить loudness.js:', e.message);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
      backgroundThrottling: false,
    },
    icon: path.join(__dirname, '../assets/icon.ico'),
    frame: false,
    autoHideMenuBar: true,
    title: 'LoliBox',
    backgroundColor: '#0f0f1a',
  });

  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
  }

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('[Main] Страница не загружена:', errorCode, errorDescription, validatedURL);
  });

  mainWindow.webContents.on('crashed', () => {
    console.error('[Main] Рендерер аварийно завершён');
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html')).catch((err) => {
      console.error('[Main] Ошибка loadFile:', err);
    });
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('close', (event) => {
    if (isQuitting || !trayApi) return;
    event.preventDefault();
    mainWindow.hide();
    trayApi.notifyMinimizedToTray();
  });

  mainWindow.on('maximize', () => mainWindow?.webContents.send('window:maximized', true));
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:maximized', false));
}

app.whenReady().then(() => {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
  }

  createWindow();

  if (setupSearchHandlers) setupSearchHandlers(ipcMain, mainWindow);
  if (setupNetworkHandlers) setupNetworkHandlers(ipcMain, mainWindow);
  if (setupPlaylistHandlers) setupPlaylistHandlers(ipcMain, mainWindow);
  if (setupSettingsHandlers) setupSettingsHandlers(ipcMain, mainWindow);
  if (setupStreamHandlers) setupStreamHandlers(ipcMain, mainWindow);
  if (setupWaveHandlers) setupWaveHandlers(ipcMain);
  if (setupLoudnessHandlers) setupLoudnessHandlers(ipcMain);

  try {
    const db = require('./db');
    ipcMain.handle('track:get-all', () => db.getAllTracks());
    ipcMain.handle('track:get-playlists', (event, trackId) => db.getTrackPlaylists(trackId));
    ipcMain.handle('track:playlist-membership', () => db.getPlaylistMembership());
    ipcMain.handle('history:record', (event, track, meta) => db.recordPlay(track, meta));
    ipcMain.handle('history:complete', (event, trackId) => db.completePlay(trackId));
    ipcMain.handle('history:get', (event, limit) => db.getHistory(limit));
    ipcMain.handle('blacklist:get', () => db.getBlacklist());
    ipcMain.handle('blacklist:add-artist', (event, artist) => db.addArtistToBlacklist(artist));
    ipcMain.handle('blacklist:add-track', (event, track) => db.addTrackToBlacklist(track));
    ipcMain.handle('blacklist:add-tracks', (event, tracks) => db.addTracksToBlacklist(tracks));
    ipcMain.handle('blacklist:remove-artist', (event, key) => db.removeArtistFromBlacklist(key));
    ipcMain.handle('blacklist:remove-track', (event, id) => db.removeTrackFromBlacklist(id));
    ipcMain.handle('blacklist:remove-artists', (event, keys) => db.removeArtistsFromBlacklist(keys));
    ipcMain.handle('blacklist:remove-tracks', (event, ids) => db.removeTracksFromBlacklist(ids));
    ipcMain.handle('blacklist:clear', (event, type) => db.clearBlacklist(type));
    ipcMain.handle('settings:get-volume', () => db.getVolume());
    ipcMain.handle('settings:set-volume', (event, value) => db.setVolume(value));
  } catch (e) {
    console.error('[Main] Не удалось инициализировать БД:', e.message);
  }

  if (setupTray) {
    try {
      trayApi = setupTray({
        getWindow: () => mainWindow,
        createWindow,
        quit: () => {
          isQuitting = true;
          app.quit();
        },
        iconPath: path.join(__dirname, '../assets/icon.ico'),
        fallbackIconPath: path.join(__dirname, '../assets/sakura-icon.png'),
        isDev,
      });
    } catch (e) {
      console.error('[Main] Не удалось создать трей:', e.message);
      trayApi = null;
    }
  }

  app.on('activate', () => {
    if (trayApi) trayApi.showWindow();
    else if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') return;
  if (isQuitting || !trayApi) app.quit();
});

ipcMain.handle('open-external', async (event, url) => {
  await shell.openExternal(url);
});

ipcMain.handle('app:get-version', () => app.getVersion());

ipcMain.handle('window:minimize', () => {
  BrowserWindow.getFocusedWindow()?.minimize();
});
ipcMain.handle('window:toggle-maximize', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) return false;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
  return win.isMaximized();
});
ipcMain.handle('window:close', () => {
  BrowserWindow.getFocusedWindow()?.close();
});
ipcMain.handle('window:is-maximized', () => {
  return !!BrowserWindow.getFocusedWindow()?.isMaximized();
});

