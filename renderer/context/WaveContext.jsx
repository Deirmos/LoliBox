import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { usePlayer } from './PlayerContext';
import { useBlacklist } from './BlacklistContext';

const WaveContext = createContext(null);

const EXTEND_THRESHOLD = 4;

export function WaveProvider({ children }) {
  const [waveTracks, setWaveTracks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [extending, setExtending] = useState(false);
  const [error, setError] = useState(null);
  const [seed, setSeed] = useState('');

  const {
    playTrack,
    appendToQueue,
    currentTrack,
    queue,
    queueIndex,
  } = usePlayer();
  const { isBlocked } = useBlacklist();

  const extendingRef = useRef(false);
  const loadingRef = useRef(false);
  const waveVersionRef = useRef(0);

  useEffect(() => {
    setWaveTracks((prev) => {
      if (!prev.length) return prev;
      const next = prev.filter((t) => !isBlocked(t));
      return next.length === prev.length ? prev : next;
    });
  }, [isBlocked]);

  useEffect(() => {
    if (waveTracks.length === 0) return;
    if (extendingRef.current) return;
    const isWaveQueue = waveTracks.some((t) => t.id === currentTrack?.id);
    if (!isWaveQueue) return;
    if (queue.length === 0) return;
    const remaining = queue.length - 1 - queueIndex;
    if (remaining > EXTEND_THRESHOLD) return;

    extendingRef.current = true;
    setExtending(true);
    const version = waveVersionRef.current;
    const exclude = waveTracks.map((t) => t.id);
    api
      .buildWave({ exclude, seedTrack: currentTrack || null })
      .then((res) => {
        if (version !== waveVersionRef.current) return;
        const known = new Set(waveTracks.map((w) => w.id));
        const fresh = (res.tracks || []).filter((t) => !known.has(t.id) && !isBlocked(t));
        if (fresh.length) {
          setWaveTracks((w) => [...w, ...fresh.filter((t) => !w.some((x) => x.id === t.id))]);
          appendToQueue(fresh);
        }
      })
      .catch(() => {})
      .finally(() => {
        extendingRef.current = false;
        if (version === waveVersionRef.current) setExtending(false);
      });
  }, [queueIndex, queue.length, waveTracks, currentTrack, appendToQueue, isBlocked]);

  const startWave = useCallback(async (seedQuery) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    waveVersionRef.current += 1;
    extendingRef.current = false;
    setExtending(false);
    setLoading(true);
    setError(null);
    try {
      const res = await api.buildWave(seedQuery);
      const tracks = res.tracks || [];
      if (tracks.length === 0) {
        setError(
          'Недостаточно данных для подбора. Добавьте несколько треков в избранное или плейлист — и волна оживёт.'
        );
        setWaveTracks([]);
        return;
      }
      setWaveTracks(tracks);
      playTrack(tracks[0], tracks);
    } catch (e) {
      setError(e.message || 'Не удалось собрать волну.');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [playTrack]);

  const value = {
    waveTracks,
    loading,
    extending,
    error,
    seed,
    setSeed,
    startWave,
  };

  return <WaveContext.Provider value={value}>{children}</WaveContext.Provider>;
}

export function useWave() {
  const ctx = useContext(WaveContext);
  if (!ctx) throw new Error('useWave must be used within WaveProvider');
  return ctx;
}

export default WaveContext;
