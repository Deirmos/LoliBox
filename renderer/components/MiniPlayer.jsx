import React, { useState } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { useBlacklist } from '../context/BlacklistContext';
import PlaylistSelector from './PlaylistSelector';
import BlacklistDialog from './BlacklistDialog';
import { IconPlay, IconPause, IconPrev, IconNext, IconVolume, IconPlaylist, IconHeart, IconHeartOff, IconRepeat, IconRepeatOne } from './icons';
import { getSourceLabel, formatDuration } from '../utils/helpers';

export default function MiniPlayer() {
  const [showPlaylists, setShowPlaylists] = useState(false);
  const [showBlacklist, setShowBlacklist] = useState(false);
  const { isBlocked } = useBlacklist();
  const {
    currentTrack,
    isPlaying,
    togglePlay,
    playPrev,
    playNext,
    currentTime,
    duration,
    seekTo,
    volume,
    setVolume,
    queue,
    queueIndex,
    playbackError,
    isLoadingTrack,
    isFavorite,
    favoriteBusy,
    toggleFavorite,
    repeatMode,
    cycleRepeatMode,
  } = usePlayer();

  if (!currentTrack) return null;

  const t = currentTrack;
  const sourceLabel = getSourceLabel(t.source);
  const sourceClass = t.source === 'soundcloud' ? 'soundcloud' : 'youtube';
  const hasPrev = queueIndex > 0 || currentTime > 3;
  const hasNext = queueIndex >= 0 && queueIndex < queue.length - 1;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="mini-player theme-transition">
      <div className="mini-player-now">
        <div className="mini-player-thumb">
          {t.thumbnail ? (
            <img src={t.thumbnail} alt={t.title} />
          ) : (
            <div className="track-placeholder">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            </div>
          )}
        </div>
        <div className="mini-player-info">
          <div className="mini-player-title">{t.title}</div>
          <div className="mini-player-artist">{t.artist}</div>
          {isLoadingTrack ? (
            <span className="mini-player-status">Загрузка потока…</span>
          ) : playbackError ? (
            <span className="mini-player-status mini-player-error" title={playbackError}>{playbackError}</span>
          ) : (
            <span className={`mini-player-source source-badge ${sourceClass}`}>{sourceLabel}</span>
          )}
        </div>
      </div>

      <div className="mini-player-main">
        <div className="mini-player-controls">
          <button className="icon-btn" onClick={playPrev} disabled={!hasPrev} title="Предыдущий">
            <IconPrev size={20} />
          </button>
          <button className="play-pause-btn" onClick={togglePlay} title={isPlaying ? 'Пауза' : 'Воспроизвести'}>
            {isPlaying ? <IconPause size={22} /> : <IconPlay size={22} />}
          </button>
          <button className="icon-btn" onClick={playNext} disabled={!hasNext} title="Следующий">
            <IconNext size={20} />
          </button>
          <button
            className={`icon-btn repeat-btn ${repeatMode !== 'off' ? 'active' : ''}`}
            onClick={cycleRepeatMode}
            title={
              repeatMode === 'off'
                ? 'Зацикливание выключено'
                : repeatMode === 'all'
                ? 'Повторять очередь'
                : 'Повторять один трек'
            }
          >
            {repeatMode === 'one' ? <IconRepeatOne size={18} /> : <IconRepeat size={18} />}
            {repeatMode === 'all' && <span className="repeat-dot all" />}
            {repeatMode === 'one' && <span className="repeat-dot">1</span>}
          </button>
        </div>

        <div className="mini-player-progress-row">
          <span className="mini-player-time">{formatDuration(currentTime)}</span>
          <div
            className="mini-player-progress"
            onClick={(e) => {
              if (!duration) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
              seekTo(ratio * duration);
            }}
            title="Перемотка"
          >
            <div className="mini-player-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="mini-player-time">{duration > 0 ? formatDuration(duration) : '--:--'}</span>
        </div>
      </div>

      <div className="mini-player-right">
        <button
          className={`icon-btn block-btn ${isBlocked(t) ? 'active' : ''}`}
          onClick={() => setShowBlacklist(true)}
          title={isBlocked(t) ? 'Автор или трек в чёрном списке' : 'Заблокировать в «Моей волне»'}
        >
          <IconHeartOff size={20} />
        </button>
        <button
          className={`icon-btn fav-btn ${isFavorite ? 'active' : ''}`}
          onClick={toggleFavorite}
          disabled={favoriteBusy}
          title={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
        >
          <IconHeart size={20} filled={isFavorite} />
        </button>
        <button
          className="icon-btn"
          title="Плейлисты"
          onClick={() => setShowPlaylists(true)}
        >
          <IconPlaylist size={18} />
        </button>
        <div className="mini-player-volume" title="Громкость">
          <IconVolume size={16} />
          <input
            type="range"
            className="volume-slider"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
          />
        </div>
      </div>

      {showPlaylists && (
        <PlaylistSelector
          track={t}
          onClose={() => setShowPlaylists(false)}
        />
      )}

      <BlacklistDialog
        open={showBlacklist}
        track={t}
        onClose={() => setShowBlacklist(false)}
      />
    </div>
  );
}
