import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';

const LibraryContext = createContext(null);

export const FAVORITES_PLAYLIST_ID = 1;

export function LibraryProvider({ children }) {
  const [membership, setMembership] = useState({});
  const [playlists, setPlaylists] = useState([]);
  const busyRef = useRef(new Set());

  const refreshMembership = useCallback(async () => {
    try {
      const map = await api.getPlaylistMembership();
      setMembership(map || {});
    } catch (e) {}
  }, []);

  const refreshPlaylists = useCallback(async () => {
    try {
      setPlaylists(await api.getPlaylists());
    } catch (e) {}
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshMembership(), refreshPlaylists()]);
  }, [refreshMembership, refreshPlaylists]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const playlistsOf = useCallback((trackId) => membership[trackId] || [], [membership]);

  const isInPlaylist = useCallback(
    (trackId, playlistId) => (membership[trackId] || []).includes(playlistId),
    [membership]
  );

  const isFavorite = useCallback(
    (trackId) => (membership[trackId] || []).includes(FAVORITES_PLAYLIST_ID),
    [membership]
  );

  const isInAnyPlaylist = useCallback(
    (trackId) => (membership[trackId] || []).length > 0,
    [membership]
  );

  const toggleTrackInPlaylist = useCallback(
    async (track, playlistId) => {
      const key = `${playlistId}:${track.id}`;
      if (busyRef.current.has(key)) return { busy: true };
      busyRef.current.add(key);
      try {
        const inList = (membership[track.id] || []).includes(playlistId);
        if (inList) {
          await api.removeTrackFromPlaylist(playlistId, track.id);
        } else {
          const res = await api.addTrackToPlaylist(track, playlistId);
          if (res.reason === 'already_in_playlist') {
            await refreshMembership();
            return { already: true };
          }
        }
        await refreshMembership();
        return { added: !inList, removed: inList };
      } finally {
        busyRef.current.delete(key);
      }
    },
    [membership, refreshMembership]
  );

  const value = {
    playlists,
    membership,
    isFavorite,
    isInPlaylist,
    isInAnyPlaylist,
    playlistsOf,
    toggleTrackInPlaylist,
    refreshAll,
    refreshMembership,
    refreshPlaylists,
  };

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error('useLibrary must be used within LibraryProvider');
  return ctx;
}

export default LibraryContext;
