import React, { useMemo, useEffect, useRef, useState } from 'react';
import { useSearch } from '../context/SearchContext';
import { usePlayer } from '../context/PlayerContext';
import TrackRow from '../components/TrackRow';
import { IconArrowUp } from '../components/icons';

const LONG_TRACK_SECONDS = 1800;

export default function Search() {
  const {
    query,
    setQuery,
    ytResults,
    scResults,
    loading,
    loadingYt,
    loadingSc,
    error,
    activeTab,
    setActiveTab,
    visibleCount,
    setVisibleCount,
    sortMode,
    setSortMode,
    lenMode,
    setLenMode,
    includeVersions,
    changeVersions,
    searched,
    runSearch,
    resetTabPaging,
    PAGE_SIZE,
  } = useSearch();

  const [showTopBtn, setShowTopBtn] = useState(false);
  const containerRef = useRef(null);
  const { currentTrack, isPlaying } = usePlayer();

  useEffect(() => {
    const scroller = containerRef.current?.closest('.main-content');
    const target = scroller || window;
    const onScroll = () => {
      const top = scroller ? scroller.scrollTop : window.scrollY;
      setShowTopBtn(top > 700);
    };
    target.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => target.removeEventListener('scroll', onScroll);
  }, []);

  function scrollToTop() {
    const scroller = containerRef.current?.closest('.main-content');
    if (scroller) scroller.scrollTo({ top: 0, behavior: 'smooth' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
    setVisibleCount(PAGE_SIZE);
  }

  const results = useMemo(() => {
    const base =
      activeTab === 'youtube' ? ytResults : activeTab === 'soundcloud' ? scResults : [...ytResults, ...scResults];
    let list = base;

    if (lenMode === 'long') list = list.filter((t) => (t.duration || 0) > LONG_TRACK_SECONDS);
    else if (lenMode === 'normal') list = list.filter((t) => (t.duration || 0) <= LONG_TRACK_SECONDS);

    if (sortMode === 'duration-asc') {
      list = [...list].sort((a, b) => (a.duration || 0) - (b.duration || 0));
    } else if (sortMode === 'duration-desc') {
      list = [...list].sort((a, b) => (b.duration || 0) - (a.duration || 0));
    }
    return list;
  }, [activeTab, ytResults, scResults, lenMode, sortMode]);

  const visible = results.slice(0, visibleCount);
  const hasMore = results.length > visibleCount;
  const longCount = [...ytResults, ...scResults].filter((t) => (t.duration || 0) > LONG_TRACK_SECONDS).length;
  const anyLoaded = ytResults.length + scResults.length > 0;

  return (
    <div className="page" ref={containerRef}>
      <div className="page-header">
        <h1 className="page-title">Поиск музыки</h1>
        <p className="page-subtitle">Найдите песню на YouTube Music или SoundCloud</p>
      </div>

      <div className="tabs" style={{ maxWidth: 600, marginBottom: 20 }}>
        <button className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`} onClick={() => { setActiveTab('all'); resetTabPaging(); }}>Все</button>
        <button className={`tab-btn ${activeTab === 'youtube' ? 'active' : ''}`} onClick={() => { setActiveTab('youtube'); resetTabPaging(); }}>
          YouTube Music{loadingYt ? ' …' : ''}
        </button>
        <button className={`tab-btn ${activeTab === 'soundcloud' ? 'active' : ''}`} onClick={() => { setActiveTab('soundcloud'); resetTabPaging(); }}>
          SoundCloud{loadingSc ? ' …' : ''}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 24, maxWidth: 700 }}>
        <input
          className="input-search"
          placeholder="Что вы хотите найти или включить?"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && runSearch()}
        />
        <button className="btn btn-primary" onClick={() => runSearch()} disabled={loading}>
          {loading ? 'Идёт поиск…' : 'Найти'}
        </button>
      </div>

      {error && (
        <div style={{ padding: 16, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, color: '#ef4444', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading && !anyLoaded && (
        <div className="empty-state">Идёт поиск…</div>
      )}

      {!loading && !anyLoaded && !error && searched && (
        <div className="empty-state">
          <div className="empty-placeholder">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </div>
          <h3 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>Ничего не найдено</h3>
          <p style={{ color: 'var(--text-muted)' }}>Попробуйте другой запрос</p>
        </div>
      )}

      {anyLoaded && (
        <div>
          <div className="search-toolbar">
            <span className="search-count">
              Найдено {results.length}
              {hasMore ? ` · показано ${visible.length}` : ''}
            </span>
            <div className="search-toolbar-controls">
              <select className="select-mini" value={sortMode} onChange={(e) => setSortMode(e.target.value)} title="Сортировка">
                <option value="relevance">По релевантности</option>
                <option value="duration-asc">Сначала короткие</option>
                <option value="duration-desc">Сначала длинные</option>
              </select>
              <div className="chip-group" role="group" aria-label="Длина трека">
                <button className={`chip ${lenMode === 'all' ? 'active' : ''}`} onClick={() => { setLenMode('all'); resetTabPaging(); }}>Все</button>
                <button className={`chip ${lenMode === 'normal' ? 'active' : ''}`} onClick={() => { setLenMode('normal'); resetTabPaging(); }}>Обычные</button>
                <button className={`chip ${lenMode === 'long' ? 'active' : ''}`} onClick={() => { setLenMode('long'); resetTabPaging(); }}>
                  Длинные{longCount ? ` · ${longCount}` : ''}
                </button>
              </div>
              <div className="chip-group" role="group" aria-label="Версии треков">
                <button
                  className={`chip ${!includeVersions ? 'active' : ''}`}
                  onClick={() => changeVersions(false)}
                  title="Скрывать ремиксы, лайвы и другие версии в каталоге исполнителя"
                >
                  Оригиналы
                </button>
                <button
                  className={`chip ${includeVersions ? 'active' : ''}`}
                  onClick={() => changeVersions(true)}
                  title="Показывать ремиксы, лайвы и другие версии"
                >
                  Все версии
                </button>
              </div>
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="empty-state" style={{ height: 260 }}>
              <p style={{ color: 'var(--text-muted)' }}>В этой категории ничего нет — измените фильтр</p>
            </div>
          ) : (
            <div className="track-list">
              {visible.map((t) => (
                <TrackRow
                  key={`${t.source}-${t.id}`}
                  track={t}
                  list={results}
                  index={results.indexOf(t)}
                  isCurrent={currentTrack?.id === t.id}
                  isPlaying={isPlaying}
                  extraBadge={(t.duration || 0) > LONG_TRACK_SECONDS ? <span className="long-track-badge">Длинный</span> : null}
                />
              ))}
            </div>
          )}

          {hasMore && (
            <div className="load-more-wrap">
              <button className="btn btn-outline load-more-btn" onClick={() => setVisibleCount(visibleCount + PAGE_SIZE)}>
                Загрузить ещё ({results.length - visibleCount})
              </button>
            </div>
          )}
        </div>
      )}

      {showTopBtn && (
        <button className="back-to-top" onClick={scrollToTop} title="К началу">
          <IconArrowUp size={20} />
        </button>
      )}
    </div>
  );
}
