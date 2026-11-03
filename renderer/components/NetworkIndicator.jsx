import React from 'react';

export default function NetworkIndicator({ online }) {
  return (
    <div className={`network-indicator ${online ? 'online' : 'offline'}`}>
      <div className="network-dot"></div>
      {online ? 'Есть интернет — онлайн' : 'Нет интернета — оффлайн'}
    </div>
  );
}
