/* global PDFLib */
/* Origami — Merge PDF
 * Combine multiple PDF files into one. 100% client-side via pdf-lib.
 */

const fileInput = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");
const list = document.getElementById("list");
const emptyState = document.getElementById("emptyState");
const mergeBtn = document.getElementById("mergeBtn");
const clearBtn = document.getElementById("clearBtn");
const fileNameInput = document.getElementById("fileNameInput");
const countLabel = document.getElementById("count");
const statusLabel = document.getElementById("status");
const progress = document.getElementById("progress");

const STORAGE_KEY = "origami-merge-pdf";
const items = [];
let dragId = null;

function defaultName() {
  return "merged.pdf";
}

function normalizeName(name) {
  let n = (name || "").trim();
  if (!n) n = defaultName();
  if (!/\.pdf$/i.test(n)) n = n + ".pdf";
  return n;
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.fileName && typeof s.fileName === "string") {
      fileNameInput.value = normalizeName(s.fileName);
    }
  } catch (_) {}
}

function saveSettings() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ fileName: fileNameInput.value.trim() || defaultName() })
    );
  } catch (_) {}
}

loadSettings();
if (!fileNameInput.value.trim()) fileNameInput.value = defaultName();
fileNameInput.addEventListener("blur", () => {
  fileNameInput.value = normalizeName(fileNameInput.value);
  saveSettings();
});
fileNameInput.addEventListener("change", saveSettings);

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
  let added = 0;
  for (const file of accepted) {
    try {
      const bytes = await file.arrayBuffer();
      const doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
      items.push({
        id: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
        file,
        pageCount: doc.getPageCount(),
      });
      added += 1;
    } catch (_) {
      setStatus(`Skipped ${file.name}: not a valid PDF`);
    }
  }
  if (added > 0) setStatus(`${added} added.`);
  render();
}

function render() {
  emptyState.style.display = items.length ? "none" : "";
  list.innerHTML = "";
  for (const item of items) {
    const li = document.createElement("li");
    li.className = "row";
    li.draggable = true;
    li.dataset.id = item.id;

    const grip = document.createElement("span");
    grip.className = "row-grip";
    grip.setAttribute("aria-hidden", "true");
    grip.textContent = "⋮⋮";

    const name = document.createElement("span");
    name.className = "row-name";
    name.textContent = item.file.name;

    const meta = document.createElement("span");
    meta.className = "row-meta";
    meta.textContent = `${item.pageCount} page${item.pageCount === 1 ? "" : "s"} · ${formatSize(item.file.size)}`;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "row-remove";
    remove.setAttribute("aria-label", `Remove ${item.file.name}`);
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      const idx = items.findIndex((x) => x.id === item.id);
      if (idx >= 0) items.splice(idx, 1);
      render();
    });

    li.append(grip, name, meta, remove);

    li.addEventListener("dragstart", (e) => {
      dragId = item.id;
      li.classList.add("dragging");
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    });
    li.addEventListener("dragend", () => {
      dragId = null;
      li.classList.remove("dragging");
    });
    li.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (!dragId || dragId === item.id) return;
      const fromIdx = items.findIndex((x) => x.id === dragId);
      const toIdx = items.findIndex((x) => x.id === item.id);
      if (fromIdx < 0 || toIdx < 0) return;
      const [moved] = items.splice(fromIdx, 1);
      items.splice(toIdx, 0, moved);
      render();
    });

    list.appendChild(li);
  }
  countLabel.textContent = `${items.length} PDF${items.length === 1 ? "" : "s"}`;
  mergeBtn.disabled = items.length < 2;
  clearBtn.disabled = items.length === 0;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function setStatus(msg) {
  statusLabel.textContent = msg;
}

async function exportMerged() {
  if (items.length < 2) {
    setStatus("Add at least 2 PDFs to merge.");
    return;
  }
  mergeBtn.disabled = true;
  setStatus("Merging…");
  progress.hidden = false;
  progress.value = 0;
  try {
    const merged = await PDFLib.PDFDocument.create();
    let processed = 0;
    for (const item of items) {
      const bytes = await item.file.arrayBuffer();
      const src = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
      const copied = await merged.copyPages(src, src.getPageIndices());
      copied.forEach((p) => merged.addPage(p));
      processed += 1;
      progress.value = processed / items.length;
    }
    const out = await merged.save();
    const blob = new Blob([out], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = normalizeName(fileNameInput.value);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
    setStatus(`Merged ${items.length} PDFs.`);
  } catch (e) {
    console.error(e);
    setStatus(`Error: ${e.message || e}`);
  } finally {
    progress.hidden = true;
    mergeBtn.disabled = items.length < 2;
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("../../sw.js").catch(() => {});
  });
}
