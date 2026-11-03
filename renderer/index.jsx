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
                    <App />
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
