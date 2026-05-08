/* global pdfjsLib JSZip */
/* Origami — Pdf2Pic
 * Extract PDF pages as PNG / JPG / WebP images. 100% client-side via pdfjs
 * for rendering and JSZip for the multi-page download.
 */

pdfjsLib.GlobalWorkerOptions.workerSrc = "../../shared/vendor/pdfjs/pdf.worker.min.js";

const fileInput = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");
const pagesEl = document.getElementById("pages");
const emptyState = document.getElementById("emptyState");
const exportBtn = document.getElementById("exportBtn");
const clearBtn = document.getElementById("clearBtn");
const fileNameInput = document.getElementById("fileNameInput");
const formatSelect = document.getElementById("formatSelect");
const scaleSelect = document.getElementById("scaleSelect");
const qualityRange = document.getElementById("qualityRange");
const qualityValue = document.getElementById("qualityValue");
const qualityWrap = document.getElementById("qualityWrap");
const countLabel = document.getElementById("count");
const statusLabel = document.getElementById("status");
const progress = document.getElementById("progress");

const STORAGE_KEY = "origami-pdf2pic";
const sources = new Map(); // sourceKey -> { fileName, pdfjsDoc }
const pages = []; // { id, sourceKey, pageIndex, thumbDataUrl }
let dragId = null;

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : "p-" + Math.random().toString(36).slice(2);
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
    if (s.scale) scaleSelect.value = String(s.scale);
    if (s.quality !== undefined) {
      qualityRange.value = String(s.quality);
      qualityValue.textContent = Number(s.quality).toFixed(2);
    }
  } catch (_) {}
}

function saveSettings() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        format: formatSelect.value,
        scale: Number(scaleSelect.value),
        quality: Number(qualityRange.value),
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
});
scaleSelect.addEventListener("change", saveSettings);
qualityRange.addEventListener("input", () => {
  qualityValue.textContent = Number(qualityRange.value).toFixed(2);
});
qualityRange.addEventListener("change", saveSettings);

function suggestedFilename() {
  const first = sources.values().next().value;
  if (first && first.fileName) {
    const base = first.fileName.replace(/\.pdf$/i, "");
    if (pages.length === 1) return `${base}.${currentExt()}`;
    return `${base}.zip`;
  }
  return pages.length === 1 ? `pdf2pic.${currentExt()}` : "pdf2pic.zip";
}

function currentExt() {
  const f = formatSelect.value;
  return f === "jpeg" ? "jpg" : f;
}

function updateFilenamePlaceholder() {
  fileNameInput.placeholder = suggestedFilename();
}

function effectiveFilename() {
  const typed = fileNameInput.value.trim();
  return typed || suggestedFilename();
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
  pages.length = 0;
  sources.clear();
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
  const accepted = Array.from(fileList).filter(
    (f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf"
  );
  if (accepted.length === 0) {
    setStatus("No PDFs selected.");
    return;
  }
  setStatus(`Loading ${accepted.length} PDF${accepted.length === 1 ? "" : "s"}…`);
  for (const file of accepted) {
    try {
      await ingestFile(file);
    } catch (e) {
      console.error(e);
      setStatus(`Skipped ${file.name}: ${e.message || "not a valid PDF"}`);
    }
  }
  setStatus(`${pages.length} page${pages.length === 1 ? "" : "s"} ready.`);
}

async function ingestFile(file) {
  const bytes = await file.arrayBuffer();
  const sourceKey = `${file.name}|${file.size}|${file.lastModified}`;
  if (sources.has(sourceKey)) {
    setStatus(`${file.name} already loaded — skipping.`);
    return;
  }

  const pdfjsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
  sources.set(sourceKey, { fileName: file.name, pdfjsDoc });

  const newPages = [];
  for (let i = 0; i < pdfjsDoc.numPages; i++) {
    const page = { id: uid(), sourceKey, pageIndex: i, thumbDataUrl: null };
    pages.push(page);
    newPages.push(page);
  }
  render();

  for (const page of newPages) {
    try {
      page.thumbDataUrl = await renderThumb(pdfjsDoc, page.pageIndex);
      updateThumbInDom(page.id, page.thumbDataUrl);
    } catch (e) {
      console.warn("Thumbnail render failed for page", page.pageIndex, e);
    }
  }
}

async function renderThumb(pdfjsDoc, pageIndex) {
  const pdfPage = await pdfjsDoc.getPage(pageIndex + 1);
  const baseViewport = pdfPage.getViewport({ scale: 1 });
  const targetWidth = 220;
  const scale = Math.min(2, targetWidth / baseViewport.width);
  const viewport = pdfPage.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d");
  await pdfPage.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL("image/jpeg", 0.7);
}

function updateThumbInDom(pageId, dataUrl) {
  const img = pagesEl.querySelector(`img[data-page-id="${cssEscape(pageId)}"]`);
  if (img) img.src = dataUrl;
}

function cssEscape(s) {
  return typeof CSS !== "undefined" && CSS.escape
    ? CSS.escape(s)
    : String(s).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function render() {
  emptyState.style.display = pages.length ? "none" : "";
  pagesEl.innerHTML = "";

  pages.forEach((page, idx) => {
    const tile = document.createElement("div");
    tile.className = "page-tile";
    tile.draggable = true;
    tile.dataset.id = page.id;

    const thumb = document.createElement("img");
    thumb.className = "page-thumb";
    thumb.alt = `Page ${idx + 1}`;
    thumb.dataset.pageId = page.id;
    if (page.thumbDataUrl) thumb.src = page.thumbDataUrl;

    const num = document.createElement("span");
    num.className = "page-num";
    num.textContent = String(idx + 1);

    const source = sources.get(page.sourceKey);
    const sourceLabel = document.createElement("span");
    sourceLabel.className = "page-source";
    sourceLabel.textContent = source ? source.fileName : "";

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "page-action page-remove";
    remove.title = "Skip this page";
    remove.setAttribute("aria-label", `Skip page ${idx + 1}`);
    remove.textContent = "×";
    remove.addEventListener("click", (e) => {
      e.stopPropagation();
      const i = pages.findIndex((p) => p.id === page.id);
      if (i >= 0) pages.splice(i, 1);
      render();
    });

    const actions = document.createElement("div");
    actions.className = "page-actions";
    actions.appendChild(remove);

    tile.append(thumb, num, sourceLabel, actions);

    tile.addEventListener("dragstart", (e) => {
      dragId = page.id;
      tile.classList.add("dragging");
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    });
    tile.addEventListener("dragend", () => {
      dragId = null;
      tile.classList.remove("dragging");
      pagesEl.querySelectorAll(".drop-target").forEach((el) => el.classList.remove("drop-target"));
    });
    tile.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (!dragId || dragId === page.id) return;
      pagesEl.querySelectorAll(".drop-target").forEach((el) => el.classList.remove("drop-target"));
      tile.classList.add("drop-target");
    });
    tile.addEventListener("drop", (e) => {
      e.preventDefault();
      tile.classList.remove("drop-target");
      if (!dragId || dragId === page.id) return;
      const fromIdx = pages.findIndex((p) => p.id === dragId);
      const toIdx = pages.findIndex((p) => p.id === page.id);
      if (fromIdx < 0 || toIdx < 0) return;
      const [moved] = pages.splice(fromIdx, 1);
      pages.splice(toIdx, 0, moved);
      render();
    });

    pagesEl.appendChild(tile);
  });

  countLabel.textContent = `${pages.length} page${pages.length === 1 ? "" : "s"}`;
  exportBtn.disabled = pages.length < 1;
  clearBtn.disabled = pages.length === 0;
  updateFilenamePlaceholder();
}

async function renderPageToBlob(page, format, scale, quality) {
  const src = sources.get(page.sourceKey);
  if (!src) throw new Error("source missing");
  const pdfPage = await src.pdfjsDoc.getPage(page.pageIndex + 1);
  const viewport = pdfPage.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d");
  if (format !== "png") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  await pdfPage.render({ canvasContext: ctx, viewport }).promise;

  const mime = format === "png" ? "image/png" : format === "jpeg" ? "image/jpeg" : "image/webp";
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      mime,
      format === "png" ? undefined : quality
    );
  });
}

function pageNameFor(page, idx, ext, total) {
  const src = sources.get(page.sourceKey);
  const baseName = src ? src.fileName.replace(/\.pdf$/i, "") : "page";
  const pad = String(total).length;
  const num = String(idx + 1).padStart(pad, "0");
  if (sources.size > 1) {
    return `${baseName}-page-${num}.${ext}`;
  }
  return `page-${num}.${ext}`;
}

async function exportImages() {
  if (pages.length < 1) {
    setStatus("Add a PDF first.");
    return;
  }
  exportBtn.disabled = true;
  setStatus("Rendering…");
  progress.hidden = false;
  progress.value = 0;
  try {
    const format = formatSelect.value;
    const scale = Number(scaleSelect.value);
    const quality = Number(qualityRange.value);
    const ext = currentExt();

    if (pages.length === 1) {
      const blob = await renderPageToBlob(pages[0], format, scale, quality);
      const filename = effectiveFilename().replace(/\.zip$/i, `.${ext}`);
      downloadBlob(blob, filename.match(/\.[a-z0-9]+$/i) ? filename : `${filename}.${ext}`);
      setStatus("Saved 1 page.");
      progress.value = 1;
      return;
    }

    const zip = new JSZip();
    for (let i = 0; i < pages.length; i++) {
      const blob = await renderPageToBlob(pages[i], format, scale, quality);
      zip.file(pageNameFor(pages[i], i, ext, pages.length), blob);
      progress.value = (i + 1) / pages.length;
    }
    const zipBlob = await zip.generateAsync({ type: "blob" });
    let filename = effectiveFilename();
    if (!/\.zip$/i.test(filename)) filename += ".zip";
    downloadBlob(zipBlob, filename);
    setStatus(`Saved ${pages.length} pages as a zip.`);
  } catch (e) {
    console.error(e);
    setStatus(`Error: ${e.message || e}`);
  } finally {
    progress.hidden = true;
    exportBtn.disabled = pages.length < 1;
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
