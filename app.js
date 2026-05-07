// ── YouTube IFrame API bootstrap ──────────────────────────────────────────────
let ytReady = false;
let ytPlayer = null;
let pendingVideoId = null;

window.onYouTubeIframeAPIReady = function () {
  ytReady = true;
  if (pendingVideoId) loadYTPlayer(pendingVideoId);
};

function loadYTPlayer(videoId) {
  if (!ytReady) { pendingVideoId = videoId; return; }
  pendingVideoId = null;

  document.getElementById('empty-player').style.display = 'none';

  if (ytPlayer) {
    ytPlayer.cueVideoById(videoId);
    return;
  }

  const wrap = document.getElementById('player-wrap');
  let playerEl = document.getElementById('yt-player');
  if (!playerEl) {
    playerEl = document.createElement('div');
    playerEl.id = 'yt-player';
    wrap.appendChild(playerEl);
  }

  ytPlayer = new YT.Player('yt-player', {
    videoId,
    playerVars: { cc_load_policy: 0, rel: 0, modestbranding: 1 },
    events: { onStateChange: onPlayerStateChange },
  });
}

// ── DOM refs ──────────────────────────────────────────────────────────────────
const videoList      = document.getElementById('video-list');
const notes          = document.getElementById('notes');
const statusSelect   = document.getElementById('status-select');
const metaAdded      = document.getElementById('meta-added');
const saveIndicator  = document.getElementById('save-indicator');
const modalOverlay   = document.getElementById('modal-overlay');
const modalUrl       = document.getElementById('modal-url');
const modalError     = document.getElementById('modal-error');
const btnAdd         = document.getElementById('btn-add');
const btnModalAdd    = document.getElementById('btn-modal-add');
const btnModalCancel = document.getElementById('btn-modal-cancel');
const btnDeleteVideo = document.getElementById('btn-delete-video');
const btnPlay        = document.getElementById('btn-play');
const speedSelect    = document.getElementById('speed-select');
const sidebar        = document.getElementById('sidebar');
const playerWrap     = document.getElementById('player-wrap');

// ── Utilities ─────────────────────────────────────────────────────────────────
function parseVideoId(url) {
  try {
    const u = new URL(url.trim());
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0];
    if (u.hostname.includes('youtube.com')) return u.searchParams.get('v');
  } catch { /* fall through */ }
  return null;
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATUS_LABELS = {
  todo: 'Todo',
  in_progress: 'In progress',
  finished: 'Finished',
  redo: 'Redo',
};

// ── Player controls ───────────────────────────────────────────────────────────
function onPlayerStateChange(e) {
  if (e.data === YT.PlayerState.PLAYING) {
    btnPlay.textContent = '⏸ Pause';
  } else {
    btnPlay.textContent = '▶ Play';
  }
}

btnPlay.addEventListener('click', () => {
  if (!ytPlayer) return;
  if (ytPlayer.getPlayerState() === YT.PlayerState.PLAYING) {
    ytPlayer.pauseVideo();
  } else {
    ytPlayer.playVideo();
  }
});

speedSelect.addEventListener('change', () => {
  if (ytPlayer) ytPlayer.setPlaybackRate(parseFloat(speedSelect.value));
});

function enableControls() {
  btnPlay.disabled = false;
  speedSelect.disabled = false;
}

function disableControls() {
  btnPlay.disabled = true;
  btnPlay.textContent = '▶ Play';
  speedSelect.disabled = true;
  speedSelect.value = '1';
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ── State ─────────────────────────────────────────────────────────────────────
let currentVideoId = null;

// ── Sidebar rendering ─────────────────────────────────────────────────────────
function renderSidebar() {
  const videos = getVideos();
  videoList.innerHTML = '';
  videos.forEach(v => {
    const item = document.createElement('div');
    item.className = 'video-item' + (v.id === currentVideoId ? ' selected' : '');
    item.dataset.id = v.id;
    item.innerHTML = `
      <img src="${v.thumbnail}" alt="" loading="lazy">
      <div class="video-meta">
        <div class="video-title" title="${escHtml(v.title)}">${escHtml(v.title)}</div>
        <div class="video-status-label status-${v.status}">${STATUS_LABELS[v.status]}</div>
      </div>`;
    item.addEventListener('click', () => selectVideo(v.id));
    videoList.appendChild(item);
  });
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Delete video ──────────────────────────────────────────────────────────────
btnDeleteVideo.addEventListener('click', () => {
  if (!currentVideoId) return;
  const video = findVideo(currentVideoId);
  if (!video) return;
  if (!confirm(`Delete "${video.title}"?\nThis will remove the video and all notes.`)) return;
  deleteVideo(currentVideoId);
  currentVideoId = null;
  notes.value = '';
  notes.disabled = true;
  metaAdded.textContent = '';
  saveIndicator.textContent = '';
  statusSelect.value = 'todo';
  updateStatusSelectStyle();
  btnDeleteVideo.style.display = 'none';
  disableControls();
  document.getElementById('empty-player').style.display = 'flex';
  if (ytPlayer) ytPlayer.stopVideo();
  renderSidebar();
});

// ── Notes save ────────────────────────────────────────────────────────────────
function flushSaveNotes() {
  if (!currentVideoId) return;
  const video = findVideo(currentVideoId);
  if (!video) return;
  video.notes = notes.value;
  video.notes_updated_at = new Date().toISOString();
  upsertVideo(video);
}

function showSaving() {
  saveIndicator.textContent = 'Saving…';
  saveIndicator.className = 'saving';
}
function showSaved() {
  saveIndicator.textContent = 'Saved ✓';
  saveIndicator.className = 'saved';
}

const debouncedSave = debounce(() => {
  flushSaveNotes();
  showSaved();
}, 1500);

notes.addEventListener('input', () => {
  showSaving();
  debouncedSave();
});

// ── Status change ─────────────────────────────────────────────────────────────
statusSelect.addEventListener('change', () => {
  if (!currentVideoId) return;
  const video = findVideo(currentVideoId);
  if (!video) return;
  video.status = statusSelect.value;
  upsertVideo(video);
  updateStatusSelectStyle();
  renderSidebar();
});

function updateStatusSelectStyle() {
  statusSelect.className = 'status-' + statusSelect.value;
}

// ── Select video ──────────────────────────────────────────────────────────────
function selectVideo(id) {
  if (currentVideoId && currentVideoId !== id) flushSaveNotes();

  currentVideoId = id;
  setSelectedId(id);

  const video = findVideo(id);
  if (!video) return;

  if (video.status === 'todo') video.status = 'in_progress';
  video.last_opened_at = new Date().toISOString();
  upsertVideo(video);

  loadYTPlayer(video.videoId);
  notes.value = video.notes || '';
  notes.disabled = false;
  statusSelect.value = video.status;
  updateStatusSelectStyle();
  metaAdded.textContent = 'Added ' + formatDate(video.added_at);
  saveIndicator.textContent = '';
  btnDeleteVideo.style.display = 'inline-block';
  enableControls();

  renderSidebar();
}

// ── Add video modal ───────────────────────────────────────────────────────────
btnAdd.addEventListener('click', openModal);
btnModalCancel.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

function openModal() {
  modalUrl.value = '';
  modalError.textContent = '';
  btnModalAdd.disabled = false;
  modalOverlay.classList.add('open');
  setTimeout(() => modalUrl.focus(), 50);
}

function closeModal() {
  modalOverlay.classList.remove('open');
}

modalUrl.addEventListener('keydown', e => { if (e.key === 'Enter') btnModalAdd.click(); });

btnModalAdd.addEventListener('click', async () => {
  const url = modalUrl.value.trim();
  if (!url) { modalError.textContent = 'Please paste a YouTube URL.'; return; }

  const videoId = parseVideoId(url);
  if (!videoId) { modalError.textContent = 'Could not parse a YouTube video ID from that URL.'; return; }

  btnModalAdd.disabled = true;
  modalError.textContent = '';

  let title = 'YouTube video';
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    if (res.ok) {
      const json = await res.json();
      title = json.title || title;
    }
  } catch { /* file:// fallback */ }

  const newVideo = {
    id: crypto.randomUUID(),
    videoId,
    url,
    title,
    thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
    status: 'todo',
    added_at: new Date().toISOString(),
    last_opened_at: null,
    notes: '',
    notes_updated_at: null,
  };

  upsertVideo(newVideo);
  renderSidebar();
  closeModal();
  selectVideo(newVideo.id);
});

// ── Drag resize ───────────────────────────────────────────────────────────────
function initDragX(handleEl, getSize, setSize, min, max) {
  let dragging = false, startX, startSize;
  handleEl.addEventListener('mousedown', e => {
    dragging = true;
    startX = e.clientX;
    startSize = getSize();
    handleEl.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    setSize(Math.max(min, Math.min(max, startSize + e.clientX - startX)));
  });
  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handleEl.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
}

function initDragY(handleEl, getSize, setSize, min, max) {
  let dragging = false, startY, startSize;
  handleEl.addEventListener('mousedown', e => {
    dragging = true;
    startY = e.clientY;
    startSize = getSize();
    handleEl.classList.add('dragging');
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    setSize(Math.max(min, Math.min(max, startSize + e.clientY - startY)));
  });
  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handleEl.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
}

// ── Page unload flush ─────────────────────────────────────────────────────────
window.addEventListener('beforeunload', flushSaveNotes);

// ── Init ──────────────────────────────────────────────────────────────────────
function init() {
  notes.disabled = true;
  renderSidebar();

  const lastId = getSelectedId();
  if (lastId && findVideo(lastId)) selectVideo(lastId);

  initDragX(
    document.getElementById('sidebar-resize'),
    () => sidebar.offsetWidth,
    w => { sidebar.style.width = w + 'px'; },
    140, 480
  );

  initDragY(
    document.getElementById('player-resize'),
    () => playerWrap.offsetHeight,
    h => {
      playerWrap.style.flex = 'none';
      playerWrap.style.height = h + 'px';
    },
    100, 520
  );
}

init();
