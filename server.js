'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// ─── App Configuration ────────────────────────────────────────────────────────

const app = express();
const PORT = 3000;

// ─── Multer Setup (in-memory storage for uploaded WAV files) ──────────────────

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.wav') {
      return cb(new Error('Only .wav files are accepted.'));
    }
    cb(null, true);
  },
});

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Dataset Helpers ──────────────────────────────────────────────────────────

/**
 * Reads all .wav files from a folder and returns an array of
 * { file: absoluteFilePath, label: number } objects.
 *
 * @param {string} folderPath - Absolute or relative path to the folder.
 * @param {number} label      - Class label (1 = cancer, 0 = normal).
 * @returns {{ file: string, label: number }[]}
 */
function loadDataset(folderPath, label) {
  const absolutePath = path.resolve(folderPath);

  if (!fs.existsSync(absolutePath)) {
    console.warn(`[WARN] Folder not found, skipping: ${absolutePath}`);
    return [];
  }

  let entries;
  try {
    entries = fs.readdirSync(absolutePath);
  } catch (err) {
    console.error(`[ERROR] Could not read folder "${absolutePath}":`, err.message);
    return [];
  }

  const wavFiles = entries.filter(
    (entry) => path.extname(entry).toLowerCase() === '.wav'
  );

  return wavFiles.map((filename) => ({
    file: path.join(absolutePath, filename),
    label,
  }));
}

// ─── Feature Extraction ───────────────────────────────────────────────────────

/**
 * Extracts a simple numeric feature vector from a WAV file.
 * Currently uses normalised buffer length as the sole feature.
 * Replace / extend this function with real DSP / MFCC features when ready.
 *
 * @param {string} filePath - Absolute path to the .wav file.
 * @returns {Promise<number[]>} Feature vector.
 */
async function extractFeatures(filePath) {
  const buffer = fs.readFileSync(filePath);

  // Feature 0: normalised file size (proxy for recording duration / energy)
  const normalisedLength = buffer.length / 100000;

  // Additional placeholder features derived from raw bytes
  const byteSum = buffer.reduce((acc, byte) => acc + byte, 0);
  const meanByteValue = byteSum / buffer.length / 255; // normalised 0-1
  const maxByte = Math.max(...buffer) / 255;            // normalised 0-1

  return [normalisedLength, meanByteValue, maxByte];
}

// ─── Training Data Preparation ────────────────────────────────────────────────

/**
 * Iterates over every sample in the dataset, extracts features, and
 * returns an array of { input: number[], output: number[] } training records.
 *
 * @param {{ file: string, label: number }[]} dataset
 * @returns {Promise<{ input: number[], output: number[] }[]>}
 */
async function prepareTrainingData(dataset) {
  const trainingData = [];

  for (const sample of dataset) {
    try {
      const features = await extractFeatures(sample.file);
      trainingData.push({
        input: features,
        output: [sample.label],
      });
    } catch (err) {
      console.error(
        `[ERROR] Feature extraction failed for "${sample.file}":`,
        err.message
      );
    }
  }

  return trainingData;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /predict
 * Accepts a single .wav file upload, extracts features, and returns a
 * JSON prediction stub.  Swap the stub with a real model inference call
 * once a trained model is available.
 */
app.post('/predict', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No WAV file uploaded. Use field name "audio".' });
    }

    // Write the in-memory buffer to a temporary file for feature extraction
    const tmpPath = path.join(__dirname, `tmp_${Date.now()}_${req.file.originalname}`);

    try {
      fs.writeFileSync(tmpPath, req.file.buffer);
      const features = await extractFeatures(tmpPath);

      // TODO: pass `features` to a trained model and return a real prediction
      console.log(`[INFO] Extracted features for "${req.file.originalname}":`, features);

      return res.json({
        prediction: 'processing',
        features,          // exposed for debugging / front-end display
        filename: req.file.originalname,
      });
    } finally {
      // Always clean up the temporary file
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    }
  } catch (err) {
    console.error('[ERROR] /predict route:', err.message);
    return res.status(500).json({ error: 'Internal server error during prediction.' });
  }
});

// ─── 404 Fallback ─────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ error: `Route "${req.method} ${req.path}" not found.` });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────

app.use((err, req, res, _next) => {
  console.error('[ERROR] Unhandled exception:', err.message);
  res.status(500).json({ error: err.message || 'Internal server error.' });
});

// ─── Server Bootstrap ─────────────────────────────────────────────────────────

(async () => {
  try {
    // 1. Load datasets
    const onco   = loadDataset(path.join(__dirname, 'data', 'onco'),   1);
    const normal = loadDataset(path.join(__dirname, 'data', 'normal'), 0);
    const dataset = [...onco, ...normal];

    console.log(`Samples loaded: ${dataset.length}`);

    // 2. Prepare training data
    const trainingData = await prepareTrainingData(dataset);
    console.log(`Training samples ready: ${trainingData.length}`);

    // 3. Start the HTTP server
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('[FATAL] Failed to start server:', err.message);
    process.exit(1);
  }
})();
