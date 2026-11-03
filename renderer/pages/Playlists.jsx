import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { usePlayer } from '../context/PlayerContext';
import TrackRow from '../components/TrackRow';
import { IconChevronLeft, IconClose, IconPlaylist } from '../components/icons';

const EMPTY_FORM = { name: '', genre: '' };

export default function Playlists() {
  const [playlists, setPlaylists] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [loading, setLoading] = useState(true);
  const { currentTrack, isPlaying } = usePlayer();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [longMode, setLongMode] = useState('all');

  useEffect(() => {
    loadPlaylists();
  }, []);

  async function loadPlaylists() {
    try {
      const p = await api.getPlaylists();
      setPlaylists(p);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function loadPlaylistTracks(id) {
    try {
      const t = await api.getPlaylistTracks(id);
      setTracks(t);
      setSelectedPlaylist(playlists.find((x) => x.id === id) || null);
    } catch (e) {
      console.error(e);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(pl, e) {
    e.stopPropagation();
    setEditing(pl);
    setForm({ name: pl.name, genre: pl.genre || '' });
    setFormError(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
    setFormError(null);
  }

  async function submitForm() {
    if (!form.name.trim()) {
      setFormError('Укажите название плейлиста.');
      return;
    }
    setFormBusy(true);
    setFormError(null);
    try {
      if (editing) {
        const patch = { genre: form.genre };
        if (!editing.is_default) patch.name = form.name;
        await api.updatePlaylist(editing.id, patch);
        if (selectedPlaylist && selectedPlaylist.id === editing.id) {
          setSelectedPlaylist({ ...selectedPlaylist, name: patch.name ?? selectedPlaylist.name, genre: form.genre || null });
        }
      } else {
        await api.createPlaylist(form.name.trim(), form.genre.trim());
      }
      closeForm();
      await loadPlaylists();
    } catch (e) {
      setFormError(e.message || 'Не удалось сохранить плейлист.');
    } finally {
      setFormBusy(false);
    }
  }

  function goBack() {
    setSelectedPlaylist(null);
    setTracks([]);
    setLongMode('all');
  }

  function askDelete(pl, e) {
    e.stopPropagation();
    setDeleteError(null);
    setConfirmDelete(pl);
  }

  async function confirmDeletePlaylist() {
    if (!confirmDelete) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.deletePlaylist(confirmDelete.id);
      setConfirmDelete(null);
      await loadPlaylists();
    } catch (err) {
      setDeleteError(err.message || 'Не удалось удалить плейлист.');
    } finally {
      setDeleteBusy(false);
    }
  }

  const LONG_TRACK_SECONDS = 1800;
  const longCount = tracks.filter((t) => (t.duration || 0) > LONG_TRACK_SECONDS).length;
  const hasLong = longCount > 0;
  const visibleTracks =
    longMode === 'long'
      ? tracks.filter((t) => (t.duration || 0) > LONG_TRACK_SECONDS)
      : longMode === 'normal'
      ? tracks.filter((t) => (t.duration || 0) <= LONG_TRACK_SECONDS)
      : tracks;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          {selectedPlaylist ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={goBack} className="btn btn-outline" style={{ padding: '6px 14px', fontSize: 13 }}>
                <IconChevronLeft size={16} /> Назад
              </button>
              <h1 className="page-title">{selectedPlaylist.name}</h1>
            </div>
          ) : (
            <div>
              <h1 className="page-title">Плейлисты</h1>
              <p className="page-subtitle">Ваши коллекции треков. Плейлист «Избранное» всегда с вами.</p>
            </div>
          )}
        </div>
        {!selectedPlaylist && (
          <button className="btn btn-primary" onClick={openCreate}>
            Создать
          </button>
        )}
      </div>

      {selectedPlaylist ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>{tracks.length} треков</p>
            {selectedPlaylist.genre && (
              <span className="playlist-genre-badge">{selectedPlaylist.genre}</span>
            )}
            {selectedPlaylist.is_default ? (
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Основной плейлист</span>
            ) : (
              <button className="btn btn-outline" style={{ padding: '4px 12px', fontSize: 12 }} onClick={(e) => openEdit(selectedPlaylist, e)}>
                Изменить название и жанр
              </button>
            )}
          </div>

          {hasLong && (
            <div className="track-filter-bar">
              <span className="track-filter-label">Показать:</span>
              <button className={`chip ${longMode === 'all' ? 'active' : ''}`} onClick={() => setLongMode('all')}>
                Все ({tracks.length})
              </button>
              <button className={`chip ${longMode === 'normal' ? 'active' : ''}`} onClick={() => setLongMode('normal')}>
                Обычные треки ({tracks.length - longCount})
              </button>
              <button className={`chip ${longMode === 'long' ? 'active' : ''}`} onClick={() => setLongMode('long')}>
                Длинные (миксы) ({longCount})
              </button>
            </div>
          )}

          {tracks.length === 0 ? (
            <div className="empty-state" style={{ height: 450 }}>
              <div className="empty-placeholder">
                <IconPlaylist size={48} />
              </div>
              <h3 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>Плейлист пуст</h3>
              <p style={{ color: 'var(--text-muted)' }}>Добавьте треки из поиска или из библиотеки</p>
            </div>
          ) : visibleTracks.length === 0 ? (
            <div className="empty-state" style={{ height: 300 }}>
              <p style={{ color: 'var(--text-muted)' }}>В этой категории пока нет треков</p>
            </div>
          ) : (
            <div className="track-list">
              {visibleTracks.map((t) => (
                <TrackRow
                  key={t.id}
                  track={t}
                  list={visibleTracks}
                  index={visibleTracks.indexOf(t)}
                  isCurrent={currentTrack?.id === t.id}
                  isPlaying={isPlaying}
                  playlistId={selectedPlaylist.id}
                  onRemoved={(removed) => setTracks((list) => list.filter((x) => x.id !== removed.id))}
                  extraBadge={(t.duration || 0) > LONG_TRACK_SECONDS ? <span className="long-track-badge">Длинный</span> : null}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {loading ? (
            <div className="empty-state">Загрузка…</div>
          ) : (
            <div className="grid">
              {playlists.map((pl) => (
                <div
                  key={pl.id}
                  className="playlist-card theme-transition"
                  onClick={() => loadPlaylistTracks(pl.id)}
                  style={{ cursor: 'pointer', position: 'relative' }}
                >
                  {!pl.is_default && (
                    <button
                      className="icon-btn"
                      title="Удалить плейлист"
                      onClick={(e) => askDelete(pl, e)}
                      style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, zIndex: 2 }}
                    >
                      <IconClose size={14} />
                    </button>
                  )}
                  <div className="playlist-card-thumb">
                    <div className="playlist-cover">
                      <IconPlaylist size={36} />
                    </div>
                  </div>
                  <div className="playlist-card-body">
                    <div className="playlist-card-title">{pl.name}</div>
                    <div className="playlist-card-count">
                      {pl.genre ? pl.genre : pl.is_default ? 'Основной плейлист · нельзя удалить' : 'Плейлист'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {formOpen && (
        <div className="modal-overlay" onClick={closeForm}>
          <div className="modal-card theme-transition" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                {editing ? 'Изменить плейлист' : 'Новый плейлист'}
              </h2>
              <button className="icon-btn" onClick={closeForm} title="Закрыть">
                <IconClose size={18} />
              </button>
            </div>

            <label className="modal-label">Название</label>
            <input
              className="input-search"
              placeholder="Например: Дорога в метро"
              value={form.name}
              autoFocus
              disabled={!!(editing && editing.is_default)}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && submitForm()}
            />
            {editing && editing.is_default && (
              <p className="modal-hint">У плейлиста «Избранное» название изменить нельзя.</p>
            )}

            {!(editing && editing.is_default) && (
              <>
                <label className="modal-label" style={{ marginTop: 14 }}>Жанр (необязательно)</label>
                <input
                  className="input-search"
                  placeholder="Например: Lo-fi, Phonk, Рок…"
                  value={form.genre}
                  onChange={(e) => setForm((f) => ({ ...f, genre: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && submitForm()}
                />
                <p className="modal-hint">Если оставить пустым — жанр не будет отображаться.</p>
              </>
            )}

            {formError && <p className="modal-error">{formError}</p>}

            <div className="modal-actions">
              <button className="btn btn-outline" onClick={closeForm} disabled={formBusy}>
                Отмена
              </button>
              <button className="btn btn-primary" onClick={submitForm} disabled={formBusy}>
                {formBusy ? '…' : editing ? 'Сохранить' : 'Создать'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => !deleteBusy && setConfirmDelete(null)}>
          <div className="modal-card theme-transition modal-danger" onClick={(e) => e.stopPropagation()}>
            <div className="modal-danger-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </div>
            <h2 className="modal-title">Удалить плейлист?</h2>
            <p className="modal-text">
              Плейлист «<b>{confirmDelete.name}</b>» будет удалён без возможности восстановления.
              Сами треки останутся в библиотеке.
            </p>
            {deleteError && <p className="modal-error">{deleteError}</p>}
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setConfirmDelete(null)} disabled={deleteBusy}>
                Отмена
              </button>
              <button className="btn btn-danger" onClick={confirmDeletePlaylist} disabled={deleteBusy}>
                {deleteBusy ? 'Удаляем…' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
