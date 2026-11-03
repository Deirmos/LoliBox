const {
  cleanArtistName,
  normalizeArtistKey: normalizeName,
  splitArtists,
  firstArtist,
  parseArtistEntries,
} = require('./artists');
const cache = require('./cache');

const MUSIC_ORIGIN = 'https://music.youtube.com';
const FALLBACK_KEY = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30';
const FALLBACK_VERSION = '1.20240101.01.00';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const FILTERS = {
  songs: 'EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D',
  artists: 'EgWKAQIgAWoKEAkQChAFEAMQBA%3D%3D',
  albums: 'EgWKAQIYAWoKEAkQChAFEAMQBA%3D%3D',
  videos: 'EgWKAQIQAWoKEAkQChAFEAMQBA%3D%3D',
};

const MIN_TRACK_SECONDS = 30;
const MAX_TRACK_SECONDS = 20 * 60;

const NON_MUSIC_RE = new RegExp(
  `\\b(?:${[
    'gameplay',
    'walkthrough',
    'playthrough',
    'no commentary',
    'full game',
    'all cutscenes',
    'cutscene',
    'game movie',
    'movie',
    'documentary',
    'interview',
    'podcast',
    'reaction',
    'tutorial',
    'lesson',
    'behind the scenes',
    'trailer',
    'teaser',
    'unboxing',
    'review',
    'vlog',
    'livestream',
    'live stream',
    'asmr',
    'white noise',
    'rain sounds',
    'sound effects',
    '10 hours',
    '1 hour',
    'hours of',
    'full album',
    'full soundtrack',
    'complete album',
    'album stream',
    'all songs',
  ].join('|')})\\b`,
  'i'
);

const VERSION_RE =
  /\b(remix|bootleg|cover|sped up|slowed|reverb|nightcore|8d|instrumental|karaoke|acapella|mashup|medley|live|concert)\b/i;

const ARTIST_CATALOG_LIMIT = 300;
const RELEASE_FETCH_CONCURRENCY = 6;
const TOP_SONGS_PLAYLIST_LIMIT = 200;
const RELEASE_RETRY_DELAY_MS = 350;

const VERSION_PAREN_RE =
  /[\(\[]\s*(?![^)\]]*\b(?:original|album|single|deluxe|acoustic|demo|remaster(?:ed)?)\b)[^)\]]*\b(?:remix(?:ed)?|rmx|bootleg|cover|sped up|slowed|reverb|nightcore|8d|instrumental|karaoke|acapella|mashup|medley|live|concert|edit|rework|dub|version)\b[^)\]]*[\)\]]/i;
const VERSION_DASH_RE =
  /\s[-–—]\s*(?:remix(?:ed)?|rmx|bootleg|cover|sped up|slowed|reverb|nightcore|8d|instrumental|karaoke|acapella|mashup|medley|live|concert|edit|rework|dub)\b/i;
const VERSION_STRONG_RE = /\b(?:sped up|slowed(?:\s*\+?\s*reverb)?|nightcore|8d audio|reverb)\b/i;

const JUNK_RELEASE_RE =
  /\b(?:b[- ]?sides?|remix(?:es|ed)?|rmx|karaoke|instrumentals?|cover(?:s)?|tribute|greatest hits|compilation|anthology|bootleg)\b|\blive\s+(?:at|from|in|versions?|album|session|performances?)\b|^(?:live|remixes|instrumentals|karaoke|covers)$/i;

let clientConfig = null;

function parseDurationText(text) {
  const str = String(text || '').trim();
  if (!/^\d{1,3}(?::\d{2}){1,2}$/.test(str)) return null;
  const parts = str.split(':').map(Number);
  let seconds = 0;
  for (const p of parts) seconds = seconds * 60 + p;
  return seconds;
}

function parseCount(text) {
  const m = String(text || '').match(/([\d.,]+)\s*([KMB])?/i);
  if (!m) return 0;
  let n = parseFloat(m[1].replace(',', '.'));
  if (!Number.isFinite(n)) return 0;
  const suffix = (m[2] || '').toUpperCase();
  if (suffix === 'K') n *= 1e3;
  else if (suffix === 'M') n *= 1e6;
  else if (suffix === 'B') n *= 1e9;
  return Math.round(n);
}

function runsText(runs) {
  if (!Array.isArray(runs)) return '';
  return runs.map((r) => (r && r.text) || '').join('');
}

function flexText(column) {
  return runsText(column?.musicResponsiveListItemFlexColumnRenderer?.text?.runs);
}

function fixedText(column) {
  return runsText(column?.musicResponsiveListItemFixedColumnRenderer?.text?.runs);
}

function pickThumbnail(thumbnails) {
  const list = (thumbnails || []).filter((t) => t && t.url);
  if (list.length === 0) return null;
  return list.reduce((a, b) => ((b.width || 0) > (a.width || 0) ? b : a)).url;
}

function walkJson(value, cb) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) walkJson(item, cb);
    return;
  }
  cb(value);
  for (const key of Object.keys(value)) walkJson(value[key], cb);
}

async function getClientConfig() {
  if (clientConfig && clientConfig.expiresAt > Date.now()) return clientConfig;

  let key = FALLBACK_KEY;
  let version = FALLBACK_VERSION;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(MUSIC_ORIGIN + '/', {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9' },
      signal: controller.signal,
    });
    if (res.ok) {
      const html = await res.text();
      const foundKey = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
      const foundVersion = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/);
      if (foundKey) key = foundKey[1];
      if (foundVersion) version = foundVersion[1];
    }
  } catch (e) {
  } finally {
    clearTimeout(timer);
  }

  clientConfig = {
    key,
    version,
    expiresAt: Date.now() + 6 * 60 * 60 * 1000,
  };
  return clientConfig;
}

async function apiPost(endpoint, body) {
  const { key, version } = await getClientConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);
  try {
    const res = await fetch(
      `${MUSIC_ORIGIN}/youtubei/v1/${endpoint}?key=${encodeURIComponent(key)}&prettyPrint=false`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENT,
          'Accept-Language': 'en-US,en;q=0.9',
          'X-YouTube-Client-Name': '67',
          'X-YouTube-Client-Version': version,
          Origin: MUSIC_ORIGIN,
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: 'WEB_REMIX',
              clientVersion: version,
              hl: 'en',
              gl: 'US',
            },
          },
          ...body,
        }),
        signal: controller.signal,
      }
    );

    if (!res.ok) throw new Error(`YouTube Music API: HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function parseResponsiveItem(renderer) {
  const columns = (renderer.flexColumns || []).map(flexText);
  const extraColumns = (renderer.fixedColumns || []).map(fixedText);

  const title = (columns[0] || '').trim();
  const detail = columns.slice(1).filter(Boolean).join(' • ');
  const segments = detail
    .split(/\s*•\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .concat(extraColumns.filter(Boolean));

  let type = null;
  let artist = null;
  let album = null;
  let duration = null;
  let plays = 0;
  let audience = 0;
  let index = 0;

  let rest = segments.slice();
  if (rest[0] && /^(song|video|episode|single|album|playlist|artist|podcast)$/i.test(rest[0])) {
    type = rest.shift().toLowerCase();
  }

  for (const segment of rest) {
    const parsedDuration = parseDurationText(segment);
    if (parsedDuration != null && duration == null) {
      duration = parsedDuration;
      continue;
    }
    if (/monthly audience|subscribers/i.test(segment)) {
      audience = parseCount(segment);
      continue;
    }
    if (/\b(plays|views)\b/i.test(segment)) {
      plays = parseCount(segment);
      continue;
    }
    if (!artist) {
      artist = segment;
      continue;
    }
    if (!album) album = segment;
  }

  const overlay = renderer.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer;
  const watch = overlay?.playNavigationEndpoint?.watchEndpoint;
  let videoId = watch?.videoId || renderer.playlistItemData?.videoId || null;

  if (!videoId) {
    walkJson(renderer.flexColumns, (node) => {
      if (!videoId && node.watchEndpoint?.videoId) videoId = node.watchEndpoint.videoId;
    });
  }

  const browseId =
    renderer.navigationEndpoint?.browseEndpoint?.browseId || null;

  const musicVideoType =
    watch?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType || null;

  if (!type && musicVideoType) {
    if (/ATV|OMV|LICENSED/i.test(musicVideoType)) type = 'song';
    else if (/UGC/i.test(musicVideoType)) type = 'video';
  }

  const thumbnail =
    pickThumbnail(renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails) ||
    (videoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : null);

  index = Number(renderer.playlistItemData?.index) || 0;

  return {
    kind: 'music',
    type,
    videoId,
    browseId,
    title,
    artist,
    album,
    duration,
    plays,
    audience,
    index,
    thumbnail,
    musicVideoType,
  };
}

function collectResponsiveItems(json) {
  const items = [];
  walkJson(json, (node) => {
    if (node.musicResponsiveListItemRenderer) {
      const item = parseResponsiveItem(node.musicResponsiveListItemRenderer);
      item.index = items.length;
      items.push(item);
    }
  });
  return items;
}

function collectContinuationTokens(json) {
  const tokens = [];
  walkJson(json, (node) => {
    const token = node.continuationCommand?.token;
    if (token && !tokens.includes(token)) tokens.push(token);
  });
  return tokens;
}

function isMusicVideoId(id) {
  return typeof id === 'string' && /^[\w-]{11}$/.test(id);
}

function isNonMusicItem(item) {
  if (!item || !item.title) return true;
  if (item.type === 'episode' || item.type === 'podcast') return true;
  if (NON_MUSIC_RE.test(item.title)) return true;
  if (item.duration != null) {
    if (item.duration < MIN_TRACK_SECONDS) return true;
    if (item.duration >= MAX_TRACK_SECONDS) return true;
  }
  return false;
}

function isVersionTitle(title) {
  const text = String(title || '');
  return (
    VERSION_PAREN_RE.test(text) ||
    VERSION_DASH_RE.test(text) ||
    VERSION_STRONG_RE.test(text)
  );
}

function isJunkRelease(title) {
  return JUNK_RELEASE_RE.test(String(title || '').trim());
}

function isExplicitVersion(title) {
  return VERSION_RE.test(String(title || ''));
}

function officialScore(item) {
  let score = 0;
  const type = String(item.musicVideoType || '');
  if (/ATV|OMV|LICENSED/i.test(type)) score += 30;
  else if (/UGC/i.test(type)) score -= 35;
  if (item.album) score += 10;
  if (item.type === 'song') score += 5;
  return score;
}

function tokenizeQuery(query) {
  return normalizeName(query).split(' ').filter(Boolean);
}

function isArtistPrefixOfQuery(artistName, query) {
  const artist = normalizeName(artistName);
  const q = normalizeName(query);
  if (!artist || !q) return false;
  return q === artist || q.startsWith(artist + ' ');
}

function isPureArtistQuery(query, targets) {
  const q = normalizeName(query)
    .replace(/\s+(?:songs?|music|tracks?|песни|треки)$/i, '')
    .trim();
  if (!q) return false;
  for (const name of targets.keys()) {
    if (q === normalizeName(name)) return true;
  }
  return false;
}

function artistMatches(item, targets) {
  if (targets.size === 0) return false;
  for (const part of splitArtists(item.artist)) {
    if (targets.has(normalizeName(part))) return true;
  }
  return false;
}

function titleCoverage(track, tokens) {
  if (!tokens || tokens.length === 0) return 0;
  const haystack = normalizeName(`${track.title || ''} ${track.album || ''}`);
  let matched = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) matched += 1;
  }
  return matched / tokens.length;
}

function rankArtistCatalog(items) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const playsDiff = (b.item.plays || 0) - (a.item.plays || 0);
      if (playsDiff) return playsDiff;
      const officialDiff = officialScore(b.item) - officialScore(a.item);
      if (officialDiff) return officialDiff;
      return a.index - b.index;
    })
    .map((x) => x.item);
}

function rankItems(items, query, targets) {
  const queryTokens = tokenizeQuery(query);
  const targetTokens = new Set();
  const targetNames = typeof targets.keys === 'function' ? [...targets.keys()] : [...targets];
  for (const name of targetNames) {
    for (const token of normalizeName(name).split(' ')) {
      if (token) targetTokens.add(token);
    }
  }
  const residualTokens = queryTokens.filter((t) => !targetTokens.has(t));

  const scored = items.map((item, index) => {
    let score = 0;

    if (artistMatches(item, targets)) score += 60;

    const coverage = titleCoverage(item, residualTokens.length ? residualTokens : queryTokens);
    score += coverage * 90;

    score += officialScore(item);

    if (item.plays > 0) score += Math.min(18, Math.log10(item.plays + 1) * 3);
    if (item.audience > 0) score += Math.min(8, Math.log10(item.audience + 1) * 1.5);

    score += Math.max(0, 8 - index * 0.4);

    if (isExplicitVersion(item.title)) score -= 45;
    if (/topic$/i.test(String(item.artist || ''))) score += 2;

    if (!item.album && item.type === 'video') score -= 12;

    if (item.fromCatalog && residualTokens.length > 0) score -= 30;

    return { item, score, order: index };
  });

  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.map((x) => x.item);
}

function normalizeTitleForDedupe(title) {
  return normalizeName(title)
    .replace(
      /\b(official|music|video|audio|lyric|lyrics|visualizer|visualiser|hd|hq|4k|explicit|clean|remastered|remaster|from the album)\b/g,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupe(items) {
  const out = [];
  const seenIds = new Set();
  const byKey = new Map();

  for (const item of items) {
    const id = item.videoId;
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);

    const key = `${normalizeTitleForDedupe(item.title)}|${normalizeName(firstArtist(item.artist))}`;
    const existing = byKey.get(key);

    if (existing) {
      const durA = existing.duration || 0;
      const durB = item.duration || 0;
      if (durA && durB && Math.abs(durA - durB) > 6) {
        out.push(item);
        continue;
      }
      if (!existing.duration && item.duration) existing.duration = item.duration;
      if (!existing.thumbnail && item.thumbnail) existing.thumbnail = item.thumbnail;
      continue;
    }

    byKey.set(key, item);
    out.push(item);
  }

  return out;
}

function mergeFeaturedArtists(artist, title) {
  return parseArtistEntries(artist, title)
    .map((entry) => entry.name)
    .join(', ');
}

async function getVideoMeta(videoId) {
  if (!isMusicVideoId(videoId)) return null;
  try {
    const json = await apiPost('player', {
      videoId,
      playbackContext: {
        contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS' },
      },
    });
    const details = json.videoDetails;
    if (!details) return null;
    return {
      title: details.title || null,
      artist: details.author || null,
      duration: Number(details.lengthSeconds) || null,
      thumbnail:
        pickThumbnail(details.thumbnail?.thumbnails) ||
        `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    };
  } catch (e) {
    return null;
  }
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = new Array(Math.min(concurrency, items.length || 1))
    .fill(null)
    .map(async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index], index);
      }
    });
  await Promise.all(workers);
  return results;
}

async function enrichItems(items, max = 30) {
  const need = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item && isMusicVideoId(item.videoId) && (!item.duration || !item.artist))
    .slice(0, max);

  if (need.length === 0) return;

  await mapPool(need, 6, async ({ item }) => {
    const meta = await getVideoMeta(item.videoId);
    if (!meta) return;
    if (!item.duration && meta.duration) item.duration = meta.duration;
    if (!item.artist && meta.artist) item.artist = meta.artist;
    if (!item.thumbnail && meta.thumbnail) item.thumbnail = meta.thumbnail;
    if (!item.title && meta.title) item.title = meta.title;
  });
}

async function searchSongs(query, limit = 40) {
  const json = await apiPost('search', { query, params: FILTERS.songs });
  const items = collectResponsiveItems(json)
    .filter((item) => isMusicVideoId(item.videoId))
    .filter((item) => item.title)
    .filter((item) => !isNonMusicItem(item));

  return items.slice(0, Math.max(1, limit));
}

async function searchArtists(query) {
  const json = await apiPost('search', { query, params: FILTERS.artists });
  const artists = [];
  const seen = new Set();

  for (const item of collectResponsiveItems(json)) {
    if (!item.browseId || !item.title) continue;
    if (item.type && item.type !== 'artist') continue;
    if (seen.has(item.browseId)) continue;
    seen.add(item.browseId);
    artists.push({
      name: item.title,
      browseId: item.browseId,
      audience: item.audience || 0,
    });
  }

  return artists;
}

async function browseArtistSongs(browseId) {
  if (!browseId) return [];
  const json = await apiPost('browse', { browseId });
  return collectResponsiveItems(json)
    .filter((item) => isMusicVideoId(item.videoId))
    .filter((item) => item.title)
    .filter((item) => !isNonMusicItem(item));
}


function parseArtistPage(json) {
  let topSongsPlaylist = null;
  const topSongs = [];
  const releases = [];
  const seenReleases = new Set();

  walkJson(json, (node) => {
    const shelf = node.musicShelfRenderer;
    if (shelf) {
      const shelfTitle = runsText(shelf.title?.runs).trim();
      if (/^(top songs|popular songs)$/i.test(shelfTitle)) {
        const bottom = shelf.bottomEndpoint?.browseEndpoint;
        if (bottom?.browseId) {
          topSongsPlaylist = { browseId: bottom.browseId, params: bottom.params || null };
        }
        for (const content of shelf.contents || []) {
          const renderer = content.musicResponsiveListItemRenderer;
          if (!renderer) continue;
          const item = parseResponsiveItem(renderer);
          if (item.videoId) topSongs.push(item);
        }
      }
      return;
    }

    const carousel = node.musicCarouselShelfRenderer;
    if (!carousel) return;
    const header = carousel.header?.musicCarouselShelfBasicHeaderRenderer;
    const carouselTitle = runsText(header?.title?.runs).trim();
    if (
      !/^(albums|singles|eps|singles & eps|singles and eps|latest release|latest releases|new releases|releases|compilations)$/i.test(
        carouselTitle
      )
    ) {
      return;
    }

    const type = /singles|eps/i.test(carouselTitle) ? 'single' : 'album';
    for (const content of carousel.contents || []) {
      const renderer = content.musicTwoRowItemRenderer;
      if (!renderer) continue;
      const browse = renderer.navigationEndpoint?.browseEndpoint;
      if (!browse?.browseId || !/^MPREb_/.test(browse.browseId)) continue;
      const title = runsText(renderer.title?.runs).trim();
      if (!title) continue;
      const key = `${browse.browseId}:${browse.params || ''}`;
      if (seenReleases.has(key)) continue;
      seenReleases.add(key);
      releases.push({
        title,
        browseId: browse.browseId,
        params: browse.params || null,
        type,
      });
    }
  });

  return { topSongs, topSongsPlaylist, releases };
}

async function getArtistPage(browseId) {
  const key = `ytm-artist-page:${browseId}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const json = await apiPost('browse', { browseId });
  const page = parseArtistPage(json);
  if (page.topSongs.length > 0 || page.releases.length > 0) {
    cache.set(key, page, cache.SEARCH_TTL_MS);
  }
  return page;
}

async function browseReleaseTracks(release, artistName) {
  if (!release?.browseId) return [];
  const key = `ytm-release:${release.browseId}:${release.params || ''}`;
  const cached = cache.get(key);
  if (cached) {
    return cached.map((item) => ({ ...item, artist: item.artist || artistName }));
  }

  const json = await apiPost('browse', {
    browseId: release.browseId,
    params: release.params || undefined,
  });
  const items = collectResponsiveItems(json)
    .filter((item) => isMusicVideoId(item.videoId))
    .filter((item) => item.title)
    .filter((item) => !isNonMusicItem(item));

  for (const item of items) {
    item.artist = item.artist || artistName;
    item.album = item.album || release.title;
    item.releaseType = release.type;
    item.fromCatalog = true;
  }

  if (items.length) cache.set(key, items, cache.SEARCH_TTL_MS);
  return items;
}

async function browsePlaylistTracks(endpoint, maxItems = TOP_SONGS_PLAYLIST_LIMIT, artistName = null) {
  if (!endpoint?.browseId) return [];
  const key = `ytm-playlist:${endpoint.browseId}:${endpoint.params || ''}:${maxItems}`;
  const cached = cache.get(key);
  if (cached) {
    return cached.map((item) => ({ ...item, artist: item.artist || artistName }));
  }

  let json = await apiPost('browse', {
    browseId: endpoint.browseId,
    params: endpoint.params || undefined,
  });
  let items = collectResponsiveItems(json);
  let pages = 0;

  while (items.length < maxItems && pages < 4) {
    const token = collectContinuationTokens(json)[0];
    if (!token) break;
    json = await apiPost('browse', { continuation: token });
    const more = collectResponsiveItems(json);
    if (more.length === 0) break;
    items = items.concat(more);
    pages += 1;
  }

  items = items
    .filter((item) => isMusicVideoId(item.videoId))
    .filter((item) => item.title)
    .filter((item) => !isNonMusicItem(item))
    .slice(0, maxItems);

  for (const item of items) {
    item.artist = item.artist || artistName;
    item.fromCatalog = true;
  }

  if (items.length) cache.set(key, items, cache.SEARCH_TTL_MS);
  return items;
}

async function fetchReleaseWithRetry(release, artistName) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const items = await browseReleaseTracks(release, artistName);
      if (items.length > 0) return items;
    } catch (e) {
    }
    if (attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, RELEASE_RETRY_DELAY_MS));
    }
  }
  return [];
}

async function fetchPlaylistWithRetry(endpoint, maxItems, artistName) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const items = await browsePlaylistTracks(endpoint, maxItems, artistName);
      if (items.length > 0) return items;
    } catch (e) {
    }
    if (attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, RELEASE_RETRY_DELAY_MS));
    }
  }
  return [];
}

async function artistCatalog(browseId, options = {}) {
  const artistName = String(options.artistName || '').trim();
  const includeVersions = !!options.includeVersions;
  const limit = Math.max(
    1,
    Math.min(ARTIST_CATALOG_LIMIT, Number(options.limit) || ARTIST_CATALOG_LIMIT)
  );
  if (!browseId) return [];

  let page;
  try {
    page = await getArtistPage(browseId);
  } catch (e) {
    return [];
  }
  if (!page) return [];

  const allReleases = page.releases || [];
  const cleanReleases = includeVersions
    ? allReleases
    : allReleases.filter((release) => !isJunkRelease(release.title));
  const releases = cleanReleases.length > 0 ? cleanReleases : allReleases;

  const playlistPromise = page.topSongsPlaylist
    ? fetchPlaylistWithRetry(
        page.topSongsPlaylist,
        TOP_SONGS_PLAYLIST_LIMIT,
        artistName
      ).catch(() => [])
    : Promise.resolve([]);

  const releaseLists = await mapPool(
    releases,
    RELEASE_FETCH_CONCURRENCY,
    (release) => fetchReleaseWithRetry(release, artistName)
  );

  const raw = [];
  for (const list of releaseLists) raw.push(...list);

  raw.push(...(await playlistPromise));

  for (const item of page.topSongs || []) {
    item.artist = item.artist || artistName;
    item.fromCatalog = true;
    raw.push(item);
  }

  let merged = dedupe(raw).filter((item) => !isNonMusicItem(item));
  if (!includeVersions) {
    merged = merged.filter((item) => !isVersionTitle(item.title));
  }

  if (merged.length === 0 && raw.length > 0) {
    merged = dedupe(raw).filter((item) => !isNonMusicItem(item));
  }

  return merged.slice(0, limit);
}

function parsePlaylistPanelItem(renderer) {
  if (!renderer || renderer.isPlayable === false) return null;
  const title = runsText(renderer?.title?.runs).trim();
  const byline = runsText(
    renderer?.longBylineText?.runs || renderer?.shortBylineText?.runs
  ).trim();
  const segments = byline
    .split(/\s*•\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

  let artist = segments[0] || null;
  let album = null;
  let plays = 0;

  for (const segment of segments.slice(1)) {
    if (/\b(views|likes|subscribers)\b/i.test(segment)) {
      plays = parseCount(segment);
      continue;
    }
    if (/^\d{4}$/.test(segment)) continue;
    if (!album) album = segment;
  }

  const watch = renderer?.navigationEndpoint?.watchEndpoint;
  const videoId = watch?.videoId || renderer?.playlistItemData?.videoId || null;
  if (!isMusicVideoId(videoId)) return null;

  const musicVideoType =
    watch?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType ||
    null;

  let type = null;
  if (musicVideoType && /ATV|OMV|LICENSED/i.test(musicVideoType)) type = 'song';
  else if (musicVideoType && /UGC/i.test(musicVideoType)) type = 'video';
  else if (album) type = 'song';

  const duration = parseDurationText(runsText(renderer?.lengthText?.runs));
  const thumbnail =
    pickThumbnail(renderer?.thumbnail?.thumbnails) ||
    pickThumbnail(renderer?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails) ||
    `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

  return {
    kind: 'music',
    type,
    videoId,
    browseId: null,
    title,
    artist,
    album,
    duration,
    plays,
    audience: 0,
    index: 0,
    thumbnail,
    musicVideoType,
  };
}

function collectPlaylistPanelItems(json) {
  const items = [];
  walkJson(json, (node) => {
    if (!node.playlistPanelVideoRenderer) return;
    const item = parsePlaylistPanelItem(node.playlistPanelVideoRenderer);
    if (!item) return;
    item.index = items.length;
    items.push(item);
  });
  return items;
}

async function radioTracks(videoId, limit = 35) {
  if (!isMusicVideoId(videoId)) return [];
  const json = await apiPost('next', {
    videoId,
    playlistId: `RDAMVM${videoId}`,
    isAudioOnly: true,
  });

  let items = collectPlaylistPanelItems(json)
    .filter((item) => item.videoId !== videoId)
    .filter((item) => item.title)
    .filter((item) => !isNonMusicItem(item));

  items = dedupe(items);
  await enrichItems(items, 8);

  return items
    .filter((item) => !isNonMusicItem(item))
    .slice(0, Math.max(1, Math.min(80, Number(limit) || 35)));
}

async function songsByArtist(artistName, limit = 30) {
  const name = String(artistName || '').trim();
  if (!name) return [];

  const songs = await searchSongs(name, Math.max(limit * 2, 40));
  const targets = new Set([normalizeName(name)]);
  const matched = songs.filter((item) => artistMatches(item, targets));
  if (matched.length === 0) return [];

  const ranked = rankItems(matched, name, targets);

  return dedupe(ranked)
    .filter((item) => !isNonMusicItem(item))
    .slice(0, Math.max(1, limit));
}

function artistPrefixQueries(query) {
  const words = String(query || '').trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [];
  const out = [];
  for (let i = 1; i < Math.min(words.length, 4); i++) {
    out.push(words.slice(0, i).join(' '));
  }
  return out;
}

async function resolveTargetArtists(query, songs, artistCandidates) {
  const targets = new Map();

  const add = (name, browseId, audience = 0) => {
    if (!name || !isArtistPrefixOfQuery(name, query)) return;
    const key = normalizeName(name);
    if (!key) return;
    const existing = targets.get(key);
    if (existing) {
      if (!existing.browseId && browseId) existing.browseId = browseId;
      existing.audience = Math.max(existing.audience || 0, audience || 0);
      return;
    }
    targets.set(key, { name: cleanArtistName(name), browseId: browseId || null, audience });
  };

  for (const a of artistCandidates || []) add(a.name, a.browseId, a.audience);

  for (const song of songs || []) {
    for (const part of splitArtists(song.artist)) add(part, null, 0);
  }

  const names = [...targets.keys()];
  for (const short of names) {
    if (names.some((long) => long !== short && long.startsWith(`${short} `))) {
      targets.delete(short);
    }
  }

  return targets;
}

function targetSupportCount(songs, targets) {
  let count = 0;
  for (const song of songs || []) {
    if (artistMatches(song, targets)) count += 1;
  }
  return count;
}

async function searchMusic(query, options = {}) {
  const limit = Math.max(
    1,
    Math.min(ARTIST_CATALOG_LIMIT, Number(options.limit) || 40)
  );
  const useArtistCatalog = !!options.artistCatalog;
  const includeVersions = !!options.includeVersions;
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) return [];

  const prefixes = artistPrefixQueries(cleanQuery);
  const [songsRes, fullArtistsRes, ...prefixArtists] = await Promise.allSettled([
    searchSongs(cleanQuery, Math.max(limit, 30)),
    searchArtists(cleanQuery),
    ...prefixes.map((p) => searchArtists(p)),
  ]);

  const songs = songsRes.status === 'fulfilled' ? songsRes.value : [];
  if (songs.length === 0 && fullArtistsRes.status === 'failed') {
    throw new Error('YouTube Music недоступен');
  }

  const artistCandidates = [];
  const seenArtists = new Set();
  const pushArtists = (list) => {
    for (const a of list || []) {
      if (!a || !a.browseId || seenArtists.has(a.browseId)) continue;
      seenArtists.add(a.browseId);
      artistCandidates.push(a);
    }
  };
  pushArtists(fullArtistsRes.status === 'fulfilled' ? fullArtistsRes.value : []);
  for (const res of prefixArtists) {
    if (res.status === 'fulfilled') pushArtists(res.value);
  }

  const targets = await resolveTargetArtists(cleanQuery, songs, artistCandidates);

  const support = targetSupportCount(songs, targets);

  const shouldUseArtistCatalog = targets.size > 0 && support >= 1;
  const pureArtistQuery =
    shouldUseArtistCatalog &&
    useArtistCatalog &&
    isPureArtistQuery(cleanQuery, targets);

  let catalog = [];
  if (shouldUseArtistCatalog) {
    const chosen = (artistCandidates || [])
      .filter((a) => a && a.browseId && targets.has(normalizeName(a.name)))
      .sort((a, b) => (b.audience || 0) - (a.audience || 0));

    if (pureArtistQuery) {
      const primary = chosen[0];
      if (primary) {
        try {
          catalog = await artistCatalog(primary.browseId, {
            artistName: primary.name || cleanQuery,
            includeVersions,
            limit: Math.max(limit, ARTIST_CATALOG_LIMIT),
          });
        } catch (e) {
          catalog = [];
        }
      }

      const rest = chosen.slice(primary ? 1 : 0, 3);
      const pages = await Promise.allSettled(
        rest.map((a) => browseArtistSongs(a.browseId))
      );
      for (const res of pages) {
        if (res.status !== 'fulfilled') continue;
        for (const item of res.value) {
          item.artist = item.artist || cleanQuery;
          item.fromCatalog = true;
          if (!includeVersions && isVersionTitle(item.title)) continue;
          catalog.push(item);
        }
      }
    } else {
      const pages = await Promise.allSettled(
        chosen.slice(0, 6).map((a) => browseArtistSongs(a.browseId))
      );
      for (const res of pages) {
        if (res.status !== 'fulfilled') continue;
        for (const item of res.value) {
          item.fromCatalog = true;
          catalog.push(item);
        }
      }
    }
  }

  let merged = dedupe([...songs, ...catalog]);

  if (shouldUseArtistCatalog) {
    const filtered = merged.filter(
      (item) =>
        (useArtistCatalog && item.fromCatalog) ||
        artistMatches(item, targets) ||
        isArtistPrefixOfQuery(item.artist, cleanQuery)
    );
    if (filtered.length > 0) merged = filtered;
  }

  if (!includeVersions) {
    if (pureArtistQuery) {
      merged = merged.filter((item) => !isVersionTitle(item.title));
    } else if (useArtistCatalog) {
      merged = merged.filter(
        (item) => !item.fromCatalog || !isVersionTitle(item.title)
      );
    }
  }

  await enrichItems(merged, 40);

  merged = merged.filter((item) => !isNonMusicItem(item));

  const ranked = pureArtistQuery
    ? rankArtistCatalog(merged)
    : rankItems(merged, cleanQuery, targets);
  const final = dedupe(ranked);

  return final.slice(0, Math.max(limit, 60));
}

async function artistTopTracks(artistName, options = {}) {
  const limit = Math.max(
    1,
    Math.min(ARTIST_CATALOG_LIMIT, Number(options.limit) || ARTIST_CATALOG_LIMIT)
  );
  const includeVersions = !!options.includeVersions;
  const name = String(artistName || '').trim();
  if (!name) return [];

  const artists = await searchArtists(name).catch(() => []);
  const normalizedTarget = normalizeName(name);

  const exact = artists
    .filter((a) => normalizeName(a.name) === normalizedTarget && a.browseId)
    .sort((a, b) => (b.audience || 0) - (a.audience || 0))
    .slice(0, 4);

  const primary = exact[0];
  const [songsRes, catalogRes] = await Promise.allSettled([
    searchSongs(name, Math.max(limit, 30)),
    primary
      ? artistCatalog(primary.browseId, {
          artistName: primary.name || name,
          includeVersions,
          limit,
        })
      : Promise.resolve([]),
  ]);

  const songs = songsRes.status === 'fulfilled' ? songsRes.value : [];
  const catalog = catalogRes.status === 'fulfilled' ? catalogRes.value : [];

  const extras = [];
  for (const artist of exact.slice(primary ? 1 : 0)) {
    try {
      const top = await browseArtistSongs(artist.browseId);
      for (const item of top) {
        item.artist = item.artist || artist.name || name;
        item.fromCatalog = true;
        if (!includeVersions && isVersionTitle(item.title)) continue;
        extras.push(item);
      }
    } catch (e) {
    }
  }

  if (catalog.length === 0) {
    for (const artist of exact) {
      try {
        const top = await browseArtistSongs(artist.browseId);
        for (const item of top) {
          item.artist = item.artist || artist.name || name;
          item.fromCatalog = true;
          if (!includeVersions && isVersionTitle(item.title)) continue;
          extras.push(item);
        }
      } catch (e) {
      }
    }
  }

  const targets = new Set([normalizedTarget]);
  let merged = dedupe([...catalog, ...extras, ...songs]);

  const filtered = merged.filter(
    (item) => item.fromCatalog || artistMatches(item, targets)
  );
  if (filtered.length > 0) merged = filtered;

  await enrichItems(merged, 40);
  merged = merged.filter((item) => !isNonMusicItem(item));
  if (!includeVersions) {
    merged = merged.filter((item) => !isVersionTitle(item.title));
  }

  return dedupe(rankArtistCatalog(merged)).slice(0, limit);
}

function itemToTrack(item) {
  const id = item.videoId;
  const artist =
    mergeFeaturedArtists(item.artist, item.title) ||
    cleanArtistName(item.artist) ||
    'Неизвестный исполнитель';

  return {
    id: `yt_${id}`,
    title: item.title || 'Без названия',
    artist,
    source: 'youtube',
    source_url: `https://www.youtube.com/watch?v=${id}`,
    duration: item.duration || null,
    thumbnail: item.thumbnail || `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    genre: null,
    channel: item.artist ? cleanArtistName(item.artist) : null,
  };
}

module.exports = {
  searchMusic,
  artistTopTracks,
  artistCatalog,
  isVersionTitle,
  isJunkRelease,
  itemToTrack,
  searchSongs,
  searchArtists,
  browseArtistSongs,
  radioTracks,
  songsByArtist,
  getVideoMeta,
  splitArtists,
  mergeFeaturedArtists,
  cleanArtistName,
  normalizeName,
  normalizeTitleForDedupe,
  isNonMusicItem,
  isMusicVideoId,
  officialScore,
  dedupe,
  MIN_TRACK_SECONDS,
  MAX_TRACK_SECONDS,
};
