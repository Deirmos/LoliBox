import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useLibrary, FAVORITES_PLAYLIST_ID } from './LibraryContext';
import { useToast } from './ToastContext';
import { api } from '../services/api';
import { loadVolume, loadVolumeSync, saveVolume, DEFAULT_VOLUME } from '../utils/helpers';

const PlayerContext = createContext(null);

export function PlayerProvider({ children }) {
  const { isFavorite: isFavInLibrary, toggleTrackInPlaylist } = useLibrary();
  const { showToast } = useToast();
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(() => loadVolumeSync());
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [playbackError, setPlaybackError] = useState(null);
  const [isLoadingTrack, setIsLoadingTrack] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [repeatMode, setRepeatMode] = useState('off');
  const [normalizationEnabled, setNormalizationEnabled] = useState(true);
  const volumeLoadedRef = useRef(false);
  const volumeTouchedRef = useRef(false);

  const isFavorite = currentTrack ? isFavInLibrary(currentTrack.id) : false;

  useEffect(() => {
    let cancelled = false;
    loadVolume().then((saved) => {
      if (cancelled) return;
      volumeLoadedRef.current = true;
      const v = Number.isFinite(Number(saved)) ? Number(saved) : DEFAULT_VOLUME;
      setVolume((current) => {
        if (volumeTouchedRef.current) return current;
        return Math.abs(current - v) > 0.001 ? v : current;
      });
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!volumeLoadedRef.current && !volumeTouchedRef.current) return;
    saveVolume(volume);
  }, [volume]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve(api.getSettings?.())
      .then((settings) => {
        if (cancelled || !settings) return;
        setNormalizationEnabled(settings.volume_normalization !== '0');
      })
      .catch(() => {
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setNormalizationEnabledSafe = useCallback((enabled) => {
    const value = !!enabled;
    setNormalizationEnabled(value);
    try {
      api.setSetting?.('volume_normalization', value ? '1' : '0');
    } catch (e) {
    }
  }, []);

  const setVolumeSafe = useCallback((value) => {
    volumeTouchedRef.current = true;
    setVolume(value);
  }, []);

  const seekFnRef = useRef(null);
  const registerSeek = useCallback((fn) => {
    seekFnRef.current = fn;
  }, []);
  const seekTo = useCallback((time) => {
    if (seekFnRef.current) seekFnRef.current(time);
  }, []);

  const replayFnRef = useRef(null);
  const registerReplay = useCallback((fn) => {
    replayFnRef.current = fn;
  }, []);

  const queueRef = useRef([]);
  const currentTrackRef = useRef(null);

  const setQueueSafe = useCallback((q) => {
    queueRef.current = q;
    setQueue(q);
  }, []);

  const playTrack = useCallback((track, list) => {
    if (!track) return;
    const same = (a, b) =>
      a === b ||
      (a.id != null && b.id != null && String(a.id) === String(b.id)) ||
      (a.source_url && b.source_url && a.source_url === b.source_url);

    if (Array.isArray(list) && list.length > 0) {
      const idx = list.findIndex((t) => same(t, track));
      if (idx >= 0) {
        setQueueSafe(list);
        currentTrackRef.current = list[idx];
        setQueueIndex(idx);
      } else {
        setQueueSafe([track]);
        currentTrackRef.current = track;
        setQueueIndex(0);
      }
    } else {
      setQueueSafe([track]);
      currentTrackRef.current = track;
      setQueueIndex(0);
    }
    setPlaybackError(null);
    setCurrentTrack(track);
    setIsPlaying(true);
  }, [setQueueSafe]);

  const toggleFavorite = useCallback(async () => {
    if (!currentTrack || favoriteBusy) return;
    setFavoriteBusy(true);
    try {
      const res = await toggleTrackInPlaylist(currentTrack, FAVORITES_PLAYLIST_ID);
      if (res.removed) {
        showToast({
          title: 'Убрано из избранного',
          message: `«${currentTrack.title}»`,
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
            </svg>
          ),
        });
      } else if (res.added) {
        showToast({
          title: 'Трек добавлен',
          message: `«${currentTrack.title}» → «Избранное»`,
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
            </svg>
          ),
        });
      }
    } catch (e) {
    } finally {
      setFavoriteBusy(false);
    }
  }, [currentTrack, favoriteBusy, toggleTrackInPlaylist, showToast]);

  const resolveIndex = useCallback(() => {
    const q = queueRef.current;
    const cur = currentTrackRef.current;
    if (!cur || q.length === 0) return -1;
    let i = q.indexOf(cur);
    if (i === -1) {
      i = q.findIndex(
        (t) =>
          (t && t.id != null && cur.id != null && String(t.id) === String(cur.id)) ||
          (t && t.source_url && cur.source_url && t.source_url === cur.source_url)
      );
    }
    return i;
  }, []);

  const playNext = useCallback(() => {
    const q = queueRef.current;
    if (q.length === 0) return;
    const i = resolveIndex();
    const next = i + 1;
    if (next < q.length) {
      currentTrackRef.current = q[next];
      setQueueIndex(next);
      setCurrentTrack(q[next]);
      setIsPlaying(true);
      return;
    }
    if (repeatMode === 'all') {
      currentTrackRef.current = q[0];
      setQueueIndex(0);
      setCurrentTrack(q[0]);
      setIsPlaying(true);
      return;
    }
    setIsPlaying(false);
  }, [repeatMode, resolveIndex]);

  const playPrev = useCallback(() => {
    if (currentTime > 3) {
      seekTo(0);
      return;
    }
    const q = queueRef.current;
    if (q.length === 0) return;
    const i = resolveIndex();
    if (i > 0) {
      currentTrackRef.current = q[i - 1];
      setQueueIndex(i - 1);
      setCurrentTrack(q[i - 1]);
      setIsPlaying(true);
      return;
    }
    if (repeatMode === 'all') {
      const last = q.length - 1;
      currentTrackRef.current = q[last];
      setQueueIndex(last);
      setCurrentTrack(q[last]);
      setIsPlaying(true);
      return;
    }
    seekTo(0);
  }, [currentTime, seekTo, repeatMode, resolveIndex]);

  const cycleRepeatMode = useCallback(() => {
    setRepeatMode((m) => (m === 'off' ? 'all' : m === 'all' ? 'one' : 'off'));
  }, []);

  const getNextTrack = useCallback(() => {
    const q = queueRef.current;
    if (q.length === 0) return null;
    const i = resolveIndex();
    if (i < 0) return null;
    if (i + 1 < q.length) return q[i + 1];
    if (repeatMode === 'all' && q.length > 1) return q[0];
    return null;
  }, [resolveIndex, repeatMode]);

  const appendToQueue = useCallback((tracks) => {
    if (!Array.isArray(tracks) || tracks.length === 0) return;
    const q = queueRef.current;
    const existing = new Set(q.map((t) => String(t.id)));
    const fresh = tracks.filter((t) => t && !existing.has(String(t.id)));
    if (fresh.length) setQueueSafe([...q, ...fresh]);
  }, [setQueueSafe]);

  const restartCurrentTrack = useCallback(() => {
    if (replayFnRef.current) {
      replayFnRef.current();
      return;
    }
    seekTo(0);
    setIsPlaying(true);
  }, [seekTo]);

  const togglePlay = useCallback(() => {
    if (!currentTrack) return;
    setIsPlaying((p) => !p);
  }, [currentTrack]);

  const value = {
    currentTrack,
    isPlaying,
    volume,
    normalizationEnabled,
    setNormalizationEnabled: setNormalizationEnabledSafe,
    currentTime,
    duration,
    queue,
    queueIndex,
    playbackError,
    isLoadingTrack,
    playTrack,
    togglePlay,
    playNext,
    playPrev,
    seekTo,
    setVolume: setVolumeSafe,
    setCurrentTrack,
    setIsPlaying,
    setCurrentTime,
    setDuration,
    setPlaybackError,
    setIsLoadingTrack,
    registerSeek,
    registerReplay,
    isFavorite,
    favoriteBusy,
    toggleFavorite,
    repeatMode,
    cycleRepeatMode,
    getNextTrack,
    restartCurrentTrack,
    appendToQueue,
  };
  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
}

export default PlayerContext;
