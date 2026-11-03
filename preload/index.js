const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lolibox', {
  checkNetwork: () => ipcRenderer.invoke('network:get-status'),
  onNetworkStatus: (cb) => ipcRenderer.on('network-status', cb),
  removeNetworkListener: () => ipcRenderer.removeAllListeners('network-status'),

  searchYouTubeMusic: (query, limit, options) =>
    ipcRenderer.invoke('search:youtube-music', query, limit, options),
  searchSoundCloud: (query, limit) => ipcRenderer.invoke('search:soundcloud', query, limit),
  searchArtistTracks: (artist, options) =>
    ipcRenderer.invoke('artist:top-tracks', artist, options),

  getStreamUrl: (url, trackId) => ipcRenderer.invoke('stream:get-url', url, trackId),
  refreshStreamUrl: (url, trackId) => ipcRenderer.invoke('stream:refresh-url', url, trackId),
  prefetchStream: (url, trackId) => ipcRenderer.invoke('stream:prefetch', url, trackId),
  buildWave: (input) => ipcRenderer.invoke('wave:build', input),

  analyzeLoudness: (url, trackId) => ipcRenderer.invoke('loudness:analyze', url, trackId),
  getLoudnessStatus: () => ipcRenderer.invoke('loudness:status'),

  getPlaylists: () => ipcRenderer.invoke('playlist:get-all'),
  getPlaylist: (playlistId) => ipcRenderer.invoke('playlist:get', playlistId),
  getPlaylistTracks: (playlistId) =>
    ipcRenderer.invoke('playlist:get-tracks', playlistId),
  addTrackToPlaylist: (track, playlistId) =>
    ipcRenderer.invoke('playlist:add-track', track, playlistId),
  createPlaylist: (name, genre) => ipcRenderer.invoke('playlist:create', name, genre),
  updatePlaylist: (playlistId, patch) =>
    ipcRenderer.invoke('playlist:update', playlistId, patch),
  deletePlaylist: (playlistId) =>
    ipcRenderer.invoke('playlist:delete', playlistId),
  removeTrackFromPlaylist: (playlistId, trackId) =>
    ipcRenderer.invoke('playlist:remove-track', playlistId, trackId),

  getAllTracks: () => ipcRenderer.invoke('track:get-all'),
  getTrackPlaylists: (trackId) => ipcRenderer.invoke('track:get-playlists', trackId),
  getPlaylistMembership: () => ipcRenderer.invoke('track:playlist-membership'),

  recordPlay: (track, meta) => ipcRenderer.invoke('history:record', track, meta),
  completePlay: (trackId) => ipcRenderer.invoke('history:complete', trackId),
  getHistory: (limit) => ipcRenderer.invoke('history:get', limit),

  getBlacklist: () => ipcRenderer.invoke('blacklist:get'),
  addArtistToBlacklist: (artist) => ipcRenderer.invoke('blacklist:add-artist', artist),
  addTrackToBlacklist: (track) => ipcRenderer.invoke('blacklist:add-track', track),
  addTracksToBlacklist: (tracks) => ipcRenderer.invoke('blacklist:add-tracks', tracks),
  removeArtistFromBlacklist: (key) => ipcRenderer.invoke('blacklist:remove-artist', key),
  removeTrackFromBlacklist: (id) => ipcRenderer.invoke('blacklist:remove-track', id),
  removeArtistsFromBlacklist: (keys) => ipcRenderer.invoke('blacklist:remove-artists', keys),
  removeTracksFromBlacklist: (ids) => ipcRenderer.invoke('blacklist:remove-tracks', ids),
  clearBlacklist: (type) => ipcRenderer.invoke('blacklist:clear', type),

  getSettings: () => ipcRenderer.invoke('settings:get-all'),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  getVolume: () => ipcRenderer.invoke('settings:get-volume'),
  setVolume: (value) => ipcRenderer.invoke('settings:set-volume', value),

  getYtDlpStatus: () => ipcRenderer.invoke('ytdlp:status'),
  chooseYtDlpPath: () => ipcRenderer.invoke('ytdlp:choose-path'),
  resetYtDlpPath: () => ipcRenderer.invoke('ytdlp:reset-path'),
  installYtDlp: () => ipcRenderer.invoke('ytdlp:install'),
  setYtDlpCookiesBrowser: (browser) =>
    ipcRenderer.invoke('ytdlp:set-cookies-browser', browser),

  installDependency: (id) => ipcRenderer.invoke('deps:install', id),
  installAllDependencies: () => ipcRenderer.invoke('deps:install-all'),
  onDependencyProgress: (cb) => ipcRenderer.on('deps:progress', cb),
  removeDependencyListeners: () => ipcRenderer.removeAllListeners('deps:progress'),

  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowToggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),
  windowIsMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onWindowMaximized: (cb) => ipcRenderer.on('window:maximized', cb),
  removeWindowListeners: () => ipcRenderer.removeAllListeners('window:maximized'),

  setTrayState: (state) => ipcRenderer.send('app:set-tray-state', state),
  onTrayCommand: (cb) => ipcRenderer.on('tray:command', cb),
  removeTrayCommandListeners: () => ipcRenderer.removeAllListeners('tray:command'),
});
