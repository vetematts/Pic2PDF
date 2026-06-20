/* global PDFLib pdfjsLib JSZip */
pdfjsLib.GlobalWorkerOptions.workerSrc = "../../shared/vendor/pdfjs/pdf.worker.min.js";

const fileInput      = document.getElementById("fileInput");
const dropZone       = document.getElementById("dropZone");
const pagesEl        = document.getElementById("pages");
const emptyState     = document.getElementById("emptyState");
const exportBtn      = document.getElementById("exportBtn");
const clearBtn       = document.getElementById("clearBtn");
const fileNameInput  = document.getElementById("fileNameInput");
const modeSelect     = document.getElementById("modeSelect");
const imageControls  = document.getElementById("imageControls");
const pdfControls    = document.getElementById("pdfControls");
const formatSelect   = document.getElementById("formatSelect");
const scaleSelect    = document.getElementById("scaleSelect");
const qualityRange   = document.getElementById("qualityRange");
const qualityValue   = document.getElementById("qualityValue");
const qualityWrap    = document.getElementById("qualityWrap");
const splitSelect    = document.getElementById("splitSelect");
const rangeField     = document.getElementById("rangeField");
const rangeInput     = document.getElementById("rangeInput");
const chunkField     = document.getElementById("chunkField");
const chunkInput     = document.getElementById("chunkInput");
const countLabel     = document.getElementById("count");
const statusLabel    = document.getElementById("status");
const progress       = document.getElementById("progress");

let pdfLibDoc  = null;
let pdfjsDoc   = null;
let sourceName = "document";
let pageCount  = 0;
const thumbs   = [];
const excluded = new Set(); // page indices excluded from export

// ── Mode switching ────────────────────────────────────────────────────────────

function syncMode() {
  const isImages = modeSelect.value === "images";
  imageControls.hidden = !isImages;
  pdfControls.hidden   = isImages;
  syncQualityVisibility();
  syncSplitFields();
  refreshGroups();
  updateFilenamePlaceholder();
}

function syncQualityVisibility() {
  qualityWrap.style.display = formatSelect.value === "png" ? "none" : "";
}

function syncSplitFields() {
  rangeField.hidden = splitSelect.value !== "ranges";
  chunkField.hidden = splitSelect.value !== "chunks";
}

modeSelect.addEventListener("change", syncMode);
formatSelect.addEventListener("change", () => { syncQualityVisibility(); updateFilenamePlaceholder(); });
scaleSelect.addEventListener("change", () => {});
qualityRange.addEventListener("input", () => { qualityValue.textContent = Number(qualityRange.value).toFixed(2); });
splitSelect.addEventListener("change", () => { syncSplitFields(); refreshGroups(); });
rangeInput.addEventListener("input", refreshGroups);
chunkInput.addEventListener("input", refreshGroups);

syncMode();

// ── File input ────────────────────────────────────────────────────────────────

fileInput.addEventListener("change", (e) => { if (e.target.files[0]) loadPdf(e.target.files[0]); fileInput.value = ""; });

["dragenter", "dragover"].forEach((ev) =>
  dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.add("dragover"); })
);
["dragleave", "drop"].forEach((ev) =>
  dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.remove("dragover"); })
);
dropZone.addEventListener("drop", (e) => { const f = e.dataTransfer?.files?.[0]; if (f) loadPdf(f); });
dropZone.addEventListener("click", (e) => { if (!e.target.closest("button,input,select,label")) fileInput.click(); });

clearBtn.addEventListener("click", () => {
  pdfLibDoc = null; pdfjsDoc = null; pageCount = 0;
  thumbs.length = 0; excluded.clear();
  pagesEl.innerHTML = "";
  emptyState.hidden = false;
  countLabel.textContent = "No PDF loaded";
  setStatus("");
  exportBtn.disabled = true;
  clearBtn.disabled  = true;
  fileNameInput.placeholder = "unfold.zip";
});

exportBtn.addEventListener("click", () => {
  if (modeSelect.value === "images") exportImages();
  else exportPdfs();
});

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "e") { e.preventDefault(); if (!exportBtn.disabled) exportBtn.click(); }
});

// ── Load PDF ──────────────────────────────────────────────────────────────────

async function loadPdf(file) {
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
    setStatus("Please choose a PDF file."); return;
  }
  setStatus("Loading…");
  try {
    const bytes  = await file.arrayBuffer();
    pdfLibDoc    = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
    pdfjsDoc     = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
    sourceName   = file.name.replace(/\.pdf$/i, "");
    pageCount    = pdfLibDoc.getPageCount();
    thumbs.length = 0;
    excluded.clear();

    emptyState.hidden   = true;
    exportBtn.disabled  = false;
    clearBtn.disabled   = false;
    renderPages();
    refreshGroups();
    updateFilenamePlaceholder();
    setStatus("Rendering previews…");

    for (let i = 0; i < pageCount; i++) {
      thumbs[i] = await renderThumb(i);
      const img = pagesEl.querySelector(`img[data-i="${i}"]`);
      if (img) img.src = thumbs[i];
    }
    setStatus(`${pageCount} pages ready.`);
  } catch (e) {
    console.error(e);
    setStatus(`Error: ${e.message || "could not read PDF"}`);
  }
}

async function renderThumb(idx) {
  const page     = await pdfjsDoc.getPage(idx + 1);
  const base     = page.getViewport({ scale: 1 });
  const scale    = Math.min(2, 200 / base.width);
  const viewport = page.getViewport({ scale });
  const canvas   = document.createElement("canvas");
  canvas.width   = Math.round(viewport.width);
  canvas.height  = Math.round(viewport.height);
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  return canvas.toDataURL("image/jpeg", 0.7);
}

// ── Render grid ───────────────────────────────────────────────────────────────

function renderPages() {
  pagesEl.innerHTML = "";
  for (let i = 0; i < pageCount; i++) {
    const tile = document.createElement("div");
    tile.className  = "page-tile";
    tile.dataset.i  = String(i);
    if (excluded.has(i)) tile.classList.add("excluded");

    const img = document.createElement("img");
    img.className = "page-thumb";
    img.alt       = `Page ${i + 1}`;
    img.dataset.i = String(i);
    if (thumbs[i]) img.src = thumbs[i];

    const num = document.createElement("span");
    num.className   = "page-num";
    num.textContent = String(i + 1);

    const group = document.createElement("span");
    group.className  = "page-group";
    group.dataset.gi = String(i);

    tile.addEventListener("click", () => {
      if (excluded.has(i)) excluded.delete(i);
      else excluded.add(i);
      tile.classList.toggle("excluded", excluded.has(i));
      refreshGroups();
    });

    tile.append(img, num, group);
    pagesEl.appendChild(tile);
  }
  countLabel.textContent = `${pageCount} page${pageCount === 1 ? "" : "s"}`;
}

function refreshGroups() {
  if (!pageCount) return;

  if (modeSelect.value === "images") {
    const active = pageCount - excluded.size;
    countLabel.textContent = `${active} of ${pageCount} page${pageCount === 1 ? "" : "s"}`;
    for (let i = 0; i < pageCount; i++) {
      const badge = pagesEl.querySelector(`span[data-gi="${i}"]`);
      if (badge) badge.textContent = "";
    }
    exportBtn.disabled = active === 0;
    return;
  }

  // PDFs mode — compute groups from non-excluded pages
  const activeIndices = Array.from({ length: pageCount }, (_, i) => i).filter((i) => !excluded.has(i));
  const groups = computeGroups(activeIndices);
  const pageToGroup = new Array(pageCount).fill(null);
  groups.forEach((g, gi) => { for (const p of g) pageToGroup[p] = gi + 1; });

  for (let i = 0; i < pageCount; i++) {
    const badge = pagesEl.querySelector(`span[data-gi="${i}"]`);
    if (!badge) continue;
    badge.textContent = pageToGroup[i] != null ? `File ${pageToGroup[i]}` : "";
  }

  const usable = groups.filter((g) => g.length > 0);
  countLabel.textContent = `${activeIndices.length} pages → ${usable.length} file${usable.length === 1 ? "" : "s"}`;
  exportBtn.disabled = usable.length === 0;
}

function computeGroups(indices) {
  const n = indices.length;
  if (!n) return [];
  const mode = splitSelect.value;

  if (mode === "pages") return indices.map((i) => [i]);

  if (mode === "chunks") {
    const size   = Math.max(1, parseInt(chunkInput.value, 10) || 1);
    const groups = [];
    for (let s = 0; s < n; s += size) groups.push(indices.slice(s, s + size));
    return groups;
  }

  // ranges — interpret against original page numbers
  const included = new Set(indices);
  const groups   = [];
  for (const part of String(rangeInput.value).split(",")) {
    const t = part.trim();
    if (!t) continue;
    const m = t.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      let a = parseInt(m[1], 10) - 1, b = parseInt(m[2], 10) - 1;
      if (a > b) [a, b] = [b, a];
      const g = [];
      for (let p = a; p <= b; p++) if (p >= 0 && p < pageCount && included.has(p)) g.push(p);
      if (g.length) groups.push(g);
    } else if (/^\d+$/.test(t)) {
      const p = parseInt(t, 10) - 1;
      if (p >= 0 && p < pageCount && included.has(p)) groups.push([p]);
    }
  }
  return groups;
}

// ── Filename placeholder ──────────────────────────────────────────────────────

function updateFilenamePlaceholder() {
  if (!pageCount) { fileNameInput.placeholder = "unfold.zip"; return; }
  const ext = formatSelect.value === "jpeg" ? "jpg" : formatSelect.value;
  const single = pageCount - excluded.size === 1;
  if (modeSelect.value === "images") {
    fileNameInput.placeholder = single ? `${sourceName}.${ext}` : `${sourceName}.zip`;
  } else {
    fileNameInput.placeholder = `${sourceName}-split.zip`;
  }
}

// ── Export: images ────────────────────────────────────────────────────────────

async function exportImages() {
  const activePages = Array.from({ length: pageCount }, (_, i) => i).filter((i) => !excluded.has(i));
  if (!activePages.length) { setStatus("No pages selected."); return; }

  exportBtn.disabled = true;
  progress.hidden    = false;
  progress.value     = 0;
  progress.max       = activePages.length;
  setStatus("Rendering…");

  try {
    const format  = formatSelect.value;
    const scale   = Number(scaleSelect.value);
    const quality = Number(qualityRange.value);
    const ext     = format === "jpeg" ? "jpg" : format;
    const pad     = String(pageCount).length;

    if (activePages.length === 1) {
      const blob = await renderPageToBlob(activePages[0], format, scale, quality);
      const name = (fileNameInput.value.trim() || `${sourceName}.${ext}`).replace(/\.zip$/i, `.${ext}`);
      downloadBlob(blob, name);
      setStatus("Done — 1 image saved.");
      return;
    }

    const zip = new JSZip();
    for (let k = 0; k < activePages.length; k++) {
      const blob = await renderPageToBlob(activePages[k], format, scale, quality);
      const num  = String(activePages[k] + 1).padStart(pad, "0");
      zip.file(`${sourceName}-page-${num}.${ext}`, blob);
      progress.value = k + 1;
    }
    const zipBlob = await zip.generateAsync({ type: "blob" });
    let fname = fileNameInput.value.trim() || `${sourceName}.zip`;
    if (!/\.zip$/i.test(fname)) fname += ".zip";
    downloadBlob(zipBlob, fname);
    setStatus(`Done — ${activePages.length} images saved.`);
  } catch (e) {
    console.error(e);
    setStatus(`Error: ${e.message || e}`);
  } finally {
    progress.hidden    = true;
    exportBtn.disabled = false;
  }
}

async function renderPageToBlob(idx, format, scale, quality) {
  const page     = await pdfjsDoc.getPage(idx + 1);
  const viewport = page.getViewport({ scale });
  const canvas   = document.createElement("canvas");
  canvas.width   = Math.round(viewport.width);
  canvas.height  = Math.round(viewport.height);
  const ctx = canvas.getContext("2d");
  if (format !== "png") { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  await page.render({ canvasContext: ctx, viewport }).promise;
  const mime = format === "png" ? "image/png" : format === "jpeg" ? "image/jpeg" : "image/webp";
  return new Promise((res, rej) => canvas.toBlob((b) => b ? res(b) : rej(new Error("toBlob failed")), mime, format === "png" ? undefined : quality));
}

// ── Export: split PDFs ────────────────────────────────────────────────────────

async function exportPdfs() {
  const activeIndices = Array.from({ length: pageCount }, (_, i) => i).filter((i) => !excluded.has(i));
  const groups = computeGroups(activeIndices).filter((g) => g.length > 0);
  if (!groups.length) { setStatus("Nothing to export — check your ranges."); return; }

  exportBtn.disabled = true;
  progress.hidden    = false;
  progress.value     = 0;
  progress.max       = groups.length;
  setStatus("Splitting…");

  try {
    const pad     = String(groups.length).length;
    const outputs = [];
    for (let gi = 0; gi < groups.length; gi++) {
      const doc    = await PDFLib.PDFDocument.create();
      const copied = await doc.copyPages(pdfLibDoc, groups[gi]);
      copied.forEach((p) => doc.addPage(p));
      outputs.push({ name: `${sourceName}-${String(gi + 1).padStart(pad, "0")}.pdf`, bytes: await doc.save() });
      progress.value = gi + 1;
    }

    if (outputs.length === 1) {
      const name = (fileNameInput.value.trim() || outputs[0].name).replace(/\.zip$/i, ".pdf");
      downloadBlob(new Blob([outputs[0].bytes], { type: "application/pdf" }), name);
    } else {
      const zip = new JSZip();
      for (const o of outputs) zip.file(o.name, o.bytes);
      const zipBlob = await zip.generateAsync({ type: "blob" });
      let fname = fileNameInput.value.trim() || `${sourceName}-split.zip`;
      if (!/\.zip$/i.test(fname)) fname += ".zip";
      downloadBlob(zipBlob, fname);
    }
    setStatus(`Done — ${outputs.length} PDF${outputs.length === 1 ? "" : "s"} saved.`);
  } catch (e) {
    console.error(e);
    setStatus(`Error: ${e.message || e}`);
  } finally {
    progress.hidden    = true;
    exportBtn.disabled = false;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function setStatus(msg) { statusLabel.textContent = msg; }

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("../../sw.js").catch(() => {}));
}
