/* global PDFLib pdfjsLib */
/* Origami — Merge PDF
 * Page-level merge: drop one or more PDFs, every page is shown as a thumbnail
 * in a grid, drag any page anywhere, remove unwanted pages, save. 100%
 * client-side via pdf-lib (output) and pdfjs-dist (thumbnail rendering).
 */

pdfjsLib.GlobalWorkerOptions.workerSrc = "../../shared/vendor/pdfjs/pdf.worker.min.js";

const fileInput = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");
const pagesEl = document.getElementById("pages");
const emptyState = document.getElementById("emptyState");
const mergeBtn = document.getElementById("mergeBtn");
const clearBtn = document.getElementById("clearBtn");
const fileNameInput = document.getElementById("fileNameInput");
const countLabel = document.getElementById("count");
const statusLabel = document.getElementById("status");
const progress = document.getElementById("progress");

const sources = new Map(); // sourceKey -> { fileName, pdfLibDoc, pdfjsDoc }
const pages = []; // { id, sourceKey, pageIndex, thumbDataUrl }
let dragId = null;

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : "p-" + Math.random().toString(36).slice(2);
}

function setStatus(msg) {
  statusLabel.textContent = msg;
}

function normalizeName(input) {
  let n = (input || "").trim() || "merged.pdf";
  if (!/\.pdf$/i.test(n)) n += ".pdf";
  return n;
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

mergeBtn.addEventListener("click", exportMerged);

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "e") {
    e.preventDefault();
    if (!mergeBtn.disabled) exportMerged();
  }
});

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

  const pdfLibDoc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
  const pdfjsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
  sources.set(sourceKey, { fileName: file.name, pdfLibDoc, pdfjsDoc });

  const pageCount = pdfLibDoc.getPageCount();
  const newPages = [];
  for (let i = 0; i < pageCount; i++) {
    const page = {
      id: uid(),
      sourceKey,
      pageIndex: i,
      thumbDataUrl: null,
    };
    pages.push(page);
    newPages.push(page);
  }
  render();

  // Render thumbnails in the background, sequential to avoid hammering the worker
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
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(s) : String(s).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
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
    remove.title = "Remove page";
    remove.setAttribute("aria-label", `Remove page ${idx + 1}`);
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
  mergeBtn.disabled = pages.length < 1;
  clearBtn.disabled = pages.length === 0;
}

async function exportMerged() {
  if (pages.length < 1) {
    setStatus("Add at least 1 page.");
    return;
  }
  mergeBtn.disabled = true;
  setStatus("Saving…");
  progress.hidden = false;
  progress.value = 0;
  try {
    const merged = await PDFLib.PDFDocument.create();
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const src = sources.get(page.sourceKey);
      if (!src) continue;
      const [copied] = await merged.copyPages(src.pdfLibDoc, [page.pageIndex]);
      merged.addPage(copied);
      progress.value = (i + 1) / pages.length;
    }
    const out = await merged.save();
    downloadBlob(out, normalizeName(fileNameInput.value));
    setStatus(`Saved ${pages.length} page${pages.length === 1 ? "" : "s"}.`);
  } catch (e) {
    console.error(e);
    setStatus(`Error: ${e.message || e}`);
  } finally {
    progress.hidden = true;
    mergeBtn.disabled = pages.length < 1;
  }
}

function downloadBlob(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/pdf" });
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
