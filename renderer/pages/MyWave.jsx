import React, { useEffect, useMemo, useState } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { useWave } from '../context/WaveContext';
import { useBlacklist } from '../context/BlacklistContext';
import { useToast } from '../context/ToastContext';
import TrackRow from '../components/TrackRow';
import { IconWave, IconSparkles, IconNext, IconHeartOff } from '../components/icons';

export default function MyWave() {
  const {
    waveTracks,
    loading,
    extending,
    error,
    seed,
    setSeed,
    startWave,
  } = useWave();

  const {
    currentTrack,
    isPlaying,
    togglePlay,
    playNext,
    queue,
    queueIndex,
  } = usePlayer();

  const { blockTracks } = useBlacklist();
  const { showToast } = useToast();

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [blocking, setBlocking] = useState(false);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = waveTracks.length > 0 && selectedIds.length === waveTracks.length;

  useEffect(() => {
    setSelectedIds((prev) => {
      if (!prev.length) return prev;
      const alive = new Set(
        waveTracks.filter((t) => t.id != null).map((t) => String(t.id))
      );
      const next = prev.filter((id) => alive.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [waveTracks]);

  const toggleSelect = (track) => {
    if (!track || track.id == null) return;
    const id = String(track.id);
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    setSelectedIds(waveTracks.filter((t) => t.id != null).map((t) => String(t.id)));
  };

  const clearSelection = () => setSelectedIds([]);

  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds([]);
  };

  async function handleBulkBlock() {
    const chosen = waveTracks.filter((t) => t.id != null && selectedSet.has(String(t.id)));
    if (!chosen.length || blocking) return;
    setBlocking(true);
    try {
      const res = await blockTracks(chosen);
      const added = res?.added?.length || 0;
      const already = res?.already?.length || 0;
      const failed = res?.failed?.length || 0;
      if (failed) {
        showToast({
          title: 'Не всё удалось заблокировать',
          message: `Заблокировано: ${added}, уже были: ${already}, ошибок: ${failed}`,
        });
      } else {
        showToast({
          title: 'Треки заблокированы',
          message:
            already > 0
              ? `Добавлено: ${added}, уже были в списке: ${already}`
              : `«Моя волна» больше не будет их предлагать (${added})`,
          icon: <IconHeartOff size={18} />,
        });
      }
      exitSelection();
    } catch (e) {
      showToast({ title: 'Не удалось заблокировать', message: e.message || 'Ошибка' });
    } finally {
      setBlocking(false);
    }
  }

  const wavePlaying = waveTracks.some((t) => t.id === currentTrack?.id);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <span className="wave-title-icon"><IconWave size={26} /></span> Моя волна
          </h1>
          <p className="page-subtitle">
            Подбор похожих треков на основе того, что вы слушаете
          </p>
        </div>
      </div>

      <div className="wave-hero">
        <div className="wave-hero-glow" />
        <div className="wave-hero-content">
          <div className="wave-hero-icon">
            <IconWave size={44} />
          </div>
          <div className="wave-hero-text">
            <h2>Волна подстроится под вас</h2>
            <p>
              Мы учитываем избранное, плейлисты и историю прослушиваний,
              находим похожие треки через YouTube Music и разбавляем
              волну новыми исполнителями.
            </p>
          </div>
          <div className="wave-hero-actions">
            <button
              className="btn btn-primary wave-start-btn"
              onClick={() => startWave(seed || null)}
              disabled={loading}
            >
              {loading ? 'Собираем волну…' : waveTracks.length ? 'Обновить волну' : 'Включить волну'}
            </button>
            {wavePlaying && (
              <button className="btn btn-outline" onClick={togglePlay}>
                {isPlaying ? 'Пауза' : 'Продолжить'}
              </button>
            )}
          </div>
        </div>

        <div className="wave-seed-row">
          <IconSparkles size={16} />
          <input
            className="input-search"
            placeholder="Настроить волну: исполнитель, жанр или настроение…"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && startWave(seed || null)}
          />
        </div>
      </div>

      {error && (
        <div className="wave-error">{error}</div>
      )}

      {loading && waveTracks.length === 0 && (
        <div className="empty-state">Идёт подбор треков…</div>
      )}

      {waveTracks.length > 0 && (
        <>
          <div className="wave-list-header">
            <span>{waveTracks.length} треков в волне</span>
            <div className="selection-controls">
              {extending && <span className="wave-extending">Подгружаем ещё…</span>}
              {!selectionMode ? (
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => setSelectionMode(true)}
                >
                  Выбрать треки
                </button>
              ) : (
                <>
                  <span className="selection-count">Выбрано: {selectedIds.length}</span>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={allSelected ? clearSelection : selectAll}
                  >
                    {allSelected ? 'Снять всё' : 'Выбрать все'}
                  </button>
                  <button className="btn btn-outline btn-sm" onClick={clearSelection} disabled={!selectedIds.length}>
                    Сбросить
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={handleBulkBlock}
                    disabled={!selectedIds.length || blocking}
                  >
                    <IconHeartOff size={15} /> {blocking ? 'Блокируем…' : `Заблокировать (${selectedIds.length})`}
                  </button>
                  <button className="btn btn-outline btn-sm" onClick={exitSelection}>
                    Отмена
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="track-list">
            {waveTracks.map((t, i) => {
              const isCurrent = currentTrack?.id === t.id;
              return (
                <TrackRow
                  key={t.id}
                  track={t}
                  list={waveTracks}
                  index={i}
                  isCurrent={isCurrent}
                  isPlaying={isPlaying}
                  showWaveIndex
                  allowBlacklist
                  selectable={selectionMode}
                  selected={selectedSet.has(String(t.id))}
                  onSelect={toggleSelect}
                />
              );
            })}
          </div>
          <div className="wave-footer-actions">
            <button className="btn btn-outline" onClick={() => playNext()} disabled={queueIndex >= queue.length - 1}>
              <IconNext size={16} /> Следующий трек
            </button>
          </div>
        </>
      )}
    </div>
  );
}
