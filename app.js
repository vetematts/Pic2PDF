/* global PDFLib */
const fileInput = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");
const list = document.getElementById("list");
const exportBtn = document.getElementById("exportBtn");
const clearBtn = document.getElementById("clearBtn");
const downscaleSelect = document.getElementById("downscale");
const countLabel = document.getElementById("count");
const statusLabel = document.getElementById("status");

const items = [];
let dragId = null;

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
    event.preventDefault();
    dropZone.classList.remove("dragover");
  });
});

dropZone.addEventListener("drop", (event) => {
  handleFiles(event.dataTransfer.files);
});

clearBtn.addEventListener("click", () => {
  items.length = 0;
  list.innerHTML = "";
  updateUI();
});

exportBtn.addEventListener("click", async () => {
  if (!items.length) return;
  exportBtn.disabled = true;
  clearBtn.disabled = true;
  statusLabel.textContent = "Building PDF...";

  try {
    const pdfDoc = await PDFLib.PDFDocument.create();
    const maxDim = Number(downscaleSelect.value);

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const dataUrl = maxDim
        ? await downscaleImage(item.dataUrl, maxDim, item.type)
        : item.dataUrl;
      const bytes = await dataUrlToBytes(dataUrl);
      const embed = item.type === "image/png"
        ? await pdfDoc.embedPng(bytes)
        : await pdfDoc.embedJpg(bytes);

      const { width, height } = embed.size();
      const page = pdfDoc.addPage([width, height]);
      page.drawImage(embed, { x: 0, y: 0, width, height });
      statusLabel.textContent = `Added ${i + 1} / ${items.length}`;
      await new Promise((r) => setTimeout(r, 0));
    }

    const pdfBytes = await pdfDoc.save();
    downloadBlob(new Blob([pdfBytes], { type: "application/pdf" }), "pic2pdf.pdf");
    statusLabel.textContent = "Done!";
  } catch (error) {
    console.error(error);
    statusLabel.textContent = "Failed to export.";
  } finally {
    exportBtn.disabled = items.length === 0;
    clearBtn.disabled = items.length === 0;
  }
});

async function handleFiles(fileList) {
  const files = Array.from(fileList).filter((file) =>
    ["image/png", "image/jpeg"].includes(file.type)
  );

  if (!files.length) return;

  statusLabel.textContent = "Loading images...";

  for (const file of files) {
    const dataUrl = await fileToDataUrl(file);
    const dims = await getImageSize(dataUrl);
    items.push({
      id: crypto.randomUUID(),
      name: file.name,
      type: file.type,
      dataUrl,
      width: dims.width,
      height: dims.height,
    });
  }

  renderList();
  statusLabel.textContent = "";
}

function renderList() {
  list.innerHTML = "";

  items.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "item";
    li.setAttribute("draggable", "true");
    li.dataset.id = item.id;

    const img = document.createElement("img");
    img.src = item.dataUrl;
    img.alt = item.name;
    img.className = "thumb";

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `<strong>${index + 1}. ${item.name}</strong><small>${item.width}×${item.height}px</small>`;

    const actions = document.createElement("div");
    actions.className = "actions";

    const dragHandle = document.createElement("span");
    dragHandle.className = "drag-handle";
    dragHandle.textContent = "↕";
    dragHandle.title = "Drag to reorder";

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => {
      const idx = items.findIndex((entry) => entry.id === item.id);
      if (idx > -1) {
        items.splice(idx, 1);
        renderList();
      }
    });

    actions.append(dragHandle, removeBtn);
    li.append(img, meta, actions);
    list.append(li);

    li.addEventListener("dragstart", (event) => {
      dragId = item.id;
      event.dataTransfer.effectAllowed = "move";
      li.classList.add("dragging");
    });

    li.addEventListener("dragend", () => {
      dragId = null;
      li.classList.remove("dragging");
    });

    li.addEventListener("dragover", (event) => {
      event.preventDefault();
      const targetId = li.dataset.id;
      if (!dragId || dragId === targetId) return;
      const dragIndex = items.findIndex((entry) => entry.id === dragId);
      const hoverIndex = items.findIndex((entry) => entry.id === targetId);
      if (dragIndex === -1 || hoverIndex === -1) return;
      const [moved] = items.splice(dragIndex, 1);
      items.splice(hoverIndex, 0, moved);
      renderList();
    });
  });

  updateUI();
}

function updateUI() {
  countLabel.textContent = `${items.length} image${items.length === 1 ? "" : "s"}`;
  exportBtn.disabled = items.length === 0;
  clearBtn.disabled = items.length === 0;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getImageSize(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

async function downscaleImage(dataUrl, maxDim, type) {
  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });

  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  if (scale >= 1) return dataUrl;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);

  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      },
      type,
      0.92
    );
  });
}

async function dataUrlToBytes(dataUrl) {
  const res = await fetch(dataUrl);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
