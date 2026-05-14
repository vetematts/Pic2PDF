/* global JSZip heic2any */
/* Origami Docs — Convert Image
 * Decode HEIC/JPG/PNG/WebP and re-encode to JPG/PNG/WebP via canvas.
 * HEIC decoding via heic2any (browsers can't read HEIC natively).
 * 100% client-side.
 */

const fileInput = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");
const itemsEl = document.getElementById("items");
const emptyState = document.getElementById("emptyState");
const exportBtn = document.getElementById("exportBtn");
const clearBtn = document.getElementById("clearBtn");
const fileNameInput = document.getElementById("fileNameInput");
const formatSelect = document.getElementById("formatSelect");
const qualityRange = document.getElementById("qualityRange");
const qualityValue = document.getElementById("qualityValue");
const qualityWrap = document.getElementById("qualityWrap");
const maxDimSelect = document.getElementById("maxDimSelect");
const countLabel = document.getElementById("count");
const statusLabel = document.getElementById("status");
const progress = document.getElementById("progress");

const STORAGE_KEY = "origami-convert-image";
const items = []; // { id, file, decodedUrl, width, height, thumbDataUrl, isHeic, originalSize }

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : "i-" + Math.random().toString(36).slice(2);
}

function isHeicFile(file) {
  if (/heic|heif/i.test(file.type)) return true;
  if (/\.(heic|heif)$/i.test(file.name)) return true;
  return false;
}

function setStatus(msg) {
  statusLabel.textContent = msg;
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.format) formatSelect.value = s.format;
    if (s.quality !== undefined) {
      qualityRange.value = String(s.quality);
      qualityValue.textContent = Number(s.quality).toFixed(2);
    }
    if (s.maxDim !== undefined) maxDimSelect.value = String(s.maxDim);
  } catch (_) {}
}

function saveSettings() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        format: formatSelect.value,
        quality: Number(qualityRange.value),
        maxDim: Number(maxDimSelect.value),
      })
    );
  } catch (_) {}
}

function syncQualityVisibility() {
  qualityWrap.style.display = formatSelect.value === "png" ? "none" : "";
}

loadSettings();
syncQualityVisibility();

formatSelect.addEventListener("change", () => {
  syncQualityVisibility();
  saveSettings();
  updateFilenamePlaceholder();
});
qualityRange.addEventListener("input", () => {
  qualityValue.textContent = Number(qualityRange.value).toFixed(2);
});
qualityRange.addEventListener("change", saveSettings);
maxDimSelect.addEventListener("change", saveSettings);

function currentExt() {
  const f = formatSelect.value;
  return f === "jpeg" ? "jpg" : f;
}

function suggestedFilename() {
  const first = items[0];
  if (first) {
    const base = first.file.name.replace(/\.[^.]+$/, "");
    if (items.length === 1) return `${base}.${currentExt()}`;
    return `${base}-converted.zip`;
  }
  return items.length === 1 ? `converted.${currentExt()}` : "converted.zip";
}

function updateFilenamePlaceholder() {
  fileNameInput.placeholder = suggestedFilename();
}

function effectiveFilename() {
  return fileNameInput.value.trim() || suggestedFilename();
}

fileInput.addEventListener("change", (event) => {
  handleFiles(event.target.files);
  fileInput.value = "";
});

["dragenter", "dragover"].forEach((evt) => {
  dropZone.addEventListener(evt, (event) => {
    event.preventDefault();
    dropZone.classList.add("dragover");
  });
});
["dragleave", "drop"].forEach((evt) => {
  dropZone.addEventListener(evt, (event) => {
    if (evt === "drop") event.preventDefault();
    dropZone.classList.remove("dragover");
  });
});
dropZone.addEventListener("drop", (event) => {
  if (event.dataTransfer && event.dataTransfer.files) {
    handleFiles(event.dataTransfer.files);
  }
});

clearBtn.addEventListener("click", () => {
  for (const it of items) {
    if (it.decodedUrl) URL.revokeObjectURL(it.decodedUrl);
  }
  items.length = 0;
  setStatus("");
  render();
});

exportBtn.addEventListener("click", exportImages);

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "e") {
    e.preventDefault();
    if (!exportBtn.disabled) exportImages();
  }
});

async function handleFiles(fileList) {
  const accepted = Array.from(fileList).filter((f) => {
    if (isHeicFile(f)) return true;
    return /^image\/(png|jpeg|webp)$/.test(f.type);
  });
  if (accepted.length === 0) {
    setStatus("Pick HEIC, JPG, PNG, or WebP files.");
    return;
  }
  for (const file of accepted) {
    try {
      setStatus(`Loading ${file.name}…`);
      const decoded = await decodeImage(file);
      items.push({
        id: uid(),
        file,
        decodedUrl: decoded.url,
        width: decoded.width,
        height: decoded.height,
        thumbDataUrl: decoded.thumbDataUrl,
        isHeic: isHeicFile(file),
        originalSize: file.size,
      });
      render();
    } catch (e) {
      console.error(e);
      setStatus(`Skipped ${file.name}: ${e.message || "could not decode"}`);
    }
  }
  setStatus(`${items.length} image${items.length === 1 ? "" : "s"} ready.`);
}

async function decodeImage(file) {
  let usableBlob = file;
  if (isHeicFile(file)) {
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 1 });
    usableBlob = Array.isArray(out) ? out[0] : out;
  }
  const url = URL.createObjectURL(usableBlob);
  const img = await loadImage(url);
  const thumbDataUrl = makeThumb(img);
  return {
    url,
    width: img.naturalWidth,
    height: img.naturalHeight,
    thumbDataUrl,
  };
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("could not load image"));
    img.src = url;
  });
}

function makeThumb(img) {
  const targetW = 220;
  const scale = Math.min(1, targetW / img.naturalWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.7);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function render() {
  emptyState.style.display = items.length ? "none" : "";
  itemsEl.innerHTML = "";

  items.forEach((item) => {
    const tile = document.createElement("div");
    tile.className = "item-tile";
    tile.dataset.id = item.id;

    const thumb = document.createElement("img");
    thumb.className = "item-thumb";
    thumb.alt = item.file.name;
    thumb.src = item.thumbDataUrl;

    const info = document.createElement("div");
    info.className = "item-info";

    const name = document.createElement("div");
    name.className = "item-name";
    name.textContent = item.file.name;
    name.title = item.file.name;

    const meta = document.createElement("div");
    meta.className = "item-meta";
    const heicTag = item.isHeic ? " · HEIC" : "";
    meta.textContent = `${item.width}×${item.height} · ${formatBytes(item.originalSize)}${heicTag}`;

    info.append(name, meta);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "item-remove";
    remove.title = "Skip this image";
    remove.setAttribute("aria-label", `Skip ${item.file.name}`);
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      const i = items.findIndex((x) => x.id === item.id);
      if (i >= 0) {
        if (items[i].decodedUrl) URL.revokeObjectURL(items[i].decodedUrl);
        items.splice(i, 1);
      }
      render();
    });

    tile.append(thumb, info, remove);
    itemsEl.appendChild(tile);
  });

  countLabel.textContent = `${items.length} image${items.length === 1 ? "" : "s"}`;
  exportBtn.disabled = items.length < 1;
  clearBtn.disabled = items.length === 0;
  updateFilenamePlaceholder();
}

function outputMime() {
  const f = formatSelect.value;
  if (f === "jpeg") return "image/jpeg";
  if (f === "webp") return "image/webp";
  return "image/png";
}

async function convertOne(item) {
  const img = await loadImage(item.decodedUrl);
  const maxDim = Number(maxDimSelect.value) || 0;
  let { naturalWidth: width, naturalHeight: height } = img;
  if (maxDim > 0) {
    const longest = Math.max(width, height);
    if (longest > maxDim) {
      const scale = maxDim / longest;
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext("2d");
  const mime = outputMime();
  if (mime === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const quality = Number(qualityRange.value);
  const blob = await canvasToBlob(canvas, mime, mime === "image/png" ? undefined : quality);
  return blob;
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      mime,
      quality
    );
  });
}

function outputNameFor(item) {
  const base = item.file.name.replace(/\.[^.]+$/, "");
  return `${base}.${currentExt()}`;
}

async function exportImages() {
  if (items.length < 1) {
    setStatus("Add an image first.");
    return;
  }
  exportBtn.disabled = true;
  setStatus("Converting…");
  progress.hidden = false;
  progress.value = 0;
  try {
    const results = [];
    for (let i = 0; i < items.length; i++) {
      const blob = await convertOne(items[i]);
      results.push({ blob, item: items[i] });
      progress.value = (i + 1) / items.length;
      setStatus(`${i + 1}/${items.length}…`);
    }

    if (results.length === 1) {
      const r = results[0];
      const filename = effectiveFilename().match(/\.[a-z0-9]+$/i)
        ? effectiveFilename()
        : `${effectiveFilename()}.${currentExt()}`;
      downloadBlob(r.blob, filename);
    } else {
      const zip = new JSZip();
      for (const r of results) {
        zip.file(outputNameFor(r.item), r.blob);
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      let filename = effectiveFilename();
      if (!/\.zip$/i.test(filename)) filename += ".zip";
      downloadBlob(zipBlob, filename);
    }

    const totalIn = items.reduce((sum, x) => sum + x.originalSize, 0);
    const totalOut = results.reduce((sum, r) => sum + r.blob.size, 0);
    setStatus(`Done. ${formatBytes(totalIn)} → ${formatBytes(totalOut)}.`);
  } catch (e) {
    console.error(e);
    setStatus(`Error: ${e.message || e}`);
  } finally {
    progress.hidden = true;
    exportBtn.disabled = items.length < 1;
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
