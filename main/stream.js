const { execFile } = require('child_process');
const { getYtDlp, baseArgs } = require('./ytdlp');
const cache = require('./cache');

const ATTEMPTS = [
  [],
  ['--extractor-args', 'youtube:player_client=android'],
  ['--extractor-args', 'youtube:player_client=web_safari,tv'],
];

const PREFETCH_MAX_CONCURRENT = 1;

const inflight = new Map();

const memoryStreams = new Map();
const MEMORY_STREAM_TTL_MS = 90 * 1000;
const MEMORY_STREAM_MAX = 100;

function getMemoryStream(key) {
  const entry = memoryStreams.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > MEMORY_STREAM_TTL_MS) {
    memoryStreams.delete(key);
    return null;
  }
  return entry.url;
}

function setMemoryStream(key, url) {
  memoryStreams.set(key, { url, at: Date.now() });
  if (memoryStreams.size > MEMORY_STREAM_MAX) {
    const oldest = memoryStreams.keys().next().value;
    if (oldest) memoryStreams.delete(oldest);
  }
}

let prefetchActive = 0;
const prefetchQueue = [];
const prefetchKeys = new Set();

function runOnce(url, extraArgs) {
  return new Promise((resolve, reject) => {
    const args = [
      ...baseArgs(),
      '-g',
      '-f', 'bestaudio/best',
      '--no-playlist',
      '--socket-timeout', '15',
      ...extraArgs,
      url,
    ];

    execFile(
      getYtDlp(),
      args,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, timeout: 45000 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error((stderr || err.message || '').trim()));
          return;
        }
        const streamUrl = (stdout || '').trim().split('\n')[0];
        if (!streamUrl) {
          reject(new Error('Аудиопоток не найден. Возможно, трек недоступен.'));
          return;
        }
        resolve(streamUrl);
      }
    );
  });
}

function buildStreamError(lastError) {
  const raw = (lastError && lastError.message) || '';
  if (/Sign in to confirm|not a bot|cookies/i.test(raw)) {
    return new Error(
      'YouTube требует авторизацию (защита от ботов). Включите импорт cookies ' +
        'в настройках (раздел yt-dlp) и выберите свой браузер, либо попробуйте позже.'
    );
  }
  if (/429|Too Many Requests/i.test(raw)) {
    return new Error('YouTube временно ограничил запросы (429). Попробуйте через минуту.');
  }
  return new Error(`Не удалось получить аудиопоток: ${raw || 'неизвестная ошибка'}`);
}

function resolveStream(url, trackId, options = {}) {
  const key = String(trackId || url);

  if (!options.bypassCache) {
    const cached = cache.getStream(url, trackId);
    if (cached) return Promise.resolve(cached);

    const memory = getMemoryStream(key);
    if (memory) return Promise.resolve(memory);
  }

  const existing = inflight.get(key);
  if (existing) return existing;

  const task = (async () => {
    let lastError = null;
    for (const extraArgs of ATTEMPTS) {
      try {
        const streamUrl = await runOnce(url, extraArgs);
        setMemoryStream(key, streamUrl);
        cache.setStream(url, trackId, streamUrl);
        return streamUrl;
      } catch (err) {
        lastError = err;
      }
    }
    throw buildStreamError(lastError);
  })();

  const tracked = task.finally(() => {
    if (inflight.get(key) === tracked) inflight.delete(key);
  });
  inflight.set(key, tracked);
  return tracked;
}

async function getStreamUrl(url, trackId, forceRefresh = false) {
  return resolveStream(url, trackId, { bypassCache: !!forceRefresh });
}

function pumpPrefetch() {
  while (prefetchActive < PREFETCH_MAX_CONCURRENT && prefetchQueue.length > 0) {
    const job = prefetchQueue.shift();
    prefetchKeys.delete(job.key);
    prefetchActive += 1;
    resolveStream(job.url, job.trackId)
      .catch(() => {})
      .finally(() => {
        prefetchActive -= 1;
        pumpPrefetch();
      });
  }
}

function prefetchStreamUrl(url, trackId) {
  if (!url || !String(url).trim()) return { success: false };
  const cleanUrl = String(url).trim();

  if (cache.getStream(cleanUrl, trackId)) {
    return { success: true, cached: true };
  }

  const key = String(trackId || cleanUrl);
  if (getMemoryStream(key)) return { success: true, cached: true };
  if (inflight.has(key) || prefetchKeys.has(key)) return { success: true, pending: true };

  for (const job of prefetchQueue) prefetchKeys.delete(job.key);
  prefetchQueue.length = 0;

  prefetchKeys.add(key);
  prefetchQueue.push({ url: cleanUrl, trackId, key });
  pumpPrefetch();
  return { success: true };
}

function setupStreamHandlers(ipcMain, mainWindow) {
  ipcMain.handle('stream:get-url', (event, url, trackId) => {
    if (!url || !url.trim()) throw new Error('Укажите ссылку на трек.');
    return getStreamUrl(url.trim(), trackId);
  });

  ipcMain.handle('stream:prefetch', (event, url, trackId) => {
    return prefetchStreamUrl(url, trackId);
  });

  ipcMain.handle('stream:refresh-url', (event, url, trackId) => {
    if (!url || !String(url).trim()) throw new Error('Укажите ссылку на трек.');
    return getStreamUrl(String(url).trim(), trackId, true);
  });
}

module.exports = {
  setupStreamHandlers,
  getStreamUrl,
  prefetchStreamUrl,
};
