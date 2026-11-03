import React, { useEffect } from 'react';

export default function ConfirmDialog({
  open,
  title = 'Подтверждение',
  message,
  confirmLabel = 'Удалить',
  cancelLabel = 'Отмена',
  busyLabel = 'Удаляем…',
  busy = false,
  danger = true,
  icon = null,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) onCancel?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onClick={() => {
        if (!busy) onCancel?.();
      }}
    >
      <div
        className={`modal-card ${danger ? 'modal-danger' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        {icon && <div className="modal-danger-icon">{icon}</div>}
        <h2 className="modal-title">{title}</h2>
        {message && <div className="modal-text">{message}</div>}
        <div className="modal-actions">
          <button
            className="btn btn-outline"
            onClick={onCancel}
            disabled={busy}
            autoFocus
          >
            {cancelLabel}
          </button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
