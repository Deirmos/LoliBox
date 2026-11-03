import { useEffect, useRef } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { useTheme } from '../context/ThemeContext';
import { api } from '../services/api';

const VOLUME_STEP = 0.05;

function clampVolume(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

export default function TrayBridge() {
  const {
    currentTrack,
    isPlaying,
    isFavorite,
    volume,
    setVolume,
    togglePlay,
    playNext,
    playPrev,
    seekTo,
    toggleFavorite,
    repeatMode,
    queueIndex,
    queue,
    currentTime,
    duration,
  } = usePlayer();
  const { theme } = useTheme();

  const playerRef = useRef({});
  playerRef.current = {
    volume,
    setVolume,
    togglePlay,
    playNext,
    playPrev,
    seekTo,
    toggleFavorite,
  };

  useEffect(() => {
    const hasTrack = !!currentTrack;
    const canNext =
      hasTrack &&
      queueIndex >= 0 &&
      (queueIndex < queue.length - 1 || repeatMode === 'all');

    api.setTrayState({
      hasTrack,
      title: currentTrack?.title || '',
      artist: currentTrack?.artist || '',
      thumbnail: currentTrack?.thumbnail || '',
      source: currentTrack?.source || '',
      isPlaying: !!isPlaying,
      isFavorite: !!isFavorite,
      canPrev: hasTrack,
      canNext,
      currentTime: Number(currentTime) || 0,
      duration: Number(duration) || 0,
      volume,
      theme,
    });
  }, [
    currentTrack,
    isPlaying,
    isFavorite,
    volume,
    queueIndex,
    queue.length,
    repeatMode,
    currentTime,
    duration,
    theme,
  ]);

  useEffect(() => {
    api.onTrayCommand((msg) => {
      const player = playerRef.current;
      switch (msg?.command) {
        case 'toggle-play':
          player.togglePlay();
          break;
        case 'next':
          player.playNext();
          break;
        case 'prev':
          player.playPrev();
          break;
        case 'seek':
          if (Number.isFinite(Number(msg.time))) player.seekTo(Number(msg.time));
          break;
        case 'toggle-favorite':
          player.toggleFavorite();
          break;
        case 'volume-up':
          player.setVolume(clampVolume(player.volume + VOLUME_STEP));
          break;
        case 'volume-down':
          player.setVolume(clampVolume(player.volume - VOLUME_STEP));
          break;
        case 'volume-set':
          player.setVolume(clampVolume(msg.value));
          break;
        default:
          break;
      }
    });
    return () => api.removeTrayCommandListeners();
  }, []);

  return null;
}
