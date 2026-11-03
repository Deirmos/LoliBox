import React, { useEffect, useMemo, useState } from 'react';
import { useBlacklist } from '../context/BlacklistContext';
import { useToast } from '../context/ToastContext';
import { trackArtists, primaryArtistKey, primaryArtistName } from '../utils/artists';
import { IconHeartOff } from './icons';

function uniqueTrackArtists(track) {
  const seen = new Set();
  return trackArtists(track).filter((entry) => {
    if (!entry || !entry.key || seen.has(entry.key)) return false;
    seen.add(entry.key);
    return true;
  });
}

export default function BlacklistDialog({ open, track, onClose, onBlocked }) {
  const { blockArtists, blockTrack, isArtistBlocked } = useBlacklist();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState([]);

  const artists = useMemo(() => uniqueTrackArtists(track), [track]);
  const blockedKeys = useMemo(
    () => new Set(artists.filter((entry) => isArtistBlocked(entry.key)).map((entry) => entry.key)),
    [artists, isArtistBlocked]
  );
  const selectableArtists = useMemo(
    () => artists.filter((entry) => !blockedKeys.has(entry.key)),
    [artists, blockedKeys]
  );

  useEffect(() => {
    if (!open || !track) return;
    const primary = primaryArtistKey(track);
    const first =
      artists.find((entry) => entry.key === primary && !blockedKeys.has(entry.key)) ||
      artists.find((entry) => !blockedKeys.has(entry.key)) ||
      null;
    setSelectedKeys(first ? [first.key] : []);
  }, [open, track, artists, blockedKeys]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onClose]);

  if (!open || !track) return null;

  const selectedSet = new Set(selectedKeys);
  const selectedArtists = selectableArtists.filter((entry) => selectedSet.has(entry.key));
  const allSelected =
    selectableArtists.length > 0 && selectedArtists.length === selectableArtists.length;
  const artistLabel = artists.length
    ? artists.map((entry) => entry.name).join(', ')
    : primaryArtistName(track);

  function toggleArtist(key) {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    );
  }

  function selectAll() {
    setSelectedKeys(selectableArtists.map((entry) => entry.key));
  }

  function clearSelection() {
    setSelectedKeys([]);
  }

  async function handleBlockArtists() {
    if (!selectedArtists.length) return;
    setBusy(true);
    try {
      const res = await blockArtists(
        selectedArtists.map((entry) => ({ key: entry.key, name: entry.name }))
      );
      const added = res.added || [];
      const already = res.already || [];
      const failed = res.failed || [];

      if (failed.length) {
        const counts = [];
        if (added.length) counts.push(`добавлено: ${added.length}`);
        if (already.length) counts.push(`уже было: ${already.length}`);
        if (failed.length) counts.push(`ошибок: ${failed.length}`);
        showToast({
          title: added.length || already.length ? 'Заблокировано не всё' : 'Не удалось заблокировать',
          message: `${counts.join(', ')}. ${failed.map((entry) => entry.name).join(', ')}`,
          icon: <IconHeartOff size={18} />,
        });
      } else if (added.length) {
        showToast({
          title: added.length === 1 ? 'Автор заблокирован' : 'Авторы заблокированы',
          message:
            added.length === 1
              ? `«${added[0].name}» больше не появится в «Моей волне»`
              : `Заблокировано авторов: ${added.length}. Их треки больше не появятся в «Моей волне»`,
          icon: <IconHeartOff size={18} />,
        });
      } else {
        showToast({
          title: 'Авторы уже в чёрном списке',
          message:
            already.length === 1
              ? `«${already[0].name}» уже заблокирован в «Моей волне»`
              : 'Выбранные авторы уже заблокированы в «Моей волне»',
          icon: <IconHeartOff size={18} />,
        });
      }

      if (added.length || already.length) {
        onBlocked?.();
        onClose?.();
      }
    } catch (e) {
      showToast({ title: 'Не удалось заблокировать', message: e.message || 'Ошибка' });
    } finally {
      setBusy(false);
    }
  }

  async function handleBlockTrack() {
    setBusy(true);
    try {
      const res = await blockTrack(track);
      if (res?.success === false) {
        showToast({ title: 'Не удалось заблокировать', message: 'Не удалось определить трек.' });
        return;
      }
      if (res?.already) {
        showToast({
          title: 'Трек уже в чёрном списке',
          message: `«${track.title}» уже заблокирован в «Моей волне»`,
          icon: <IconHeartOff size={18} />,
        });
      } else {
        showToast({
          title: 'Трек заблокирован',
          message: `«${track.title}» больше не появится в «Моей волне»`,
          icon: <IconHeartOff size={18} />,
        });
      }
      onBlocked?.();
      onClose?.();
    } catch (e) {
      showToast({ title: 'Не удалось заблокировать', message: e.message || 'Ошибка' });
    } finally {
      setBusy(false);
    }
  }

  const artistButtonLabel = busy
    ? 'Блокируем…'
    : selectableArtists.length === 0
      ? 'Все авторы уже в списке'
      : selectedArtists.length === 0
        ? 'Выберите авторов'
        : selectedArtists.length === 1
          ? 'Заблокировать автора'
          : `Заблокировать выбранных (${selectedArtists.length})`;

  return (
    <div
      className="modal-overlay"
      onClick={() => {
        if (!busy) onClose?.();
      }}
    >
      <div
        className="modal-card modal-danger blacklist-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Чёрный список"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-danger-icon">
          <IconHeartOff size={22} />
        </div>
        <h2 className="modal-title">Добавить в чёрный список?</h2>

        <div className="blacklist-dialog-track">
          {track.thumbnail ? (
            <img className="blacklist-dialog-thumb" src={track.thumbnail} alt="" />
          ) : (
            <div className="blacklist-dialog-thumb blacklist-dialog-thumb--empty">
              <IconHeartOff size={18} />
            </div>
          )}
          <div className="blacklist-dialog-meta">
            <span className="blacklist-dialog-title">{track.title}</span>
            <span className="blacklist-dialog-artist">{artistLabel}</span>
          </div>
        </div>

        {artists.length > 0 && (
          <div className="blacklist-artist-picker">
            <div className="blacklist-picker-head">
              <span className="blacklist-picker-label">Кого заблокировать в «Моей волне»?</span>
              {selectableArtists.length > 1 && (
                <div className="blacklist-picker-toggles">
                  <button
                    type="button"
                    className="blacklist-picker-toggle"
                    onClick={selectAll}
                    disabled={busy || allSelected}
                  >
                    Выбрать всех
                  </button>
                  <button
                    type="button"
                    className="blacklist-picker-toggle"
                    onClick={clearSelection}
                    disabled={busy || selectedArtists.length === 0}
                  >
                    Снять
                  </button>
                </div>
              )}
            </div>
            <div className="blacklist-artist-options" role="group" aria-label="Авторы трека">
              {artists.map((entry) => {
                const blocked = blockedKeys.has(entry.key);
                const checked = !blocked && selectedSet.has(entry.key);
                const tags = [];
                if (entry.role === 'primary') tags.push('основной');
                if (blocked) tags.push('уже в списке');
                return (
                  <label
                    key={entry.key}
                    className={`blacklist-artist-option ${checked ? 'selected' : ''} ${blocked ? 'blocked' : ''}`}
                  >
                    <input
                      type="checkbox"
                      name="blacklist-artist"
                      value={entry.key}
                      checked={checked}
                      onChange={() => toggleArtist(entry.key)}
                      disabled={busy || blocked}
                    />
                    <span className="blacklist-artist-name">{entry.name}</span>
                    {tags.length > 0 && (
                      <span className="blacklist-artist-tag">{tags.join(' · ')}</span>
                    )}
                  </label>
                );
              })}
            </div>
            {selectableArtists.length === 0 && (
              <p className="blacklist-all-blocked">
                Все авторы этого трека уже в чёрном списке.
              </p>
            )}
          </div>
        )}

        <p className="modal-text">
          «Моя волна» перестанет подбирать треки выбранных авторов или этот трек.
          В поиске и «Для вас» блокировка не действует.
        </p>

        <div className="modal-actions blacklist-dialog-actions">
          <button className="btn btn-outline" onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button className="btn btn-outline" onClick={handleBlockTrack} disabled={busy}>
            Только этот трек
          </button>
          <button
            className="btn btn-danger"
            onClick={handleBlockArtists}
            disabled={busy || selectedArtists.length === 0}
            autoFocus
          >
            {artistButtonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
