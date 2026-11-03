import React, { useMemo, useState } from 'react';
import { useBlacklist } from '../context/BlacklistContext';
import { useToast } from '../context/ToastContext';
import { IconHeartOff } from '../components/icons';

export default function Blacklist() {
  const {
    artists,
    tracks,
    unblockArtist,
    unblockTrack,
    unblockArtists,
    unblockTracks,
  } = useBlacklist();
  const { showToast } = useToast();
  const [tab, setTab] = useState('artists');
  const [busyKey, setBusyKey] = useState(null);
  const [selected, setSelected] = useState([]);
  const [bulkBusy, setBulkBusy] = useState(false);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const items = tab === 'artists' ? artists : tracks;
  const itemKey = (item) =>
    tab === 'artists' ? String(item.key || '') : String(item.id ?? '');
  const allSelected =
    items.length > 0 && items.every((item) => selectedSet.has(itemKey(item)));

  function changeTab(nextTab) {
    setTab(nextTab);
    setSelected([]);
  }

  function toggleSelected(item) {
    const key = itemKey(item);
    if (!key) return;
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]
    );
  }

  function selectAll() {
    setSelected(items.map(itemKey).filter(Boolean));
  }

  function clearSelection() {
    setSelected([]);
  }

  async function handleBulkUnblock() {
    if (!selected.length || bulkBusy) return;
    setBulkBusy(true);
    try {
      const res =
        tab === 'artists'
          ? await unblockArtists(selected)
          : await unblockTracks(selected);
      const failed = res?.failed?.length || 0;
      const removed = res?.removed || 0;
      if (failed) {
        showToast({
          title: 'Не всё удалось разблокировать',
          message: `Разблокировано: ${removed}, ошибок: ${failed}`,
        });
      } else {
        showToast({
          title: tab === 'artists' ? 'Авторы разблокированы' : 'Треки разблокированы',
          message: `Снова могут появляться в «Моей волне» (${removed})`,
        });
      }
      clearSelection();
    } catch (e) {
      showToast({ title: 'Не удалось разблокировать', message: e.message || 'Ошибка' });
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleUnblockArtist(artist) {
    if (busyKey) return;
    setBusyKey(`a:${artist.key}`);
    try {
      await unblockArtist(artist.key);
      showToast({
        title: 'Автор разблокирован',
        message: `«${artist.name}» снова может появляться в «Моей волне»`,
      });
    } catch (e) {
      showToast({ title: 'Не удалось разблокировать', message: e.message || 'Ошибка' });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleUnblockTrack(track) {
    if (busyKey) return;
    setBusyKey(`t:${track.id}`);
    try {
      await unblockTrack(track.id);
      showToast({
        title: 'Трек разблокирован',
        message: `«${track.title}» снова может появляться в «Моей волне»`,
      });
    } catch (e) {
      showToast({ title: 'Не удалось разблокировать', message: e.message || 'Ошибка' });
    } finally {
      setBusyKey(null);
    }
  }

  const empty = artists.length === 0 && tracks.length === 0;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">
          <span className="wave-title-icon"><IconHeartOff size={24} /></span> Чёрный список
        </h1>
        <p className="page-subtitle">
          Заблокированные авторы и треки не попадают в «Мою волну». У совместных треков можно
          выбрать одного или нескольких авторов. В поиске и «Для вас» они остаются доступны.
        </p>
      </div>

      <div className="blacklist-tabs" role="tablist">
        <button
          className={`blacklist-tab ${tab === 'artists' ? 'active' : ''}`}
          onClick={() => changeTab('artists')}
          role="tab"
          aria-selected={tab === 'artists'}
        >
          Авторы <span className="blacklist-tab-count">{artists.length}</span>
        </button>
        <button
          className={`blacklist-tab ${tab === 'tracks' ? 'active' : ''}`}
          onClick={() => changeTab('tracks')}
          role="tab"
          aria-selected={tab === 'tracks'}
        >
          Треки <span className="blacklist-tab-count">{tracks.length}</span>
        </button>
      </div>

      {!empty && items.length > 0 && (
        <div className="selection-toolbar">
          <button className="btn btn-outline btn-sm" onClick={allSelected ? clearSelection : selectAll}>
            {allSelected ? 'Снять всё' : 'Выбрать все'}
          </button>
          <span className="selection-count">Выбрано: {selected.length}</span>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleBulkUnblock}
            disabled={!selected.length || bulkBusy}
          >
            {bulkBusy
              ? 'Разблокируем…'
              : `Разблокировать (${selected.length})`}
          </button>
          {selected.length > 0 && (
            <button className="btn btn-outline btn-sm" onClick={clearSelection}>
              Сбросить
            </button>
          )}
        </div>
      )}

      {empty && (
        <div className="empty-state">
          <div className="empty-placeholder">
            <IconHeartOff size={48} />
          </div>
          <h3 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>Чёрный список пуст</h3>
          <p style={{ color: 'var(--text-muted)' }}>
            Нажмите перечёркнутое сердечко рядом с текущим треком в мини-плеере или в списке
            «Моей волны», чтобы заблокировать автора или отдельный трек.
          </p>
        </div>
      )}

      {!empty && tab === 'artists' && (
        artists.length === 0 ? (
          <div className="blacklist-empty-tab">
            <p>Нет заблокированных авторов.</p>
          </div>
        ) : (
          <div className="blacklist-list">
            {artists.map((artist) => {
              const key = String(artist.key || '');
              const isSelected = selectedSet.has(key);
              return (
                <div className={`blacklist-row ${isSelected ? 'selected' : ''}`} key={artist.key}>
                  <button
                    type="button"
                    className={`track-select ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleSelected(artist)}
                    title={isSelected ? 'Снять выбор' : 'Выбрать автора'}
                    aria-pressed={isSelected}
                  >
                    {isSelected && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                  <div className="blacklist-row-avatar">
                    {(artist.name || artist.key || '?').trim().charAt(0).toUpperCase()}
                  </div>
                  <div className="blacklist-row-info">
                    <span className="blacklist-row-title">{artist.name || artist.key}</span>
                    <span className="blacklist-row-sub">Автор заблокирован в «Моей волне»</span>
                  </div>
                  <button
                    className="btn btn-outline blacklist-unblock"
                    onClick={() => handleUnblockArtist(artist)}
                    disabled={busyKey === `a:${artist.key}`}
                  >
                    {busyKey === `a:${artist.key}` ? 'Разблокируем…' : 'Разблокировать'}
                  </button>
                </div>
              );
            })}
          </div>
        )
      )}

      {!empty && tab === 'tracks' && (
        tracks.length === 0 ? (
          <div className="blacklist-empty-tab">
            <p>Нет заблокированных треков.</p>
          </div>
        ) : (
          <div className="blacklist-list">
            {tracks.map((track) => {
              const key = String(track.id ?? '');
              const isSelected = selectedSet.has(key);
              return (
                <div className={`blacklist-row ${isSelected ? 'selected' : ''}`} key={track.id}>
                  <button
                    type="button"
                    className={`track-select ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleSelected(track)}
                    title={isSelected ? 'Снять выбор' : 'Выбрать трек'}
                    aria-pressed={isSelected}
                  >
                    {isSelected && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                  {track.thumbnail ? (
                    <img className="blacklist-row-thumb" src={track.thumbnail} alt="" />
                  ) : (
                    <div className="blacklist-row-thumb blacklist-row-thumb--empty">
                      <IconHeartOff size={16} />
                    </div>
                  )}
                  <div className="blacklist-row-info">
                    <span className="blacklist-row-title">{track.title}</span>
                    <span className="blacklist-row-sub">{track.artist || 'Неизвестный исполнитель'}</span>
                  </div>
                  <button
                    className="btn btn-outline blacklist-unblock"
                    onClick={() => handleUnblockTrack(track)}
                    disabled={busyKey === `t:${track.id}`}
                  >
                    {busyKey === `t:${track.id}` ? 'Разблокируем…' : 'Разблокировать'}
                  </button>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
