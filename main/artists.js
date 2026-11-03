const ARTIST_SPLIT_RE = /\s*(?:,|;|\s&\s|\sfeat\.?\s|\sft\.?\s|\sfeaturing\s|\sx\s|×)\s*/i;

const TITLE_FEATURE_RE = /\b(?:feat\.?|ft\.?|featuring)\s+([^()[\]{}]+)/gi;

const UNKNOWN_ARTIST_RE =
  /^(?:various artists|unknown|неизвестный исполнитель|неизвестен|va)$/i;

function cleanArtistName(value) {
  return String(value || '')
    .replace(/\s*-\s*topic$/i, '')
    .replace(/\s*vevo$/i, '')
    .replace(/\s*official$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeArtistKey(value) {
  return cleanArtistName(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitArtists(value) {
  return String(value || '')
    .split(ARTIST_SPLIT_RE)
    .map((s) => s.trim())
    .filter((s) => s && !UNKNOWN_ARTIST_RE.test(s));
}

function firstArtist(value) {
  return splitArtists(value)[0] || String(value || '').trim();
}

function featuredNamesFromTitle(title) {
  const text = String(title || '');
  const names = [];

  const push = (value) => {
    for (const part of splitArtists(value)) names.push(part);
  };

  let match;
  TITLE_FEATURE_RE.lastIndex = 0;
  while ((match = TITLE_FEATURE_RE.exec(text)) !== null) {
    push(match[1]);
  }

  const dash = text.indexOf(' - ');
  if (dash > 0) {
    const prefix = text.slice(0, dash);
    if (ARTIST_SPLIT_RE.test(prefix)) push(prefix);
  }

  return names;
}

function parseArtistEntries(artist, title) {
  const result = [];
  const seen = new Map();

  const add = (raw, role) => {
    const name = cleanArtistName(raw);
    if (!name || UNKNOWN_ARTIST_RE.test(name)) return;
    const key = normalizeArtistKey(name);
    if (!key) return;

    const existingIndex = seen.get(key);
    if (existingIndex != null) {
      if (role === 'primary') result[existingIndex].role = 'primary';
      return;
    }

    seen.set(key, result.length);
    result.push({ name, key, role });
  };

  splitArtists(artist).forEach((part, index) => {
    add(part, index === 0 ? 'primary' : 'featured');
  });

  for (const guest of featuredNamesFromTitle(title)) add(guest, 'featured');

  if (result.length && !result.some((entry) => entry.role === 'primary')) {
    result[0].role = 'primary';
  }

  return result;
}

function buildArtistEntries(artist, title) {
  const result = parseArtistEntries(artist, title);
  if (result.length) return result;
  return [
    {
      name: 'Неизвестный исполнитель',
      key: normalizeArtistKey('Неизвестный исполнитель'),
      role: 'primary',
    },
  ];
}

function primaryArtistKey(entriesOrTrack) {
  const entries = Array.isArray(entriesOrTrack)
    ? entriesOrTrack
    : entriesOrTrack?.artists;
  if (Array.isArray(entries) && entries.length) {
    const primary = entries.find((entry) => entry?.role === 'primary');
    if (primary?.key) return primary.key;
    if (entries[0]?.key) return entries[0].key;
  }
  return '';
}

function trackHasArtist(track, key) {
  if (!track || !key) return false;
  const entries = Array.isArray(track.artists) ? track.artists : [];
  return entries.some((entry) => entry?.key === key);
}

module.exports = {
  ARTIST_SPLIT_RE,
  cleanArtistName,
  normalizeArtistKey,
  splitArtists,
  firstArtist,
  featuredNamesFromTitle,
  parseArtistEntries,
  buildArtistEntries,
  primaryArtistKey,
  trackHasArtist,
};
