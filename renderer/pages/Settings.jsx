import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { usePlayer } from '../context/PlayerContext';

const THEME_GRADIENTS = {
  lolibox: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
  deimon: 'linear-gradient(135deg, #ef4444, #b91c1c)',
  neutral: 'linear-gradient(135deg, #4b5563, #6366f1)',
};

const COMPONENT_LABELS = {
  'yt-dlp': 'yt-dlp',
  ffmpeg: 'ffmpeg',
};

export default function Settings() {
  const { theme, themes, applyTheme } = useTheme();
  const { normalizationEnabled, setNormalizationEnabled } = usePlayer();
  const [message, setMessage] = useState(null);
  const [ytdlp, setYtdlp] = useState(null);
  const [appVersion, setAppVersion] = useState(null);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(null);

  const refreshYtDlp = useCallback(
    () => api.getYtDlpStatus().then(setYtdlp).catch(() => setYtdlp(null)),
    []
  );

  useEffect(() => {
    api.getAppVersion().then(setAppVersion).catch(() => {});
    refreshYtDlp();
  }, [refreshYtDlp]);

  useEffect(() => {
    api.onDependencyProgress((info) => setProgress(info));
    return () => api.removeDependencyListeners();
  }, []);

  async function chooseYtDlp() {
    try {
      const res = await api.chooseYtDlpPath();
      if (res) await refreshYtDlp();
    } catch (e) {
      setMessage({ type: 'error', text: `Не удалось указать путь: ${e.message}` });
    }
  }

  async function resetYtDlp() {
    try {
      await api.resetYtDlpPath();
      await refreshYtDlp();
    } catch (e) {
      setMessage({ type: 'error', text: `Не удалось сбросить путь: ${e.message}` });
    }
  }

  async function installComponent(id) {
    setInstalling(true);
    setProgress({ id, stage: 'download', percent: 0, message: `Загружаем ${COMPONENT_LABELS[id] || id}…` });
    try {
      const res = await api.installDependency(id);
      await refreshYtDlp();
      if (!res.success) {
        setMessage({ type: 'error', text: `Не удалось установить: ${res.error}` });
      } else {
        setMessage({ type: 'success', text: `${COMPONENT_LABELS[id] || id} установлен.` });
      }
    } catch (e) {
      setMessage({ type: 'error', text: `Ошибка установки: ${e.message}` });
    } finally {
      setInstalling(false);
      setProgress(null);
    }
  }

  async function installAllComponents() {
    setInstalling(true);
    try {
      const res = await api.installAllDependencies();
      await refreshYtDlp();
      const failed = Object.entries(res.results || {}).filter(([, r]) => r && r.success === false);
      if (failed.length) {
        setMessage({
          type: 'error',
          text: `Не удалось установить: ${failed.map(([id, r]) => r.error || id).join('; ')}`,
        });
      } else {
        setMessage({ type: 'success', text: 'Все компоненты установлены.' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: `Ошибка установки: ${e.message}` });
    } finally {
      setInstalling(false);
      setProgress(null);
    }
  }

  async function installYtDlp() {
    setInstalling(true);
    try {
      const res = await api.installYtDlp();
      await refreshYtDlp();
      if (!res.success) {
        setMessage({ type: 'error', text: `Не удалось установить: ${res.error}` });
      }
    } catch (e) {
      setMessage({ type: 'error', text: `Ошибка установки: ${e.message}` });
    } finally {
      setInstalling(false);
    }
  }

  const ffmpeg = ytdlp?.ffmpeg || null;
  const missing = [];
  if (ytdlp && !ytdlp.found) missing.push('yt-dlp');
  if (ffmpeg && !ffmpeg.found) missing.push('ffmpeg');

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Настройки</h1>
        <p className="page-subtitle">Звук, тема оформления и компоненты приложения.</p>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Звук</div>
        <div className="settings-item">
          <div className="settings-item-row">
            <div className="settings-item-text">
              <span className="settings-item-label">Выравнивание громкости</span>
              <p className="settings-item-hint">
                Тихие треки звучат громче, громкие — тише: уровень приводится
                примерно к одному значению. Ползунок громкости продолжает работать как обычно.
              </p>
            </div>
            <button
              type="button"
              className={`toggle-switch ${normalizationEnabled ? 'on' : ''}`}
              role="switch"
              aria-checked={normalizationEnabled}
              aria-label="Выравнивание громкости"
              onClick={() => setNormalizationEnabled(!normalizationEnabled)}
            >
              <span className="toggle-knob" />
            </button>
          </div>
        </div>

        <div className="settings-item">
          <div className="settings-item-row">
            <div className="settings-item-text">
              <span className="settings-item-label">ffmpeg</span>
              <p className="settings-item-hint">
                Нужен для измерения громкости треков. Без него плеер работает,
                но выравнивание громкости отключено.
              </p>
            </div>
            <div className="settings-actions">
              {!ffmpeg ? (
                <span className="settings-item-value">Проверка…</span>
              ) : ffmpeg.found ? (
                <span className="settings-item-value settings-ok">
                  ✓ Найден{ffmpeg.version ? ` · v${ffmpeg.version}` : ''}
                </span>
              ) : (
                <span className="settings-item-value settings-bad">✗ Не найден</span>
              )}
              {ffmpeg && !ffmpeg.found && (
                <button className="btn btn-primary" onClick={() => installComponent('ffmpeg')} disabled={installing}>
                  {installing ? 'Установка…' : 'Скачать ffmpeg'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Компоненты поиска и воспроизведения</div>
        <p className="settings-item-hint settings-section-hint">
          LoliBox работает через yt-dlp. Если компонента нет в системе — его можно
          скачать прямо здесь (без прав администратора, в папку{' '}
          <code>{ytdlp?.binDir || '%LOCALAPPDATA%\\LoliBox\\bin'}</code>).
        </p>

        <div className="settings-item">
          <div className="settings-item-row">
            <div className="settings-item-text">
              <span className="settings-item-label">yt-dlp</span>
              <p className="settings-item-hint">Поиск музыки и ссылки на аудиопоток.</p>
            </div>
            <div className="settings-actions">
              {ytdlp === null ? (
                <span className="settings-item-value">Проверка…</span>
              ) : ytdlp.found ? (
                <span className="settings-item-value settings-ok">
                  ✓ Найден{ytdlp.version ? ` · v${ytdlp.version}` : ''}
                </span>
              ) : (
                <span className="settings-item-value settings-bad">✗ Не найден</span>
              )}
              <button className="btn btn-outline" onClick={refreshYtDlp}>Проверить снова</button>
              {ytdlp && !ytdlp.found && (
                <button className="btn btn-primary" onClick={() => installComponent('yt-dlp')} disabled={installing}>
                  {installing ? 'Установка…' : 'Скачать yt-dlp'}
                </button>
              )}
              {ytdlp && !ytdlp.found && ytdlp.winget && (
                <button className="btn btn-outline" onClick={installYtDlp} disabled={installing}>
                  Через winget
                </button>
              )}
              <button className="btn btn-outline" onClick={chooseYtDlp}>Указать путь вручную</button>
            </div>
          </div>
          {ytdlp && ytdlp.path && (
            <div className="settings-path">
              {ytdlp.path}
              {ytdlp.source === 'managed' && ' (установлен приложением)'}
              <button className="btn btn-outline settings-path-reset" onClick={resetYtDlp}>
                Сбросить
              </button>
            </div>
          )}
        </div>

        {missing.length > 0 && (
          <div className="settings-item">
            <div className="settings-item-row">
              <div className="settings-item-text">
                <span className="settings-item-label">Быстрый старт</span>
                <p className="settings-item-hint">
                  Не найдено: {missing.map((id) => COMPONENT_LABELS[id] || id).join(', ')}
                </p>
              </div>
              <div className="settings-actions">
                <button className="btn btn-primary" onClick={installAllComponents} disabled={installing}>
                  {installing ? 'Установка…' : `Установить всё (${missing.length})`}
                </button>
              </div>
            </div>
          </div>
        )}

        {progress && (
          <div className="settings-item">
            <span className="settings-item-label">{progress.message}</span>
            <div className="install-progress" style={{ marginTop: 6 }}>
              <div className="install-progress-fill" style={{ width: `${progress.percent || 0}%` }} />
            </div>
          </div>
        )}

        {message && (
          <p
            className="settings-message"
            style={{ color: message.type === 'error' ? '#ef4444' : '#22c55e' }}
          >
            {message.text}
          </p>
        )}

        {ytdlp && ytdlp.found && (
          <div className="settings-item">
            <div className="settings-item-row">
              <div className="settings-item-text">
                <span className="settings-item-label">Авторизация YouTube</span>
                <p className="settings-item-hint">
                  Если YouTube пишет «Sign in to confirm you&apos;re not a bot» или 429 —
                  выберите браузер, в котором вы залогинены в YouTube. yt-dlp возьмёт cookies оттуда.
                </p>
              </div>
              <div className="settings-actions">
                <select
                  value={ytdlp.cookiesBrowser || 'none'}
                  onChange={async (e) => {
                    try {
                      await api.setYtDlpCookiesBrowser(e.target.value);
                      await refreshYtDlp();
                    } catch (err) {
                      setMessage({ type: 'error', text: `Не удалось сохранить: ${err.message}` });
                    }
                  }}
                  className="settings-select"
                >
                  <option value="none">Не использовать cookies</option>
                  <option value="chrome">Chrome</option>
                  <option value="edge">Edge</option>
                  <option value="firefox">Firefox</option>
                  <option value="brave">Brave</option>
                  <option value="opera">Opera</option>
                  <option value="vivaldi">Vivaldi</option>
                </select>
                <span className="settings-item-hint">
                  JS-runtime: {ytdlp.jsRuntime || 'не найден'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Тема оформления</div>
        <p className="settings-item-hint settings-section-hint">
          Три темы: LoliBox (фиолетовая), DeimonTheme (красная), NeutralTheme (серая).
          Переключение с плавной анимацией.
        </p>
        <div className="theme-selector" style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          {themes.map((t) => (
            <button
              key={t.id}
              onClick={() => applyTheme(t.id)}
              className={`theme-chip ${theme === t.id ? 'active' : ''}`}
              style={{
                background: THEME_GRADIENTS[t.id] || t.color,
                borderColor: 'transparent',
                color: '#fff',
                opacity: theme === t.id ? 1 : 0.65,
              }}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">О приложении</div>
        <div className="settings-item">
          <span className="settings-item-label">Название</span>
          <span className="settings-item-value">LoliBox</span>
        </div>
        <div className="settings-item">
          <span className="settings-item-label">Версия</span>
          <span className="settings-item-value">{appVersion ? `v${appVersion}` : '—'}</span>
        </div>
        <div className="settings-item">
          <span className="settings-item-label">Источники музыки</span>
          <span className="settings-item-value">YouTube Music · SoundCloud</span>
        </div>
      </div>
    </div>
  );
}
