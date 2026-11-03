let hoverPrefetchTimer = null;

function scheduleHoverPrefetch(url, trackId) {
  if (!url || !window.lolibox || !window.lolibox.prefetchStream) return;
  clearTimeout(hoverPrefetchTimer);
  hoverPrefetchTimer = setTimeout(() => {
    hoverPrefetchTimer = null;
    try {
      Promise.resolve(window.lolibox.prefetchStream(url, trackId)).catch(() => {});
    } catch (e) {
    }
  }, 220);
}

export const api = {
  checkNetwork: () =>
    window.lolibox ? window.lolibox.checkNetwork() : Promise.resolve({ online: true }),
  onNetworkStatus: (cb) => {
    if (!window.lolibox) return;
    window.lolibox.onNetworkStatus((_, data) => cb(data));
  },

  searchYouTubeMusic: (q, limit, options) =>
    window.lolibox.searchYouTubeMusic(q, limit, options),
  searchSoundCloud: (q, limit) => window.lolibox.searchSoundCloud(q, limit),
  searchArtistTracks: (artist, options) =>
    window.lolibox.searchArtistTracks(artist, options),

  getStreamUrl: (url, trackId) => window.lolibox.getStreamUrl(url, trackId),
  refreshStreamUrl: (url, trackId) => {
    if (window.lolibox && window.lolibox.refreshStreamUrl) {
      return window.lolibox.refreshStreamUrl(url, trackId);
    }
    if (window.lolibox && window.lolibox.getStreamUrl) {
      return window.lolibox.getStreamUrl(url, trackId);
    }
    return Promise.reject(new Error('API недоступен'));
  },
  prefetchStream: (url, trackId) => {
    if (!url || !window.lolibox || !window.lolibox.prefetchStream) return Promise.resolve(null);
    try {
      return Promise.resolve(window.lolibox.prefetchStream(url, trackId)).catch(() => null);
    } catch (e) {
      return Promise.resolve(null);
    }
  },
  prefetchStreamHover: (url, trackId) => scheduleHoverPrefetch(url, trackId),

  buildWave: (input) => window.lolibox.buildWave(input),

  analyzeLoudness: (url, trackId) => {
    if (!window.lolibox || !window.lolibox.analyzeLoudness) {
      return Promise.resolve({ success: false, reason: 'unavailable' });
    }
    return Promise.resolve(window.lolibox.analyzeLoudness(url, trackId)).catch(() => ({
      success: false,
      reason: 'error',
    }));
  },
  getLoudnessStatus: () =>
    window.lolibox && window.lolibox.getLoudnessStatus
      ? window.lolibox.getLoudnessStatus()
      : Promise.resolve({ available: false }),

  getPlaylists: () => window.lolibox.getPlaylists(),
  getPlaylist: (id) => window.lolibox.getPlaylist(id),
  getPlaylistTracks: (id) => window.lolibox.getPlaylistTracks(id),
  addTrackToPlaylist: (track, playlistId) => window.lolibox.addTrackToPlaylist(track, playlistId),
  createPlaylist: (name, genre) => window.lolibox.createPlaylist(name, genre),
  updatePlaylist: (id, patch) => window.lolibox.updatePlaylist(id, patch),
  deletePlaylist: (id) => window.lolibox.deletePlaylist(id),
  removeTrackFromPlaylist: (playlistId, trackId) => window.lolibox.removeTrackFromPlaylist(playlistId, trackId),

  getAllTracks: () => window.lolibox.getAllTracks(),
  getTrackPlaylists: (trackId) => window.lolibox.getTrackPlaylists(trackId),
  getPlaylistMembership: () => window.lolibox.getPlaylistMembership(),

  recordPlay: (track, meta) =>
    window.lolibox ? window.lolibox.recordPlay(track, meta) : Promise.resolve({ success: false }),
  completePlay: (trackId) =>
    window.lolibox ? window.lolibox.completePlay(trackId) : Promise.resolve({ success: false }),
  getHistory: (limit) =>
    window.lolibox ? window.lolibox.getHistory(limit) : Promise.resolve([]),

  getBlacklist: () =>
    window.lolibox && window.lolibox.getBlacklist
      ? window.lolibox.getBlacklist()
      : Promise.resolve({ artists: [], tracks: [] }),
  addArtistToBlacklist: (artist) =>
    window.lolibox && window.lolibox.addArtistToBlacklist
      ? window.lolibox.addArtistToBlacklist(artist)
      : Promise.resolve({ success: false }),
  addTrackToBlacklist: (track) =>
    window.lolibox && window.lolibox.addTrackToBlacklist
      ? window.lolibox.addTrackToBlacklist(track)
      : Promise.resolve({ success: false }),
  addTracksToBlacklist: (tracks) =>
    window.lolibox && window.lolibox.addTracksToBlacklist
      ? window.lolibox.addTracksToBlacklist(tracks)
      : Promise.resolve({ success: false }),
  removeArtistFromBlacklist: (key) =>
    window.lolibox && window.lolibox.removeArtistFromBlacklist
      ? window.lolibox.removeArtistFromBlacklist(key)
      : Promise.resolve({ success: false }),
  removeTrackFromBlacklist: (id) =>
    window.lolibox && window.lolibox.removeTrackFromBlacklist
      ? window.lolibox.removeTrackFromBlacklist(id)
      : Promise.resolve({ success: false }),
  removeArtistsFromBlacklist: (keys) =>
    window.lolibox && window.lolibox.removeArtistsFromBlacklist
      ? window.lolibox.removeArtistsFromBlacklist(keys)
      : Promise.resolve({ success: false }),
  removeTracksFromBlacklist: (ids) =>
    window.lolibox && window.lolibox.removeTracksFromBlacklist
      ? window.lolibox.removeTracksFromBlacklist(ids)
      : Promise.resolve({ success: false }),
  clearBlacklist: (type) =>
    window.lolibox && window.lolibox.clearBlacklist
      ? window.lolibox.clearBlacklist(type)
      : Promise.resolve({ success: false }),

  getSettings: () => window.lolibox.getSettings(),
  setSetting: (k, v) => window.lolibox.setSetting(k, v),
  getVolume: () => window.lolibox.getVolume(),
  setVolume: (v) => window.lolibox.setVolume(v),

  getYtDlpStatus: () => window.lolibox.getYtDlpStatus(),
  chooseYtDlpPath: () => window.lolibox.chooseYtDlpPath(),
  resetYtDlpPath: () => window.lolibox.resetYtDlpPath(),
  installYtDlp: () => window.lolibox.installYtDlp(),
  setYtDlpCookiesBrowser: (b) => window.lolibox.setYtDlpCookiesBrowser(b),

  installDependency: (id) => window.lolibox.installDependency(id),
  installAllDependencies: () => window.lolibox.installAllDependencies(),
  onDependencyProgress: (cb) => {
    if (!window.lolibox) return;
    window.lolibox.onDependencyProgress((_, data) => cb(data));
  },
  removeDependencyListeners: () => {
    if (window.lolibox) window.lolibox.removeDependencyListeners();
  },

  getAppVersion: () =>
    window.lolibox?.getAppVersion
      ? window.lolibox.getAppVersion()
      : Promise.resolve(null),
  openExternal: (url) => window.lolibox.openExternal(url),

  windowMinimize: () => window.lolibox.windowMinimize(),
  windowToggleMaximize: () => window.lolibox.windowToggleMaximize(),
  windowClose: () => window.lolibox.windowClose(),
  windowIsMaximized: () => window.lolibox.windowIsMaximized(),
  onWindowMaximized: (cb) => {
    if (!window.lolibox) return;
    window.lolibox.onWindowMaximized((_, val) => cb(val));
  },
  removeWindowListeners: () => {
    if (window.lolibox) window.lolibox.removeWindowListeners();
  },

  setTrayState: (state) => {
    if (!window.lolibox || !window.lolibox.setTrayState) return;
    try {
      window.lolibox.setTrayState(state);
    } catch (e) {
    }
  },
  onTrayCommand: (cb) => {
    if (!window.lolibox || !window.lolibox.onTrayCommand) return;
    window.lolibox.onTrayCommand((_, payload) => cb(payload));
  },
  removeTrayCommandListeners: () => {
    if (window.lolibox && window.lolibox.removeTrayCommandListeners) {
      window.lolibox.removeTrayCommandListeners();
    }
  },
};
