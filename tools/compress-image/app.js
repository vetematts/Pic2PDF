/* global JSZip */
/* Origami Docs — Compress Image
 * Re-encode and resize JPG / PNG / WebP files via canvas. 100% client-side.
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
const maxDimSelect = document.getElementById("maxDimSelect");
const countLabel = document.getElementById("count");
const statusLabel = document.getElementById("status");
const progress = document.getElementById("progress");

const STORAGE_KEY = "origami-compress-image";
const items = []; // { id, file, width, height, thumbDataUrl, originalSize }

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : "i-" + Math.random().toString(36).slice(2);
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

loadSettings();

formatSelect.addEventListener("change", saveSettings);
qualityRange.addEventListener("input", () => {
  qualityValue.textContent = Number(qualityRange.value).toFixed(2);
});
qualityRange.addEventListener("change", saveSettings);
maxDimSelect.addEventListener("change", saveSettings);

function suggestedFilename() {
  const first = items[0];
  if (first) {
    const base = first.file.name.replace(/\.[^.]+$/, "");
    if (items.length === 1) return `${base}-compressed.${outputExt(first.file.type)}`;
    return `${base}-compressed.zip`;
  }
  return items.length === 1 ? "compressed.jpg" : "compressed.zip";
}

function updateFilenamePlaceholder() {
  fileNameInput.placeholder = suggestedFilename();
}

function effectiveFilename() {
  return fileNameInput.value.trim() || suggestedFilename();
}

function outputExt(originalMime) {
  const f = formatSelect.value;
  if (f === "jpeg") return "jpg";
  if (f === "webp" || f === "png") return f;
  // auto: keep original
  if (originalMime === "image/jpeg") return "jpg";
  if (originalMime === "image/png") return "png";
  if (originalMime === "image/webp") return "webp";
  return "jpg";
}

function outputMime(originalMime) {
  const f = formatSelect.value;
  if (f === "jpeg") return "image/jpeg";
  if (f === "webp") return "image/webp";
  if (f === "png") return "image/png";
  return originalMime || "image/jpeg";
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

formatSelect.addEventListener("change", updateFilenamePlaceholder);

async function handleFiles(fileList) {
  const accepted = Array.from(fileList).filter((f) =>
    /^image\/(png|jpeg|webp)$/.test(f.type)
  );
  if (accepted.length === 0) {
    setStatus("Pick JPG, PNG, or WebP files.");
    return;
  }
  setStatus(`Loading ${accepted.length} image${accepted.length === 1 ? "" : "s"}…`);
  for (const file of accepted) {
    try {
      const meta = await readImageMeta(file);
      items.push({
        id: uid(),
        file,
        width: meta.width,
        height: meta.height,
        thumbDataUrl: meta.thumbDataUrl,
        originalSize: file.size,
      });
    } catch (e) {
      console.error(e);
      setStatus(`Skipped ${file.name}: ${e.message || "could not read"}`);
    }
  }
  render();
  setStatus(`${items.length} image${items.length === 1 ? "" : "s"} ready.`);
}

function readImageMeta(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const targetW = 220;
      const scale = Math.min(1, targetW / img.naturalWidth);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const thumbDataUrl = canvas.toDataURL("image/jpeg", 0.7);
      URL.revokeObjectURL(url);
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight,
        thumbDataUrl,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("invalid image"));
    };
    img.src = url;
  });
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function render() {
  emptyState.style.display = items.length ? "none" : "";
  itemsEl.innerHTML = "";

  items.forEach((item, idx) => {
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
    meta.textContent = `${item.width}×${item.height} · ${formatBytes(item.originalSize)}`;

    info.append(name, meta);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "item-remove";
    remove.title = "Skip this image";
    remove.setAttribute("aria-label", `Skip ${item.file.name}`);
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      const i = items.findIndex((x) => x.id === item.id);
      if (i >= 0) items.splice(i, 1);
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

async function compressOne(item) {
  const url = URL.createObjectURL(item.file);
  try {
    const img = await loadImage(url);
    const maxDim = Number(maxDimSelect.value) || 0;
    let { width, height } = img;
    if (width > 0 && height > 0 && maxDim > 0) {
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

    const mime = outputMime(item.file.type);
    if (mime === "image/jpeg") {
      // Flatten transparency onto white for JPG
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const quality = Number(qualityRange.value);
    const blob = await canvasToBlob(canvas, mime, mime === "image/png" ? undefined : quality);
    return { blob, mime };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("could not load image"));
    img.src = url;
  });
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

function outputNameFor(item, idx, ext) {
  const base = item.file.name.replace(/\.[^.]+$/, "");
  return `${base}.${ext}`;
}

async function exportImages() {
  if (items.length < 1) {
    setStatus("Add an image first.");
    return;
  }
  exportBtn.disabled = true;
  setStatus("Compressing…");
  progress.hidden = false;
  progress.value = 0;
  try {
    const results = [];
    for (let i = 0; i < items.length; i++) {
      const { blob, mime } = await compressOne(items[i]);
      results.push({ blob, item: items[i] });
      progress.value = (i + 1) / items.length;
      const saved = items[i].originalSize - blob.size;
      const pct = Math.max(0, Math.round((saved / items[i].originalSize) * 100));
      setStatus(`${i + 1}/${items.length} · saved ${pct}% on average so far`);
    }

    if (results.length === 1) {
      const r = results[0];
      const ext = outputExt(r.item.file.type);
      const filename = effectiveFilename().match(/\.[a-z0-9]+$/i)
        ? effectiveFilename()
        : `${effectiveFilename()}.${ext}`;
      downloadBlob(r.blob, filename);
    } else {
      const zip = new JSZip();
      for (const r of results) {
        const ext = outputExt(r.item.file.type);
        zip.file(outputNameFor(r.item, 0, ext), r.blob);
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      let filename = effectiveFilename();
      if (!/\.zip$/i.test(filename)) filename += ".zip";
      downloadBlob(zipBlob, filename);
    }

    const totalIn = items.reduce((sum, x) => sum + x.originalSize, 0);
    const totalOut = results.reduce((sum, r) => sum + r.blob.size, 0);
    const savedPct = Math.max(0, Math.round(((totalIn - totalOut) / totalIn) * 100));
    setStatus(
      `Done. ${formatBytes(totalIn)} → ${formatBytes(totalOut)} (saved ${savedPct}%).`
    );
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
