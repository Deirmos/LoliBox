import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useLibrary } from '../context/LibraryContext';

export default function PlaylistSelector({ track, onClose, onAdded }) {
  const [playlists, setPlaylists] = useState([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const { showToast } = useToast();
  const { refreshMembership, refreshPlaylists } = useLibrary();

  useEffect(() => {
    api.getPlaylists().then(setPlaylists).catch(() => {});
  }, []);

  async function handleAdd(playlistId) {
    try {
      const res = await api.addTrackToPlaylist(track, playlistId);
      const playlist = playlists.find((p) => p.id === playlistId);
      const playlistName = playlist?.name || 'плейлист';
      await refreshMembership();
      await refreshPlaylists();
      if (res.reason === 'already_in_playlist') {
        showToast({
          title: 'Уже в плейлисте',
          message: `«${track.title}» уже есть в «${playlistName}»`,
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <line x1="12" y1="8" x2="12" y2="13" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          ),
        });
        return;
      }
      showToast({
        title: 'Трек добавлен',
        message: `«${track.title}» → «${playlistName}»`,
      });
      onAdded?.(playlistId, playlistName);
      onClose();
    } catch (err) {
      showToast({ title: 'Не удалось добавить', message: err.message || 'Ошибка' });
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      const created = await api.createPlaylist(newName.trim());
      setPlaylists((p) => [created, ...p]);
      setCreating(false);
      setNewName('');
      const res = await api.addTrackToPlaylist(track, created.id);
      await refreshMembership();
      await refreshPlaylists();
      if (res.reason === 'already_in_playlist') {
        showToast({ title: 'Уже в плейлисте', message: `«${track.title}» уже есть в «${created.name}»` });
        return;
      }
      showToast({ title: 'Трек добавлен', message: `«${track.title}» → «${created.name}»` });
      onAdded?.(created.id, created.name);
      onClose();
    } catch (e) {
      showToast({ title: 'Не удалось добавить', message: e.message || 'Ошибка' });
    }
  }

  const onlyFavorites = playlists.length === 1 && playlists[0].is_default === 1;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            {onlyFavorites ? 'Добавить в «Избранное»' : 'Выберите плейлист'}
          </h2>
          <button className="icon-btn" onClick={onClose} title="Закрыть">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <p className="playlist-picker-track">
          {track.title} — {track.artist}
        </p>

        {onlyFavorites ? (
          <div className="playlist-picker-empty">
            <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>
              У вас нет других плейлистов — трек автоматически добавится в <b>«Избранное»</b>.
            </p>
            <button className="btn btn-primary" onClick={() => handleAdd(playlists[0].id)}>
              Добавить в «Избранное»
            </button>
          </div>
        ) : (
          <>
            <div className="playlist-picker-list">
              {playlists.map((pl) => (
                <button
                  key={pl.id}
                  onClick={() => handleAdd(pl.id)}
                  className={`playlist-picker-item ${pl.is_default ? 'is-default' : ''}`}
                >
                  <span className="playlist-picker-name">{pl.name}</span>
                  <span className="playlist-picker-tag">
                    {pl.is_default ? 'по умолчанию' : pl.genre || ''}
                  </span>
                </button>
              ))}
            </div>

            {!creating ? (
              <button className="playlist-picker-new" onClick={() => setCreating(true)}>
                + Новый плейлист
              </button>
            ) : (
              <div className="playlist-picker-create">
                <input
                  className="input-search"
                  style={{ width: '100%', marginBottom: 12, padding: '8px 12px' }}
                  placeholder="Название плейлиста"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  autoFocus
                />
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button className="btn btn-outline" onClick={() => setCreating(false)}>Отмена</button>
                  <button className="btn btn-primary" onClick={handleCreate} disabled={!newName.trim()}>Создать и добавить</button>
                </div>
              </div>
            )}
          </>
        )}

        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}
