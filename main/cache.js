const path = require('path');
const { APP_DIR, readCache, writeCache } = require('./db');

const CACHE_FILE = path.join(APP_DIR, 'cache.json');

const MAX_ENTRIES = 400;
const SEARCH_TTL_MS = 24 * 60 * 60 * 1000;
const STREAM_TTL_MS = 4 * 60 * 60 * 1000;
const FLUSH_DEBOUNCE_MS = 3000;

let store = null;
let flushTimer = null;

function loadStore() {
  if (store) return store;
  const raw = readCache();
  store = {};
  for (const [key, entry] of Object.entries(raw || {})) {
    if (entry && entry.expiresAt > Date.now()) store[key] = entry;
  }
  return store;
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, FLUSH_DEBOUNCE_MS);
  if (flushTimer.unref) flushTimer.unref();
}

function flush() {
  if (!store) return;
  const entries = Object.entries(store);
  if (entries.length > MAX_ENTRIES) {
    entries.sort((a, b) => (b[1].expiresAt || 0) - (a[1].expiresAt || 0));
    store = Object.fromEntries(entries.slice(0, MAX_ENTRIES));
  }
  writeCache(store);
}

function get(key) {
  const s = loadStore();
  const entry = s[key];
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    delete s[key];
    scheduleFlush();
    return null;
  }
  return entry.value;
}

function set(key, value, ttlMs) {
  const s = loadStore();
  s[key] = { value, expiresAt: Date.now() + ttlMs };
  if (Object.keys(s).length > MAX_ENTRIES) {
    const now = Date.now();
    for (const [k, e] of Object.entries(s)) {
      if (e.expiresAt <= now) delete s[k];
    }
  }
  scheduleFlush();
}

function searchKey(source, query, limit) {
  return `search:${source}:${limit}:${String(query || '').trim().toLowerCase()}`;
}

function getSearch(source, query, limit) {
  return get(searchKey(source, query, limit));
}

function setSearch(source, query, limit, tracks, ttlMs = SEARCH_TTL_MS) {
  if (!Array.isArray(tracks) || tracks.length === 0) return;
  set(searchKey(source, query, limit), tracks, ttlMs);
}

function streamKey(sourceUrl, trackId) {
  return `stream:${trackId || sourceUrl}`;
}

function getStream(sourceUrl, trackId) {
  return get(streamKey(sourceUrl, trackId));
}

function setStream(sourceUrl, trackId, streamUrl) {
  if (!streamUrl) return;
  set(streamKey(sourceUrl, trackId), streamUrl, STREAM_TTL_MS);
}

function clearAll() {
  store = {};
  writeCache({});
}

module.exports = {
  CACHE_FILE,
  MAX_ENTRIES,
  SEARCH_TTL_MS,
  STREAM_TTL_MS,
  get,
  set,
  getSearch,
  setSearch,
  getStream,
  setStream,
  flush,
  clearAll,
};
