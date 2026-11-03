import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { trackArtists, primaryArtistKey, primaryArtistName } from '../utils/artists';

const BlacklistContext = createContext(null);

export function BlacklistProvider({ children }) {
  const [artists, setArtists] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.getBlacklist();
      setArtists(Array.isArray(data?.artists) ? data.artists : []);
      setTracks(Array.isArray(data?.tracks) ? data.tracks : []);
    } catch (e) {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const artistKeySet = useMemo(
    () => new Set(artists.map((a) => a && a.key).filter(Boolean)),
    [artists]
  );
  const trackIdSet = useMemo(
    () => new Set(tracks.map((t) => (t && t.id != null ? String(t.id) : '')).filter(Boolean)),
    [tracks]
  );

  const isArtistBlocked = useCallback(
    (key) => !!key && artistKeySet.has(String(key)),
    [artistKeySet]
  );

  const isTrackBlocked = useCallback(
    (trackId) => trackId != null && trackIdSet.has(String(trackId)),
    [trackIdSet]
  );

  const isBlocked = useCallback(
    (track) => {
      if (!track) return false;
      if (track.id != null && trackIdSet.has(String(track.id))) return true;
      return trackArtists(track).some((entry) => entry.key && artistKeySet.has(entry.key));
    },
    [artistKeySet, trackIdSet]
  );

  const blockArtists = useCallback(
    async (entries) => {
      const list = (Array.isArray(entries) ? entries : [])
        .filter((entry) => entry && entry.key)
        .map((entry) => ({
          key: String(entry.key),
          name: entry.name || entry.key,
        }));

      if (!list.length) {
        return { success: false, error: 'no_artist', added: [], already: [], failed: [] };
      }

      const added = [];
      const already = [];
      const failed = [];

      for (const entry of list) {
        try {
          const res = await api.addArtistToBlacklist(entry);
          if (res?.success === false) {
            failed.push({ ...entry, error: res.error || 'unknown' });
          } else if (res?.already) {
            already.push(entry);
          } else {
            added.push(entry);
          }
        } catch (e) {
          failed.push({ ...entry, error: e.message || 'unknown' });
        }
      }

      await refresh();
      return { success: failed.length === 0, added, already, failed };
    },
    [refresh]
  );

  const blockArtist = useCallback(
    async (target) => {
      const isArtistEntry = !!target && !!target.key && !target.title;
      const key = isArtistEntry ? target.key : primaryArtistKey(target);
      const name = isArtistEntry
        ? target.name || target.key
        : primaryArtistName(target);
      if (!key) return { success: false, error: 'no_artist' };

      const res = await blockArtists([{ key, name }]);
      if (res.failed.length) {
        return { success: false, error: res.failed[0].error };
      }
      return { success: true, already: res.already.length > 0 };
    },
    [blockArtists]
  );

  const blockTrack = useCallback(
    async (track) => {
      if (!track || track.id == null) return { success: false, error: 'no_track' };
      const res = await api.addTrackToBlacklist({
        id: track.id,
        title: track.title,
        artist: track.artist,
        thumbnail: track.thumbnail,
        source: track.source,
        source_url: track.source_url,
      });
      await refresh();
      return res;
    },
    [refresh]
  );

  const blockTracks = useCallback(
    async (list) => {
      const items = (Array.isArray(list) ? list : []).filter((t) => t && t.id != null);
      if (!items.length) {
        return { success: false, error: 'no_tracks', added: [], already: [], failed: [] };
      }

      const payload = items.map((track) => ({
        id: track.id,
        title: track.title,
        artist: track.artist,
        thumbnail: track.thumbnail,
        source: track.source,
        source_url: track.source_url,
      }));

      let added = [];
      let already = [];
      let failed = [];
      try {
        const res = await api.addTracksToBlacklist(payload);
        if (res && Array.isArray(res.added)) {
          added = res.added;
          already = Array.isArray(res.already) ? res.already : [];
          failed = Array.isArray(res.failed) ? res.failed : [];
        } else {
          failed = payload.map((track) => ({ ...track, error: 'unknown' }));
        }
      } catch (e) {
        failed = payload.map((track) => ({ ...track, error: e.message || 'unknown' }));
      }

      await refresh();
      return { success: failed.length === 0, added, already, failed };
    },
    [refresh]
  );

  const unblockArtist = useCallback(
    async (key) => {
      const res = await api.removeArtistFromBlacklist(key);
      await refresh();
      return res;
    },
    [refresh]
  );

  const unblockTrack = useCallback(
    async (id) => {
      const res = await api.removeTrackFromBlacklist(id);
      await refresh();
      return res;
    },
    [refresh]
  );

  const unblockArtists = useCallback(
    async (keys) => {
      const list = (Array.isArray(keys) ? keys : []).filter(Boolean);
      if (!list.length) return { success: false, error: 'no_keys', removed: 0, failed: [] };
      let removed = 0;
      const failed = [];
      try {
        const res = await api.removeArtistsFromBlacklist(list);
        if (res && res.success !== false) removed = Number(res.removed) || 0;
        else failed.push({ error: (res && res.error) || 'unknown' });
      } catch (e) {
        failed.push({ error: e.message || 'unknown' });
      }
      await refresh();
      return { success: failed.length === 0, removed, failed };
    },
    [refresh]
  );

  const unblockTracks = useCallback(
    async (ids) => {
      const list = (Array.isArray(ids) ? ids : []).filter((id) => id != null);
      if (!list.length) return { success: false, error: 'no_ids', removed: 0, failed: [] };
      let removed = 0;
      const failed = [];
      try {
        const res = await api.removeTracksFromBlacklist(list);
        if (res && res.success !== false) removed = Number(res.removed) || 0;
        else failed.push({ error: (res && res.error) || 'unknown' });
      } catch (e) {
        failed.push({ error: e.message || 'unknown' });
      }
      await refresh();
      return { success: failed.length === 0, removed, failed };
    },
    [refresh]
  );

  const value = {
    artists,
    tracks,
    loading,
    refresh,
    isArtistBlocked,
    isTrackBlocked,
    isBlocked,
    blockArtist,
    blockArtists,
    blockTrack,
    blockTracks,
    unblockArtist,
    unblockTrack,
    unblockArtists,
    unblockTracks,
  };

  return <BlacklistContext.Provider value={value}>{children}</BlacklistContext.Provider>;
}

export function useBlacklist() {
  const ctx = useContext(BlacklistContext);
  if (!ctx) throw new Error('useBlacklist must be used within BlacklistProvider');
  return ctx;
}

export default BlacklistContext;
