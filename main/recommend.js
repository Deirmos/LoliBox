const db = require('./db');
const { buildArtistEntries } = require('./artists');
const {
  radioTracks,
  songsByArtist,
  searchMusic,
  itemToTrack,
  splitArtists,
  normalizeName,
  normalizeTitleForDedupe,
  isNonMusicItem,
  isMusicVideoId,
  officialScore,
} = require('./ytmusic');

const WAVE_SIZE = 40;
const MIN_SECONDS = 45;
const MAX_SECONDS = 600;
const MAX_SEED_RADIOS = 6;
const MAX_ARTIST_CATALOGS = 6;
const MAX_PER_ARTIST = 2;
const RECENT_COOLDOWN_DAYS = 10;
const HISTORY_LIMIT = 800;
const DAY_MS = 24 * 60 * 60 * 1000;

const WAVE_NON_MUSIC_RE = new RegExp(
  `\\b(?:${[
    'mix',
    'megamix',
    'playlist',
    'compilation',
    'full album',
    'album stream',
    'full soundtrack',
    'complete album',
    'all songs',
    'dj set',
    'live stream',
    'livestream',
    'gameplay',
    'walkthrough',
    'playthrough',
    'no commentary',
    'full game',
    'all cutscenes',
    'cutscene',
    'game movie',
    '10 hours',
    '1 hour',
    'hours of',
    'loop',
    'non-stop',
    'nonstop',
    'sleep music',
  ].join('|')})\\b`,
  'i'
);

const BAD_VERSION_RE = /\b(lyrics?|karaoke|sped up|slowed|nightcore|8d|reverb)\b/i;

const ORIGIN_PRIORITY = {
  seed: 5,
  seedRadio: 4,
  current: 4,
  radio: 3,
  artist: 2,
  explore: 1,
};

function primaryArtistKey(value) {
  if (value && typeof value === 'object' && value.primary_artist_key) {
    return value.primary_artist_key;
  }
  const artist = typeof value === 'string' ? value : value?.artist;
  const parts = splitArtists(artist).map((part) => normalizeName(part)).filter(Boolean);
  return parts[0] || normalizeName(artist);
}

function artistKeys(item) {
  if (Array.isArray(item?.artists) && item.artists.length) {
    return item.artists.map((entry) => entry?.key).filter(Boolean);
  }
  return splitArtists(item?.artist).map((part) => normalizeName(part)).filter(Boolean);
}

function artistEntries(item) {
  if (Array.isArray(item?.artists) && item.artists.length) return item.artists;
  return buildArtistEntries(item?.artist, item?.title);
}

function pickSeedFocus(items) {
  const counts = new Map();
  for (const item of items) {
    if (!isWaveItem(item)) continue;
    for (const key of artistKeys(item)) {
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }

  let focus = null;
  let maxCount = 1;
  for (const [key, count] of counts.entries()) {
    if (count > maxCount) {
      maxCount = count;
      focus = key;
    }
  }
  if (!focus) return null;

  let name = null;
  for (const item of items) {
    const parts = splitArtists(item.artist);
    const match = parts.find((part) => normalizeName(part) === focus);
    if (match) {
      name = match.trim();
      break;
    }
  }

  return { key: focus, name: name || focus };
}

function normalizeForMatch(value) {
  return normalizeName(value);
}

function queryMentionsArtist(query, artistName) {
  const q = normalizeForMatch(query);
  const a = normalizeForMatch(artistName);
  if (!q || !a) return false;
  if (` ${q} `.includes(` ${a} `)) return true;

  const queryTokens = q.split(' ').filter(Boolean);
  const artistTokens = a.split(' ').filter(Boolean);
  return artistTokens.length > 0 && artistTokens.every((token) => queryTokens.includes(token));
}

function trackKey(track) {
  if (!track) return '';
  if (track.id != null) return String(track.id);
  if (track.source_url) return `url:${track.source_url}`;
  return `meta:${normalizeName(track.title)}|${normalizeName(track.artist)}`;
}

function videoIdFromTrack(track) {
  if (!track) return null;
  const idMatch = String(track.id || '').match(/^yt_([\w-]{11})$/);
  if (idMatch) return idMatch[1];
  const url = String(track.source_url || '');
  const urlMatch = url.match(
    /(?:[?&]v=|youtu\.be\/|\/vi\/|\/embed\/)([\w-]{11})/
  );
  return urlMatch ? urlMatch[1] : null;
}

function eventToTrack(event) {
  if (!event) return null;
  if (event.track_id == null && !event.title) return null;
  return {
    id: event.track_id != null ? event.track_id : null,
    title: event.title || 'Без названия',
    artist: event.artist || 'Неизвестный исполнитель',
    source: event.source || 'youtube',
    source_url: event.source_url || null,
    duration: Number(event.duration) || null,
    thumbnail: event.thumbnail || null,
    artists: Array.isArray(event.artists) ? event.artists : undefined,
    primary_artist_key: event.primary_artist_key || undefined,
  };
}

function isWaveItem(item) {
  if (!item || !item.title || !isMusicVideoId(item.videoId)) return false;

  const duration = Number(item.duration);
  if (!Number.isFinite(duration) || duration < MIN_SECONDS || duration >= MAX_SECONDS) {
    return false;
  }
  if (isNonMusicItem({ title: item.title, duration, type: 'song' })) return false;
  if (WAVE_NON_MUSIC_RE.test(item.title)) return false;
  if (BAD_VERSION_RE.test(item.title)) return false;
  if (/MUSIC_VIDEO_TYPE_UGC/i.test(String(item.musicVideoType || ''))) return false;

  return true;
}

function weightedShuffle(items, weightFn) {
  const pool = items.slice();
  const out = [];
  while (pool.length > 0) {
    let total = 0;
    for (const item of pool) total += Math.max(0.01, weightFn(item));
    let r = Math.random() * total;
    let index = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      r -= Math.max(0.01, weightFn(pool[i]));
      if (r <= 0) {
        index = i;
        break;
      }
    }
    out.push(pool.splice(index, 1)[0]);
  }
  return out;
}

function addOrMergeTrackInfo(map, key, track) {
  const existing = map.get(key);
  if (!existing) {
    map.set(key, { ...track });
    return;
  }
  for (const field of [
    'title',
    'artist',
    'source',
    'source_url',
    'duration',
    'thumbnail',
    'artists',
    'primary_artist_key',
  ]) {
    if (!existing[field] && track[field]) existing[field] = track[field];
  }
}

function buildProfile() {
  const now = Date.now();
  const playlists = db.getPlaylists();
  const favoriteIds = new Set(playlists.filter((p) => p.is_default).map((p) => p.id));

  const library = new Map();
  const addLibrary = (track, weight) => {
    if (!track || track.id == null) return;
    const key = String(track.id);
    const previous = library.get(key);
    if (!previous || weight > previous.weight) {
      library.set(key, { track, weight });
    }
  };

  for (const playlistId of favoriteIds) {
    for (const track of db.getPlaylistTracks(playlistId)) addLibrary(track, 3.0);
  }
  for (const playlist of playlists) {
    if (playlist.is_default) continue;
    for (const track of db.getPlaylistTracks(playlist.id)) addLibrary(track, 1.8);
  }
  for (const track of db.getAllTracks()) addLibrary(track, 0.5);

  const trackScores = new Map();
  const trackInfo = new Map();
  const artistScores = new Map();
  const artistNames = new Map();
  const knownArtists = new Set();
  const libraryTrackKeys = new Set();
  const libraryUrls = new Set();
  const recentTrackKeys = new Set();
  const recentUrls = new Set();
  const recentArtists = new Set();

  const observe = (track, weight) => {
    if (!track) return;
    const key = trackKey(track);
    if (!key) return;

    trackScores.set(key, (trackScores.get(key) || 0) + weight);
    addOrMergeTrackInfo(trackInfo, key, track);

    for (const entry of artistEntries(track)) {
      const artistKey = entry?.key;
      if (!artistKey) continue;
      const artistWeight = weight * (entry.role === 'primary' ? 1 : 0.55);
      artistScores.set(artistKey, (artistScores.get(artistKey) || 0) + artistWeight);
      if (!artistNames.has(artistKey)) artistNames.set(artistKey, entry.name || artistKey);
      knownArtists.add(artistKey);
    }
  };

  for (const { track, weight } of library.values()) {
    observe(track, weight);
    libraryTrackKeys.add(String(track.id));
    if (track.source_url) libraryUrls.add(track.source_url);
  }

  for (const event of db.getHistory(HISTORY_LIMIT)) {
    const track = eventToTrack(event);
    if (!track) continue;

    const playedAt = Date.parse(event.played_at || '');
    const ageDays = Number.isFinite(playedAt) ? Math.max(0, (now - playedAt) / DAY_MS) : 999;
    const recency = Math.exp(-ageDays / 30);
    const weight = (event.completed ? 3.0 : 1.1) * recency + 0.15;
    observe(track, weight);

    if (event.track_id != null) {
      const key = String(event.track_id);
      if (ageDays <= RECENT_COOLDOWN_DAYS) recentTrackKeys.add(key);
    }
    if (event.source_url && ageDays <= RECENT_COOLDOWN_DAYS) {
      recentUrls.add(event.source_url);
    }
    if (ageDays <= 1.5) {
      const key = primaryArtistKey(track);
      if (key) recentArtists.add(key);
    }
  }

  return {
    trackScores,
    trackInfo,
    artistScores,
    artistNames,
    knownArtists,
    libraryTrackKeys,
    libraryUrls,
    recentTrackKeys,
    recentUrls,
    recentArtists,
  };
}

function topArtistNames(profile, count) {
  return [...profile.artistScores.entries()]
    .filter(([key, score]) => key && score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([key, score]) => ({
      key,
      score,
      name: profile.artistNames.get(key) || key,
    }));
}

function pickSeeds(profile, count) {
  const all = [];
  for (const [key, score] of profile.trackScores.entries()) {
    const track = profile.trackInfo.get(key);
    if (!track || !videoIdFromTrack(track)) continue;
    all.push({ key, score, track });
  }
  if (all.length === 0) return [];

  all.sort((a, b) => b.score - a.score);
  const pool = all.slice(0, Math.max(40, count * 8));
  const shuffled = weightedShuffle(pool, (item) => Math.max(0.15, item.score));

  const chosen = [];
  const usedArtists = new Set();
  for (const candidate of shuffled) {
    if (chosen.length >= count) break;
    const artist = primaryArtistKey(candidate.track);
    if (artist && usedArtists.has(artist)) continue;
    chosen.push(candidate);
    if (artist) usedArtists.add(artist);
  }

  if (chosen.length < count) {
    for (const candidate of shuffled) {
      if (chosen.length >= count) break;
      if (!chosen.includes(candidate)) chosen.push(candidate);
    }
  }

  return chosen;
}

function pickLongTailSeed(profile, seeds) {
  const chosenKeys = new Set(seeds.map((seed) => seed.key));
  const seedArtists = new Set(seeds.map((seed) => primaryArtistKey(seed.track)));
  const all = [];

  for (const [key, score] of profile.trackScores.entries()) {
    if (chosenKeys.has(key)) continue;
    const track = profile.trackInfo.get(key);
    if (!track || !videoIdFromTrack(track)) continue;
    if (seedArtists.has(primaryArtistKey(track))) continue;
    all.push({ key, score, track });
  }

  if (all.length === 0) return null;
  all.sort((a, b) => b.score - a.score);

  const start = Math.min(5, Math.max(0, all.length - 1));
  const tail = all.slice(start, Math.min(all.length, 40));
  if (tail.length === 0) return all[all.length - 1];
  return tail[Math.floor(Math.random() * tail.length)];
}

function isRecentItem(item, profile) {
  const id = `yt_${item.videoId}`;
  if (profile.recentTrackKeys.has(id) || profile.recentTrackKeys.has(item.videoId)) {
    return true;
  }
  return profile.recentUrls.has(`https://www.youtube.com/watch?v=${item.videoId}`);
}

function isLibraryItem(item, profile) {
  const id = `yt_${item.videoId}`;
  if (profile.libraryTrackKeys.has(id) || profile.libraryTrackKeys.has(item.videoId)) {
    return true;
  }
  return profile.libraryUrls.has(`https://www.youtube.com/watch?v=${item.videoId}`);
}


function getBlockedSets() {
  const blacklist = db.getBlacklist ? db.getBlacklist() : { artists: [], tracks: [] };
  const artists = new Set(
    (blacklist.artists || [])
      .map((a) => (a && a.key ? String(a.key) : ''))
      .filter(Boolean)
  );
  const tracks = new Set(
    (blacklist.tracks || [])
      .map((t) => (t && t.id != null ? String(t.id) : ''))
      .filter(Boolean)
  );
  return { artists, tracks };
}

function isBlockedItem(item, blocked) {
  if (!item || !blocked) return false;
  const videoId = item.videoId || videoIdFromTrack(item);
  if (videoId && (blocked.tracks.has(videoId) || blocked.tracks.has(`yt_${videoId}`))) {
    return true;
  }
  if (item.id != null && blocked.tracks.has(String(item.id))) return true;
  for (const key of artistKeys(item)) {
    if (blocked.artists.has(key)) return true;
  }
  return false;
}

function prepareCandidates(rawCandidates, profile, options) {
  const blocked = getBlockedSets();
  const hardExcluded = new Set(
    (Array.isArray(options.exclude) ? options.exclude : []).map((id) => String(id))
  );

  const byVideo = new Map();
  for (const candidate of rawCandidates) {
    if (!candidate || !isWaveItem(candidate.item)) continue;
    const { videoId } = candidate.item;
    if (hardExcluded.has(videoId) || hardExcluded.has(`yt_${videoId}`)) continue;

    const previous = byVideo.get(videoId);
    if (
      !previous ||
      (ORIGIN_PRIORITY[candidate.origin] || 0) > (ORIGIN_PRIORITY[previous.origin] || 0)
    ) {
      byVideo.set(videoId, candidate);
    }
  }

  const bySong = new Map();
  for (const candidate of byVideo.values()) {
    const item = candidate.item;
    const key = `${normalizeTitleForDedupe(item.title)}|${normalizeName(
      splitArtists(item.artist)[0] || item.artist
    )}`;
    const previous = bySong.get(key);
    if (!previous) {
      bySong.set(key, candidate);
      continue;
    }
    const betterOrigin =
      (ORIGIN_PRIORITY[candidate.origin] || 0) > (ORIGIN_PRIORITY[previous.origin] || 0);
    const betterOfficial =
      officialScore(candidate.item) > officialScore(previous.item) + 5;
    if (betterOrigin || betterOfficial) bySong.set(key, candidate);
  }

  return [...bySong.values()]
    .filter((candidate) => !isBlockedItem(candidate.item, blocked))
    .map((candidate) => {
    const parts = artistKeys(candidate.item);
    const primaryArtist = parts[0] || normalizeName(candidate.item.artist);
    return {
      ...candidate,
      artistKeys: parts,
      primaryArtist,
      familiar: parts.some((key) => profile.knownArtists.has(key)),
      recent: isRecentItem(candidate.item, profile),
      inLibrary: isLibraryItem(candidate.item, profile),
    };
  });
}

function scoreCandidate(candidate, profile, artistCounts) {
  const item = candidate.item;
  const base = {
    seed: 70,
    seedRadio: 52,
    current: 45,
    radio: 30,
    artist: 22,
    explore: 14,
  }[candidate.origin] || 20;

  let score = base;
  score += Math.max(0, 14 - (Number(candidate.order) || 0) * 0.45);

  let affinity = 0;
  for (const key of candidate.artistKeys) {
    affinity += profile.artistScores.get(key) || 0;
  }
  score += Math.min(36, Math.log1p(affinity) * 8);

  score += candidate.familiar ? 14 : 10;
  score += officialScore(item) * 0.5;

  const count = artistCounts.get(candidate.primaryArtist) || 0;
  score -= count * 22;
  if (count >= MAX_PER_ARTIST) score -= 600;

  if (candidate.recent) score -= 170;
  if (candidate.inLibrary) score -= 200;
  if (profile.recentArtists.has(candidate.primaryArtist)) score -= 35;

  if (item.plays > 0) score += Math.min(8, Math.log10(item.plays + 1) * 1.5);
  score += (Math.random() - 0.5) * 12;

  return score;
}

function selectCandidates(candidates, profile, size) {
  const selected = [];
  const chosenVideos = new Set();
  const artistCounts = new Map();
  const newTarget = Math.max(8, Math.round(size * 0.3));
  let newCount = 0;

  const take = (onlyNew, cap) => {
    let best = null;
    let bestScore = -Infinity;

    for (const candidate of candidates) {
      if (chosenVideos.has(candidate.item.videoId)) continue;
      if (onlyNew && candidate.familiar) continue;
      if ((artistCounts.get(candidate.primaryArtist) || 0) >= cap) continue;

      const score = scoreCandidate(candidate, profile, artistCounts);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    if (!best) return false;
    chosenVideos.add(best.item.videoId);
    artistCounts.set(best.primaryArtist, (artistCounts.get(best.primaryArtist) || 0) + 1);
    if (!best.familiar) newCount += 1;
    selected.push({ ...best, score: bestScore });
    return true;
  };

  while (selected.length < size && newCount < newTarget) {
    if (!take(true, MAX_PER_ARTIST)) break;
  }
  while (selected.length < size) {
    if (!take(false, MAX_PER_ARTIST)) break;
  }

  for (const cap of [3, 4]) {
    while (selected.length < size) {
      if (!take(false, cap)) break;
    }
  }

  return selected;
}

function interleave(selected, profile, { familiarFirst = true } = {}) {
  if (selected.length === 0) return [];

  const groups = new Map();
  for (const candidate of selected) {
    const key = candidate.primaryArtist || candidate.item.videoId;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(candidate);
  }

  const orderedGroups = [...groups.values()].sort((a, b) => {
    const scoreA = Math.max(...a.map((item) => item.score || 0));
    const scoreB = Math.max(...b.map((item) => item.score || 0));
    return scoreB - scoreA;
  });

  const ordered = [];
  let added = true;
  while (added) {
    added = false;
    for (const group of orderedGroups) {
      if (group.length > 0) {
        ordered.push(group.shift());
        added = true;
      }
    }
  }

  if (familiarFirst && ordered.length > 1 && !ordered[0].familiar) {
    const familiarIndex = ordered.findIndex((candidate) => candidate.familiar);
    if (familiarIndex > 0) {
      const [familiar] = ordered.splice(familiarIndex, 1);
      ordered.unshift(familiar);
    }
  }

  const base = [];
  const extras = [];
  const seenArtists = new Set();
  for (const candidate of ordered) {
    const key = candidate.primaryArtist || candidate.item.videoId;
    if (seenArtists.has(key)) {
      extras.push(candidate);
    } else {
      seenArtists.add(key);
      base.push(candidate);
    }
  }

  const canInsertAt = (list, index, candidate) => {
    const before = list[index - 1];
    const after = list[index];
    const key = candidate.primaryArtist;
    return (
      (!before || before.primaryArtist !== key) &&
      (!after || after.primaryArtist !== key)
    );
  };

  for (const extra of extras) {
    let inserted = false;
    const minPos = Math.min(3, base.length);
    for (let attempt = 0; attempt < 24 && !inserted; attempt++) {
      const position =
        minPos + Math.floor(Math.random() * (base.length - minPos + 1));
      if (canInsertAt(base, position, extra)) {
        base.splice(position, 0, extra);
        inserted = true;
      }
    }
    if (!inserted) {
      for (let position = minPos; position <= base.length; position++) {
        if (canInsertAt(base, position, extra)) {
          base.splice(position, 0, extra);
          inserted = true;
          break;
        }
      }
    }
    if (!inserted) base.push(extra);
  }

  return base;
}

async function buildRecommendations(input = {}) {
  const options = typeof input === 'string' ? { seed: input } : { ...(input || {}) };
  const seedQuery = typeof options.seed === 'string' ? options.seed.trim() : '';
  const profile = buildProfile();
  const blocked = getBlockedSets();

  const hasProfile = profile.trackScores.size > 0 || profile.artistScores.size > 0;
  if (!seedQuery && !options.seedTrack && !hasProfile) {
    return { tracks: [], reason: 'empty-library' };
  }

  const tasks = [];
  const rawCandidates = [];
  const addRadioTask = (videoId, origin) => {
    if (!isMusicVideoId(videoId)) return;
    tasks.push(
      radioTracks(videoId, 45)
        .then((items) =>
          items.map((item, order) => ({ item, origin, order }))
        )
        .catch(() => [])
    );
  };

  let seedItems = [];
  if (seedQuery) {
    try {
      seedItems = await searchMusic(seedQuery, { limit: 30 });
    } catch (e) {
      seedItems = [];
    }

    const focus = pickSeedFocus(seedItems);
    const focused = focus
      ? seedItems.filter((item) => artistKeys(item).includes(focus.key))
      : seedItems;
    const hasFocus = !!(
      focus &&
      focused.length > 0 &&
      queryMentionsArtist(seedQuery, focus.name)
    );
    const seedCandidates = (hasFocus ? focused : seedItems.slice(0, 8))
      .filter(isWaveItem)
      .filter((item) => !isBlockedItem(item, blocked));

    for (const item of seedCandidates) {
      rawCandidates.push({ item, origin: 'seed', order: item.index || 0 });
    }
    for (const item of seedCandidates.slice(0, 3)) {
      addRadioTask(item.videoId, 'seedRadio');
    }
  }

  const seeds = pickSeeds(profile, seedQuery ? 1 : MAX_SEED_RADIOS).filter(
    (seed) => !isBlockedItem(seed.track, blocked)
  );
  const seedVideos = new Set();
  for (const seed of seeds) {
    const videoId = videoIdFromTrack(seed.track);
    if (!videoId || seedVideos.has(videoId)) continue;
    seedVideos.add(videoId);
    addRadioTask(videoId, 'radio');
  }

  if (options.seedTrack) {
    const videoId = videoIdFromTrack(options.seedTrack);
    if (videoId && !seedVideos.has(videoId)) {
      seedVideos.add(videoId);
      addRadioTask(videoId, 'current');
    }
  }

  for (const artist of topArtistNames(profile, seedQuery ? 1 : MAX_ARTIST_CATALOGS).filter(
    (artist) => !blocked.artists.has(artist.key)
  )) {
    tasks.push(
      songsByArtist(artist.name, 24)
        .then((items) =>
          items.map((item, order) => ({ item, origin: 'artist', order }))
        )
        .catch(() => [])
    );
  }

  const longTailRaw = seedQuery ? null : pickLongTailSeed(profile, seeds);
  const longTail = longTailRaw && !isBlockedItem(longTailRaw.track, blocked) ? longTailRaw : null;
  if (longTail) {
    const videoId = videoIdFromTrack(longTail.track);
    if (videoId && !seedVideos.has(videoId)) {
      seedVideos.add(videoId);
      addRadioTask(videoId, 'explore');
    }
  }

  const settled = await Promise.allSettled(tasks);
  for (const result of settled) {
    if (result.status === 'fulfilled') rawCandidates.push(...result.value);
  }

  const candidates = prepareCandidates(rawCandidates, profile, options);
  if (candidates.length === 0) {
    return { tracks: [], reason: 'no-candidates' };
  }

  const famStats = candidates.reduce(
    (acc, c) => {
      if (c.familiar) {
        acc.familiar += 1;
        if (c.inLibrary) acc.familiarInLibrary += 1;
        if (c.recent) acc.familiarRecent += 1;
      }
      return acc;
    },
    { familiar: 0, familiarInLibrary: 0, familiarRecent: 0 }
  );

  const selected = selectCandidates(candidates, profile, WAVE_SIZE);
  const ordered = interleave(selected, profile, { familiarFirst: !seedQuery });
  const tracks = ordered
    .map((candidate) => itemToTrack(candidate.item))
    .filter((track) => track && track.id);

  console.log(
    `[Wave] seeds=${seeds.length}, candidates=${candidates.length} ` +
      `(familiar=${famStats.familiar}, inLib=${famStats.familiarInLibrary}), ` +
      `selected=${tracks.length}, newArtists=${ordered.filter((c) => !c.familiar).length}`
  );
  if (process.env.LOLIBOX_DEBUG_WAVE) {
    console.log(
      '[Wave] selection: ' +
        ordered
          .map(
            (c) =>
              `${c.familiar ? 'F' : 'N'}:${c.primaryArtist}:${c.origin}:${Math.round(c.score)}`
          )
          .join(' | ')
    );
  }

  return {
    tracks,
    reason: tracks.length > 0 ? null : 'no-candidates',
  };
}

module.exports = {
  buildRecommendations,
  buildProfile,
  isWaveItem,
};
