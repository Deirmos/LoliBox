const { execFile, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const http = require('http');
const zlib = require('zlib');
const { URL } = require('url');


function managedBinDir() {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share');
  return path.join(local, 'LoliBox', 'bin');
}

function bundledBinDir() {
  if (!process.resourcesPath) return null;
  return path.join(process.resourcesPath, 'bin');
}

function systemBinDirs() {
  const home = os.homedir();
  const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  const roaming = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  const dirs = [
    path.join(local, 'Microsoft', 'WinGet', 'Links'),
    path.join(local, 'Microsoft', 'WinGet', 'Packages'),
    path.join(home, 'scoop', 'shims'),
    path.join(home, 'scoop', 'apps', 'ffmpeg', 'current', 'bin'),
    path.join(home, 'scoop', 'apps', 'yt-dlp', 'current'),
    'C:\\ProgramData\\chocolatey\\bin',
    path.join(roaming, 'npm'),
    path.join(local, 'Programs'),
    'C:\\ffmpeg\\bin',
  ];

  const expanded = [];
  for (const dir of dirs) {
    expanded.push(dir);
    if (!/[\\/]Python[^\\/]*/i.test(dir)) {
      try {
        for (const entry of fs.readdirSync(dir)) {
          if (/^Python/i.test(entry)) expanded.push(path.join(dir, entry, 'Scripts'));
        }
      } catch (e) {
      }
    }
  }

  const wingetPackages = path.join(local, 'Microsoft', 'WinGet', 'Packages');
  try {
    for (const entry of fs.readdirSync(wingetPackages)) {
      if (/yt-?dlp|ffmpeg/i.test(entry)) {
        expanded.push(path.join(wingetPackages, entry));
        expanded.push(path.join(wingetPackages, entry, 'bin'));
      }
    }
  } catch (e) {}

  return expanded;
}


const IS_WIN = process.platform === 'win32';

const COMPONENTS = {
  'yt-dlp': {
    id: 'yt-dlp',
    label: 'yt-dlp',
    critical: true,
    description: 'Поиск музыки и ссылки на аудиопоток',
    exeName: IS_WIN ? 'yt-dlp.exe' : 'yt-dlp',
    archive: false,
    sources: [
      'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe',
    ],
  },
  ffmpeg: {
    id: 'ffmpeg',
    label: 'ffmpeg',
    critical: false,
    description: 'Выравнивание громкости треков',
    exeName: IS_WIN ? 'ffmpeg.exe' : 'ffmpeg',
    archive: 'zip',
    wanted: IS_WIN ? ['ffmpeg.exe', 'ffprobe.exe'] : ['ffmpeg', 'ffprobe'],
    sources: [
      'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip',
      'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
    ],
  },
};

const COMPONENT_IDS = Object.keys(COMPONENTS);


function isFile(p) {
  try {
    return !!p && fs.statSync(p).isFile();
  } catch (e) {
    return false;
  }
}

function findOnPath(exeName) {
  try {
    const cmd = IS_WIN ? 'where.exe' : 'which';
    const out = execFileSync(cmd, [exeName], { encoding: 'utf-8', timeout: 5000 });
    for (const line of String(out).split(/\r?\n/)) {
      const candidate = line.trim();
      if (candidate && isFile(candidate)) return candidate;
    }
  } catch (e) {}
  return null;
}

function resolveComponent(id) {
  const comp = COMPONENTS[id];
  if (!comp) return null;

  const managed = managedBinDir();
  const managedExe = path.join(managed, comp.exeName);
  if (isFile(managedExe)) return { path: managedExe, source: 'managed' };

  const bundled = bundledBinDir();
  if (bundled) {
    const bundledExe = path.join(bundled, comp.exeName);
    if (isFile(bundledExe)) return { path: bundledExe, source: 'bundled' };
  }

  const onPath = findOnPath(comp.exeName);
  if (onPath) return { path: onPath, source: 'path' };

  for (const dir of systemBinDirs()) {
    const candidate = path.join(dir, comp.exeName);
    if (isFile(candidate)) return { path: candidate, source: 'system' };
  }

  return null;
}

function getVersion(id) {
  const found = resolveComponent(id);
  if (!found) return null;
  const args = id === 'ffmpeg' ? ['-version'] : ['--version'];
  try {
    const out = execFileSync(found.path, args, { encoding: 'utf-8', timeout: 8000, windowsHide: true });
    const first = String(out).split(/\r?\n/)[0] || '';
    const m = first.match(/\d+\.\d+(\.\d+)?/);
    return m ? m[0] : first.trim() || null;
  } catch (e) {
    return null;
  }
}

function getStatus() {
  const components = {};
  let allCriticalPresent = true;

  for (const id of COMPONENT_IDS) {
    const comp = COMPONENTS[id];
    const found = resolveComponent(id);
    components[id] = {
      id,
      label: comp.label,
      critical: comp.critical,
      description: comp.description,
      found: !!found,
      path: found ? found.path : null,
      source: found ? found.source : null,
      version: found ? getVersion(id) : null,
    };
    if (comp.critical && !found) allCriticalPresent = false;
  }

  return { components, ok: allCriticalPresent, binDir: managedBinDir() };
}


function downloadFile(url, onProgress) {
  return new Promise((resolve, reject) => {
    const request = (target, redirectsLeft) => {
      let parsed;
      try {
        parsed = new URL(target);
      } catch (e) {
        reject(new Error(`Некорректный адрес: ${target}`));
        return;
      }

      const client = parsed.protocol === 'http:' ? http : https;
      const req = client.get(
        target,
        {
          headers: {
            'User-Agent': 'LoliBox/1.0 (+https://github.com/yt-dlp/yt-dlp)',
            Accept: '*/*',
          },
        },
        (res) => {
          const status = res.statusCode || 0;

          if (status >= 300 && status < 400 && res.headers.location) {
            res.resume();
            if (redirectsLeft <= 0) {
              reject(new Error('Слишком много перенаправлений при загрузке.'));
              return;
            }
            request(new URL(res.headers.location, target).toString(), redirectsLeft - 1);
            return;
          }

          if (status !== 200) {
            res.resume();
            reject(new Error(`Сервер ответил кодом ${status}.`));
            return;
          }

          const total = Number(res.headers['content-length']) || 0;
          const chunks = [];
          let received = 0;

          res.on('data', (chunk) => {
            chunks.push(chunk);
            received += chunk.length;
            if (onProgress) onProgress(received, total);
          });
          res.on('end', () => resolve(Buffer.concat(chunks)));
          res.on('error', reject);
        }
      );

      req.on('error', reject);
      req.setTimeout(60000, () => {
        req.destroy(new Error('Превышено время ожидания ответа сервера.'));
      });
    };

    request(url, 5);
  });
}


function findEndOfCentralDirectory(buf) {
  const min = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

function readZipEntries(buf) {
  const eocd = findEndOfCentralDirectory(buf);
  if (eocd < 0) throw new Error('Файл не похож на ZIP-архив.');

  const count = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);
  const entries = [];

  for (let i = 0; i < count; i++) {
    if (ptr + 46 > buf.length || buf.readUInt32LE(ptr) !== 0x02014b50) break;
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.toString('utf8', ptr + 46, ptr + 46 + nameLen);
    entries.push({ name, method, compSize, localOffset });
    ptr += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

function readZipEntry(buf, entry) {
  const off = entry.localOffset;
  if (off + 30 > buf.length || buf.readUInt32LE(off) !== 0x04034b50) {
    throw new Error('Повреждён ZIP-архив.');
  }
  const nameLen = buf.readUInt16LE(off + 26);
  const extraLen = buf.readUInt16LE(off + 28);
  const start = off + 30 + nameLen + extraLen;
  const data = buf.subarray(start, start + entry.compSize);

  if (entry.method === 0) return Buffer.from(data);
  if (entry.method === 8) return zlib.inflateRawSync(data);
  throw new Error(`Неподдерживаемый метод сжатия в архиве (${entry.method}).`);
}

function extractFromZip(buf, wantedNames) {
  const entries = readZipEntries(buf);
  const wanted = wantedNames.map((n) => n.toLowerCase());
  const result = new Map();

  for (const entry of entries) {
    if (entry.name.endsWith('/')) continue;
    const base = path.posix.basename(entry.name.split('\\').join('/')).toLowerCase();
    if (!wanted.includes(base)) continue;
    if (result.has(base)) continue;
    result.set(base, readZipEntry(buf, entry));
  }

  return result;
}


function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function installComponent(id, onProgress) {
  const comp = COMPONENTS[id];
  if (!comp) throw new Error(`Неизвестный компонент: ${id}`);

  const report = (stage, percent, message) => {
    if (onProgress) onProgress({ stage, percent, message });
  };

  const binDir = ensureDir(managedBinDir());

  let lastError = null;
  for (const source of comp.sources) {
    try {
      report('download', 0, `Загружаем ${comp.label}…`);
      const buffer = await downloadFile(source, (received, total) => {
        const percent = total ? Math.round((received / total) * 100) : 0;
        report('download', percent, `Загружаем ${comp.label}… ${percent}%`);
      });

      if (!comp.archive) {
        report('install', 95, `Устанавливаем ${comp.label}…`);
        const target = path.join(binDir, comp.exeName);
        const tmp = `${target}.download`;
        fs.writeFileSync(tmp, buffer);
        fs.renameSync(tmp, target);
      } else {
        report('install', 90, `Распаковываем ${comp.label}…`);
        const files = extractFromZip(buffer, comp.wanted);
        const primary = comp.wanted[0].toLowerCase();
        if (!files.has(primary)) {
          throw new Error(`В архиве нет файла ${comp.wanted[0]}.`);
        }
        for (const [name, data] of files) {
          const target = path.join(binDir, name);
          const tmp = `${target}.download`;
          fs.writeFileSync(tmp, data);
          fs.renameSync(tmp, target);
        }
      }

      report('done', 100, `${comp.label} установлен.`);
      return { success: true, id, path: path.join(binDir, comp.exeName) };
    } catch (err) {
      lastError = err;
    }
  }

  return {
    success: false,
    id,
    error: lastError ? lastError.message : 'Не удалось скачать компонент.',
  };
}

async function installMissing(onProgress) {
  const results = {};
  for (const id of COMPONENT_IDS) {
    if (resolveComponent(id)) {
      results[id] = { success: true, skipped: true };
      continue;
    }
    results[id] = await installComponent(id, onProgress);
  }
  return results;
}

function removeManaged() {
  const dir = managedBinDir();
  try {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  COMPONENTS,
  COMPONENT_IDS,
  managedBinDir,
  bundledBinDir,
  systemBinDirs,
  resolveComponent,
  getVersion,
  getStatus,
  installComponent,
  installMissing,
  removeManaged,
  downloadFile,
  extractFromZip,
};
