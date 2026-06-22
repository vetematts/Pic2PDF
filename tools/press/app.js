/* global JSZip heic2any */
/* Origami Docs — Press
 * One image: crop + convert + compress. Multiple images: batch convert + compress.
 */

const fileInput    = document.getElementById("fileInput");
const dropZone     = document.getElementById("dropZone");
const emptyState   = document.getElementById("emptyState");
const stage        = document.getElementById("stage");
const cropImgEl    = document.getElementById("cropImg");
const cropBox      = document.getElementById("cropBox");
const ratioRow     = document.getElementById("ratioRow");
const ratioSelect  = document.getElementById("ratioSelect");
const itemsEl      = document.getElementById("items");
const formatSelect = document.getElementById("formatSelect");
const qualityRange = document.getElementById("qualityRange");
const qualityValue = document.getElementById("qualityValue");
const qualityWrap  = document.getElementById("qualityWrap");
const maxDimSelect = document.getElementById("maxDimSelect");
const fileNameInput = document.getElementById("fileNameInput");
const resetBtn     = document.getElementById("resetBtn");
const exportBtn    = document.getElementById("exportBtn");
const clearBtn     = document.getElementById("clearBtn");
const countLabel   = document.getElementById("count");
const statusLabel  = document.getElementById("status");
const progress     = document.getElementById("progress");

const MIN_CROP = 16;
const items = []; // { id, file, decodedUrl, width, height, thumbDataUrl, isHeic, originalSize }
let cropImg = null;
let srcType = "image/png";
let sourceName = "press";
let natW = 0, natH = 0, cropScale = 1;
let crop = { x: 0, y: 0, w: 0, h: 0 };
let drag = null;

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : "i-" + Math.random().toString(36).slice(2);
}

function setStatus(msg) { statusLabel.textContent = msg; }

function isHeicFile(f) {
  return /heic|heif/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);
}

// ── Settings ──────────────────────────────────────────────────────────────

const STORAGE_KEY = "origami-press";

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (s.format) formatSelect.value = s.format;
    if (s.quality != null) {
      qualityRange.value = String(s.quality);
      qualityValue.textContent = Number(s.quality).toFixed(2);
    }
    if (s.maxDim != null) maxDimSelect.value = String(s.maxDim);
  } catch (_) {}
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      format: formatSelect.value,
      quality: Number(qualityRange.value),
      maxDim: Number(maxDimSelect.value),
    }));
  } catch (_) {}
}

function syncQualityVisibility() {
  const f = formatSelect.value;
  const isPng = f === "png" || (f === "auto" && srcType === "image/png");
  qualityWrap.style.display = isPng ? "none" : "";
}

loadSettings();
syncQualityVisibility();

formatSelect.addEventListener("change", () => { syncQualityVisibility(); saveSettings(); updateFilenamePlaceholder(); });
qualityRange.addEventListener("input",  () => { qualityValue.textContent = Number(qualityRange.value).toFixed(2); });
qualityRange.addEventListener("change", saveSettings);
maxDimSelect.addEventListener("change", saveSettings);
ratioSelect.addEventListener("change",  () => { if (cropImg) applyRatioToCrop(); });

// ── File input ────────────────────────────────────────────────────────────

fileInput.addEventListener("change", (e) => { handleFiles(e.target.files); fileInput.value = ""; });

["dragenter", "dragover"].forEach((evt) =>
  dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.add("dragover"); })
);
["dragleave", "drop"].forEach((evt) =>
  dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.remove("dragover"); })
);
dropZone.addEventListener("drop", (e) => { if (e.dataTransfer?.files) handleFiles(e.dataTransfer.files); });
dropZone.addEventListener("click", (e) => { if (!e.target.closest("button,input,select,label")) fileInput.click(); });

clearBtn.addEventListener("click", () => {
  for (const it of items) if (it.decodedUrl) URL.revokeObjectURL(it.decodedUrl);
  items.length = 0;
  cropImg = null;
  setStatus("");
  render();
});

resetBtn.addEventListener("click", () => {
  if (cropImg) { resetCrop(); layout(); }
});

exportBtn.addEventListener("click", () => {
  if (items.length === 1) exportSingle();
  else exportBatch();
});

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "e") {
    e.preventDefault();
    if (!exportBtn.disabled) exportBtn.click();
  }
});

window.addEventListener("resize", () => {
  if (items.length === 1 && cropImg) { measureScale(); layout(); }
});

async function handleFiles(fileList) {
  const accepted = Array.from(fileList).filter(
    (f) => isHeicFile(f) || /^image\/(png|jpeg|webp)$/.test(f.type)
  );
  if (!accepted.length) { setStatus("Pick JPG, PNG, WebP, or HEIC files."); return; }

  setStatus("Loading…");
  for (const file of accepted) {
    try {
      const decoded = await decodeImage(file);
      items.push({
        id: uid(), file,
        decodedUrl: decoded.url,
        width: decoded.width, height: decoded.height,
        thumbDataUrl: decoded.thumbDataUrl,
        isHeic: isHeicFile(file),
        originalSize: file.size,
      });
    } catch (e) {
      setStatus(`Skipped ${file.name}: ${e.message || "could not decode"}`);
    }
  }
  render();
  setStatus(`${items.length} image${items.length === 1 ? "" : "s"} ready.`);
}

async function decodeImage(file) {
  let blob = file;
  if (isHeicFile(file)) {
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 1 });
    blob = Array.isArray(out) ? out[0] : out;
  }
  const url = URL.createObjectURL(blob);
  const img = await loadImageEl(url);
  return { url, width: img.naturalWidth, height: img.naturalHeight, thumbDataUrl: makeThumb(img) };
}

function loadImageEl(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("could not load image"));
    img.src = url;
  });
}

function makeThumb(img) {
  const s = Math.min(1, 220 / img.naturalWidth);
  const c = document.createElement("canvas");
  c.width  = Math.max(1, Math.round(img.naturalWidth * s));
  c.height = Math.max(1, Math.round(img.naturalHeight * s));
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.7);
}

// ── Render ────────────────────────────────────────────────────────────────

function render() {
  const n = items.length;
  emptyState.hidden  = n > 0;
  exportBtn.disabled = n === 0;
  clearBtn.disabled  = n === 0;

  if (n === 1) {
    ratioRow.hidden  = false;
    resetBtn.hidden  = false;
    resetBtn.disabled = false;
    itemsEl.hidden   = true;
    itemsEl.innerHTML = "";
    stage.hidden     = false;
    activateCrop(items[0]);
  } else {
    ratioRow.hidden  = true;
    resetBtn.hidden  = true;
    stage.hidden     = true;
    cropImg          = null;
    renderBatch();
  }

  updateFilenamePlaceholder();
}

function renderBatch() {
  itemsEl.hidden = items.length === 0;
  itemsEl.innerHTML = "";
  for (const item of items) {
    const tile   = document.createElement("div");
    tile.className = "item-tile";

    const thumb  = document.createElement("img");
    thumb.className = "item-thumb";
    thumb.src    = item.thumbDataUrl;
    thumb.alt    = item.file.name;

    const info   = document.createElement("div");
    info.className = "item-info";

    const name   = document.createElement("div");
    name.className = "item-name";
    name.textContent = item.file.name;
    name.title   = item.file.name;

    const meta   = document.createElement("div");
    meta.className = "item-meta";
    meta.textContent = `${item.width}×${item.height} · ${formatBytes(item.originalSize)}${item.isHeic ? " · HEIC" : ""}`;

    info.append(name, meta);

    const remove = document.createElement("button");
    remove.type  = "button";
    remove.className = "item-remove";
    remove.title = "Remove";
    remove.setAttribute("aria-label", `Remove ${item.file.name}`);
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      const idx = items.findIndex((x) => x.id === item.id);
      if (idx >= 0) {
        if (items[idx].decodedUrl) URL.revokeObjectURL(items[idx].decodedUrl);
        items.splice(idx, 1);
      }
      render();
    });

    tile.append(thumb, info, remove);
    itemsEl.appendChild(tile);
  }

  countLabel.textContent = items.length === 0
    ? "No images loaded"
    : `${items.length} image${items.length === 1 ? "" : "s"}`;
}

// ── Crop (single image) ───────────────────────────────────────────────────

function activateCrop(item) {
  srcType    = item.file.type || "image/jpeg";
  sourceName = item.file.name.replace(/\.[^.]+$/, "") || "press";
  cropImgEl.src = item.decodedUrl;
  syncQualityVisibility();
  requestAnimationFrame(() => {
    cropImg = cropImgEl;
    natW    = item.width;
    natH    = item.height;
    measureScale();
    resetCrop();
    layout();
  });
}

function measureScale() {
  cropScale = (cropImgEl.clientWidth || natW) / natW;
}

function ratioValue() {
  const r = ratioSelect.value;
  if (r === "free") return null;
  const [a, b] = r.split(":").map(Number);
  return a / b;
}

function resetCrop() {
  const ratio = ratioValue();
  if (ratio == null) {
    crop = {
      x: Math.round(natW * 0.1), y: Math.round(natH * 0.1),
      w: Math.round(natW * 0.8), h: Math.round(natH * 0.8),
    };
  } else {
    let w = natW, h = w / ratio;
    if (h > natH) { h = natH; w = h * ratio; }
    crop = {
      x: Math.round((natW - w) / 2), y: Math.round((natH - h) / 2),
      w: Math.round(w), h: Math.round(h),
    };
  }
}

function applyRatioToCrop() {
  const ratio = ratioValue();
  if (ratio == null) { layout(); return; }
  const cx = crop.x + crop.w / 2, cy = crop.y + crop.h / 2;
  let w = crop.w, h = w / ratio;
  if (h > crop.h) { h = crop.h; w = h * ratio; }
  crop.w = Math.round(w); crop.h = Math.round(h);
  crop.x = Math.round(cx - crop.w / 2); crop.y = Math.round(cy - crop.h / 2);
  clampCrop(); layout();
}

function clampCrop() {
  crop.w = Math.max(MIN_CROP, Math.min(crop.w, natW));
  crop.h = Math.max(MIN_CROP, Math.min(crop.h, natH));
  crop.x = Math.max(0, Math.min(crop.x, natW - crop.w));
  crop.y = Math.max(0, Math.min(crop.y, natH - crop.h));
}

function layout() {
  cropBox.style.left   = `${crop.x * cropScale}px`;
  cropBox.style.top    = `${crop.y * cropScale}px`;
  cropBox.style.width  = `${crop.w * cropScale}px`;
  cropBox.style.height = `${crop.h * cropScale}px`;
  countLabel.textContent = `${Math.round(crop.w)} × ${Math.round(crop.h)} px`;
}

cropBox.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  const handle = e.target.classList.contains("handle")
    ? [...e.target.classList].find((c) => c !== "handle") : null;
  drag = { mode: handle ? "resize" : "move", handle, start: pointerNatural(e), orig: { ...crop } };
  cropBox.setPointerCapture(e.pointerId);
});

cropBox.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const p = pointerNatural(e);
  const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
  const o = drag.orig, ratio = ratioValue();

  if (drag.mode === "move") {
    crop.x = o.x + dx; crop.y = o.y + dy;
    clampCrop(); layout(); return;
  }

  let { x, y, w, h } = o;
  const hh = drag.handle;
  if (hh.includes("e")) w = o.w + dx;
  if (hh.includes("s")) h = o.h + dy;
  if (hh.includes("w")) { w = o.w - dx; x = o.x + dx; }
  if (hh.includes("n")) { h = o.h - dy; y = o.y + dy; }

  if (ratio != null) {
    if (hh === "e" || hh === "w" || hh.includes("e") || hh.includes("w")) {
      h = w / ratio;
      if (hh.includes("n")) y = o.y + (o.h - h);
    } else {
      w = h * ratio;
      if (hh.includes("w")) x = o.x + (o.w - w);
    }
  }

  if (w >= MIN_CROP) { crop.w = w; crop.x = x; }
  if (h >= MIN_CROP) { crop.h = h; crop.y = y; }
  clampCrop(); layout();
});

cropBox.addEventListener("pointerup",     () => { drag = null; });
cropBox.addEventListener("pointercancel", () => { drag = null; });

function pointerNatural(e) {
  const rect = cropImgEl.getBoundingClientRect();
  return { x: (e.clientX - rect.left) / cropScale, y: (e.clientY - rect.top) / cropScale };
}

// ── Export ────────────────────────────────────────────────────────────────

function outputMime(originalMime) {
  const f = formatSelect.value;
  if (f === "jpeg") return "image/jpeg";
  if (f === "png")  return "image/png";
  if (f === "webp") return "image/webp";
  return originalMime || "image/jpeg";
}

function outputExt(mime) {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  return "png";
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((res, rej) =>
    canvas.toBlob(
      (b) => b ? res(b) : rej(new Error("toBlob failed")),
      mime,
      mime === "image/png" ? undefined : quality
    )
  );
}

function drawToCanvas(img, sx, sy, sw, sh, outW, outH, mime) {
  const canvas = document.createElement("canvas");
  canvas.width  = Math.max(1, outW);
  canvas.height = Math.max(1, outH);
  const ctx = canvas.getContext("2d");
  if (mime === "image/jpeg") { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, outW, outH); }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
  return canvas;
}

async function exportSingle() {
  if (!crop.w || !crop.h) { setStatus("Image not ready yet."); return; }
  const item = items[0];
  exportBtn.disabled = true;
  setStatus("Processing…");
  try {
    const img     = await loadImageEl(item.decodedUrl);
    const mime    = outputMime(item.file.type);
    const quality = Number(qualityRange.value);
    const maxDim  = Number(maxDimSelect.value) || 0;
    const cw = Math.round(crop.w), ch = Math.round(crop.h);

    let outW = cw, outH = ch;
    if (maxDim > 0) {
      const longest = Math.max(outW, outH);
      if (longest > maxDim) {
        const s = maxDim / longest;
        outW = Math.round(outW * s);
        outH = Math.round(outH * s);
      }
    }

    const canvas = drawToCanvas(img, Math.round(crop.x), Math.round(crop.y), cw, ch, outW, outH, mime);
    const blob   = await canvasToBlob(canvas, mime, quality);
    const ext    = outputExt(mime);
    let name     = fileNameInput.value.trim() || `${sourceName}.${ext}`;
    if (!/\.[a-z0-9]+$/i.test(name)) name += `.${ext}`;
    downloadBlob(blob, name);
    setStatus(`Done — ${outW}×${outH} ${ext.toUpperCase()}.`);
  } catch (e) {
    console.error(e); setStatus(`Error: ${e.message || e}`);
  } finally {
    exportBtn.disabled = false;
  }
}

async function exportBatch() {
  exportBtn.disabled = true;
  progress.hidden    = false;
  progress.value     = 0;
  setStatus("Processing…");
  try {
    const quality = Number(qualityRange.value);
    const maxDim  = Number(maxDimSelect.value) || 0;
    const results = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const img  = await loadImageEl(item.decodedUrl);
      const mime = outputMime(item.file.type);
      let w = img.naturalWidth, h = img.naturalHeight;
      if (maxDim > 0) {
        const longest = Math.max(w, h);
        if (longest > maxDim) { const s = maxDim / longest; w = Math.round(w * s); h = Math.round(h * s); }
      }
      const canvas = drawToCanvas(img, 0, 0, img.naturalWidth, img.naturalHeight, w, h, mime);
      const blob   = await canvasToBlob(canvas, mime, quality);
      const ext    = outputExt(mime);
      results.push({ blob, name: `${item.file.name.replace(/\.[^.]+$/, "")}.${ext}` });
      progress.value = (i + 1) / items.length;
    }

    if (results.length === 1) {
      const r    = results[0];
      let name   = fileNameInput.value.trim() || r.name;
      if (!/\.[a-z0-9]+$/i.test(name)) name += "." + r.name.split(".").pop();
      downloadBlob(r.blob, name);
    } else {
      const zip = new JSZip();
      for (const r of results) zip.file(r.name, r.blob);
      const zipBlob = await zip.generateAsync({ type: "blob" });
      let name = fileNameInput.value.trim() || "press.zip";
      if (!/\.zip$/i.test(name)) name += ".zip";
      downloadBlob(zipBlob, name);
    }

    const totalIn  = items.reduce((s, x) => s + x.originalSize, 0);
    const totalOut = results.reduce((s, r) => s + r.blob.size, 0);
    const pct = Math.max(0, Math.round(((totalIn - totalOut) / totalIn) * 100));
    setStatus(`Done — ${results.length} image${results.length === 1 ? "" : "s"}${pct > 0 ? `, saved ${pct}%` : ""}.`);
  } catch (e) {
    console.error(e); setStatus(`Error: ${e.message || e}`);
  } finally {
    progress.hidden    = true;
    exportBtn.disabled = false;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (bytes < 1024)    return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function updateFilenamePlaceholder() {
  if (!items.length) { fileNameInput.placeholder = "press.zip"; return; }
  if (items.length === 1) {
    const ext = outputExt(outputMime(items[0].file.type));
    fileNameInput.placeholder = `${items[0].file.name.replace(/\.[^.]+$/, "")}.${ext}`;
  } else {
    fileNameInput.placeholder = "press.zip";
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("../../sw.js").catch(() => {}));
}
