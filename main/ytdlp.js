const { execFileSync } = require('child_process');
const fs = require('fs');

const deps = require('./deps');

const EXE_NAMES = process.platform === 'win32' ? ['yt-dlp.exe', 'yt-dlp'] : ['yt-dlp'];

let cachedPath = null;

function getCustomPath() {
  try {
    const db = require('./db');
    const custom = db.getSettings().ytdlp_path;
    if (custom && fs.existsSync(custom)) return custom;
  } catch (e) {}
  return null;
}

function resolveYtDlp() {
  if (cachedPath) return cachedPath;

  const custom = getCustomPath();
  if (custom) {
    cachedPath = custom;
    return cachedPath;
  }

  const found = deps.resolveComponent('yt-dlp');
  cachedPath = found ? found.path : null;
  return cachedPath;
}

function getYtDlp() {
  return resolveYtDlp() || 'yt-dlp';
}

function invalidateCache() {
  cachedPath = null;
}

function getVersion() {
  const exe = resolveYtDlp();
  if (!exe) return null;
  try {
    return execFileSync(exe, ['--version'], { encoding: 'utf-8', timeout: 5000, windowsHide: true }).trim();
  } catch (e) {
    return null;
  }
}

function getStatus() {
  const exe = resolveYtDlp();
  return { found: !!exe, path: exe, version: exe ? getVersion() : null };
}

const INSTALL_HINT =
  'yt-dlp не найден. Установите его командой "winget install yt-dlp.yt-dlp" ' +
  '(или "python -m pip install -U yt-dlp"), либо укажите путь к yt-dlp.exe в настройках. ' +
  'Без него поиск и воспроизведение не работают.';

let cachedJsRuntime = undefined;

function resolveJsRuntime() {
  if (cachedJsRuntime !== undefined) return cachedJsRuntime;

  const candidates = [
    { name: 'deno', arg: 'deno' },
    { name: 'node', arg: 'node' },
    { name: 'bun', arg: 'bun' },
  ];

  for (const c of candidates) {
    try {
      const finder = process.platform === 'win32' ? 'where.exe' : 'which';
      execFileSync(finder, [c.name], { encoding: 'utf-8', timeout: 5000 });
      cachedJsRuntime = c.arg;
      return cachedJsRuntime;
    } catch (e) {
    }
  }

  cachedJsRuntime = null;
  return cachedJsRuntime;
}

function baseArgs() {
  const args = [];

  const jsRuntime = resolveJsRuntime();
  if (jsRuntime) {
    args.push('--js-runtimes', jsRuntime);
  }

  try {
    const db = require('./db');
    const browser = db.getSettings().ytdlp_cookies_browser;
    if (browser && browser !== 'none') {
      args.push('--cookies-from-browser', browser);
    }
  } catch (e) {}

  return args;
}

function invalidateRuntime() {
  cachedJsRuntime = undefined;
}

module.exports = {
  getYtDlp,
  resolveYtDlp,
  invalidateCache,
  getVersion,
  getStatus,
  resolveJsRuntime,
  invalidateRuntime,
  baseArgs,
  INSTALL_HINT,
};
