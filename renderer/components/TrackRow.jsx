import React, { useState } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { useLibrary, FAVORITES_PLAYLIST_ID } from '../context/LibraryContext';
import { useBlacklist } from '../context/BlacklistContext';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';
import { getSourceLabel, formatDuration } from '../utils/helpers';
import PlaylistSelector from './PlaylistSelector';
import BlacklistDialog from './BlacklistDialog';
import { IconPlay, IconHeart, IconHeartOff, IconPlus, IconClose } from './icons';

export default function TrackRow({
  track: t,
  list,
  index,
  isCurrent = false,
  isPlaying = false,
  showWaveIndex = false,
  playlistId = null,
  onRemoved,
  extraBadge = null,
  onBeforePlay,
  allowBlacklist = false,
  selectable = false,
  selected = false,
  onSelect = null,
}) {
  const { playTrack } = usePlayer();
  const { isFavorite, isInPlaylist, toggleTrackInPlaylist } = useLibrary();
  const { isBlocked } = useBlacklist();
  const { showToast } = useToast();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [blacklistOpen, setBlacklistOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const fav = playlistId ? isInPlaylist(t.id, playlistId) : isFavorite(t.id);

  async function handleHeart(e) {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      const targetPlaylist = playlistId || FAVORITES_PLAYLIST_ID;
      const res = await toggleTrackInPlaylist(t, targetPlaylist);
      if (res.removed) {
        showToast({ title: 'Убрано', message: `«${t.title}» удалён из плейлиста` });
        onRemoved?.(t);
      } else if (res.added) {
        showToast({
          title: 'Трек добавлен',
          message: `«${t.title}» → «${playlistId ? 'плейлист' : 'Избранное'}»`,
        });
      }
    } catch (err) {
      showToast({ title: 'Не удалось изменить плейлист', message: err.message || 'Ошибка' });
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(e) {
    e.stopPropagation();
    if (busy || !playlistId) return;
    setBusy(true);
    try {
      await toggleTrackInPlaylist(t, playlistId);
      onRemoved?.(t);
    } catch (err) {
      showToast({ title: 'Не удалось убрать трек', message: err.message || 'Ошибка' });
    } finally {
      setBusy(false);
    }
  }

  const play = (event) => {
    if (selectable) {
      event?.stopPropagation?.();
      onSelect?.(t);
      return;
    }
    onBeforePlay?.();
    playTrack(t, list);
  };

  const handleHoverPrefetch = () => {
    if (!t.source_url) return;
    api.prefetchStreamHover(t.source_url, t.id);
  };

  return (
    <div
      className={`track-row theme-transition ${isCurrent ? 'wave-current' : ''} ${showWaveIndex ? 'has-index' : ''} ${selectable ? 'selectable' : ''} ${selected ? 'selected' : ''}`}
      onMouseEnter={handleHoverPrefetch}
      onClick={(event) => {
        if (!selectable) return;
        if (event.target.closest('button, a, input, label')) return;
        onSelect?.(t);
      }}
    >
      {selectable && (
        <button
          type="button"
          className={`track-select ${selected ? 'selected' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onSelect?.(t);
          }}
          title={selected ? 'Снять выбор' : 'Выбрать трек'}
          aria-pressed={selected}
        >
          {selected && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </button>
      )}

      {(showWaveIndex || isCurrent) && (
        <div className="wave-row-index">
          {isCurrent ? (
            isPlaying ? (
              <span className="wave-bars"><i /><i /><i /></span>
            ) : (
              <IconPlay size={14} />
            )
          ) : (
            index + 1
          )}
        </div>
      )}

      <div className="track-row-thumb" onClick={play} style={{ cursor: 'pointer' }}>
        {t.thumbnail ? (
          <img src={t.thumbnail} alt={t.title} />
        ) : (
          <div className="track-placeholder">
            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polygon points="10 8 16 12 10 16 10 8" />
            </svg>
          </div>
        )}
      </div>

      <div className="track-row-info" onClick={play} style={{ cursor: 'pointer' }}>
        <div className="track-row-title">{t.title}</div>
        <div className="track-row-artist">{t.artist}</div>
      </div>

      {extraBadge}

      <span className={`source-badge ${t.source}`}>{getSourceLabel(t.source)}</span>
      {t.duration && <span className="track-row-duration">{formatDuration(t.duration)}</span>}

      <div className="track-row-actions">
        {allowBlacklist && (
          <button
            className={`icon-btn block-btn ${isBlocked(t) ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setBlacklistOpen(true); }}
            title={isBlocked(t) ? 'Автор или трек в чёрном списке' : 'Заблокировать в «Моей волне»'}
          >
            <IconHeartOff size={17} />
          </button>
        )}
        <button
          className={`icon-btn fav-btn ${fav ? 'active' : ''}`}
          onClick={handleHeart}
          disabled={busy}
          title={fav ? 'Убрать из избранного' : 'В избранное'}
        >
          <IconHeart size={17} filled={fav} />
        </button>

        <button
          className="icon-btn"
          title="Добавить в плейлист"
          onClick={(e) => { e.stopPropagation(); setSelectorOpen(true); }}
        >
          <IconPlus size={16} />
        </button>

        {playlistId && (
          <button
            className="icon-btn remove-btn"
            title="Убрать из плейлиста"
            onClick={handleRemove}
            disabled={busy}
          >
            <IconClose size={16} />
          </button>
        )}
      </div>

      {selectorOpen && (
        <PlaylistSelector track={t} onClose={() => setSelectorOpen(false)} />
      )}

      {allowBlacklist && (
        <BlacklistDialog
          open={blacklistOpen}
          track={t}
          onClose={() => setBlacklistOpen(false)}
        />
      )}
    </div>
  );
}
