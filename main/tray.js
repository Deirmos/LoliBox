const { Tray, BrowserWindow, nativeImage, ipcMain, app, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const TOOLTIP_LIMIT = 127;
const POPUP_WIDTH = 360;
const POPUP_HEIGHT = 330;
const POPUP_PADDING = 16;
const IDLE_DESTROY_MS = 5 * 60 * 1000;
const TOGGLE_COOLDOWN_MS = 220;

let tray = null;
let iconImage = null;
let popup = null;
let popupReady = false;
let destroyTimer = null;
let lastHiddenAt = 0;

let getWindow = () => null;
let createWindow = () => {};
let quit = () => app.quit();
let isDev = false;

let state = {
  hasTrack: false,
  title: '',
  artist: '',
  thumbnail: '',
  source: '',
  isPlaying: false,
  isFavorite: false,
  canPrev: false,
  canNext: false,
  currentTime: 0,
  duration: 0,
  volume: 0,
  theme: 'lolibox',
};

let hintShown = false;

function sendCommand(command, payload) {
  const win = getWindow();
  if (!win || win.isDestroyed()) return;
  win.webContents.send('tray:command', { command, ...(payload || {}) });
}

function showWindow() {
  const win = getWindow();
  if (!win || win.isDestroyed()) {
    createWindow();
    return;
  }
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
}

function clipTooltip(text) {
  const str = String(text || '');
  return str.length > TOOLTIP_LIMIT ? `${str.slice(0, TOOLTIP_LIMIT - 1)}…` : str;
}

function buildTooltip() {
  if (!state.hasTrack) return 'LoliBox';
  const parts = [`LoliBox — ${state.title || 'Без названия'}`];
  if (state.artist) parts.push(state.artist);
  return clipTooltip(parts.join(' — '));
}

function clearDestroyTimer() {
  if (destroyTimer) {
    clearTimeout(destroyTimer);
    destroyTimer = null;
  }
}

function scheduleDestroy() {
  clearDestroyTimer();
  destroyTimer = setTimeout(() => {
    destroyTimer = null;
    if (popup && !popup.isDestroyed() && !popup.isVisible()) {
      popup.destroy();
      popup = null;
      popupReady = false;
    }
  }, IDLE_DESTROY_MS);
}

function pushState() {
  if (!popup || popup.isDestroyed() || !popupReady) return;
  if (!popup.isVisible()) return;
  try {
    popup.webContents.send('tray:state', state);
  } catch (e) {
  }
}

function positionPopup() {
  if (!popup || popup.isDestroyed()) return;

  let anchor = null;
  try {
    anchor = tray ? tray.getBounds() : null;
  } catch (e) {
    anchor = null;
  }
  if (!anchor || (!anchor.width && !anchor.height)) {
    const point = screen.getCursorScreenPoint();
    anchor = { x: point.x, y: point.y, width: 0, height: 0 };
  }

  const display = screen.getDisplayNearestPoint({
    x: Math.round(anchor.x + anchor.width / 2),
    y: Math.round(anchor.y + anchor.height / 2),
  });
  const work = display.workArea;

  let x = Math.round(anchor.x + anchor.width / 2 - POPUP_WIDTH / 2);
  const popupHeight = popup.getBounds().height || POPUP_HEIGHT;
  let y = Math.round(anchor.y - popupHeight - 10);

  if (y < work.y + 4) y = Math.round(anchor.y + anchor.height + 10);

  x = Math.max(work.x + 8, Math.min(x, work.x + work.width - POPUP_WIDTH - 8));
  y = Math.max(work.y + 8, Math.min(y, work.y + work.height - popupHeight - 8));

  popup.setPosition(x, y, false);
}

function createPopup() {
  if (popup && !popup.isDestroyed()) return popup;

  popupReady = false;
  popup = new BrowserWindow({
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload/tray.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: true,
    },
  });

  popup.setAlwaysOnTop(true, 'pop-up-menu');
  popup.setMenuBarVisibility(false);

  const loaded = async () => {
    if (!popup || popup.isDestroyed()) return;
    try {
      const cardHeight = await popup.webContents.executeJavaScript(
        'document.getElementById("card").getBoundingClientRect().height'
      );
      const height = Math.ceil(Number(cardHeight) || 0);
      if (height > 0 && popup && !popup.isDestroyed()) {
        popup.setSize(POPUP_WIDTH, height + POPUP_PADDING);
      }
    } catch (e) {
    }
    if (!popup || popup.isDestroyed()) return;
    popupReady = true;
    positionPopup();
    popup.show();
    popup.focus();
    pushState();
  };

  if (isDev) {
    popup.loadURL('http://localhost:5173/tray.html').catch(() => {});
  } else {
    popup
      .loadFile(path.join(__dirname, '../dist/tray.html'))
      .catch((err) => console.error('[Tray] Ошибка загрузки карточки:', err.message));
  }

  popup.webContents.once('did-finish-load', loaded);

  popup.webContents.on('did-fail-load', (event, code, description, url, isMainFrame) => {
    if (!isMainFrame) return;
    console.error('[Tray] Карточка не загружена:', code, description);
    if (popup && !popup.isDestroyed()) {
      popup.destroy();
      popup = null;
      popupReady = false;
    }
  });

  popup.on('blur', () => {
    if (popup && !popup.isDestroyed() && !popup.webContents.isDevToolsOpened()) {
      hidePopup();
    }
  });

  popup.on('closed', () => {
    popup = null;
    popupReady = false;
    clearDestroyTimer();
  });

  return popup;
}

function showPopup() {
  clearDestroyTimer();
  if (!popup || popup.isDestroyed()) {
    createPopup();
    return;
  }
  if (!popupReady) return;
  positionPopup();
  popup.show();
  popup.focus();
  pushState();
}

function hidePopup() {
  if (!popup || popup.isDestroyed()) return;
  popup.hide();
  lastHiddenAt = Date.now();
  scheduleDestroy();
}

function togglePopup() {
  if (popup && !popup.isDestroyed() && popup.isVisible()) {
    hidePopup();
    return;
  }
  if (Date.now() - lastHiddenAt < TOGGLE_COOLDOWN_MS) return;
  showPopup();
}

function applyState(next) {
  if (!next || typeof next !== 'object') return;
  state = { ...state, ...next };
  if (tray && !tray.isDestroyed()) tray.setToolTip(buildTooltip());
  pushState();
}

function notifyMinimizedToTray() {
  if (hintShown || !tray || tray.isDestroyed()) return;
  hintShown = true;
  try {
    tray.displayBalloon({
      title: 'LoliBox свёрнут в трей',
      content:
        'Воспроизведение продолжается. Клик по значку — управление, «Выход» — в карточке трея.',
      icon: iconImage || undefined,
      noSound: true,
    });
  } catch (e) {
  }
}

function setupTray(options = {}) {
  if (typeof options.getWindow === 'function') getWindow = options.getWindow;
  if (typeof options.createWindow === 'function') createWindow = options.createWindow;
  if (typeof options.quit === 'function') quit = options.quit;
  isDev = !!options.isDev;

  const candidates = [options.iconPath, options.fallbackIconPath]
    .filter(Boolean)
    .map((p) => path.resolve(p));

  let iconSource = null;
  for (const p of candidates) {
    const candidate = nativeImage.createFromPath(p);
    if (!candidate.isEmpty()) {
      iconSource = candidate;
      iconImage = candidate;
      break;
    }
  }
  if (!iconSource) {
    const existing = candidates.find((p) => fs.existsSync(p));
    iconSource = existing || nativeImage.createEmpty();
  }

  tray = new Tray(iconSource);
  tray.setToolTip('LoliBox');

  tray.on('click', () => togglePopup());
  tray.on('right-click', () => togglePopup());
  tray.on('double-click', () => {
    hidePopup();
    showWindow();
  });
  tray.on('balloon-click', () => showWindow());

  ipcMain.on('app:set-tray-state', (event, next) => applyState(next));

  ipcMain.handle('tray:get-state', () => state);

  ipcMain.on('tray:popup-command', (event, msg) => {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.command) {
      case 'show-main':
        hidePopup();
        showWindow();
        break;
      case 'quit':
        quit();
        break;
      case 'hide':
        hidePopup();
        break;
      default:
        sendCommand(msg.command, { value: msg.value, time: msg.time });
        break;
    }
  });

  return { showWindow, notifyMinimizedToTray, applyState, getTray: () => tray };
}

module.exports = { setupTray };
