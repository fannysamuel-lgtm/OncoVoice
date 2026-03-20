// app.js — Browser-side logic

// ─── Get DOM elements ─────────────────────────────────────────────────────────
const dropZone       = document.getElementById("drop-zone");
const fileInput      = document.getElementById("file-input");
const fileNameEl     = document.getElementById("file-name");
const transcribeBtn  = document.getElementById("transcribe-btn");
const statusEl       = document.getElementById("status");
const statusText     = document.getElementById("status-text");
const resultCard     = document.getElementById("result-card");
const resultText     = document.getElementById("result-text");
const copyBtn        = document.getElementById("copy-btn");
const errorBanner    = document.getElementById("error-banner");
const errorText      = document.getElementById("error-text");

// ─── State ────────────────────────────────────────────────────────────────────
let selectedFile = null;

// ─── Helper: show/hide elements ───────────────────────────────────────────────
function show(el) { el.hidden = false; }
function hide(el) { el.hidden = true; }

// ─── File selection ───────────────────────────────────────────────────────────

// When user picks a file via the button
fileInput.addEventListener("change", () => {
  handleFile(fileInput.files[0]);
});

// Drag-and-drop support
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("drag-over");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  handleFile(e.dataTransfer.files[0]);
});

// Also allow clicking anywhere on the drop zone to open the file picker
dropZone.addEventListener("click", () => fileInput.click());

// Process the selected file
function handleFile(file) {
  if (!file) return;

  if (!file.name.endsWith(".wav")) {
    showError("Please select a .wav file.");
    return;
  }

  selectedFile = file;
  fileNameEl.textContent = `📄 ${file.name} (${formatBytes(file.size)})`;
  transcribeBtn.disabled = false;
  hide(errorBanner);
  hide(resultCard);
}

// ─── Transcription ────────────────────────────────────────────────────────────

transcribeBtn.addEventListener("click", async () => {
  if (!selectedFile) return;

  // Show loader, hide old results
  transcribeBtn.disabled = true;
  show(statusEl);
  hide(resultCard);
  hide(errorBanner);
  statusText.textContent = "Uploading audio…";

  // Build form data
  const formData = new FormData();
  formData.append("audio", selectedFile);

  try {
    statusText.textContent = "Sending to Whisper…";

    const response = await fetch("/transcribe", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Unknown server error.");
    }

    // Display result
    resultText.textContent = data.text;
    show(resultCard);

  } catch (err) {
    showError(err.message);
  } finally {
    hide(statusEl);
    transcribeBtn.disabled = false;
  }
});

// ─── Copy to clipboard ────────────────────────────────────────────────────────

copyBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(resultText.textContent).then(() => {
    copyBtn.textContent = "Copied!";
    setTimeout(() => (copyBtn.textContent = "Copy"), 1800);
  });
});

// ─── Utilities ────────────────────────────────────────────────────────────────

function showError(msg) {
  errorText.textContent = msg;
  show(errorBanner);
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
