const { dialog } = require('electron');
const { spawn, execFile } = require('child_process');
const db = require('./db');
const deps = require('./deps');
const {
  getStatus,
  invalidateCache,
  resolveJsRuntime,
  invalidateRuntime,
} = require('./ytdlp');

function wingetAvailable() {
  return new Promise((resolve) => {
    execFile('where.exe', ['winget'], { encoding: 'utf-8', timeout: 5000 }, (err) => {
      if (!err) {
        resolve(true);
        return;
      }
      execFile('winget', ['--version'], { encoding: 'utf-8', timeout: 5000 }, (err2) => {
        resolve(!err2);
      });
    });
  });
}

function sendProgress(mainWindow, info) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('deps:progress', info);
}

function setupSettingsHandlers(ipcMain, mainWindow) {
  ipcMain.handle('settings:get-all', () => db.getSettings());

  ipcMain.handle('settings:set', (event, key, value) => db.setSetting(key, value));

  ipcMain.handle('ytdlp:status', async () => {
    invalidateRuntime();
    invalidateCache();

    const status = deps.getStatus();
    const ytdlp = status.components['yt-dlp'];

    return {
      found: ytdlp.found,
      path: ytdlp.path,
      version: ytdlp.version,
      source: ytdlp.source,
      ffmpeg: status.components.ffmpeg,
      binDir: status.binDir,
      jsRuntime: resolveJsRuntime(),
      cookiesBrowser: db.getSettings().ytdlp_cookies_browser || 'none',
      winget: process.platform === 'win32' ? await wingetAvailable() : false,
    };
  });

  ipcMain.handle('deps:install', async (event, id) => {
    if (!deps.COMPONENTS[id]) {
      return { success: false, error: `Неизвестный компонент: ${id}` };
    }

    const res = await deps.installComponent(id, (info) => sendProgress(mainWindow, { id, ...info }));
    invalidateCache();

    if (res.success) {
      const status = deps.getStatus();
      return { success: true, ...status.components[id] };
    }
    return { success: false, error: res.error, id };
  });

  ipcMain.handle('deps:install-all', async () => {
    const results = await deps.installMissing((info) => sendProgress(mainWindow, info));
    invalidateCache();
    return { success: true, results, ...deps.getStatus() };
  });

  ipcMain.handle('ytdlp:set-cookies-browser', (event, browser) => {
    db.setSetting('ytdlp_cookies_browser', browser || 'none');
    return { success: true };
  });

  ipcMain.handle('ytdlp:choose-path', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: 'Укажите исполняемый файл yt-dlp',
      filters:
        process.platform === 'win32'
          ? [{ name: 'Исполняемые файлы', extensions: ['exe'] }, { name: 'Все файлы', extensions: ['*'] }]
          : [{ name: 'Все файлы', extensions: ['*'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const picked = result.filePaths[0];
    db.setSetting('ytdlp_path', picked);
    invalidateCache();
    return { path: picked, ...getStatus() };
  });

  ipcMain.handle('ytdlp:reset-path', () => {
    db.setSetting('ytdlp_path', '');
    invalidateCache();
    return getStatus();
  });

  ipcMain.handle('ytdlp:install', async () => {
    if (process.platform !== 'win32') {
      return { success: false, error: 'Автоустановка доступна только в Windows. Установите yt-dlp вручную.' };
    }
    if (!(await wingetAvailable())) {
      return { success: false, error: 'winget не найден. Установите yt-dlp вручную или укажите путь к файлу.' };
    }
    return new Promise((resolve) => {

      const child = spawn(
        'winget',
        [
          'install',
          '--id', 'yt-dlp.yt-dlp',
          '--exact',
          '--accept-source-agreements',
          '--accept-package-agreements',
          '--disable-interactivity',
        ],
        { windowsHide: true }
      );

      let output = '';
      child.stdout.on('data', (d) => { output += d.toString(); });
      child.stderr.on('data', (d) => { output += d.toString(); });

      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        invalidateCache();
        resolve(result);
      };

      child.on('error', (err) => finish({ success: false, error: err.message }));
      child.on('close', (code) => {
        const status = getStatus();
        if (status.found) {
          finish({ success: true, ...status });
        } else {
          finish({
            success: false,
            error: `winget завершился с кодом ${code}. ${output.trim().slice(-400)}`.trim(),
          });
        }
      });
    });
  });
}

module.exports = { setupSettingsHandlers };
