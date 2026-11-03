const db = require('./db');

function setupPlaylistHandlers(ipcMain, mainWindow) {
  ipcMain.handle('playlist:get-all', () => db.getPlaylists());

  ipcMain.handle('playlist:get', (event, playlistId) => db.getPlaylist(playlistId));

  ipcMain.handle('playlist:get-tracks', (event, playlistId) => db.getPlaylistTracks(playlistId));

  ipcMain.handle('playlist:create', (event, name, genre) => db.createPlaylist(name, genre));

  ipcMain.handle('playlist:update', (event, playlistId, patch) => db.updatePlaylist(playlistId, patch));

  ipcMain.handle('playlist:delete', (event, playlistId) => db.deletePlaylist(playlistId));

  ipcMain.handle('playlist:add-track', (event, track, playlistId) => db.addTrackToPlaylist(track, playlistId));

  ipcMain.handle('playlist:remove-track', (event, playlistId, trackId) => db.removeTrackFromPlaylist(playlistId, trackId));
}

module.exports = { setupPlaylistHandlers };
