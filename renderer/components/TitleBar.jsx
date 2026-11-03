import React, { useEffect, useState } from 'react';
import { api } from '../services/api';

export default function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    api.windowIsMaximized?.().then((v) => setMaximized(!!v)).catch(() => {});
    api.onWindowMaximized?.((val) => setMaximized(!!val));
    return () => api.removeWindowListeners?.();
  }, []);

  return (
    <div className="titlebar" aria-hidden="false">
      <div className="titlebar-drag" />
      <div className="titlebar-controls">
        <button className="titlebar-btn" title="Свернуть" onClick={() => api.windowMinimize?.()}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>

        <button
          className="titlebar-btn"
          title={maximized ? 'Восстановить' : 'Развернуть'}
          onClick={() => api.windowToggleMaximize?.()}
        >
          {maximized ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="4" y="8" width="12" height="12" rx="1.5" />
              <path d="M8 8V5.5A1.5 1.5 0 0 1 9.5 4H18a1.5 1.5 0 0 1 1.5 1.5V14" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="5" y="5" width="14" height="14" rx="1.5" />
            </svg>
          )}
        </button>

        <button className="titlebar-btn titlebar-close" title="Закрыть (свернуть в трей)" onClick={() => api.windowClose?.()}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
