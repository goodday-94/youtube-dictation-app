const STORAGE_KEY = 'dictation_app_data';

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { videos: [], selected_video_id: null };
    return JSON.parse(raw);
  } catch {
    return { videos: [], selected_video_id: null };
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function getVideos() {
  return loadData().videos;
}

function getSelectedId() {
  return loadData().selected_video_id;
}

function upsertVideo(video) {
  const data = loadData();
  const idx = data.videos.findIndex(v => v.id === video.id);
  if (idx === -1) {
    data.videos.push(video);
  } else {
    data.videos[idx] = video;
  }
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
