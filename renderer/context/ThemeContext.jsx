import { createContext, useContext, useState, useEffect } from 'react';

const themes = [
  { id: 'lolibox', name: 'LoliBox', color: '#8b5cf6' },
  { id: 'deimon', name: 'DeimonTheme', color: '#ef4444' },
  { id: 'neutral', name: 'NeutralTheme', color: '#6366f1' },
];

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('lolibox');

  useEffect(() => {
    if (window.lolibox) {
      window.lolibox
        .getSettings()
        .then((s) => {
          if (s && s.theme && themes.some((t) => t.id === s.theme)) {
            setTheme(s.theme);
          }
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  const applyTheme = (id) => {
    setTheme(id);
    if (window.lolibox) {
      window.lolibox.setSetting('theme', id).catch(() => {});
    }
  };

  const value = { theme, themes, applyTheme };
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

export default themes;
