/* global JSZip */
/* Origami Docs — Favicon Generator
 * One image → favicon.ico + the standard PNG set + HTML snippet, zipped.
 * 100% client-side. Custom ICO writer (PNG-in-ICO, widely supported).
 */

const fileInput = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");
const emptyState = document.getElementById("emptyState");
const exportBtn = document.getElementById("exportBtn");
const clearBtn = document.getElementById("clearBtn");
const fileNameInput = document.getElementById("fileNameInput");
const bgSelect = document.getElementById("bgSelect");
const bgColorWrap = document.getElementById("bgColorWrap");
const bgColor = document.getElementById("bgColor");
const paddingRange = document.getElementById("paddingRange");
const paddingValue = document.getElementById("paddingValue");
const previewWrap = document.getElementById("previewWrap");
const previewGrid = document.getElementById("previewGrid");
const snippetEl = document.getElementById("snippet");
const copySnippet = document.getElementById("copySnippet");
const countLabel = document.getElementById("count");
const statusLabel = document.getElementById("status");
const progress = document.getElementById("progress");

// size -> output filename
const PNG_SIZES = [
  [16, "favicon-16.png"],
  [32, "favicon-32.png"],
  [48, "favicon-48.png"],
  [180, "apple-touch-icon.png"],
  [192, "icon-192.png"],
  [512, "icon-512.png"],
];
const ICO_SIZES = [16, 32, 48];

const SNIPPET = `<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />`;

let sourceImg = null;
let sourceName = "favicon";

snippetEl.textContent = SNIPPET;

function setStatus(msg) {
  statusLabel.textContent = msg;
}

function syncBgFields() {
  bgColorWrap.hidden = bgSelect.value !== "color";
}
syncBgFields();

bgSelect.addEventListener("change", () => {
  syncBgFields();
  if (sourceImg) renderPreview();
});
bgColor.addEventListener("input", () => sourceImg && renderPreview());
paddingRange.addEventListener("input", () => {
  paddingValue.textContent = paddingRange.value;
  if (sourceImg) renderPreview();
});

fileInput.addEventListener("change", (e) => {
  const f = e.target.files && e.target.files[0];
  if (f) loadImage(f);
  fileInput.value = "";
});

["dragenter", "dragover"].forEach((evt) => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });
});
["dragleave", "drop"].forEach((evt) => {
  dropZone.addEventListener(evt, (e) => {
    if (evt === "drop") e.preventDefault();
    dropZone.classList.remove("dragover");
  });
});
dropZone.addEventListener("drop", (e) => {
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) loadImage(f);
});

clearBtn.addEventListener("click", () => {
  sourceImg = null;
  previewWrap.hidden = true;
  previewGrid.innerHTML = "";
  emptyState.style.display = "";
  countLabel.textContent = "No image loaded";
  setStatus("");
  exportBtn.disabled = true;
  clearBtn.disabled = true;
});

exportBtn.addEventListener("click", exportSet);

copySnippet.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(SNIPPET);
    copySnippet.textContent = "Copied";
    setTimeout(() => (copySnippet.textContent = "Copy"), 1500);
  } catch (_) {
    setStatus("Clipboard blocked — select the snippet manually.");
  }
});

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "e") {
    e.preventDefault();
    if (!exportBtn.disabled) exportSet();
  }
});

function loadImage(file) {
  if (!/^image\//.test(file.type)) {
    setStatus("Pick an image file.");
    return;
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    sourceImg = img;
    sourceName = file.name.replace(/\.[^.]+$/, "") || "favicon";
    emptyState.style.display = "none";
    exportBtn.disabled = false;
    clearBtn.disabled = false;
    countLabel.textContent = `${img.naturalWidth}×${img.naturalHeight} source`;
    setStatus("");
    renderPreview();
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    setStatus("Could not load that image.");
  };
  img.src = url;
}

function drawSize(size) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (bgSelect.value === "color") {
    ctx.fillStyle = bgColor.value;
    ctx.fillRect(0, 0, size, size);
  }
  const pad = Math.round((size * Number(paddingRange.value)) / 100);
  const box = size - pad * 2;
  const ar = sourceImg.naturalWidth / sourceImg.naturalHeight;
  let dw = box;
  let dh = box;
  if (ar > 1) dh = box / ar;
  else dw = box * ar;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(sourceImg, (size - dw) / 2, (size - dh) / 2, dw, dh);
  return canvas;
}

function renderPreview() {
  previewWrap.hidden = false;
  previewGrid.innerHTML = "";
  for (const [size, name] of PNG_SIZES) {
    const cell = document.createElement("div");
    cell.className = "preview-cell";
    const canvas = drawSize(size);
    canvas.className = "preview-img";
    const cap = document.createElement("span");
    cap.className = "preview-cap";
    cap.textContent = `${size}px`;
    cell.title = name;
    cell.append(canvas, cap);
    previewGrid.appendChild(cell);
  }
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/png"
    );
  });
}

async function buildIco(entries) {
  // entries: [{ size, bytes: Uint8Array(png) }]
  const count = entries.length;
  const head = new ArrayBuffer(6 + count * 16);
  const dv = new DataView(head);
  dv.setUint16(0, 0, true);
  dv.setUint16(2, 1, true);
  dv.setUint16(4, count, true);
  let offset = 6 + count * 16;
  for (let i = 0; i < count; i++) {
    const e = entries[i];
    const base = 6 + i * 16;
    dv.setUint8(base, e.size >= 256 ? 0 : e.size);
    dv.setUint8(base + 1, e.size >= 256 ? 0 : e.size);
    dv.setUint8(base + 2, 0);
    dv.setUint8(base + 3, 0);
    dv.setUint16(base + 4, 1, true);
    dv.setUint16(base + 6, 32, true);
    dv.setUint32(base + 8, e.bytes.byteLength, true);
    dv.setUint32(base + 12, offset, true);
    offset += e.bytes.byteLength;
  }
  return new Blob([head, ...entries.map((e) => e.bytes)], {
    type: "image/x-icon",
  });
}

async function exportSet() {
  if (!sourceImg) {
    setStatus("Add an image first.");
    return;
  }
  exportBtn.disabled = true;
  setStatus("Generating…");
  progress.hidden = false;
  progress.value = 0;
  try {
    const zip = new JSZip();
    let step = 0;
    const totalSteps = PNG_SIZES.length + ICO_SIZES.length + 1;

    for (const [size, name] of PNG_SIZES) {
      const blob = await canvasToBlob(drawSize(size));
      zip.file(name, blob);
      step += 1;
      progress.value = step / totalSteps;
    }

    const icoEntries = [];
    for (const size of ICO_SIZES) {
      const blob = await canvasToBlob(drawSize(size));
      icoEntries.push({ size, bytes: new Uint8Array(await blob.arrayBuffer()) });
      step += 1;
      progress.value = step / totalSteps;
    }
    const ico = await buildIco(icoEntries);
    zip.file("favicon.ico", ico);
    zip.file("snippet.html", SNIPPET + "\n");

    const zipBlob = await zip.generateAsync({ type: "blob" });
    let fname = fileNameInput.value.trim() || `${sourceName}-favicons.zip`;
    if (!/\.zip$/i.test(fname)) fname += ".zip";
    downloadBlob(zipBlob, fname);
    setStatus(`Done — ${PNG_SIZES.length} PNGs + favicon.ico + snippet.`);
  } catch (e) {
    console.error(e);
    setStatus(`Error: ${e.message || e}`);
  } finally {
    progress.hidden = true;
    exportBtn.disabled = false;
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("../../sw.js").catch(() => {});
  });
}
