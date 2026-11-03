import React, { useState } from 'react';
import Layout from './components/Layout';
import Home from './pages/Home';
import Search from './pages/Search';
import MyWave from './pages/MyWave';
import Playlists from './pages/Playlists';
import Blacklist from './pages/Blacklist';
import Settings from './pages/Settings';
import AudioPlayer from './components/AudioPlayer';
import TrayBridge from './components/TrayBridge';

const PAGES = {
  home: Home,
  wave: MyWave,
  search: Search,
  playlists: Playlists,
  blacklist: Blacklist,
  settings: Settings,
};

export default function App() {
  const [page, setPage] = useState('home');
  const Page = PAGES[page] || Home;

  return (
    <>
      <AudioPlayer />
      <TrayBridge />
      <Layout currentPage={page} onPageChange={setPage}>
        <Page />
      </Layout>
    </>
  );
}
