import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { api } from '../services/api';

const SearchContext = createContext(null);

const PAGE_SIZE = 10;

export function SearchProvider({ children }) {
  const [query, setQuery] = useState('');
  const [ytResults, setYtResults] = useState([]);
  const [scResults, setScResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingYt, setLoadingYt] = useState(false);
  const [loadingSc, setLoadingSc] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [sortMode, setSortMode] = useState('relevance');
  const [lenMode, setLenMode] = useState('all');
  const [includeVersions, setIncludeVersions] = useState(false);
  const [searched, setSearched] = useState(false);

  const reqIdRef = useRef(0);

  const runSearch = useCallback(async (rawQuery, opts = {}) => {
    const q = (rawQuery ?? query).trim();
    if (!q) return;
    const versions =
      opts.includeVersions != null ? !!opts.includeVersions : includeVersions;
    const myId = ++reqIdRef.current;
    setQuery(q);
    setLoading(true);
    setLoadingYt(true);
    setLoadingSc(true);
    setError(null);
    setYtResults([]);
    setScResults([]);
    setVisibleCount(PAGE_SIZE);
    setSortMode('relevance');
    setLenMode('all');
    setSearched(true);

    let failures = 0;
    let firstError = null;

    const ytPromise = api
      .searchYouTubeMusic(q, 100, { includeVersions: versions })
      .then((res) => {
        if (myId === reqIdRef.current) setYtResults(res);
      })
      .catch((e) => {
        failures += 1;
        firstError = firstError || e;
        if (myId === reqIdRef.current) setYtResults([]);
      })
      .finally(() => {
        if (myId === reqIdRef.current) setLoadingYt(false);
      });

    const scPromise = api
      .searchSoundCloud(q, 25)
      .then((res) => {
        if (myId === reqIdRef.current) setScResults(res);
      })
      .catch((e) => {
        failures += 1;
        firstError = firstError || e;
        if (myId === reqIdRef.current) setScResults([]);
      })
      .finally(() => {
        if (myId === reqIdRef.current) setLoadingSc(false);
      });

    await Promise.allSettled([ytPromise, scPromise]);
    if (myId !== reqIdRef.current) return;
    if (failures === 2) setError(firstError?.message || 'Поиск недоступен.');
    setLoading(false);
  }, [query, includeVersions]);

  const changeVersions = useCallback(
    (value) => {
      const next = !!value;
      setIncludeVersions(next);
      if (searched && query.trim()) {
        runSearch(query, { includeVersions: next });
      }
    },
    [searched, query, runSearch]
  );

  const resetTabPaging = useCallback(() => setVisibleCount(PAGE_SIZE), []);

  const value = {
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
    hasResults: ytResults.length + scResults.length > 0,
  };

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export function useSearch() {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error('useSearch must be used within SearchProvider');
  return ctx;
}

export default SearchContext;
