'use strict';

const express  = require('express');
const fs       = require('fs');
const path     = require('path');
const multer   = require('multer');
const synaptic = require('synaptic');

const { Architect, Trainer } = synaptic;

// ─── App & Neural Network Setup ───────────────────────────────────────────────

const app  = express();
const PORT = 3000;

// 3 inputs (features) → hidden layer of 3 → 1 output (0 or 1)
const net     = new Architect.Perceptron(3, 3, 1);
const trainer = new Trainer(net);

// ─── Multer (in-memory WAV uploads) ──────────────────────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== '.wav') {
      return cb(new Error('Only .wav files are accepted.'));
    }
    cb(null, true);
  },
});

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Dataset Loading ──────────────────────────────────────────────────────────

/**
 * Reads all .wav files from a folder and returns labelled records.
 * @param {string} folderPath
 * @param {number} label  1 = cancer, 0 = normal
 * @returns {{ file: string, label: number }[]}
 */
function loadDataset(folderPath, label) {
  const absPath = path.resolve(folderPath);

  if (!fs.existsSync(absPath)) {
    console.warn(`[WARN] Folder not found, skipping: ${absPath}`);
    return [];
  }

  try {
    return fs
      .readdirSync(absPath)
      .filter((f) => path.extname(f).toLowerCase() === '.wav')
      .map((f) => ({ file: path.join(absPath, f), label }));
  } catch (err) {
    console.error(`[ERROR] Could not read folder "${absPath}":`, err.message);
    return [];
  }
}

// ─── Feature Extraction ───────────────────────────────────────────────────────

/**
 * Extracts a normalised numeric feature vector from a WAV file.
 * All values clamped to [0, 1] for stable training.
 *
 * FIX: Replaced Math.max(...buffer) — which spreads thousands of bytes as
 * function arguments and overflows the call stack — with an iterative loop.
 * Same fix applied to byteSum so large files don't cause issues there either.
 *
 * @param {string} filePath
 * @returns {Promise<number[]>}
 */
async function extractFeatures(filePath) {
  const buffer = fs.readFileSync(filePath);

  const clamp = (v) => Math.min(1, Math.max(0, v));

  const normLength = clamp(buffer.length / 100000);

  // ✅ FIX: Use iterative loop instead of Math.max(...buffer) and buffer.reduce()
  // Math.max(...buffer) and reduce() with spread both blow the call stack
  // for large WAV files with thousands of bytes.
  let byteSum = 0;
  let maxByte = 0;
  for (let i = 0; i < buffer.length; i++) {
    byteSum += buffer[i];
    if (buffer[i] > maxByte) maxByte = buffer[i];
  }

  const meanByte = clamp(byteSum / buffer.length / 255);
  const maxByteNorm = clamp(maxByte / 255);

  return [normLength, meanByte, maxByteNorm];
}

// ─── Training Data Preparation ────────────────────────────────────────────────

/**
 * Builds the synaptic trainer-compatible training array.
 * @param {{ file: string, label: number }[]} dataset
 * @returns {Promise<{ input: number[], output: number[] }[]>}
 */
async function prepareTrainingData(dataset) {
  const trainingData = [];

  for (const sample of dataset) {
    try {
      const features = await extractFeatures(sample.file);
      trainingData.push({
        input:  features,
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
 * Accepts a WAV upload (field name: "audio"), runs it through the trained
 * neural network, and returns a classification result.
 */
app.post('/predict', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ error: 'No WAV file uploaded. Use field name "audio".' });
    }

    const tmpPath = path.join(
      __dirname,
      `tmp_${Date.now()}_${req.file.originalname}`
    );

    try {
      fs.writeFileSync(tmpPath, req.file.buffer);
      const features = await extractFeatures(tmpPath);
      const result   = net.activate(features);   // synaptic uses .activate()
      const score    = result[0];

      return res.json({
        prediction: score > 0.5 ? 'Cancer Detected' : 'Normal Voice',
        confidence: parseFloat(score.toFixed(4)),
      });
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    }
  } catch (err) {
    console.error('[ERROR] /predict:', err.message);
    return res.status(500).json({ error: 'Prediction failed: ' + err.message });
  }
});

// ─── 404 Fallback ─────────────────────────────────────────────────────────────

app.use((req, res) => {
  res
    .status(404)
    .json({ error: `Route "${req.method} ${req.path}" not found.` });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  console.error('[ERROR] Unhandled:', err.message);
  res.status(500).json({ error: err.message || 'Internal server error.' });
});

// ─── Bootstrap ────────────────────────────────────────────────────────────────

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

    // 3. Train (only if samples exist)
    if (trainingData.length > 0) {
      console.log('Training started...');
      trainer.train(trainingData, {
        rate:       0.1,
        iterations: 2000,
        error:      0.005,
        log:        200,          // print error every 200 iterations
        shuffle:    true,
      });
      console.log('Training completed.');
    } else {
      console.warn(
        '[WARN] No training samples found. ' +
        'Add WAV files to data/onco and data/normal, then restart.'
      );
    }

    // 4. Start HTTP server
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('[FATAL] Server failed to start:', err.message);
    process.exit(1);
  }
})();
