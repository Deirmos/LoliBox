const { execFile } = require('child_process');
const deps = require('./deps');
const cache = require('./cache');

const TARGET_LUFS = -14;
const ANALYSIS_START_SECONDS = 8;
const ANALYSIS_SECONDS = 30;
const MIN_GAIN_DB = -12;
const MAX_GAIN_DB = 12;
const MIN_VALID_LUFS = -45;
const TRUE_PEAK_LIMIT_DB = -1.0;
const RESULT_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const FAILURE_TTL_MS = 30 * 60 * 1000;
const MAX_CONCURRENT = 1;

const inflight = new Map();
const queue = [];
let active = 0;

function cacheKey(trackId, url) {
  return `loudness:${trackId || url}`;
}

function parseLoudnorm(stderr) {
  if (!stderr) return null;
  const marker = stderr.lastIndexOf('"input_i"');
  if (marker < 0) return null;
  const start = stderr.lastIndexOf('{', marker);
  const end = stderr.indexOf('}', marker);
  if (start < 0 || end < 0 || end <= start) return null;
  try {
    const data = JSON.parse(stderr.slice(start, end + 1));
    const inputI = parseFloat(data.input_i);
    const inputTp = parseFloat(data.input_tp);
    if (!Number.isFinite(inputI)) return null;
    return {
      measuredLufs: inputI,
      truePeak: Number.isFinite(inputTp) ? inputTp : null,
    };
  } catch (e) {
    return null;
  }
}

function computeGain(measuredLufs, truePeak) {
  if (!Number.isFinite(measuredLufs) || measuredLufs < MIN_VALID_LUFS) return null;

  let gainDb = TARGET_LUFS - measuredLufs;
  gainDb = Math.max(MIN_GAIN_DB, Math.min(MAX_GAIN_DB, gainDb));

  if (gainDb > 0 && Number.isFinite(truePeak)) {
    const peakRoom = TRUE_PEAK_LIMIT_DB - truePeak;
    if (peakRoom < gainDb) gainDb = peakRoom;
    gainDb = Math.max(MIN_GAIN_DB, Math.min(MAX_GAIN_DB, gainDb));
  }

  return Math.round(gainDb * 10) / 10;
}

function analyzeWithFfmpeg(ffmpegPath, url) {
  return new Promise((resolve) => {
    const args = [
      '-hide_banner',
      '-nostdin',
      '-ss', String(ANALYSIS_START_SECONDS),
      '-t', String(ANALYSIS_SECONDS),
      '-i', url,
      '-vn',
      '-af', `loudnorm=I=${TARGET_LUFS}:TP=-1.5:LRA=11:print_format=json`,
      '-f', 'null',
      '-',
    ];

    execFile(
      ffmpegPath,
      args,
      { encoding: 'utf-8', timeout: 30000, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        const parsed = parseLoudnorm(stderr || '');
        if (!parsed) {
          resolve({
            success: false,
            reason: 'analysis_failed',
            error: String((stderr || (err && err.message) || '').trim()).slice(-300),
          });
          return;
        }
        const gainDb = computeGain(parsed.measuredLufs, parsed.truePeak);
        if (gainDb == null) {
          resolve({ success: false, reason: 'silent_or_invalid' });
          return;
        }
        resolve({
          success: true,
          gainDb,
          measuredLufs: Math.round(parsed.measuredLufs * 10) / 10,
          truePeak: parsed.truePeak != null ? Math.round(parsed.truePeak * 10) / 10 : null,
          targetLufs: TARGET_LUFS,
        });
      }
    );
  });
}

function enqueue(job) {
  return new Promise((resolve) => {
    queue.push({ job, resolve });
    pump();
  });
}

function pump() {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const { job, resolve } = queue.shift();
    active += 1;
    Promise.resolve()
      .then(job)
      .then(resolve)
      .catch((err) => resolve({ success: false, reason: 'analysis_failed', error: err.message }))
      .finally(() => {
        active -= 1;
        pump();
      });
  }
}

async function analyzeLoudness(url, trackId) {
  if (!url || !String(url).trim()) return { success: false, reason: 'no_url' };
  const cleanUrl = String(url).trim();
  const key = cacheKey(trackId, cleanUrl);

  const cached = cache.get(key);
  if (cached) return { ...cached, cached: true };

  if (inflight.has(key)) return inflight.get(key);

  const task = enqueue(async () => {
    const found = deps.resolveComponent('ffmpeg');
    if (!found) {
      const result = { success: false, reason: 'ffmpeg_missing' };
      return result;
    }

    const result = await analyzeWithFfmpeg(found.path, cleanUrl);
    if (result.success) {
      cache.set(key, result, RESULT_TTL_MS);
    } else {
      cache.set(key, result, FAILURE_TTL_MS);
    }
    return result;
  }).finally(() => {
    if (inflight.get(key) === task) inflight.delete(key);
  });

  inflight.set(key, task);
  return task;
}

function getLoudnessStatus() {
  const found = deps.resolveComponent('ffmpeg');
  return {
    available: !!found,
    ffmpegPath: found ? found.path : null,
    ffmpegSource: found ? found.source : null,
    targetLufs: TARGET_LUFS,
  };
}

function setupLoudnessHandlers(ipcMain) {
  ipcMain.handle('loudness:analyze', (event, url, trackId) => analyzeLoudness(url, trackId));
  ipcMain.handle('loudness:status', () => getLoudnessStatus());
}

module.exports = {
  setupLoudnessHandlers,
  analyzeLoudness,
  getLoudnessStatus,
  TARGET_LUFS,
};
