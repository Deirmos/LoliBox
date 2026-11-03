const { execFileSync, execFile } = require('child_process');
const { getYtDlp, baseArgs, INSTALL_HINT } = require('./ytdlp');
const cache = require('./cache');
const ytmusic = require('./ytmusic');
const { normalizeArtistKey: normalizeName } = require('./artists');

const ARTIST_LIST_TTL_MS = 15 * 60 * 1000;

function ytDlpAvailable() {
  try {
    execFileSync(getYtDlp(), ['--version'], { encoding: 'utf-8', maxBuffer: 1024, timeout: 5000 });
    return true;
  } catch (e) {
    return false;
  }
}

function runYtDlpAsync(args, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    execFile(
      getYtDlp(),
      args,
      { encoding: 'utf-8', maxBuffer: 20 * 1024 * 1024, timeout: timeoutMs },
      (err, stdout, stderr) => {
        if (!err) {
          resolve((stdout || '').trim());
          return;
        }
        if (err.code === 100 || err.status === 100) {
          resolve((stdout || '').trim());
          return;
        }
        const msg = stderr || err.message || '';
        if (msg.includes('Unable to extract') || msg.includes('no results')) {
          resolve('');
          return;
        }
        reject(new Error(`yt-dlp: ${msg.trim()}`));
      }
    );
  });
}

function parseDuration(text) {
  if (!text) return null;
  const parts = text.split(':').reverse().map(Number);
  let seconds = 0;
  let multiplier = 1;
  for (const p of parts) {
    seconds += p * multiplier;
    multiplier *= 60;
  }
  return seconds;
}

function pickThumbnail(info) {
  if (Array.isArray(info.thumbnails) && info.thumbnails.length > 0) {
    const withUrl = info.thumbnails.filter((t) => t && t.url);
    if (withUrl.length > 0) {
      const best = withUrl.reduce((a, b) => ((b.width || 0) > (a.width || 0) ? b : a));
      return best.url;
    }
  }
  if (typeof info.thumbnail === 'string' && info.thumbnail) return info.thumbnail;
  return null;
}

async function searchYouTubeMusic(query, limit = 40) {
  const count = Math.max(1, Math.min(100, Number(limit) || 40));
  const cached = cache.getSearch('yt', query, count);
  if (cached) return cached;

  const args = [
    ...baseArgs(),
    '--flat-playlist',
    '--dump-json',
    '--socket-timeout', '10',
    '--retries', '1',
    `ytsearch${count}:${query}`,
  ];
  const raw = await runYtDlpAsync(args, 45000);
  if (!raw) return [];
  const tracks = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const info = JSON.parse(line);
      tracks.push({
        id: `yt_${info.id}`,
        title: info.title || 'Без названия',
        artist: info.artist || info.uploader || info.channel || 'Неизвестный исполнитель',
        source: 'youtube',
        source_url: info.webpage_url || info.url || `https://www.youtube.com/watch?v=${info.id}`,
        duration: info.duration || null,
        thumbnail: pickThumbnail(info),
        genre: info.genre || null,
        channel: info.channel || info.uploader || null,
      });
    } catch (e) {}
  }
  cache.setSearch('yt', query, count, tracks);
  return tracks;
}

async function searchSoundCloud(query, limit = 25) {
  const count = Math.max(1, Math.min(100, Number(limit) || 25));
  const cached = cache.getSearch('sc', query, count);
  if (cached) return cached;

  const args = [
    ...baseArgs(),
    '--flat-playlist',
    '--dump-json',
    '--socket-timeout', '8',
    '--retries', '1',
    `scsearch${count}:${query}`,
  ];
  const raw = await runYtDlpAsync(args, 35000);
  if (!raw) return [];
  const tracks = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const info = JSON.parse(line);
      tracks.push({
        id: `sc_${info.id}`,
        title: info.title || 'Без названия',
        artist: info.artist || info.uploader || info.channel || 'Неизвестный исполнитель',
        source: 'soundcloud',
        source_url: info.webpage_url || info.url || `https://soundcloud.com/search?q=${encodeURIComponent(query)}`,
        duration: info.duration || null,
        thumbnail: pickThumbnail(info),
        genre: info.genre || null,
        channel: info.channel || info.uploader || null,
      });
    } catch (e) {}
  }
  cache.setSearch('sc', query, count, tracks);
  return tracks;
}

function nameMatches(candidate, target) {
  const c = normalizeName(candidate);
  const t = normalizeName(target);
  if (!c || !t) return false;
  return c === t || c.includes(t) || t.includes(c);
}

async function resolveArtistChannel(name) {
  const cached = cache.getSearch('artist-channel', name, 0);
  if (cached) return cached;

  const raw = await runYtDlpAsync([
    ...baseArgs(),
    '--flat-playlist',
    '--dump-json',
    '--socket-timeout', '10',
    '--retries', '1',
    `ytsearch10:${name}`,
  ], 30000);
  if (!raw) return null;

  let directChannel = null;
  const videoChannels = new Map();

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let info;
    try { info = JSON.parse(line); } catch (e) { continue; }

    const url = info.webpage_url || info.url || '';
    const isChannelUrl = /youtube\.com\/(channel\/[\w-]+|@[\w.-]+)/i.test(url);

    if (isChannelUrl && !directChannel && nameMatches(info.channel || info.uploader || info.title, name)) {
      directChannel = {
        url: url.split('?')[0].replace(/\/$/, ''),
        title: info.channel || info.uploader || info.title || name,
        id: info.id || null,
      };
      continue;
    }

    const chUrl = info.channel_url || '';
    const chName = info.channel || info.uploader || '';
    if (chUrl && /youtube\.com\/channel\//i.test(chUrl) && nameMatches(chName, name)) {
      const clean = chUrl.split('?')[0].replace(/\/$/, '');
      const entry = videoChannels.get(clean) || { url: clean, title: chName, count: 0, id: info.channel_id || null };
      entry.count += 1;
      videoChannels.set(clean, entry);
    }
  }

  let channel = directChannel;
  if (!channel && videoChannels.size > 0) {
    channel = [...videoChannels.values()].sort((a, b) => b.count - a.count)[0];
  }

  if (channel) cache.setSearch('artist-channel', name, 0, channel);
  return channel;
}

async function searchArtistChannel(channelUrl, limit = 120) {
  const cached = cache.getSearch('artist-tracks', channelUrl, limit);
  if (cached) return cached;

  const files = [
    `${channelUrl}/videos`,
    `${channelUrl}/releases`,
  ];
  const seenIds = new Set();
  const out = [];

  const results = await Promise.allSettled(
    files.map((u) =>
      runYtDlpAsync([
        ...baseArgs(),
        '--flat-playlist',
        '--dump-json',
        '--socket-timeout', '10',
        '--retries', '1',
        '--playlist-end', String(limit),
        u,
      ], 60000)
    )
  );

  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value) continue;
    for (const line of r.value.split('\n')) {
      if (!line.trim()) continue;
      let info;
      try { info = JSON.parse(line); } catch (e) { continue; }
      const id = info.id;
      if (!id || seenIds.has(id)) continue;
      if (info._type === 'playlist' || info.ie_key === 'YoutubePlaylist') continue;
      if (!/^[\w-]{11}$/.test(String(id))) continue;
      seenIds.add(id);
      const artistName =
        info.artist ||
        info.uploader ||
        info.channel ||
        info.playlist_channel ||
        info.playlist_uploader ||
        null;
      out.push({
        id: `yt_${id}`,
        title: info.title || 'Без названия',
        artist: artistName || 'Неизвестный исполнитель',
        source: 'youtube',
        source_url: info.webpage_url || (info.url && info.url.startsWith('http') ? info.url : `https://www.youtube.com/watch?v=${id}`),
        duration: info.duration || null,
        thumbnail: pickThumbnail(info) || `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
        genre: info.genre || null,
        channel: artistName,
      });
    }
  }
  if (out.length) cache.setSearch('artist-tracks', channelUrl, limit, out);
  return out;
}

function scoreArtistTrack(track, artistName) {
  const title = normalizeName(track.title);
  const channel = normalizeName(track.channel || track.artist);
  const target = normalizeName(artistName);
  const dur = track.duration || 0;
  let score = 0;

  if (channel && (channel === target || channel.includes(target))) score += 100;
  if (title.includes(target)) score += 30;

  if (/\b(feat|ft|with|x|&)\b/.test(title) || title.includes(' и ')) score -= 8;

  if (/\b(remix|cover|sped up|slowed|reverb|nightcore|live|instrumental|reaction|tutorial)\b/.test(title)) {
    score -= 45;
  }

  if (/\b(trailer|gameplay|interview|behind the scenes|teaser|documentary|vlog|announcement|promo|short film|making of)\b/.test(title)) {
    score -= 80;
  }

  if (dur > 0 && dur < 60) score -= 30;

  if (/\b(full album|album stream|ep|mix|playlist|compilation|selected works)\b/.test(title)) score -= 60;
  if (dur > 1800) score -= 50;

  return score;
}

function dedupeTracks(list) {
  const seen = new Set();
  return list.filter((t) => {
    const key = t.source_url || t.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rankArtistTracks(list, artistName) {
  return list
    .map((t, i) => ({ t, s: scoreArtistTrack(t, artistName), i }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.t);
}

async function searchYouTubeSmartLegacy(query, limit = 40, options = {}) {
  const count = Math.max(1, Math.min(300, Number(limit) || 40));
  const includeVersions = !!options.includeVersions;
  const cacheSource = includeVersions ? 'ytsmart-all' : 'ytsmart-orig';
  const cached = cache.getSearch(cacheSource, query, count);
  if (cached) return cached;

  const [textRes, channelRes] = await Promise.allSettled([
    searchYouTubeMusic(query, count),
    resolveArtistChannel(query),
  ]);

  const textTracks = textRes.status === 'fulfilled' ? textRes.value : [];
  const channel = channelRes.status === 'fulfilled' ? channelRes.value : null;

  let artistTracks = [];
  if (channel?.url && nameMatches(channel.title, query)) {
    try {
      artistTracks = await searchArtistChannel(channel.url, Math.max(count, 80));
      if (!includeVersions) {
        artistTracks = artistTracks.filter(
          (t) => !ytmusic.isVersionTitle(t.title)
        );
      }
    } catch (e) {
      console.error('[Search] channel tracks error:', e.message);
    }
  }

  if (artistTracks.length === 0) {
    cache.setSearch(cacheSource, query, count, textTracks);
    return textTracks;
  }

  const merged = dedupeTracks([...artistTracks, ...textTracks]);
  const ranked = rankArtistTracks(merged, channel.title);

  const final = ranked.slice(0, Math.max(count, 100));
  cache.setSearch(cacheSource, query, count, final);
  return final;
}

async function searchYouTubeSmart(query, limit = 40, options = {}) {
  const count = Math.max(1, Math.min(300, Number(limit) || 40));
  const includeVersions = !!options.includeVersions;
  const cacheSource = includeVersions ? 'ytm-all' : 'ytm-orig';
  const cached = cache.getSearch(cacheSource, query, count);
  if (cached) return cached;

  try {
    const items = await ytmusic.searchMusic(query, {
      limit: Math.max(count, 60),
      artistCatalog: true,
      includeVersions,
    });
    const tracks = items.map(ytmusic.itemToTrack).filter((t) => t && t.id);
    if (tracks.length > 0) {
      cache.setSearch(cacheSource, query, count, tracks);
      return tracks;
    }
  } catch (err) {
    console.error('[Search] YouTube Music API error:', err.message);
  }

  try {
    const fallback = await searchYouTubeSmartLegacy(query, count, options);
    if (fallback.length > 0) cache.setSearch(cacheSource, query, count, fallback);
    return fallback;
  } catch (err) {
    console.error('[Search] yt-dlp fallback error:', err.message);
    return [];
  }
}

async function artistTopTracksYtm(artistName, limit = 300, options = {}) {
  const name = String(artistName || '').trim();
  if (!name) return null;

  const includeVersions = !!options.includeVersions;
  const cacheSource = includeVersions ? 'ytm-artist-all' : 'ytm-artist-orig';
  const cached = cache.getSearch(cacheSource, name, limit);
  if (cached) return cached;

  try {
    const items = await ytmusic.artistTopTracks(name, {
      limit: Math.max(limit, 60),
      includeVersions,
    });
    const tracks = items.map(ytmusic.itemToTrack).filter((t) => t && t.id);
    if (tracks.length > 0) {
      cache.setSearch(cacheSource, name, limit, tracks, ARTIST_LIST_TTL_MS);
      return tracks;
    }
  } catch (err) {
    console.error('[Search] YouTube Music artist error:', err.message);
  }
  return null;
}

async function artistTopTracksLegacy(artistName, limit = 300, options = {}) {
  const name = String(artistName || '').trim();
  if (!name) return [];

  const includeVersions = !!options.includeVersions;
  const keepVersion = (t) => includeVersions || !ytmusic.isVersionTitle(t.title);

  let channelTracks = [];
  try {
    const channel = await resolveArtistChannel(name);
    if (channel?.url) {
      channelTracks = await searchArtistChannel(channel.url, limit);
      channelTracks = channelTracks.filter(keepVersion);
    }
  } catch (e) {
    console.error('[Search] channel lookup error:', e.message);
  }

  const [sc, ytText] = await Promise.allSettled([
    searchSoundCloud(name, 30),
    channelTracks.length ? Promise.resolve([]) : searchYouTubeMusic(`${name} songs`, 50),
  ]);

  const scTracks = sc.status === 'fulfilled'
    ? sc.value.filter((t) => nameMatches(t.artist || t.channel, name)).filter(keepVersion)
    : [];
  const textTracks = ytText.status === 'fulfilled' ? ytText.value.filter(keepVersion) : [];

  const fromYt = channelTracks.length
    ? channelTracks
    : textTracks.filter((t) => nameMatches(t.artist || t.channel, name));

  const merged = dedupeTracks([...fromYt, ...scTracks]);
  const ranked = rankArtistTracks(merged, name);
  if (ranked.length > 0) return ranked;

  return dedupeTracks([
    ...channelTracks,
    ...(sc.status === 'fulfilled' ? sc.value.filter(keepVersion) : []),
    ...textTracks,
  ]);
}

function setupSearchHandlers(ipcMain, mainWindow) {
  ipcMain.handle('search:youtube-music', async (event, query, limit, options) => {
    if (!query || !query.trim()) return [];
    try {
      return await searchYouTubeSmart(query.trim(), limit, options);
    } catch (err) {
      console.error('[Search] YouTube error:', err.message);
      throw err;
    }
  });

  ipcMain.handle('search:soundcloud', async (event, query, limit) => {
    if (!query || !query.trim()) return [];
    try {
      return await searchSoundCloud(query.trim(), limit);
    } catch (err) {
      console.error('[Search] SoundCloud error:', err.message);
      throw err;
    }
  });

  ipcMain.handle('artist:top-tracks', async (event, artistName, options) => {
    if (!artistName || !artistName.trim()) return [];
    const name = artistName.trim();

    try {
      const fromYtm = await artistTopTracksYtm(name, 300, options);
      if (fromYtm && fromYtm.length > 0) return fromYtm;

      return await artistTopTracksLegacy(name, 300, options);
    } catch (err) {
      console.error('[Search] artist error:', err.message);
      throw err;
    }
  });
}

module.exports = {
  setupSearchHandlers,
  searchYouTubeMusic,
  searchYouTubeSmart,
  searchSoundCloud,
  resolveArtistChannel,
  searchArtistChannel,
  ytDlpAvailable,
};
