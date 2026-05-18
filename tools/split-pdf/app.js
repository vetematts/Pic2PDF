/* global PDFLib pdfjsLib JSZip */
/* Origami Docs — Split PDF
 * Split one PDF into several by single page, custom ranges, or fixed chunks.
 * pdfjs renders thumbnails, pdf-lib does the splitting, JSZip bundles output.
 */

pdfjsLib.GlobalWorkerOptions.workerSrc = "../../shared/vendor/pdfjs/pdf.worker.min.js";

const fileInput = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");
const pagesEl = document.getElementById("pages");
const emptyState = document.getElementById("emptyState");
const exportBtn = document.getElementById("exportBtn");
const clearBtn = document.getElementById("clearBtn");
const fileNameInput = document.getElementById("fileNameInput");
const modeSelect = document.getElementById("modeSelect");
const rangeField = document.getElementById("rangeField");
const rangeInput = document.getElementById("rangeInput");
const chunkField = document.getElementById("chunkField");
const chunkInput = document.getElementById("chunkInput");
const countLabel = document.getElementById("count");
const statusLabel = document.getElementById("status");
const progress = document.getElementById("progress");

let sourcePdfLib = null;
let sourcePdfjs = null;
let sourceName = "document";
let pageCount = 0;
const thumbs = []; // dataURL per page index

function setStatus(msg) {
  statusLabel.textContent = msg;
}

function syncModeFields() {
  rangeField.hidden = modeSelect.value !== "ranges";
  chunkField.hidden = modeSelect.value !== "chunks";
}

syncModeFields();

modeSelect.addEventListener("change", () => {
  syncModeFields();
  refreshGroups();
});
rangeInput.addEventListener("input", refreshGroups);
chunkInput.addEventListener("input", refreshGroups);

fileInput.addEventListener("change", (event) => {
  const f = event.target.files && event.target.files[0];
  if (f) loadPdf(f);
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
  if (f) loadPdf(f);
});

clearBtn.addEventListener("click", () => {
  sourcePdfLib = null;
  sourcePdfjs = null;
  pageCount = 0;
  thumbs.length = 0;
  pagesEl.innerHTML = "";
  emptyState.style.display = "";
  countLabel.textContent = "No PDF loaded";
  setStatus("");
  exportBtn.disabled = true;
  clearBtn.disabled = true;
});

exportBtn.addEventListener("click", exportSplit);

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "e") {
    e.preventDefault();
    if (!exportBtn.disabled) exportSplit();
  }
});

async function loadPdf(file) {
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
    setStatus("Pick a PDF file.");
    return;
  }
  setStatus("Loading…");
  try {
    const bytes = await file.arrayBuffer();
    sourcePdfLib = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
    sourcePdfjs = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
    sourceName = file.name.replace(/\.pdf$/i, "");
    pageCount = sourcePdfLib.getPageCount();
    thumbs.length = 0;

    emptyState.style.display = "none";
    countLabel.textContent = `${pageCount} page${pageCount === 1 ? "" : "s"}`;
    exportBtn.disabled = false;
    clearBtn.disabled = false;
    renderPages();
    refreshGroups();
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

async function renderThumb(pageIndex) {
  const page = await sourcePdfjs.getPage(pageIndex + 1);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(2, 200 / base.width);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  return canvas.toDataURL("image/jpeg", 0.7);
}

function renderPages() {
  pagesEl.innerHTML = "";
  for (let i = 0; i < pageCount; i++) {
    const tile = document.createElement("div");
    tile.className = "page-tile";
    tile.dataset.page = String(i);

    const img = document.createElement("img");
    img.className = "page-thumb";
    img.alt = `Page ${i + 1}`;
    img.dataset.i = String(i);
    if (thumbs[i]) img.src = thumbs[i];

    const num = document.createElement("span");
    num.className = "page-num";
    num.textContent = String(i + 1);

    const group = document.createElement("span");
    group.className = "page-group";
    group.dataset.group = String(i);

    tile.append(img, num, group);
    pagesEl.appendChild(tile);
  }
}

function computeGroups() {
  if (pageCount === 0) return [];
  const mode = modeSelect.value;
  if (mode === "pages") {
    return Array.from({ length: pageCount }, (_, i) => [i]);
  }
  if (mode === "chunks") {
    const n = Math.max(1, parseInt(chunkInput.value, 10) || 1);
    const groups = [];
    for (let i = 0; i < pageCount; i += n) {
      groups.push(
        Array.from({ length: Math.min(n, pageCount - i) }, (_, k) => i + k)
      );
    }
    return groups;
  }
  // ranges
  const groups = [];
  for (const part of String(rangeInput.value).split(",")) {
    const t = part.trim();
    if (!t) continue;
    const m = t.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      let a = parseInt(m[1], 10);
      let b = parseInt(m[2], 10);
      if (a > b) [a, b] = [b, a];
      const g = [];
      for (let p = a; p <= b; p++) if (p >= 1 && p <= pageCount) g.push(p - 1);
      if (g.length) groups.push(g);
    } else if (/^\d+$/.test(t)) {
      const p = parseInt(t, 10);
      if (p >= 1 && p <= pageCount) groups.push([p - 1]);
    }
  }
  return groups;
}

function refreshGroups() {
  const groups = computeGroups();
  // Map page index -> output number (1-based), or null if excluded
  const pageToGroup = new Array(pageCount).fill(null);
  groups.forEach((g, gi) => {
    for (const p of g) pageToGroup[p] = gi + 1;
  });

  for (let i = 0; i < pageCount; i++) {
    const tile = pagesEl.querySelector(`.page-tile[data-page="${i}"]`);
    const badge = tile && tile.querySelector(".page-group");
    if (!tile || !badge) continue;
    if (pageToGroup[i] == null) {
      tile.classList.add("excluded");
      badge.textContent = "";
    } else {
      tile.classList.remove("excluded");
      badge.textContent = `File ${pageToGroup[i]}`;
    }
  }

  const usable = groups.filter((g) => g.length > 0);
  if (pageCount > 0) {
    countLabel.textContent =
      `${pageCount} page${pageCount === 1 ? "" : "s"} → ${usable.length} file${usable.length === 1 ? "" : "s"}`;
  }
  exportBtn.disabled = usable.length === 0;
}

function pad(n, total) {
  return String(n).padStart(String(total).length, "0");
}

async function exportSplit() {
  const groups = computeGroups().filter((g) => g.length > 0);
  if (groups.length === 0) {
    setStatus("Nothing to split — check your ranges.");
    return;
  }
  exportBtn.disabled = true;
  setStatus("Splitting…");
  progress.hidden = false;
  progress.value = 0;
  try {
    const outputs = [];
    for (let gi = 0; gi < groups.length; gi++) {
      const doc = await PDFLib.PDFDocument.create();
      const copied = await doc.copyPages(sourcePdfLib, groups[gi]);
      copied.forEach((p) => doc.addPage(p));
      const bytes = await doc.save();
      outputs.push({
        name: `${sourceName}-${pad(gi + 1, groups.length)}.pdf`,
        bytes,
      });
      progress.value = (gi + 1) / groups.length;
    }

    if (outputs.length === 1) {
      downloadBlob(
        new Blob([outputs[0].bytes], { type: "application/pdf" }),
        normalizeName(fileNameInput.value, outputs[0].name)
      );
    } else {
      const zip = new JSZip();
      for (const o of outputs) zip.file(o.name, o.bytes);
      const zipBlob = await zip.generateAsync({ type: "blob" });
      let fname = fileNameInput.value.trim() || `${sourceName}-split.zip`;
      if (!/\.zip$/i.test(fname)) fname += ".zip";
      downloadBlob(zipBlob, fname);
    }
    setStatus(`Done — ${outputs.length} file${outputs.length === 1 ? "" : "s"}.`);
  } catch (e) {
    console.error(e);
    setStatus(`Error: ${e.message || e}`);
  } finally {
    progress.hidden = true;
    exportBtn.disabled = false;
  }
}

function normalizeName(typed, fallback) {
  let n = (typed || "").trim();
  if (!n) return fallback;
  if (!/\.pdf$/i.test(n)) n += ".pdf";
  return n;
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
