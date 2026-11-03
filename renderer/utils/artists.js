function fallbackArtistKey(name) {
  return String(name || '')
    .replace(/\s*-\s*topic$/i, '')
    .replace(/\s*vevo$/i, '')
    .replace(/\s*official$/i, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ARTIST_SPLIT_RE = /\s*(?:,|;|\s&\s|\sfeat\.?\s|\sft\.?\s|\sfeaturing\s|\sx\s|×)\s*/i;

function splitArtistNames(value) {
  return String(value || '')
    .split(ARTIST_SPLIT_RE)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function trackArtists(track) {
  if (track && Array.isArray(track.artists) && track.artists.length) {
    return track.artists.filter((entry) => entry && entry.key);
  }
  const names = splitArtistNames(track?.artist);
  if (!names.length) return [];
  return names.map((name, index) => ({
    name,
    key: fallbackArtistKey(name),
    role: index === 0 ? 'primary' : 'featured',
  }));
}

export function trackHasArtist(track, key) {
  if (!key) return false;
  return trackArtists(track).some((entry) => entry.key === key);
}

export function primaryArtistKey(track) {
  if (track?.primary_artist_key) return track.primary_artist_key;
  const entries = trackArtists(track);
  const primary = entries.find((entry) => entry.role === 'primary');
  return primary?.key || entries[0]?.key || '';
}

export function primaryArtistName(track) {
  const entries = trackArtists(track);
  const primary = entries.find((entry) => entry.role === 'primary');
  return primary?.name || entries[0]?.name || 'Неизвестный исполнитель';
}

const FAVORITE_WEIGHT = 1;
const PRIMARY_FACTOR = 1;
const FEATURED_FACTOR = 0.45;
const MIN_ARTIST_SCORE = 0.55;

function bestArtistName(votes) {
  let best = '';
  let bestWeight = -1;
  for (const [name, weight] of votes.entries()) {
    if (weight > bestWeight || (weight === bestWeight && name.length < best.length)) {
      best = name;
      bestWeight = weight;
    }
  }
  return best;
}

export function collectArtistStats({ favorites = [], all = [] } = {}) {
  const stats = new Map();
  const counts = new Map();

  for (const track of all) {
    for (const entry of trackArtists(track)) {
      counts.set(entry.key, (counts.get(entry.key) || 0) + 1);
    }
  }

  const observe = (track, sourceWeight) => {
    for (const entry of trackArtists(track)) {
      if (!entry.key) continue;
      const roleFactor = entry.role === 'primary' ? PRIMARY_FACTOR : FEATURED_FACTOR;

      let record = stats.get(entry.key);
      if (!record) {
        record = {
          key: entry.key,
          score: 0,
          avatar: null,
          avatarAny: null,
          votes: new Map(),
        };
        stats.set(entry.key, record);
      }

      record.score += sourceWeight * roleFactor;

      const name = entry.name || entry.key;
      const nameWeight = entry.role === 'primary' ? 2 : 1;
      record.votes.set(name, (record.votes.get(name) || 0) + nameWeight);

      if (track.thumbnail) {
        if (!record.avatarAny) record.avatarAny = track.thumbnail;
        if (entry.role === 'primary' && !record.avatar) record.avatar = track.thumbnail;
      }
    }
  };

  for (const track of favorites) observe(track, FAVORITE_WEIGHT);

  return [...stats.values()]
    .filter((record) => record.score >= MIN_ARTIST_SCORE)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const countDiff = (counts.get(b.key) || 0) - (counts.get(a.key) || 0);
      if (countDiff !== 0) return countDiff;
      return bestArtistName(a.votes).localeCompare(bestArtistName(b.votes));
    })
    .map((record) => {
      const name = bestArtistName(record.votes) || record.key;
      return {
        key: record.key,
        name,
        avatar: record.avatar || record.avatarAny || null,
        count: counts.get(record.key) || 0,
        score: record.score,
      };
    });
}
