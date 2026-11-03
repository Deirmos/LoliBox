import { createContext, useContext, useState, useEffect } from 'react';

const NetworkContext = createContext(null);

export function NetworkProvider({ children }) {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (window.lolibox) {
      window.lolibox
        .checkNetwork()
        .then((s) => setOnline(!!s.online))
        .catch(() => setOnline(true));
    }

    const handler = (_, { online: isOnline }) => setOnline(!!isOnline);
    window.lolibox?.onNetworkStatus(handler);

    return () => {
      window.lolibox?.removeNetworkListener();
    };
  }, []);

  const value = { online };
  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export function useNetwork() {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error('useNetwork must be used within NetworkProvider');
  return ctx;
}

export default NetworkContext;
