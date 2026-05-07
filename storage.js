const STORAGE_KEY = 'dictation_app_data';
const GH_SETTINGS_KEY = 'dictation_github';
const GH_DATA_PATH = 'data.json';

// ── Local storage ─────────────────────────────────────────────────────────────
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { videos: [], selected_video_id: null };
    return JSON.parse(raw);
  } catch { return { videos: [], selected_video_id: null }; }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function getVideos() { return loadData().videos; }
function getSelectedId() { return loadData().selected_video_id; }

function upsertVideo(video) {
  const data = loadData();
  const idx = data.videos.findIndex(v => v.id === video.id);
  if (idx === -1) data.videos.push(video);
  else data.videos[idx] = video;
  saveData(data);
}

function setSelectedId(id) {
  const data = loadData();
  data.selected_video_id = id;
  saveData(data);
}

function findVideo(id) {
  return loadData().videos.find(v => v.id === id) || null;
}

function deleteVideo(id) {
  const data = loadData();
  data.videos = data.videos.filter(v => v.id !== id);
  if (data.selected_video_id === id) data.selected_video_id = null;
  saveData(data);
}

// ── GitHub settings ───────────────────────────────────────────────────────────
const GH_OWNER = 'QilinZhang94';
const GH_REPO  = 'youtube-dictation-app';

function getGHSettings() {
  const token = localStorage.getItem(GH_SETTINGS_KEY);
  if (!token) return null;
  return { token, owner: GH_OWNER, repo: GH_REPO };
}

function saveGHSettings({ token }) {
  localStorage.setItem(GH_SETTINGS_KEY, token);
}

// ── GitHub API ────────────────────────────────────────────────────────────────
function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

function encodeBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function decodeBase64(str) {
  return decodeURIComponent(escape(atob(str.replace(/\n/g, ''))));
}

async function githubFetch() {
  const s = getGHSettings();
  if (!s?.token) return null;

  const res = await fetch(
    `https://api.github.com/repos/${s.owner}/${s.repo}/contents/${GH_DATA_PATH}`,
    { headers: ghHeaders(s.token) }
  );

  if (res.status === 404) return { data: { videos: [], selected_video_id: null }, sha: null };
  if (!res.ok) throw new Error(`GitHub fetch failed: ${res.status}`);

  const json = await res.json();
  return { data: JSON.parse(decodeBase64(json.content)), sha: json.sha };
}

async function githubPush(data, sha) {
  const s = getGHSettings();
  if (!s?.token) return null;

  const body = {
    message: 'sync: update dictation data',
    content: encodeBase64(JSON.stringify(data, null, 2)),
    ...(sha ? { sha } : {}),
  };

  const res = await fetch(
    `https://api.github.com/repos/${s.owner}/${s.repo}/contents/${GH_DATA_PATH}`,
    { method: 'PUT', headers: ghHeaders(s.token), body: JSON.stringify(body) }
  );

  if (res.status === 409) {
    // SHA conflict — re-fetch and retry once
    const fresh = await githubFetch();
    if (!fresh) return null;
    body.sha = fresh.sha;
    const retry = await fetch(
      `https://api.github.com/repos/${s.owner}/${s.repo}/contents/${GH_DATA_PATH}`,
      { method: 'PUT', headers: ghHeaders(s.token), body: JSON.stringify(body) }
    );
    if (!retry.ok) throw new Error(`GitHub push failed: ${retry.status}`);
    const retryJson = await retry.json();
    return retryJson.content.sha;
  }

  if (!res.ok) throw new Error(`GitHub push failed: ${res.status}`);
  const json = await res.json();
  return json.content.sha;
}
