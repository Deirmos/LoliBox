import React, { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../services/api';
import TrackCard from '../components/TrackCard';
import { IconSparkles, IconPlaylist, IconChevronLeft } from '../components/icons';
import { collectArtistStats, trackArtists, trackHasArtist } from '../utils/artists';

const LONG_TRACK_SECONDS = 1800;

export default function Home() {
  const [sections, setSections] = useState([]);
  const [artists, setArtists] = useState([]);
  const [loading, setLoading] = useState(true);

  const [artistView, setArtistView] = useState(null);
  const [artistTracks, setArtistTracks] = useState([]);
  const [artistLoading, setArtistLoading] = useState(false);
  const [artistLocalTracks, setArtistLocalTracks] = useState([]);
  const [artistLocalReady, setArtistLocalReady] = useState(false);
  const [artistVersions, setArtistVersions] = useState('originals');
  const [artistLenMode, setArtistLenMode] = useState('normal');
  const [artistSortMode, setArtistSortMode] = useState('relevance');

  const artistReqRef = useRef(0);

  const artistVisible = useMemo(() => {
    let list = artistTracks;
    if (artistLenMode === 'normal') list = list.filter((t) => (t.duration || 0) <= LONG_TRACK_SECONDS);
    else if (artistLenMode === 'long') list = list.filter((t) => (t.duration || 0) > LONG_TRACK_SECONDS);

    if (artistSortMode === 'duration-asc') {
      list = [...list].sort((a, b) => (a.duration || 0) - (b.duration || 0));
    } else if (artistSortMode === 'duration-desc') {
      list = [...list].sort((a, b) => (b.duration || 0) - (a.duration || 0));
    }
    return list;
  }, [artistTracks, artistLenMode, artistSortMode]);

  const artistLongCount = useMemo(
    () => artistTracks.filter((t) => (t.duration || 0) > LONG_TRACK_SECONDS).length,
    [artistTracks]
  );

  useEffect(() => {
    loadTracks();
  }, []);

  async function loadTracks() {
    try {
      const [all, playlists] = await Promise.all([api.getAllTracks(), api.getPlaylists()]);

      const favorites = playlists.filter((p) => p.is_default);
      const favoriteTracks = [];
      for (const p of favorites) {
        try {
          favoriteTracks.push(...(await api.getPlaylistTracks(p.id)));
        } catch (e) {}
      }

      const favoriteIds = new Set(favoriteTracks.map((t) => t.id));

      const artistStats = collectArtistStats({
        favorites: favoriteTracks,
        all,
      });
      const artistScoreByKey = new Map(artistStats.map((artist) => [artist.key, artist.score]));

      const genreScore = {};
      for (const t of favoriteTracks) {
        if (t.genre) genreScore[t.genre] = (genreScore[t.genre] || 0) + 1;
      }
      const topGenres = Object.keys(genreScore).sort((a, b) => genreScore[b] - genreScore[a]);

      setArtists(artistStats.slice(0, 12));

      const scoreOf = (t) => {
        let s = 0;
        if (favoriteIds.has(t.id)) s += 5;
        for (const entry of trackArtists(t)) {
          const artistScore = artistScoreByKey.get(entry.key) || 0;
          if (artistScore) s += 3 * artistScore;
        }
        if (t.genre && genreScore[t.genre]) s += 2 * genreScore[t.genre];
        return s;
      };

      const built = [];

      if (topGenres.length) {
        const byGenre = all
          .filter((t) => t.genre && topGenres.includes(t.genre))
          .sort((a, b) => scoreOf(b) - scoreOf(a))
          .slice(0, 12);
        if (byGenre.length >= 2) {
          built.push({ id: 'genres', title: 'Ваши жанры', icon: <IconSparkles size={18} />, tracks: byGenre });
        }
      }

      if (favoriteTracks.length) {
        built.push({
          id: 'favorites',
          title: 'Из избранного',
          icon: <IconPlaylist size={18} />,
          tracks: favoriteTracks.slice(0, 12),
        });
      }

      if (built.length === 0 && all.length) {
        built.push({
          id: 'all',
          title: 'Вся библиотека',
          icon: <IconSparkles size={18} />,
          tracks: all.slice(0, 20),
        });
      }

      setSections(built);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function loadArtistOnline(artist, includeVersions, local) {
    const reqId = ++artistReqRef.current;
    setArtistLoading(true);
    try {
      const found = await api.searchArtistTracks(artist.name, { includeVersions });
      if (reqId !== artistReqRef.current) return;
      const seen = new Set(local.map((t) => t.id));
      const extra = (found || []).filter(
        (t) => !seen.has(t.id) && (seen.add(t.id), true)
      );
      setArtistTracks([...local, ...extra]);
    } catch (e) {
      if (reqId === artistReqRef.current) setArtistTracks(local);
    } finally {
      if (reqId === artistReqRef.current) setArtistLoading(false);
    }
  }

  async function openArtist(artist) {
    const reqId = ++artistReqRef.current;
    setArtistView(artist);
    setArtistLoading(true);
    setArtistTracks([]);
    setArtistLocalTracks([]);
    setArtistLocalReady(false);
    setArtistVersions('originals');
    setArtistLenMode('normal');
    setArtistSortMode('relevance');
    try {
      const all = await api.getAllTracks();
      if (reqId !== artistReqRef.current) return;
      const local = all.filter((t) => trackHasArtist(t, artist.key));
      setArtistLocalTracks(local);
      setArtistTracks(local);
      setArtistLocalReady(true);
      await loadArtistOnline(artist, false, local);
    } catch (e) {
      console.error(e);
      if (reqId === artistReqRef.current) {
        setArtistTracks([]);
        setArtistLocalReady(true);
        setArtistLoading(false);
      }
    }
  }

  function changeArtistVersions(mode) {
    if (!artistView || !artistLocalReady || mode === artistVersions) return;
    setArtistVersions(mode);
    loadArtistOnline(artistView, mode === 'all', artistLocalTracks);
  }

  if (loading) return <div className="empty-state">Загрузка…</div>;

  if (artistView) {
    return (
      <div className="page">
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button
              className="btn btn-outline"
              style={{ padding: '6px 14px', fontSize: 13 }}
              onClick={() => {
                artistReqRef.current += 1;
                setArtistView(null);
              }}
            >
              <IconChevronLeft size={16} /> Назад
            </button>
            <div className="artist-avatar artist-avatar-lg">
              {artistView.avatar ? (
                <img src={artistView.avatar} alt={artistView.name} />
              ) : (
                <span>{artistView.name.charAt(0)}</span>
              )}
            </div>
            <div>
              <h1 className="page-title">{artistView.name}</h1>
              <p className="page-subtitle">
                {artistLoading ? 'Ищем треки…' : `${artistTracks.length} треков`}
              </p>
            </div>
          </div>
        </div>

        {artistTracks.length === 0 && !artistLoading ? (
          <div className="empty-state" style={{ height: 300 }}>
            <p style={{ color: 'var(--text-muted)' }}>Треки не найдены</p>
          </div>
        ) : (
          <>
            <div className="search-toolbar">
              <span className="search-count">
                {artistVisible.length} треков
                {artistLenMode !== 'all' && artistTracks.length !== artistVisible.length
                  ? ` из ${artistTracks.length}`
                  : ''}
              </span>
              <div className="search-toolbar-controls">
                <select
                  className="select-mini"
                  value={artistSortMode}
                  onChange={(e) => setArtistSortMode(e.target.value)}
                  title="Сортировка"
                >
                  <option value="relevance">По популярности</option>
                  <option value="duration-asc">Сначала короткие</option>
                  <option value="duration-desc">Сначала длинные</option>
                </select>
                <div className="chip-group" role="group" aria-label="Длина трека">
                  <button className={`chip ${artistLenMode === 'all' ? 'active' : ''}`} onClick={() => setArtistLenMode('all')}>
                    Все
                  </button>
                  <button className={`chip ${artistLenMode === 'normal' ? 'active' : ''}`} onClick={() => setArtistLenMode('normal')}>
                    Обычные
                  </button>
                  <button className={`chip ${artistLenMode === 'long' ? 'active' : ''}`} onClick={() => setArtistLenMode('long')}>
                    Длинные{artistLongCount ? ` · ${artistLongCount}` : ''}
                  </button>
                </div>
                <div className="chip-group" role="group" aria-label="Версии треков">
                  <button
                    className={`chip ${artistVersions === 'originals' ? 'active' : ''}`}
                    onClick={() => changeArtistVersions('originals')}
                    disabled={!artistLocalReady}
                    title="Скрыть ремиксы, лайвы и другие версии"
                  >
                    Оригиналы
                  </button>
                  <button
                    className={`chip ${artistVersions === 'all' ? 'active' : ''}`}
                    onClick={() => changeArtistVersions('all')}
                    disabled={!artistLocalReady}
                    title="Показать ремиксы, лайвы и другие версии"
                  >
                    Все версии
                  </button>
                </div>
              </div>
            </div>

            {artistVisible.length === 0 ? (
              <div className="empty-state" style={{ height: 260 }}>
                <p style={{ color: 'var(--text-muted)' }}>В этой категории ничего нет — измените фильтр</p>
              </div>
            ) : (
              <div className="grid">
                {artistVisible.map((t) => (
                  <TrackCard key={t.id} track={t} list={artistVisible} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  if (sections.length === 0 && artists.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-placeholder">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <polygon points="10 8 16 12 10 16 10 8" />
          </svg>
        </div>
        <h3 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>Библиотека пуста</h3>
        <p style={{ color: 'var(--text-muted)' }}>Начните с поиска музыки во вкладке «Поиск»</p>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Для вас</h1>
          <p className="page-subtitle">Персональная подборка на основе того, что вы слушаете</p>
        </div>
      </div>

      {artists.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 className="home-section-title">
            <span className="home-section-icon"><IconSparkles size={18} /></span>
            Любимые исполнители
          </h2>
          <div className="artist-grid">
            {artists.map((a) => (
              <button key={a.key} className="artist-card theme-transition" onClick={() => openArtist(a)} title={a.name}>
                <div className="artist-avatar">
                  {a.avatar ? (
                    <img src={a.avatar} alt={a.name} />
                  ) : (
                    <span>{a.name.charAt(0)}</span>
                  )}
                </div>
                <div className="artist-name">{a.name}</div>
                <div className="artist-count">{a.count} треков</div>
              </button>
            ))}
          </div>
        </section>
      )}

      {sections.map((section) => (
        <section key={section.id} style={{ marginBottom: 32 }}>
          <h2 className="home-section-title">
            <span className="home-section-icon">{section.icon}</span>
            {section.title}
          </h2>
          <div className="grid">
            {section.tracks.map((t) => (
              <TrackCard key={`${section.id}-${t.id}`} track={t} list={section.tracks} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
