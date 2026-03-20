# 🎙 Whisper Transcriber

Upload a WAV file and get an instant text transcription powered by OpenAI Whisper.

---

## 📁 File Structure

```
whisper-app/
├── server.js          ← Express server + API call
├── package.json       ← Dependencies list
├── .env.example       ← API key template
└── public/
    ├── index.html     ← The web page
    ├── style.css      ← All the styling
    └── app.js         ← Browser-side logic
```

---

## 🚀 Setup (step by step)

### 1. Install Node.js
Download from https://nodejs.org (choose the LTS version).

### 2. Get an OpenAI API Key
- Go to https://platform.openai.com/api-keys
- Create a new key and copy it.

### 3. Set your API key

**Mac / Linux** — run in terminal:
```bash
export OPENAI_API_KEY=sk-your-key-here
```

**Windows** — run in Command Prompt:
```cmd
set OPENAI_API_KEY=sk-your-key-here
```

Or copy `.env.example` → `.env` and fill it in, then add `require('dotenv').config()` at the top of `server.js`.

### 4. Install dependencies
Open a terminal in the project folder and run:
```bash
npm install
```

### 5. Start the server
```bash
npm start
```

### 6. Open the app
Visit http://localhost:3000 in your browser.

---

## 💡 How it works

1. You pick a `.wav` file in the browser.
2. The browser sends it to our Express server (`POST /transcribe`).
3. The server forwards the file to **OpenAI Whisper** (`whisper-1` model).
4. Whisper returns the transcribed text.
5. The server sends the text back to the browser to display.

---

## ⚠️ Limits
- WAV files only (Whisper also supports mp3, m4a, etc. — change `accept` in `index.html` if needed)
- Max file size: 25 MB (OpenAI's limit)
