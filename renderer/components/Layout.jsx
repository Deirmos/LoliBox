import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { usePlayer } from '../context/PlayerContext';
import { useNetwork } from '../context/NetworkContext';
import Sidebar from './Sidebar';
import MiniPlayer from './MiniPlayer';
import TitleBar from './TitleBar';

export default function Layout({ children, currentPage, onPageChange }) {
  const { theme, applyTheme, themes } = useTheme();
  const { currentTrack } = usePlayer();
  const { online } = useNetwork();

  return (
    <div className="app-shell theme-transition">
      <TitleBar />
      <div className="app-body">
        <Sidebar
          currentPage={currentPage}
          onPageChange={onPageChange}
          theme={theme}
          applyTheme={applyTheme}
          themes={themes}
          online={online}
          onSettingsClick={() => onPageChange('settings')}
        />

        <div className="main-content theme-transition">
          {children}
        </div>
      </div>

      {currentTrack && <MiniPlayer />}
    </div>
  );
}
