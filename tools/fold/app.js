/* global PDFLib pdfjsLib */
pdfjsLib.GlobalWorkerOptions.workerSrc = "../../shared/vendor/pdfjs/pdf.worker.min.js";

const fileInput    = document.getElementById("fileInput");
const dropZone     = document.getElementById("dropZone");
const grid         = document.getElementById("grid");
const emptyState   = document.getElementById("emptyState");
const exportBtn    = document.getElementById("exportBtn");
const clearBtn     = document.getElementById("clearBtn");
const fileNameInput = document.getElementById("fileNameInput");
const advancedToggle = document.getElementById("advancedToggle");
const controls     = document.getElementById("controls");
const advancedPanel = document.querySelector(".controls-advanced");
const countLabel   = document.getElementById("count");
const statusLabel  = document.getElementById("status");
const progress     = document.getElementById("progress");
const pageSizeSelect = document.getElementById("pageSize");
const fitModeSelect  = document.getElementById("fitMode");
const marginSelect   = document.getElementById("margin");
const pageBgInput    = document.getElementById("pageBg");
const downscaleSelect = document.getElementById("downscale");
const qualityRange   = document.getElementById("quality");
const qualityValue   = document.getElementById("qualityValue");

const STORAGE_KEY = "fold-settings";
const items = [];
const sources = new Map(); // sourceKey -> { fileName, pdfLibDoc, pdfjsDoc }
let dragId = null;

loadSettings();

// ── Settings ──────────────────────────────────────────────────────────────────

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (s.pageSize)  pageSizeSelect.value  = s.pageSize;
    if (s.fitMode)   fitModeSelect.value   = s.fitMode;
    if (s.margin !== undefined) marginSelect.value = String(s.margin);
    if (s.pageBg)    pageBgInput.value     = s.pageBg;
    if (s.downscale !== undefined) downscaleSelect.value = String(s.downscale);
    if (s.quality !== undefined) {
      qualityRange.value = String(s.quality);
      qualityValue.textContent = Number(s.quality).toFixed(2);
    }
  } catch (_) {}
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      pageSize:  pageSizeSelect.value,
      fitMode:   fitModeSelect.value,
      margin:    Number(marginSelect.value),
      pageBg:    pageBgInput.value,
      downscale: Number(downscaleSelect.value) || 0,
      quality:   Number(qualityRange.value),
    }));
  } catch (_) {}
}

[pageSizeSelect, fitModeSelect, marginSelect, pageBgInput, downscaleSelect].forEach(
  (el) => el.addEventListener("change", saveSettings)
);
qualityRange.addEventListener("input", () => {
  qualityValue.textContent = Number(qualityRange.value).toFixed(2);
});
qualityRange.addEventListener("change", saveSettings);

// ── Advanced panel ────────────────────────────────────────────────────────────

advancedToggle.addEventListener("click", () => {
  const open = controls.classList.contains("advanced-on");
  if (open) {
    const h = advancedPanel.getBoundingClientRect().height;
    advancedPanel.style.height = `${h}px`;
    requestAnimationFrame(() => {
      controls.classList.remove("advanced-on");
      advancedPanel.style.height = "0px";
    });
    advancedToggle.textContent = "Advanced";
    advancedToggle.setAttribute("aria-expanded", "false");
  } else {
    controls.classList.add("advanced-on");
    advancedToggle.textContent = "Hide advanced";
    advancedToggle.setAttribute("aria-expanded", "true");
    advancedPanel.style.height = advancedPanel.scrollHeight + "px";
    const onEnd = (e) => {
      if (e.propertyName !== "height") return;
      advancedPanel.style.height = "auto";
      advancedPanel.removeEventListener("transitionend", onEnd);
    };
    advancedPanel.addEventListener("transitionend", onEnd);
  }
});

// ── File input ────────────────────────────────────────────────────────────────

fileInput.addEventListener("change", (e) => { handleFiles(e.target.files); fileInput.value = ""; });

["dragenter", "dragover"].forEach((ev) =>
  dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.add("dragover"); })
);
["dragleave", "drop"].forEach((ev) =>
  dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.remove("dragover"); })
);
dropZone.addEventListener("drop", (e) => handleFiles(e.dataTransfer.files));
dropZone.addEventListener("click", (e) => {
  if (!e.target.closest("button,input,select,label")) fileInput.click();
});

clearBtn.addEventListener("click", () => {
  items.length = 0;
  sources.clear();
  statusLabel.textContent = "";
  render();
});

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "e") { e.preventDefault(); if (!exportBtn.disabled) exportBtn.click(); }
});

exportBtn.addEventListener("click", exportFold);

// ── Ingest ────────────────────────────────────────────────────────────────────

async function handleFiles(fileList) {
  const all = Array.from(fileList);
  const imageFiles = all.filter((f) => ["image/png", "image/jpeg", "image/webp"].includes(f.type));
  const pdfFiles   = all.filter((f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf");
  const skipped    = all.length - imageFiles.length - pdfFiles.length;

  if (!imageFiles.length && !pdfFiles.length) {
    setStatus("No supported files. Use JPG, PNG, WebP, or PDF.");
    return;
  }

  setStatus("Loading…");
  progress.hidden = false;
  progress.value  = 0;
  progress.max    = imageFiles.length + pdfFiles.length;
  let done = 0;

  for (const file of imageFiles) {
    try {
      const dataUrl = await fileToDataUrl(file);
      const dims    = await getImageSize(dataUrl);
      items.push({ id: uid(), type: "image", name: file.name, dataUrl, width: dims.width, height: dims.height, rotation: 0 });
    } catch (_) {}
    progress.value = ++done;
  }

  for (const file of pdfFiles) {
    try { await ingestPdf(file); } catch (e) { setStatus(`Skipped ${file.name}: ${e.message || "invalid PDF"}`); }
    progress.value = ++done;
  }

  progress.hidden = true;
  render();
  setStatus(`${items.length} page${items.length === 1 ? "" : "s"} ready${skipped ? ` · ${skipped} unsupported skipped` : ""}.`);
}

async function ingestPdf(file) {
  const bytes     = await file.arrayBuffer();
  const sourceKey = `${file.name}|${file.size}|${file.lastModified}`;
  if (sources.has(sourceKey)) return;

  const pdfLibDoc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
  const pdfjsDoc  = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
  sources.set(sourceKey, { fileName: file.name, pdfLibDoc, pdfjsDoc });

  const count    = pdfLibDoc.getPageCount();
  const newItems = [];
  for (let i = 0; i < count; i++) {
    const item = { id: uid(), type: "pdf-page", name: file.name, sourceKey, pageIndex: i, thumbDataUrl: null };
    items.push(item);
    newItems.push(item);
  }
  render();

  for (const item of newItems) {
    try {
      item.thumbDataUrl = await renderThumb(pdfjsDoc, item.pageIndex);
      const img = grid.querySelector(`img[data-id="${item.id}"]`);
      if (img) img.src = item.thumbDataUrl;
    } catch (_) {}
  }
}

async function renderThumb(pdfjsDoc, pageIndex) {
  const pdfPage    = await pdfjsDoc.getPage(pageIndex + 1);
  const base       = pdfPage.getViewport({ scale: 1 });
  const scale      = Math.min(2, 220 / base.width);
  const viewport   = pdfPage.getViewport({ scale });
  const canvas     = document.createElement("canvas");
  canvas.width     = Math.round(viewport.width);
  canvas.height    = Math.round(viewport.height);
  await pdfPage.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  return canvas.toDataURL("image/jpeg", 0.7);
}

// ── Render ────────────────────────────────────────────────────────────────────

function render() {
  emptyState.hidden = items.length > 0;
  grid.innerHTML    = "";

  items.forEach((item, idx) => {
    const tile = document.createElement("div");
    tile.className    = "fold-tile";
    tile.draggable    = true;
    tile.dataset.id   = item.id;

    const img = document.createElement("img");
    img.className    = "fold-thumb";
    img.alt          = item.name;
    img.dataset.id   = item.id;
    if (item.type === "image") {
      img.src = item.dataUrl;
      if (item.rotation) img.className += ` rotated-${item.rotation}`;
    } else {
      if (item.thumbDataUrl) img.src = item.thumbDataUrl;
    }

    const num = document.createElement("span");
    num.className   = "fold-num";
    num.textContent = String(idx + 1);

    const label = document.createElement("span");
    label.className   = "fold-label";
    label.textContent = item.name;

    const actions = document.createElement("div");
    actions.className = "fold-actions";

    if (item.type === "image") {
      const rotBtn = document.createElement("button");
      rotBtn.className = "fold-action";
      rotBtn.title     = "Rotate 90°";
      rotBtn.textContent = "↻";
      rotBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        item.rotation = (item.rotation + 90) % 360;
        render();
      });
      actions.appendChild(rotBtn);
    }

    const removeBtn = document.createElement("button");
    removeBtn.className   = "fold-action";
    removeBtn.title       = "Remove";
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      items.splice(items.findIndex((x) => x.id === item.id), 1);
      render();
    });
    actions.appendChild(removeBtn);

    tile.append(img, num, label, actions);

    tile.addEventListener("dragstart", (e) => {
      dragId = item.id;
      tile.classList.add("dragging");
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    });
    tile.addEventListener("dragend", () => {
      dragId = null;
      tile.classList.remove("dragging");
      grid.querySelectorAll(".drop-target").forEach((el) => el.classList.remove("drop-target"));
    });
    tile.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (!dragId || dragId === item.id) return;
      grid.querySelectorAll(".drop-target").forEach((el) => el.classList.remove("drop-target"));
      tile.classList.add("drop-target");
    });
    tile.addEventListener("drop", (e) => {
      e.preventDefault();
      tile.classList.remove("drop-target");
      if (!dragId || dragId === item.id) return;
      const from = items.findIndex((x) => x.id === dragId);
      const to   = items.findIndex((x) => x.id === item.id);
      if (from < 0 || to < 0) return;
      const [moved] = items.splice(from, 1);
      items.splice(to, 0, moved);
      render();
    });

    grid.appendChild(tile);
  });

  countLabel.textContent = `${items.length} page${items.length === 1 ? "" : "s"}`;
  exportBtn.disabled = items.length === 0;
  clearBtn.disabled  = items.length === 0;
}

// ── Export ────────────────────────────────────────────────────────────────────

async function exportFold() {
  if (!items.length) return;
  exportBtn.disabled = true;
  clearBtn.disabled  = true;
  progress.hidden    = false;
  progress.max       = items.length;
  progress.value     = 0;
  setStatus("Building PDF…");

  try {
    const pdfDoc  = await PDFLib.PDFDocument.create();
    const maxDim  = Number(downscaleSelect.value);
    const quality = Number(qualityRange.value);
    const margin  = Number(marginSelect.value);
    const pageBg  = pageBgInput.value;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      if (item.type === "image") {
        const rotatedUrl = item.rotation ? await rotateImage(item.dataUrl, item.rotation, item.type) : item.dataUrl;
        const dataUrl    = await processImage(rotatedUrl, maxDim, item.type, quality);
        const bytes      = await dataUrlToBytes(dataUrl);
        const embed      = dataUrl.startsWith("data:image/png")
          ? await pdfDoc.embedPng(bytes)
          : await pdfDoc.embedJpg(bytes);
        const { width, height } = embed.size();
        const ps   = getPageSize(pageSizeSelect.value, width, height, margin);
        const page = pdfDoc.addPage([ps.width, ps.height]);
        const bg   = hexToRgb(pageBg);
        if (bg) page.drawRectangle({ x: 0, y: 0, width: ps.width, height: ps.height, color: PDFLib.rgb(bg.r, bg.g, bg.b) });
        const pl = getPlacement(ps.width - margin * 2, ps.height - margin * 2, width, height, fitModeSelect.value);
        page.drawImage(embed, { x: pl.x + margin, y: pl.y + margin, width: pl.width, height: pl.height });

      } else if (item.type === "pdf-page") {
        const src = sources.get(item.sourceKey);
        if (!src) continue;
        const [copied] = await pdfDoc.copyPages(src.pdfLibDoc, [item.pageIndex]);
        pdfDoc.addPage(copied);
      }

      progress.value = i + 1;
      setStatus(`Processing ${i + 1} / ${items.length}…`);
      await tick();
    }

    const out  = await pdfDoc.save();
    const name = normalizeName(fileNameInput.value.trim() || "fold.pdf");
    downloadBlob(new Blob([out], { type: "application/pdf" }), name);
    setStatus("Done! PDF downloaded.");
  } catch (e) {
    console.error(e);
    setStatus(`Error: ${e.message || e}`);
  } finally {
    progress.hidden    = true;
    exportBtn.disabled = items.length === 0;
    clearBtn.disabled  = items.length === 0;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() { return crypto.randomUUID ? crypto.randomUUID() : "x" + Math.random().toString(36).slice(2); }
function tick() { return new Promise((r) => setTimeout(r, 0)); }
function setStatus(msg) { statusLabel.textContent = msg; }

function fileToDataUrl(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
}

function getImageSize(dataUrl) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res({ width: i.naturalWidth, height: i.naturalHeight }); i.onerror = rej; i.src = dataUrl; });
}

async function processImage(dataUrl, maxDim, type, quality) {
  const outputType = type === "image/png" ? "image/png" : "image/jpeg";
  const img = await loadImg(dataUrl);
  const scale = maxDim ? Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight)) : 1;
  const canvas = document.createElement("canvas");
  canvas.width  = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvasToDataUrl(canvas, outputType, quality);
}

async function rotateImage(dataUrl, degrees, type) {
  const outputType = type === "image/png" ? "image/png" : "image/jpeg";
  const img = await loadImg(dataUrl);
  const sideways = Math.abs(degrees) % 180 !== 0;
  const canvas = document.createElement("canvas");
  canvas.width  = sideways ? img.naturalHeight : img.naturalWidth;
  canvas.height = sideways ? img.naturalWidth  : img.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  return canvasToDataUrl(canvas, outputType, 0.92);
}

function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

function canvasToDataUrl(canvas, type, quality) {
  return new Promise((res) => {
    canvas.toBlob((b) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); }, type, quality);
  });
}

async function dataUrlToBytes(dataUrl) {
  return new Uint8Array(await (await fetch(dataUrl)).arrayBuffer());
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function normalizeName(input) {
  const base = (input || "fold.pdf").replace(/\.pdf$/i, "").trim().slice(0, 80) || "fold";
  return `${base}.pdf`;
}

function getPageSize(mode, w, h, margin) {
  if (mode === "a4")     return { width: 595.28, height: 841.89 };
  if (mode === "letter") return { width: 612,    height: 792    };
  return { width: w + margin * 2, height: h + margin * 2 };
}

function getPlacement(pageW, pageH, imgW, imgH, fitMode) {
  if (pageW === imgW && pageH === imgH) return { x: 0, y: 0, width: imgW, height: imgH };
  const scaleX = pageW / imgW, scaleY = pageH / imgH;
  const scale  = fitMode === "cover" ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
  const w = imgW * scale, h = imgH * scale;
  return { x: (pageW - w) / 2, y: (pageH - h) / 2, width: w, height: h };
}

function hexToRgb(hex) {
  const v = hex.replace("#", "");
  if (v.length !== 6) return null;
  const r = parseInt(v.slice(0,2), 16), g = parseInt(v.slice(2,4), 16), b = parseInt(v.slice(4,6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  return { r: r/255, g: g/255, b: b/255 };
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("../../sw.js").catch(() => {}));
}
