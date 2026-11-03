import React from 'react';
import { useTheme } from '../context/ThemeContext';
import {
  IconHome,
  IconWave,
  IconSearch,
  IconPlaylist,
  IconHeartOff,
  IconSettings,
} from './icons';
import sakuraIcon from '../assets/sakura-icon.png';
import sakuraBranch from '../assets/sakura-branch.png';

const items = [
  { id: 'home', label: 'Для вас', icon: <IconHome size={18} /> },
  { id: 'wave', label: 'Моя волна', icon: <IconWave size={18} /> },
  { id: 'search', label: 'Поиск', icon: <IconSearch size={18} /> },
  { id: 'playlists', label: 'Плейлисты', icon: <IconPlaylist size={18} /> },
  { id: 'blacklist', label: 'Чёрный список', icon: <IconHeartOff size={18} /> },
];

export default function Sidebar({
  currentPage,
  onPageChange,
  theme,
  applyTheme,
  themes,
  online,
  onSettingsClick,
}) {
  return (
    <aside className="sidebar theme-transition">
      <div className="sidebar-brand">
        <img className="brand-branch" src={sakuraBranch} alt="" aria-hidden="true" />
        <div className="logo">
          <img className="logo-img" src={sakuraIcon} alt="LoliBox" />
        </div>
        <span className="brand-text">LoliBox</span>
      </div>

      <nav className="sidebar-nav">
        {items.map((item) => {
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onPageChange(item.id)}
              className={`nav-item ${isActive ? 'active' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                borderRadius: '10px',
                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                background: isActive ? 'var(--accent-glow)' : 'transparent',
                border: '1px solid transparent',
                width: '100%',
                textAlign: 'left',
              }}
            >
              <span style={{ width: 24, textAlign: 'center' }}>{item.icon}</span>
              {item.label}
            </button>
          );
        })}
      </nav>

      <div style={{ padding: 16, borderTop: '1px solid var(--border)', marginTop: 'auto' }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: 12 }}>
          Тема оформления
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {themes.map((t) => (
            <button
              key={t.id}
              onClick={() => applyTheme(t.id)}
              className={`theme-chip ${theme === t.id ? 'active' : ''}`}
              style={{
                width: '100%',
                textAlign: 'left',
                justifyContent: 'flex-start',
              }}
            >
              {t.name}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 14, fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: 8 }}>
          Статус сети
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: online ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', border: `1px solid ${online ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'}` }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: online ? '#22c55e' : '#ef4444',
              animation: online ? 'pulse 2s infinite' : 'none',
            }}
          />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
            {online ? 'Онлайн' : 'Оффлайн'}
          </span>
        </div>

        <button
          onClick={onSettingsClick}
          style={{
            width: '100%',
            marginTop: 16,
            padding: 10,
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--bg-card)',
            color: 'var(--text-secondary)',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          <IconSettings size={16} style={{ marginRight: 8, verticalAlign: 'middle' }} />
          Настройки
        </button>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
      `}</style>
    </aside>
  );
}
