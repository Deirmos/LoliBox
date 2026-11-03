const api = window.loliboxTray;

const el = {
  card: document.getElementById('card'),
  hide: document.getElementById('hide'),
  artImg: document.getElementById('artImg'),
  artPlaceholder: document.getElementById('artPlaceholder'),
  title: document.getElementById('title'),
  artist: document.getElementById('artist'),
  fav: document.getElementById('fav'),
  time: document.getElementById('time'),
  duration: document.getElementById('duration'),
  progress: document.getElementById('progress'),
  progressFill: document.getElementById('progressFill'),
  prev: document.getElementById('prev'),
  play: document.getElementById('play'),
  next: document.getElementById('next'),
  volume: document.getElementById('volume'),
  open: document.getElementById('open'),
  quit: document.getElementById('quit'),
};

const iconPlay = el.play.querySelector('.tray-icon-play');
const iconPause = el.play.querySelector('.tray-icon-pause');

function setHidden(node, hidden) {
  if (!node) return;
  if (hidden) node.setAttribute('hidden', '');
  else node.removeAttribute('hidden');
}

let state = {
  hasTrack: false,
  title: '',
  artist: '',
  thumbnail: '',
  isPlaying: false,
  isFavorite: false,
  canPrev: false,
  canNext: false,
  currentTime: 0,
  duration: 0,
  volume: 0,
  theme: 'lolibox',
};

let volumeDragging = false;
let progressDragging = false;
let pendingSeek = null;

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function send(command, payload) {
  try {
    api?.command(command, payload);
  } catch (e) {
  }
}

function render(next) {
  if (!next || typeof next !== 'object') return;
  state = { ...state, ...next };

  document.body.dataset.theme = state.theme || 'lolibox';

  const hasTrack = !!state.hasTrack;
  el.title.textContent = state.title || (hasTrack ? 'Без названия' : 'Ничего не играет');
  el.artist.textContent =
    state.artist || (hasTrack ? 'Неизвестный исполнитель' : 'Включите трек в LoliBox');

  if (state.thumbnail) {
    if (el.artImg.getAttribute('src') !== state.thumbnail) {
      el.artImg.src = state.thumbnail;
    }
    el.artImg.hidden = false;
    el.artPlaceholder.hidden = true;
  } else {
    el.artImg.removeAttribute('src');
    el.artImg.hidden = true;
    el.artPlaceholder.hidden = false;
  }

  setHidden(iconPlay, !!state.isPlaying);
  setHidden(iconPause, !state.isPlaying);
  el.play.title = state.isPlaying ? 'Пауза' : 'Воспроизвести';
  el.play.setAttribute('aria-label', el.play.title);

  el.fav.classList.toggle('active', !!state.isFavorite);
  el.fav.title = state.isFavorite ? 'Убрать из избранного' : 'Добавить в избранное';

  const duration = Number(state.duration) || 0;
  const current = Number(state.currentTime) || 0;
  const ratio = duration > 0 ? Math.min(1, Math.max(0, current / duration)) : 0;

  if (!progressDragging) {
    el.progressFill.style.width = `${ratio * 100}%`;
    el.time.textContent = formatTime(current);
  }
  el.duration.textContent = duration > 0 ? formatTime(duration) : '--:--';

  el.prev.disabled = !hasTrack || !state.canPrev;
  el.play.disabled = !hasTrack;
  el.next.disabled = !hasTrack || !state.canNext;
  el.fav.disabled = !hasTrack;

  if (!volumeDragging) {
    const v = Math.max(0, Math.min(1, Number(state.volume) || 0));
    el.volume.value = String(v);
    el.volume.style.setProperty('--volume', `${v * 100}%`);
  }
}


el.play.addEventListener('click', () => send('toggle-play'));
el.prev.addEventListener('click', () => send('prev'));
el.next.addEventListener('click', () => send('next'));
el.fav.addEventListener('click', () => send('toggle-favorite'));

function ratioFromEvent(event) {
  const rect = el.progress.getBoundingClientRect();
  if (!rect.width) return 0;
  return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
}

el.progress.addEventListener('pointerdown', (event) => {
  if (!state.hasTrack || !(Number(state.duration) > 0)) return;
  progressDragging = true;
  const ratio = ratioFromEvent(event);
  pendingSeek = ratio * Number(state.duration);
  el.progressFill.style.width = `${ratio * 100}%`;
  el.time.textContent = formatTime(pendingSeek);
  try {
    el.progress.setPointerCapture(event.pointerId);
  } catch (e) {
  }
});

el.progress.addEventListener('pointermove', (event) => {
  if (!progressDragging || !(Number(state.duration) > 0)) return;
  const ratio = ratioFromEvent(event);
  pendingSeek = ratio * Number(state.duration);
  el.progressFill.style.width = `${ratio * 100}%`;
  el.time.textContent = formatTime(pendingSeek);
});

function finishProgressSeek() {
  if (!progressDragging) return;
  progressDragging = false;
  if (pendingSeek != null) {
    send('seek', { time: pendingSeek });
    pendingSeek = null;
  }
}

el.progress.addEventListener('pointerup', finishProgressSeek);
el.progress.addEventListener('pointercancel', finishProgressSeek);
window.addEventListener('pointerup', finishProgressSeek);

el.volume.addEventListener('pointerdown', () => {
  volumeDragging = true;
});
window.addEventListener('pointerup', () => {
  if (!volumeDragging) return;
  volumeDragging = false;
});

let volumeSendFrame = null;

function sendVolume() {
  if (volumeSendFrame != null) return;
  volumeSendFrame = requestAnimationFrame(() => {
    volumeSendFrame = null;
    send('volume-set', { value: Number(el.volume.value) });
  });
}

el.volume.addEventListener('input', () => {
  el.volume.style.setProperty('--volume', `${Number(el.volume.value) * 100}%`);
  sendVolume();
});
el.volume.addEventListener('change', () => {
  if (volumeSendFrame != null) {
    cancelAnimationFrame(volumeSendFrame);
    volumeSendFrame = null;
  }
  send('volume-set', { value: Number(el.volume.value) });
});

el.hide.addEventListener('click', () => api?.hide());
el.open.addEventListener('click', () => api?.showMain());
el.quit.addEventListener('click', () => api?.quit());

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') api?.hide();
});


if (api) {
  api.onState(render);
  Promise.resolve(api.getState())
    .then((initial) => {
      if (initial) render(initial);
    })
    .catch(() => {});
} else {
  render(state);
}
