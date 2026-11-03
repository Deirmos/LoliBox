export function formatDuration(seconds) {
  if (!seconds) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function getSourceLabel(source) {
  if (source === 'soundcloud') return 'SoundCloud';
  return 'YouTube Music';
}

export function truncateText(text, maxLength = 60) {
  const str = String(text || '').trim();
  if (!str) return '';
  if (str.length <= maxLength) return str;

  const cutoff = str.slice(0, maxLength - 1);
  const lastSpace = cutoff.lastIndexOf(' ');
  const head = lastSpace >= maxLength * 0.6 ? cutoff.slice(0, lastSpace) : cutoff;
  return `${head.trimEnd()}…`;
}

export function getSourceColor(source) {
  return source === 'soundcloud' ? '#ff7700' : '#3b82f6';
}

export function volumeToGain(slider) {
  const v = Math.max(0, Math.min(1, Number(slider) || 0));
  return Math.pow(v, 2.2);
}

const VOLUME_KEY = 'lolibox.volume';
export const DEFAULT_VOLUME = 0.35;

function clampVolume(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return DEFAULT_VOLUME;
  return Math.max(0, Math.min(1, v));
}

export function loadVolumeSync() {
  try {
    const raw = window.localStorage.getItem(VOLUME_KEY);
    if (raw == null) return DEFAULT_VOLUME;
    return clampVolume(raw);
  } catch (e) {
    return DEFAULT_VOLUME;
  }
}

export async function loadVolume() {
  const fallback = loadVolumeSync();
  try {
    if (typeof window !== 'undefined' && window.lolibox?.getVolume) {
      const stored = await window.lolibox.getVolume();
      if (stored != null && Number.isFinite(Number(stored))) {
        return clampVolume(stored);
      }
    }
  } catch (e) {
  }
  return fallback;
}

export function saveVolume(value) {
  const v = clampVolume(value);
  try {
    window.localStorage.setItem(VOLUME_KEY, String(v));
  } catch (e) {
  }
  try {
    window.lolibox?.setVolume?.(v);
  } catch (e) {
  }
}
