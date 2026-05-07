// ── DOM refs ──────────────────────────────────────────────────────────────────
const videoList       = document.getElementById('video-list');
const notes           = document.getElementById('notes');
const statusSelect    = document.getElementById('status-select');
const metaAdded       = document.getElementById('meta-added');
const saveIndicator   = document.getElementById('save-indicator');
const modalOverlay    = document.getElementById('modal-overlay');
const modalUrl        = document.getElementById('modal-url');
const modalError      = document.getElementById('modal-error');
const btnAdd          = document.getElementById('btn-add');
const btnModalAdd     = document.getElementById('btn-modal-add');
const btnModalCancel  = document.getElementById('btn-modal-cancel');
const btnDeleteVideo  = document.getElementById('btn-delete-video');
const btnPlay         = document.getElementById('btn-play');
const speedSelect     = document.getElementById('speed-select');
const sidebar         = document.getElementById('sidebar');
const playerWrap      = document.getElementById('player-wrap');
const btnSettings     = document.getElementById('btn-settings');
const settingsOverlay = document.getElementById('settings-overlay');
const ghTokenInput    = document.getElementById('gh-token');
const settingsMsg     = document.getElementById('settings-msg');
const btnSettingsSave = document.getElementById('btn-settings-save');
const btnSettingsCancel = document.getElementById('btn-settings-cancel');

// ── YouTube IFrame API ────────────────────────────────────────────────────────
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

  if (ytPlayer) { ytPlayer.cueVideoById(videoId); return; }

  const wrap = document.getElementById('player-wrap');
  let el = document.getElementById('yt-player');
  if (!el) {
    el = document.createElement('div');
    el.id = 'yt-player';
    wrap.appendChild(el);
  }
  ytPlayer = new YT.Player('yt-player', {
    videoId,
    playerVars: { cc_load_policy: 0, rel: 0, modestbranding: 1 },
    events: { onStateChange: onPlayerStateChange },
  });
}

// ── Player controls ───────────────────────────────────────────────────────────
function onPlayerStateChange(e) {
  btnPlay.textContent = e.data === YT.PlayerState.PLAYING ? '⏸' : '▶';
}

btnPlay.addEventListener('click', () => {
  if (!ytPlayer) return;
  ytPlayer.getPlayerState() === YT.PlayerState.PLAYING
    ? ytPlayer.pauseVideo()
    : ytPlayer.playVideo();
});

speedSelect.addEventListener('change', () => {
  if (ytPlayer) ytPlayer.setPlaybackRate(parseFloat(speedSelect.value));
});

function enableControls()  { btnPlay.disabled = false; speedSelect.disabled = false; }
function disableControls() {
  btnPlay.disabled = true; btnPlay.textContent = '▶';
  speedSelect.disabled = true; speedSelect.value = '1';
}

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

const STATUS_LABELS = { todo: 'Todo', in_progress: 'In progress', finished: 'Finished', redo: 'Redo' };

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── State ─────────────────────────────────────────────────────────────────────
let currentVideoId = null;
let currentSha = null;

// ── GitHub sync ───────────────────────────────────────────────────────────────
function updateKeyButton() {
  const configured = !!getGHSettings()?.token;
  btnSettings.classList.toggle('configured', configured);
  btnSettings.classList.toggle('not-configured', !configured);
  btnSettings.title = configured ? 'Sync configured — click to edit' : 'Read only — click to add token';
}

async function pullFromGitHub() {
  try {
    const result = await githubFetch();
    if (!result) return false;
    currentSha = result.sha;
    saveData(result.data);
    return true;
  } catch {
    return false;
  }
}

async function pushToGitHubNow() {
  const s = getGHSettings();
  if (!s?.token) return;
  try {
    const data = loadData();
    currentSha = await githubPush(data, currentSha);
  } catch (e) {
    console.error('GitHub sync failed:', e.message);
  }
}

const debouncedGHSync = debounce(pushToGitHubNow, 3000);

// ── Sidebar ───────────────────────────────────────────────────────────────────
function renderSidebar() {
  const videos = getVideos();
  videoList.innerHTML = '';
  videos.forEach(v => {
    const item = document.createElement('div');
    item.className = 'video-item' + (v.id === currentVideoId ? ' selected' : '');
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

// ── Notes save ────────────────────────────────────────────────────────────────
function flushSaveNotes() {
  if (!currentVideoId) return;
  const video = findVideo(currentVideoId);
  if (!video) return;
  video.notes = notes.value;
  video.notes_updated_at = new Date().toISOString();
  upsertVideo(video);
}

const debouncedSave = debounce(() => {
  flushSaveNotes();
  saveIndicator.textContent = 'Saved ✓';
  saveIndicator.className = 'saved';
  debouncedGHSync();
}, 1500);

notes.addEventListener('input', () => {
  saveIndicator.textContent = 'Saving…';
  saveIndicator.className = 'saving';
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
  pushToGitHubNow();
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

  if (video.status === 'todo') {
    video.status = 'in_progress';
    upsertVideo(video);
    pushToGitHubNow();
  }
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

// ── Delete video ──────────────────────────────────────────────────────────────
btnDeleteVideo.addEventListener('click', () => {
  if (!currentVideoId) return;
  const video = findVideo(currentVideoId);
  if (!video) return;
  if (!confirm(`Delete "${video.title}"?\nThis will remove the video and all notes.`)) return;

  deleteVideo(currentVideoId);
  currentVideoId = null;
  notes.value = ''; notes.disabled = true;
  metaAdded.textContent = ''; saveIndicator.textContent = '';
  statusSelect.value = 'todo'; updateStatusSelectStyle();
  btnDeleteVideo.style.display = 'none';
  disableControls();
  document.getElementById('empty-player').style.display = 'flex';
  if (ytPlayer) ytPlayer.stopVideo();
  renderSidebar();
  pushToGitHubNow();
});

// ── Add video modal ───────────────────────────────────────────────────────────
btnAdd.addEventListener('click', () => openOverlay(modalOverlay));
btnModalCancel.addEventListener('click', () => closeOverlay(modalOverlay));
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeOverlay(modalOverlay); });

function openOverlay(el)  { el.classList.add('open'); }
function closeOverlay(el) { el.classList.remove('open'); }

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeOverlay(modalOverlay);
    closeOverlay(settingsOverlay);
  }
});

function openModal() {
  modalUrl.value = ''; modalError.textContent = '';
  btnModalAdd.disabled = false;
  openOverlay(modalOverlay);
  setTimeout(() => modalUrl.focus(), 50);
}

btnAdd.removeEventListener('click', () => openOverlay(modalOverlay));
btnAdd.addEventListener('click', openModal);

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
    if (res.ok) { const j = await res.json(); title = j.title || title; }
  } catch { /* file:// fallback */ }

  const newVideo = {
    id: crypto.randomUUID(), videoId, url, title,
    thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
    status: 'todo', added_at: new Date().toISOString(),
    last_opened_at: null, notes: '', notes_updated_at: null,
  };

  upsertVideo(newVideo);
  renderSidebar();
  closeOverlay(modalOverlay);
  selectVideo(newVideo.id);
  pushToGitHubNow();
});

// ── Settings modal ────────────────────────────────────────────────────────────
btnSettings.addEventListener('click', () => {
  const s = getGHSettings();
  ghTokenInput.value = s?.token || '';
  settingsMsg.textContent = ''; settingsMsg.className = '';
  openOverlay(settingsOverlay);
  setTimeout(() => ghTokenInput.focus(), 50);
});

btnSettingsCancel.addEventListener('click', () => closeOverlay(settingsOverlay));
settingsOverlay.addEventListener('click', e => { if (e.target === settingsOverlay) closeOverlay(settingsOverlay); });

btnSettingsSave.addEventListener('click', async () => {
  const token = ghTokenInput.value.trim();
  if (!token) { settingsMsg.textContent = 'Please enter a token.'; settingsMsg.className = 'error'; return; }

  btnSettingsSave.disabled = true;
  settingsMsg.textContent = 'Connecting…'; settingsMsg.className = '';

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/data.json`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' } }
    );
    if (res.status === 401) throw new Error('Invalid token.');
    if (res.status === 403) throw new Error('Token has no access to this repo.');
    saveGHSettings({ token });
    updateKeyButton();
    settingsMsg.textContent = '✓ Connected!'; settingsMsg.className = 'ok';
    setTimeout(() => closeOverlay(settingsOverlay), 700);
    const pulled = await pullFromGitHub();
    if (pulled) renderSidebar();
  } catch (e) {
    settingsMsg.textContent = e.message || 'Connection failed.'; settingsMsg.className = 'error';
  } finally {
    btnSettingsSave.disabled = false;
  }
});

// ── Drag resize ───────────────────────────────────────────────────────────────
function initDragX(handle, getW, setW, min, max) {
  let dragging = false, startX, startW;
  handle.addEventListener('mousedown', e => {
    dragging = true; startX = e.clientX; startW = getW();
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    setW(Math.max(min, Math.min(max, startW + e.clientX - startX)));
  });
  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false; handle.classList.remove('dragging');
    document.body.style.cursor = ''; document.body.style.userSelect = '';
  });
}

function initDragY(handle, getH, setH, min, max) {
  let dragging = false, startY, startH;
  handle.addEventListener('mousedown', e => {
    dragging = true; startY = e.clientY; startH = getH();
    handle.classList.add('dragging');
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    setH(Math.max(min, Math.min(max, startH + e.clientY - startY)));
  });
  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false; handle.classList.remove('dragging');
    document.body.style.cursor = ''; document.body.style.userSelect = '';
  });
}

// ── Page unload ───────────────────────────────────────────────────────────────
window.addEventListener('beforeunload', flushSaveNotes);

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  notes.disabled = true;
  updateKeyButton();

  const pulled = await pullFromGitHub();

  renderSidebar();

  const lastId = getSelectedId();
  if (lastId && findVideo(lastId)) selectVideo(lastId);

  if (window.innerWidth > 768) {
    const appEl = document.getElementById('app');
    initDragX(
      document.getElementById('sidebar-resize'),
      () => sidebar.offsetWidth,
      w => { appEl.style.gridTemplateColumns = `${w}px 4px 1fr`; },
      140, 600
    );
    initDragY(
      document.getElementById('player-resize'),
      () => playerWrap.offsetHeight,
      h => { appEl.style.gridTemplateRows = `${h}px 4px auto 1fr`; },
      100, 600
    );
  }
}

init();
