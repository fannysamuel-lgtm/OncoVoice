// server.js — Main Express server

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const OpenAI = require("openai");

// ─── Setup ────────────────────────────────────────────────────────────────────

const app = express();
const PORT = 3000;

// Initialize OpenAI with your API key from the environment variable
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ─── File Upload Config ───────────────────────────────────────────────────────

// Multer saves uploaded files to the "uploads/" folder temporarily
const upload = multer({
  dest: "uploads/",
  fileFilter: (req, file, cb) => {
    // Only allow WAV files
    if (file.mimetype === "audio/wav" || file.originalname.endsWith(".wav")) {
      cb(null, true);
    } else {
      cb(new Error("Only WAV files are allowed!"), false);
    }
  },
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB max (OpenAI's limit)
  },
});

// ─── Routes ───────────────────────────────────────────────────────────────────

// Serve the HTML page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Handle the audio upload + transcription
app.post("/transcribe", upload.single("audio"), async (req, res) => {
  // Make sure a file was uploaded
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }

  const tempFilePath = req.file.path;

  try {
    console.log(`Transcribing file: ${req.file.originalname}`);

    // Send the file to OpenAI Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: "whisper-1",
    });

    console.log("Transcription successful!");

    // Send the transcription text back to the browser
    res.json({ text: transcription.text });
  } catch (err) {
    console.error("OpenAI error:", err.message);
    res.status(500).json({ error: "Transcription failed: " + err.message });
  } finally {
    // Always delete the temp file to keep the server clean
    fs.unlink(tempFilePath, () => {});
  }
});

// ─── Start Server ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
  console.log(`   Make sure OPENAI_API_KEY is set in your environment.`);
});
