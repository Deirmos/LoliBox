const fs = require('fs');
const path = require('path');
const os = require('os');
const { buildArtistEntries, primaryArtistKey, normalizeArtistKey, firstArtist, cleanArtistName } = require('./artists');

const APP_DIR = path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'LoliBox');
const DB_FILE = path.join(APP_DIR, 'lolibox.json');

function ensureDir() {
  if (!fs.existsSync(APP_DIR)) fs.mkdirSync(APP_DIR, { recursive: true });
}

function readDB() {
  ensureDir();
  if (!fs.existsSync(DB_FILE)) return defaultData();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return defaultData();
  }
}

function writeDB(data) {
  ensureDir();
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function defaultData() {
  return {
    settings: {
      theme: 'lolibox',
      volume: '0.35',
      volume_normalization: '1',
    },
    playlists: [
      { id: 1, name: 'Избранное', is_default: 1, created_at: new Date().toISOString() },
    ],
    tracks: [],
    playlist_tracks: [],
    history: [],
    blacklist: { artists: [], tracks: [] },
  };
}

let cache = null;
let dirty = false;

const MAX_HISTORY_EVENTS = 1000;
const HISTORY_MERGE_WINDOW_MS = 30 * 60 * 1000;

function applyArtistFields(item) {
  if (!item) return item;
  if (!Array.isArray(item.artists) || item.artists.length === 0) {
    item.artists = buildArtistEntries(item.artist, item.title);
  }
  if (!item.primary_artist_key) {
    item.primary_artist_key = primaryArtistKey(item.artists);
  }
  return item;
}

function getData() {
  if (!cache) cache = readDB();
  if (!Array.isArray(cache.history)) cache.history = [];

  if (!cache.blacklist || typeof cache.blacklist !== 'object') {
    cache.blacklist = { artists: [], tracks: [] };
    dirty = true;
  }
  if (!Array.isArray(cache.blacklist.artists)) cache.blacklist.artists = [];
  if (!Array.isArray(cache.blacklist.tracks)) cache.blacklist.tracks = [];

  if (!cache.meta) cache.meta = {};
  if (cache.meta.artistsVersion !== 1) {
    for (const track of Array.isArray(cache.tracks) ? cache.tracks : []) {
      applyArtistFields(track);
    }
    for (const event of cache.history) applyArtistFields(event);
    cache.meta.artistsVersion = 1;
    dirty = true;
  }

  return cache;
}

function persist() {
  if (cache) writeDB(cache);
  dirty = false;
}

setInterval(() => { if (dirty) persist(); }, 5000);

function flush() {
  if (dirty) persist();
}
process.on('exit', flush);
process.on('SIGINT', () => { flush(); process.exit(0); });
process.on('SIGTERM', () => { flush(); process.exit(0); });

function getSettings() {
  const data = getData();
  if (data.settings.volume == null) data.settings.volume = '0.35';
  if (data.settings.volume_normalization == null) {
    data.settings.volume_normalization = '1';
    dirty = true;
  }
  if ('download_path' in data.settings) {
    delete data.settings.download_path;
    dirty = true;
  }
  if ('vpn_mode' in data.settings) {
    delete data.settings.vpn_mode;
    dirty = true;
  }
  return { ...data.settings };
}

function setSetting(key, value) {
  const d = getData();
  d.settings[key] = String(value);
  dirty = true;
  persist();
  return { success: true };
}

function getVolume() {
  const raw = getData().settings.volume;
  if (raw == null || raw === '') return null;
  const v = Number(raw);
  if (!Number.isFinite(v)) return null;
  return Math.max(0, Math.min(1, v));
}

function setVolume(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return { success: false };
  const clamped = Math.max(0, Math.min(1, v));
  const d = getData();
  d.settings.volume = String(clamped);
  dirty = true;
  persist();
  return { success: true, volume: clamped };
}

function getPlaylists() {
  return getData().playlists.slice().sort((a, b) => b.is_default - a.is_default || a.name.localeCompare(b.name));
}

function getPlaylist(playlistId) {
  return getData().playlists.find(p => p.id === playlistId) || null;
}

function getPlaylistTracks(playlistId) {
  const d = getData();
  const trackIds = d.playlist_tracks.filter(pt => pt.playlist_id === playlistId).map(pt => pt.track_id);
  return d.tracks.filter(t => trackIds.includes(t.id));
}

function createPlaylist(name, genre) {
  if (!name || !name.trim()) throw new Error('Укажите имя плейлиста.');
  const d = getData();
  if (d.playlists.some(p => p.name === name.trim())) {
    throw new Error('Плейлист с таким именем уже существует.');
  }
  const id = Date.now();
  const playlist = {
    id,
    name: name.trim(),
    genre: genre && genre.trim() ? genre.trim() : null,
    is_default: 0,
    created_at: new Date().toISOString(),
  };
  d.playlists.push(playlist);
  dirty = true;
  return playlist;
}

function updatePlaylist(playlistId, { name, genre }) {
  const d = getData();
  const pl = d.playlists.find(p => p.id === playlistId);
  if (!pl) throw new Error('Плейлист не найден.');

  if (typeof name === 'string') {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Имя плейлиста не может быть пустым.');
    if (pl.is_default) throw new Error('Плейлист «Избранное» нельзя переименовать.');
    if (d.playlists.some(p => p.id !== playlistId && p.name === trimmed)) {
      throw new Error('Плейлист с таким именем уже существует.');
    }
    pl.name = trimmed;
  }

  if (genre !== undefined && !pl.is_default) {
    pl.genre = genre && genre.trim() ? genre.trim() : null;
  }

  dirty = true;
  return { ...pl };
}

function deletePlaylist(playlistId) {
  const d = getData();
  const idx = d.playlists.findIndex(p => p.id === playlistId);
  if (idx === -1) throw new Error('Плейлист не найден.');
  if (d.playlists[idx].is_default) throw new Error('Нельзя удалить плейлист "Избранное".');
  d.playlists.splice(idx, 1);
  d.playlist_tracks = d.playlist_tracks.filter(pt => pt.playlist_id !== playlistId);
  dirty = true;
  return { success: true };
}

function addTrackToPlaylist(track, playlistId) {
  const d = getData();
  let existing = d.tracks.find(t => t.id === track.id);
  if (!existing) {
    existing = {
      id: track.id,
      title: track.title,
      artist: track.artist,
      source: track.source || 'youtube',
      source_url: track.source_url || null,
      duration: track.duration || null,
      thumbnail: track.thumbnail || null,
      genre: track.genre || null,
      added_at: new Date().toISOString(),
    };
    applyArtistFields(existing);
    d.tracks.push(existing);
  } else {
    applyArtistFields(existing);
  }
  const already = d.playlist_tracks.some(pt => pt.playlist_id === playlistId && pt.track_id === track.id);
  if (already) return { success: false, reason: 'already_in_playlist' };
  d.playlist_tracks.push({ playlist_id: playlistId, track_id: track.id, added_at: new Date().toISOString() });
  dirty = true;
  return { success: true };
}

function removeTrackFromPlaylist(playlistId, trackId) {
  const d = getData();
  d.playlist_tracks = d.playlist_tracks.filter(pt => !(pt.playlist_id === playlistId && pt.track_id === trackId));
  dirty = true;
  return { success: true };
}

function getAllTracks() {
  return getData().tracks.slice();
}

function getTrackPlaylists(trackId) {
  const d = getData();
  return d.playlist_tracks.filter((pt) => pt.track_id === trackId).map((pt) => pt.playlist_id);
}

function getPlaylistMembership() {
  const d = getData();
  const map = {};
  for (const pt of d.playlist_tracks) {
    (map[pt.track_id] = map[pt.track_id] || []).push(pt.playlist_id);
  }
  return map;
}

function recordPlay(track, meta = {}) {
  if (!track || track.id == null) return { success: false, error: 'missing_track' };

  const d = getData();
  const now = Date.now();
  const progress = Number(meta.progress);
  const event = {
    track_id: track.id,
    title: track.title || '',
    artist: track.artist || '',
    source: track.source || 'youtube',
    source_url: track.source_url || null,
    thumbnail: track.thumbnail || null,
    duration: Number(track.duration) || null,
    played_at: new Date(now).toISOString(),
    completed: !!meta.completed,
    progress: Number.isFinite(progress) && progress > 0 ? progress : 0,
  };
  applyArtistFields(event);

  const last = d.history[d.history.length - 1];
  const lastTime = last ? Date.parse(last.played_at || '') : NaN;
  const sameTrack = last && String(last.track_id) === String(event.track_id);
  if (
    sameTrack &&
    !last.completed &&
    Number.isFinite(lastTime) &&
    now - lastTime < HISTORY_MERGE_WINDOW_MS
  ) {
    last.played_at = event.played_at;
    last.completed = !!(last.completed || event.completed);
    last.progress = Math.max(Number(last.progress) || 0, event.progress);
    for (const key of ['title', 'artist', 'source', 'source_url', 'thumbnail', 'duration']) {
      if (!last[key] && event[key]) last[key] = event[key];
    }
    if (!last.artists && event.artists) last.artists = event.artists;
    if (!last.primary_artist_key && event.primary_artist_key) {
      last.primary_artist_key = event.primary_artist_key;
    }
  } else {
    d.history.push(event);
    if (d.history.length > MAX_HISTORY_EVENTS) {
      d.history = d.history.slice(-MAX_HISTORY_EVENTS);
    }
  }

  dirty = true;
  return { success: true };
}

function completePlay(trackId) {
  if (trackId == null) return { success: false, error: 'missing_track' };
  const d = getData();
  const id = String(trackId);
  for (let i = d.history.length - 1; i >= 0; i--) {
    const ev = d.history[i];
    if (String(ev.track_id) !== id) continue;
    ev.completed = true;
    ev.progress = Math.max(Number(ev.progress) || 0, Number(ev.duration) || 0);
    dirty = true;
    return { success: true };
  }
  return { success: false, error: 'not_found' };
}

function getHistory(limit = 500) {
  const n = Math.max(1, Math.min(MAX_HISTORY_EVENTS, Number(limit) || 500));
  return getData().history.slice(-n);
}


function getBlacklist() {
  const d = getData();
  return {
    artists: d.blacklist.artists.slice(),
    tracks: d.blacklist.tracks.slice(),
  };
}

function addArtistToBlacklist({ key, name } = {}) {
  const cleanName = String(name || '').trim();
  let cleanKey = String(key || '').trim();
  let displaySource = cleanName;
  if (!cleanKey && cleanName) {
    displaySource = firstArtist(cleanName);
    cleanKey = normalizeArtistKey(displaySource);
  }
  if (!cleanKey) return { success: false, error: 'missing_key' };
  const d = getData();
  if (d.blacklist.artists.some((a) => a.key === cleanKey)) {
    return { success: true, already: true };
  }
  const displayName = displaySource ? cleanArtistName(displaySource) : cleanKey;
  const entry = {
    key: cleanKey,
    name: displayName || cleanKey,
    added_at: new Date().toISOString(),
  };
  d.blacklist.artists.unshift(entry);
  dirty = true;
  persist();
  return { success: true, added: true, artist: entry };
}

function addTrackToBlacklist(track = {}) {
  const id = track.id != null ? String(track.id) : '';
  if (!id) return { success: false, error: 'missing_id' };
  const d = getData();
  if (d.blacklist.tracks.some((t) => String(t.id) === id)) {
    return { success: true, already: true };
  }
  const entry = {
    id,
    title: track.title || 'Без названия',
    artist: track.artist || '',
    thumbnail: track.thumbnail || null,
    source: track.source || null,
    source_url: track.source_url || null,
    added_at: new Date().toISOString(),
  };
  d.blacklist.tracks.unshift(entry);
  dirty = true;
  persist();
  return { success: true, added: true, track: entry };
}

function removeArtistFromBlacklist(key) {
  const cleanKey = String(key || '').trim();
  const d = getData();
  const before = d.blacklist.artists.length;
  d.blacklist.artists = d.blacklist.artists.filter((a) => a.key !== cleanKey);
  if (d.blacklist.artists.length !== before) {
    dirty = true;
    persist();
    return { success: true, removed: true };
  }
  return { success: true, removed: false };
}

function removeTrackFromBlacklist(id) {
  const cleanId = String(id || '');
  const d = getData();
  const before = d.blacklist.tracks.length;
  d.blacklist.tracks = d.blacklist.tracks.filter((t) => String(t.id) !== cleanId);
  if (d.blacklist.tracks.length !== before) {
    dirty = true;
    persist();
    return { success: true, removed: true };
  }
  return { success: true, removed: false };
}

function addTracksToBlacklist(tracks = []) {
  const list = Array.isArray(tracks) ? tracks : [];
  const added = [];
  const already = [];
  const failed = [];
  const d = getData();
  const known = new Set(d.blacklist.tracks.map((t) => String(t.id)));

  for (const track of list) {
    const id = track && track.id != null ? String(track.id) : '';
    if (!id) {
      failed.push({ id: null, title: track && track.title, error: 'missing_id' });
      continue;
    }
    if (known.has(id)) {
      already.push({ id, title: track.title });
      continue;
    }
    const entry = {
      id,
      title: track.title || 'Без названия',
      artist: track.artist || '',
      thumbnail: track.thumbnail || null,
      source: track.source || null,
      source_url: track.source_url || null,
      added_at: new Date().toISOString(),
    };
    d.blacklist.tracks.unshift(entry);
    known.add(id);
    added.push(entry);
  }

  if (added.length) {
    dirty = true;
    persist();
  }
  return { success: failed.length === 0, added, already, failed };
}

function removeArtistsFromBlacklist(keys = []) {
  const wanted = new Set((Array.isArray(keys) ? keys : []).map((k) => String(k || '').trim()).filter(Boolean));
  if (!wanted.size) return { success: true, removed: 0 };
  const d = getData();
  const before = d.blacklist.artists.length;
  d.blacklist.artists = d.blacklist.artists.filter((a) => !wanted.has(String(a.key)));
  const removed = before - d.blacklist.artists.length;
  if (removed) {
    dirty = true;
    persist();
  }
  return { success: true, removed };
}

function removeTracksFromBlacklist(ids = []) {
  const wanted = new Set((Array.isArray(ids) ? ids : []).filter((id) => id != null).map((id) => String(id)));
  if (!wanted.size) return { success: true, removed: 0 };
  const d = getData();
  const before = d.blacklist.tracks.length;
  d.blacklist.tracks = d.blacklist.tracks.filter((t) => !wanted.has(String(t.id)));
  const removed = before - d.blacklist.tracks.length;
  if (removed) {
    dirty = true;
    persist();
  }
  return { success: true, removed };
}

function clearBlacklist(type) {
  const d = getData();
  if (type === 'artists') d.blacklist.artists = [];
  else if (type === 'tracks') d.blacklist.tracks = [];
  else d.blacklist = { artists: [], tracks: [] };
  dirty = true;
  persist();
  return { success: true };
}

const CACHE_FILE = path.join(APP_DIR, 'cache.json');

function readCache() {
  ensureDir();
  if (!fs.existsSync(CACHE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
  } catch (e) {
    return {};
  }
}

function writeCache(data) {
  ensureDir();
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data), 'utf-8');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

module.exports = {
  getSettings,
  setSetting,
  getVolume,
  setVolume,
  readCache,
  writeCache,
  getPlaylists,
  getPlaylist,
  getPlaylistTracks,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
  addTrackToPlaylist,
  removeTrackFromPlaylist,
  getAllTracks,
  getTrackPlaylists,
  getPlaylistMembership,
  recordPlay,
  completePlay,
  getHistory,
  getBlacklist,
  addArtistToBlacklist,
  addTrackToBlacklist,
  addTracksToBlacklist,
  removeArtistFromBlacklist,
  removeTrackFromBlacklist,
  removeArtistsFromBlacklist,
  removeTracksFromBlacklist,
  clearBlacklist,
  APP_DIR,
};
