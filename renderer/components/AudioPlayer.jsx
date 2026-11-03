import React, { useEffect, useRef, useState, useCallback } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { api } from '../services/api';
import { volumeToGain } from '../utils/helpers';

export default function AudioPlayer() {
  const {
    currentTrack,
    isPlaying,
    setIsPlaying,
    volume,
    normalizationEnabled,
    currentTime,
    duration,
    setCurrentTime,
    setDuration,
    setPlaybackError,
    setIsLoadingTrack,
    registerSeek,
    registerReplay,
    playNext,
    repeatMode,
    getNextTrack,
  } = usePlayer();

  const audioRef = useRef(null);

  const preloaderRef = useRef(null);
  const preloadedRef = useRef({ id: null });
  const preloadReqRef = useRef({ id: null, promise: null });
  const PRELOAD_LEAD_SECONDS = 20;

  const streamUrlRef = useRef({ id: null, url: null });
  const streamRetryRef = useRef({ id: null, done: true });
  const [trackGain, setTrackGain] = useState(1);
  const volumeRampRef = useRef(null);

  const currentTrackRef = useRef(currentTrack);
  const listenRef = useRef({ id: null, recorded: false });

  useEffect(() => {
    currentTrackRef.current = currentTrack;
    listenRef.current = {
      id: currentTrack ? String(currentTrack.id) : null,
      recorded: false,
    };
  }, [currentTrack]);

  const requestNormalization = useCallback(
    (url, trackId) => {
      if (!normalizationEnabled || !url || trackId == null) return;
      const id = String(trackId);
      Promise.resolve(api.analyzeLoudness?.(url, trackId))
        .then((res) => {
          if (!res || !res.success || !Number.isFinite(Number(res.gainDb))) return;
          const current = currentTrackRef.current;
          if (!current || String(current.id) !== id) return;
          const factor = Math.max(0.2, Math.min(4, Math.pow(10, Number(res.gainDb) / 20)));
          setTrackGain(factor);
        })
        .catch(() => {
        });
    },
    [normalizationEnabled]
  );

  useEffect(() => {
    const id = currentTrack ? String(currentTrack.id) : null;
    setTrackGain(1);
    if (!currentTrack || !normalizationEnabled) return;
    const cached = streamUrlRef.current;
    if (cached.id === id && cached.url) requestNormalization(cached.url, currentTrack.id);
  }, [currentTrack, normalizationEnabled, requestNormalization]);

  function sendHistory(send) {
    try {
      const promise = typeof send === 'function' ? send() : send;
      if (promise && typeof promise.catch === 'function') promise.catch(() => {});
    } catch (e) {
    }
  }

  const restartCurrentTrackRef = useRef(null);

  const streamReqRef = useRef({ id: null, promise: null });

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'none';
    audio.volume = 0;
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const pre = new Audio();
    pre.preload = 'auto';
    pre.muted = true;
    preloaderRef.current = pre;
    return () => {
      pre.pause();
      pre.removeAttribute('src');
      try { pre.load(); } catch (e) {}
      preloaderRef.current = null;
      preloadedRef.current = { id: null };
    };
  }, []);

  useEffect(() => {
    const pre = preloaderRef.current;
    if (!pre || !currentTrack) return undefined;

    const clearPreload = () => {
      if (!preloadedRef.current.id) return;
      pre.removeAttribute('src');
      try { pre.load(); } catch (e) {}
      preloadedRef.current = { id: null };
      preloadReqRef.current = { id: null, promise: null };
    };

    if (repeatMode === 'one') return undefined;

    const next = getNextTrack ? getNextTrack() : null;
    const nextId = next && next.id != null ? String(next.id) : null;

    if (!nextId || !next.source_url) {
      if (preloadedRef.current.id && preloadedRef.current.id !== nextId) clearPreload();
      return undefined;
    }

    if (preloadedRef.current.id === nextId && pre.src) return undefined;

    const total = duration > 0 ? duration : Number(currentTrack.duration) || 0;
    if (total <= 0) return undefined;
    if (total - currentTime > PRELOAD_LEAD_SECONDS) return undefined;

    let req = preloadReqRef.current;
    if (req.id !== nextId || !req.promise) {
      req = { id: nextId, promise: api.getStreamUrl(next.source_url, next.id) };
      preloadReqRef.current = req;
      req.promise.catch(() => {
        if (preloadReqRef.current === req) {
          preloadReqRef.current = { id: null, promise: null };
        }
      });
    }

    req.promise
      .then((url) => {
        if (!url) return;
        if (preloadReqRef.current !== req) return;
        if (preloadedRef.current.id === nextId && pre.src) return;
        pre.src = url;
        pre.preload = 'auto';
        try { pre.load(); } catch (e) {}
        preloadedRef.current = { id: nextId };
        requestNormalization(url, next.id);
      })
      .catch(() => {
      });

    return undefined;
  }, [currentTime, duration, currentTrack, repeatMode, getNextTrack, requestNormalization]); // eslint-disable-line react-hooks/exhaustive-deps

  const repeatModeRef = useRef(repeatMode);
  const playNextRef = useRef(playNext);
  const isPlayingRef = useRef(isPlaying);
  useEffect(() => {
    repeatModeRef.current = repeatMode;
    playNextRef.current = playNext;
    isPlayingRef.current = isPlaying;
  }, [repeatMode, playNext, isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    let cancelled = false;

    async function sync() {
      if (!currentTrack) {
        audio.pause();
        audio.removeAttribute('src');
        delete audio.dataset.trackId;
        audio.load();
        setIsLoadingTrack(false);
        return;
      }

      if (audio.dataset.trackId !== String(currentTrack.id)) {
        setPlaybackError(null);
        setCurrentTime(0);
        setDuration(0);

        if (!currentTrack.source_url) {
          setPlaybackError('У трека нет источника для воспроизведения.');
          setIsPlaying(false);
          setIsLoadingTrack(false);
          return;
        }

        const key = String(currentTrack.id);
        let req = streamReqRef.current;
        if (req.id !== key || !req.promise) {
          req = { id: key, promise: api.getStreamUrl(currentTrack.source_url, currentTrack.id) };
          streamReqRef.current = req;
          req.promise.catch(() => {
            if (streamReqRef.current === req) streamReqRef.current = { id: null, promise: null };
          });
        }

        setIsLoadingTrack(true);
        let url = null;
        try {
          url = await req.promise;
        } catch (err) {
          if (!cancelled) {
            setPlaybackError(err.message || 'Не удалось загрузить трек.');
            setIsPlaying(false);
            setIsLoadingTrack(false);
          }
          return;
        }
        if (cancelled) return;
        setIsLoadingTrack(false);
        if (!url) {
          setPlaybackError('Не удалось получить ссылку на аудиопоток.');
          setIsPlaying(false);
          return;
        }

        streamUrlRef.current = { id: key, url };
        streamRetryRef.current = { id: key, done: false };
        audio.dataset.trackId = String(currentTrack.id);
        audio.src = url;
        requestNormalization(url, currentTrack.id);
      }

      if (!audio.src) return;

      if (isPlaying) {
        try {
          await audio.play();
        } catch (err) {
          if (!cancelled && err.name !== 'AbortError') {
            setPlaybackError('Не удалось воспроизвести трек. Проверьте источник.');
            setIsPlaying(false);
          }
        }
      } else {
        audio.pause();
      }
    }

    sync();

    return () => {
      cancelled = true;
    };
  }, [currentTrack, isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;

    const onTime = () => {
      setCurrentTime(audio.currentTime);

      const track = currentTrackRef.current;
      const listen = listenRef.current;
      if (!track || !listen || listen.recorded) return;
      if (audio.paused || audio.dataset.trackId !== String(track.id)) return;

      const duration = Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : Number(track.duration) || 0;
      const threshold = duration > 0 ? Math.min(20, Math.max(8, duration * 0.35)) : 20;
      if (audio.currentTime < threshold) return;

      listen.recorded = true;
      sendHistory(() => api.recordPlay?.(track, { completed: false, progress: audio.currentTime }));
    };
    const onMeta = () => {
      if (Number.isFinite(audio.duration)) setDuration(audio.duration);
    };
    const onEnded = () => {
      const track = currentTrackRef.current;
      if (track) {
        const progress = Number.isFinite(audio.duration) ? audio.duration : (track.duration || 0);
        if (listenRef.current.recorded) {
          sendHistory(() => api.completePlay?.(track.id));
        } else {
          sendHistory(() => api.recordPlay?.(track, { completed: true, progress }));
        }
      }
      listenRef.current.recorded = false;

      if (repeatModeRef.current === 'one') {
        restartCurrentTrackRef.current();
        return;
      }
      setIsPlaying(false);
      playNextRef.current();
    };
    const onErr = () => {
      if (!audio.getAttribute('src')) return;

      const track = currentTrackRef.current;
      const retry = streamRetryRef.current;
      const trackId = track && track.id != null ? String(track.id) : null;
      const canRetry =
        track &&
        trackId &&
        track.source_url &&
        retry.id === trackId &&
        !retry.done;

      if (!canRetry) {
        setPlaybackError('Ошибка воспроизведения аудио');
        setIsPlaying(false);
        return;
      }

      streamRetryRef.current = { id: trackId, done: true };
      const shouldPlay = isPlayingRef.current || !audio.paused;
      setPlaybackError(null);
      setIsLoadingTrack(true);

      api
        .refreshStreamUrl(track.source_url, track.id)
        .then((fresh) => {
          const current = currentTrackRef.current;
          if (!fresh || !current || String(current.id) !== trackId) return;
          streamUrlRef.current = { id: trackId, url: fresh };
          audio.dataset.trackId = trackId;
          audio.src = fresh;
          try { audio.load(); } catch (e) {}
          if (shouldPlay) {
            const p = audio.play();
            if (p && typeof p.catch === 'function') p.catch(() => {});
          }
        })
        .catch((err) => {
          const current = currentTrackRef.current;
          if (!current || String(current.id) !== trackId) return;
          setPlaybackError(err.message || 'Ошибка воспроизведения аудио');
          setIsPlaying(false);
        })
        .finally(() => {
          const current = currentTrackRef.current;
          if (current && String(current.id) === trackId) setIsLoadingTrack(false);
        });
    };

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('durationchange', onMeta);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onErr);

    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('durationchange', onMeta);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onErr);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;

    const base = volumeToGain(volume);
    const target = Math.max(
      0,
      Math.min(1, base * (normalizationEnabled ? trackGain : 1))
    );

    if (volumeRampRef.current) {
      clearInterval(volumeRampRef.current);
      volumeRampRef.current = null;
    }

    const from = audio.volume;
    if (Math.abs(from - target) < 0.004) {
      audio.volume = target;
      return undefined;
    }

    const steps = 8;
    const delta = (target - from) / steps;
    let step = 0;
    volumeRampRef.current = setInterval(() => {
      step += 1;
      const next = step >= steps ? target : from + delta * step;
      try {
        audio.volume = Math.max(0, Math.min(1, next));
      } catch (e) {
      }
      if (step >= steps) {
        clearInterval(volumeRampRef.current);
        volumeRampRef.current = null;
      }
    }, 20);

    return () => {
      if (volumeRampRef.current) {
        clearInterval(volumeRampRef.current);
        volumeRampRef.current = null;
      }
    };
  }, [volume, trackGain, normalizationEnabled]);

  useEffect(() => {
    registerSeek((time) => {
      const audio = audioRef.current;
      if (Number.isFinite(time) && audio && audio.src) {
        audio.currentTime = Math.max(0, time);
        setCurrentTime(audio.currentTime);
      }
    });
  }, [registerSeek, setCurrentTime]);

  useEffect(() => {
    restartCurrentTrackRef.current = () => {
      const audio = audioRef.current;
      if (!audio || !audio.src) return;
      try {
        audio.currentTime = 0;
        setCurrentTime(0);
        listenRef.current = {
          id: currentTrackRef.current ? String(currentTrackRef.current.id) : null,
          recorded: false,
        };
        const p = audio.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (e) {
      }
    };
  }, [setCurrentTime]);

  useEffect(() => {
    registerReplay(() => {
      restartCurrentTrackRef.current?.();
    });
  }, [registerReplay]);

  return null;
}

export { AudioPlayer };
