import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(null);

let toastSeq = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const removeNow = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (id) => {
      setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      setTimeout(() => removeNow(id), 260);
    },
    [removeNow]
  );

  const showToast = useCallback(
    ({ title, message, icon = null, duration = 3200 }) => {
      const id = `toast_${Date.now()}_${toastSeq++}`;
      setToasts((list) => {
        const next = [...list, { id, title, message, icon, leaving: false }];
        return next.slice(-4);
      });
      const timer = setTimeout(() => dismiss(id), duration);
      timersRef.current.set(id, timer);
      return id;
    },
    [dismiss]
  );

  const value = { showToast, dismiss };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast theme-transition ${t.leaving ? 'toast-leaving' : ''}`}
            role="status"
            onClick={() => dismiss(t.id)}
          >
            <div className="toast-icon">
              {t.icon || (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </div>
            <div className="toast-body">
              {t.title && <div className="toast-title">{t.title}</div>}
              {t.message && <div className="toast-message">{t.message}</div>}
            </div>
            <button className="toast-close" onClick={() => dismiss(t.id)} title="Скрыть" aria-label="Скрыть">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) return { showToast: () => {}, dismiss: () => {} };
  return ctx;
}

export default ToastContext;
