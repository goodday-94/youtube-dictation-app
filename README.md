# YouTube Dictation Practice

A personal English dictation practice app. Pick a YouTube video, listen, type what you hear, then check with the CC button.

**Live:** https://goodday-94.github.io/youtube-dictation-app

---

## Features

- Add YouTube videos by URL
- Type notes while listening
- Check your transcription using YouTube's native CC button
- Status tracking: Todo / In progress / Finished / Redo
- Notes auto-save as you type
- Sync across devices via GitHub

---

## GitHub Sync Setup

Data is stored in `data.json` in this repo. To enable sync:

1. Go to [github.com/settings/tokens?type=beta](https://github.com/settings/tokens?type=beta)
2. Generate a new fine-grained token
3. Set **Repository access** → this repo only
4. Set **Permissions → Contents** → Read and Write
5. Click 🔑 in the app → paste the token → **Save & Sync**

Once configured, all changes (add/delete/notes) sync automatically.

---

## Run Locally

```bash
python -m http.server 8081
# open http://localhost:8081
```

---

*by Qilin Zhang*
