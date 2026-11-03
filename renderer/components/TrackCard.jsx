import React, { useState } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { useLibrary, FAVORITES_PLAYLIST_ID } from '../context/LibraryContext';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';
import { getSourceLabel, formatDuration, truncateText } from '../utils/helpers';
import { IconHeart } from './icons';

export default function TrackCard({ track, list }) {
  const { playTrack, currentTrack, isPlaying } = usePlayer();
  const { isFavorite, isInAnyPlaylist, toggleTrackInPlaylist } = useLibrary();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  const sourceLabel = getSourceLabel(track.source);
  const sourceClass = track.source === 'soundcloud' ? 'soundcloud' : 'youtube';
  const isCurrent = currentTrack?.id === track.id;
  const playing = isCurrent && isPlaying;
  const isLong = (track.duration || 0) > 1800;

  const inLibrary = isInAnyPlaylist(track.id);
  const fav = isFavorite(track.id);

  async function handleHeart(e) {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      const res = await toggleTrackInPlaylist(track, FAVORITES_PLAYLIST_ID);
      if (res.removed) {
        showToast({ title: 'Убрано из избранного', message: `«${track.title}»` });
      } else if (res.added) {
        showToast({ title: 'Трек добавлен', message: `«${track.title}» → «Избранное»` });
      }
    } catch (err) {
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`track-card theme-transition ${isCurrent ? 'wave-current' : ''} ${inLibrary ? 'in-library' : ''}`}
      onClick={() => playTrack(track, list)}
      onMouseEnter={() => {
        if (track.source_url) api.prefetchStreamHover(track.source_url, track.id);
      }}
      title={`${track.title} — ${track.artist || 'Неизвестный исполнитель'}`}
      style={{ cursor: 'pointer' }}
    >
      <div className="track-card-thumb">
        {track.thumbnail ? (
          <img src={track.thumbnail} alt={track.title} loading="lazy" />
        ) : (
          <div className="track-placeholder">
            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polygon points="10 8 16 12 10 16 10 8" />
            </svg>
          </div>
        )}
        {isCurrent && (
          <div className="track-card-playing" title={playing ? 'Играет сейчас' : 'Текущий трек'}>
            {playing ? (
              <span className="wave-bars"><i /><i /><i /></span>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <polygon points="8 5 19 12 8 19 8 5" />
              </svg>
            )}
          </div>
        )}
      </div>

      <div className="track-card-info">
        <div className="track-card-title">{truncateText(track.title, 70)}</div>
        <div className="track-card-artist">{truncateText(track.artist || 'Неизвестный исполнитель', 48)}</div>
      </div>

      <div className="track-card-meta">
        <span className={`track-card-source ${sourceClass}`}>{sourceLabel}</span>
        {isLong && <span className="long-track-badge">Длинный</span>}
        {track.duration ? <span className="track-card-duration">{formatDuration(track.duration)}</span> : null}
      </div>

      <button
        className={`icon-btn fav-btn ${fav ? 'active' : ''} ${inLibrary ? 'visible' : ''}`}
        onClick={handleHeart}
        disabled={busy}
        title={fav ? 'Убрать из избранного' : 'Добавить в избранное'}
      >
        <IconHeart size={17} filled={fav} />
      </button>
    </div>
  );
}
