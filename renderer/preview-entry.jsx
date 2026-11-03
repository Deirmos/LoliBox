import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';
import { PlayerProvider } from './context/PlayerContext';
import { WaveProvider } from './context/WaveContext';
import { NetworkProvider } from './context/NetworkContext';
import { ToastProvider } from './context/ToastContext';
import { LibraryProvider } from './context/LibraryContext';
import { BlacklistProvider } from './context/BlacklistContext';
import { SearchProvider } from './context/SearchContext';
import './styles/themes.css';

const ARTIST_TRACKS = [
  { id: 'yt_a1', title: 'Sewerslvt - With You Forever', artist: 'Sewerslvt', source: 'youtube', source_url: 'https://www.youtube.com/watch?v=a1', duration: 249, thumbnail: 'https://i.ytimg.com/vi/a1/mqdefault.jpg' },
  { id: 'yt_a2', title: 'Sewerslvt - Kawaii Razor Blades (feat. yandere)', artist: 'Sewerslvt', source: 'youtube', source_url: 'https://www.youtube.com/watch?v=a2', duration: 339, thumbnail: 'https://i.ytimg.com/vi/a2/mqdefault.jpg' },
  { id: 'yt_a3', title: 'Sewerslvt - Down The Drain (feat. Nurtheon)', artist: 'Sewerslvt', source: 'youtube', source_url: 'https://www.youtube.com/watch?v=a3', duration: 489, thumbnail: 'https://i.ytimg.com/vi/a3/mqdefault.jpg' },
  { id: 'yt_a4', title: '@Cynthoni - Draining Love Story (In The Eyes Of Cynthoni)', artist: 'Cynthoni', source: 'youtube', source_url: 'https://www.youtube.com/watch?v=a4', duration: 3518, thumbnail: 'https://i.ytimg.com/vi/a4/mqdefault.jpg' },
  { id: 'yt_a5', title: 'Sewerslvt - goodbye', artist: 'Sewerslvt', source: 'youtube', source_url: 'https://www.youtube.com/watch?v=a5', duration: 1021, thumbnail: 'https://i.ytimg.com/vi/a5/mqdefault.jpg' },
];

window.lolibox = {
  checkNetwork: async () => ({ online: true }),
  onNetworkStatus: () => {}, removeNetworkListener: () => {},
  getAllTracks: async () => ARTIST_TRACKS.slice(0, 1),
  getPlaylists: async () => [{ id: 1, name: 'Избранное', is_default: 1 }],
  getPlaylistTracks: async () => [ARTIST_TRACKS[0]],
  getPlaylistMembership: async () => ({ yt_a1: [1] }),
  getTrackPlaylists: async () => [1],
  getSettings: async () => ({ theme: 'lolibox', volume_normalization: '1' }),
  setSetting: async () => ({ success: true }),
  getVolume: async () => 0.2,
  setVolume: async () => ({ success: true }),
  searchArtistTracks: async () => ARTIST_TRACKS,
  getStreamUrl: async () => '',
  prefetchStream: async () => ({ success: true }),
  analyzeLoudness: async () => ({ success: false }),
  getLoudnessStatus: async () => ({ available: false }),
  getBlacklist: async () => ({ artists: [], tracks: [] }),
  addArtistToBlacklist: async () => ({ success: true }),
  addTrackToBlacklist: async () => ({ success: true }),
  removeArtistFromBlacklist: async () => ({ success: true }),
  removeTrackFromBlacklist: async () => ({ success: true }),
  clearBlacklist: async () => ({ success: true }),
  windowIsMaximized: async () => false,
  onWindowMaximized: () => {}, removeWindowListeners: () => {},
  setTrayState: () => {},
  onTrayCommand: () => {}, removeTrayCommandListeners: () => {},
};

function Preview() {
  React.useEffect(() => {
    const t = setTimeout(() => {
      const card = document.querySelector('.artist-card');
      if (card) card.click();
    }, 400);
    return () => clearTimeout(t);
  }, []);
  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <LibraryProvider>
          <BlacklistProvider>
            <PlayerProvider>
              <WaveProvider>
                <NetworkProvider>
                  <SearchProvider>
                    <Preview />
                  </SearchProvider>
                </NetworkProvider>
              </WaveProvider>
            </PlayerProvider>
          </BlacklistProvider>
        </LibraryProvider>
      </ToastProvider>
    </ThemeProvider>
  </React.StrictMode>
);
