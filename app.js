/* global PDFLib */
const fileInput = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");
const list = document.getElementById("list");
const emptyState = document.getElementById("emptyState");
const exportBtn = document.getElementById("exportBtn");
const clearBtn = document.getElementById("clearBtn");
const downscaleSelect = document.getElementById("downscale");
const qualityRange = document.getElementById("quality");
const qualityValue = document.getElementById("qualityValue");
const pageSizeSelect = document.getElementById("pageSize");
const fitModeSelect = document.getElementById("fitMode");
const marginSelect = document.getElementById("margin");
const pageBgInput = document.getElementById("pageBg");
const showSizesToggle = document.getElementById("showSizes");
const advancedToggle = document.getElementById("advancedToggle");
const controls = document.getElementById("controls");
const advancedPanel = document.querySelector(".controls-advanced");
const countLabel = document.getElementById("count");
const statusLabel = document.getElementById("status");
const progress = document.getElementById("progress");
const dismissStatusBtn = document.getElementById("dismissStatus");
const estimateLabel = document.getElementById("estimate");

const items = [];
let dragId = null;
let estimateToken = 0;

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

dropZone.addEventListener("click", (event) => {
  if (event.target.closest("button, input, select, label")) return;
  fileInput.click();
});

clearBtn.addEventListener("click", () => {
  items.length = 0;
  list.innerHTML = "";
  clearStatus();
  updateUI();
});

showSizesToggle.addEventListener("change", () => {
  renderList();
});

function openAdvanced() {
  controls.classList.add("advanced-on");
  advancedToggle.textContent = "Hide advanced";
  advancedToggle.setAttribute("aria-expanded", "true");
  const height = advancedPanel.scrollHeight;
  advancedPanel.style.height = `${height}px`;
  const onEnd = (event) => {
    if (event.propertyName !== "height") return;
    advancedPanel.style.height = "auto";
    advancedPanel.removeEventListener("transitionend", onEnd);
  };
  advancedPanel.addEventListener("transitionend", onEnd);
}

function closeAdvanced() {
  const height = advancedPanel.getBoundingClientRect().height;
  advancedPanel.style.height = `${height}px`;
  requestAnimationFrame(() => {
    controls.classList.remove("advanced-on");
    advancedPanel.style.height = "0px";
  });
  advancedToggle.textContent = "Advanced";
  advancedToggle.setAttribute("aria-expanded", "false");
}

advancedToggle.addEventListener("click", () => {
  const isOpen = controls.classList.contains("advanced-on");
  if (isOpen) {
    closeAdvanced();
  } else {
    openAdvanced();
  }
});

qualityRange.addEventListener("input", () => {
  qualityValue.textContent = Number(qualityRange.value).toFixed(2);
});

qualityRange.addEventListener("change", () => {
  scheduleEstimate();
});

downscaleSelect.addEventListener("change", () => {
  scheduleEstimate();
});

dismissStatusBtn.addEventListener("click", () => {
  clearStatus();
});

exportBtn.addEventListener("click", async () => {
  if (!items.length) return;
  exportBtn.disabled = true;
  clearBtn.disabled = true;
  statusLabel.textContent = "Building PDF...";
  progress.hidden = false;
  progress.max = items.length;
  progress.value = 0;
  dismissStatusBtn.hidden = true;

  try {
    const pdfDoc = await PDFLib.PDFDocument.create();
    const maxDim = Number(downscaleSelect.value);
    const quality = Number(qualityRange.value);
    const margin = Number(marginSelect.value);
    const pageBg = pageBgInput.value;

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const rotatedUrl = item.rotation
        ? await rotateImage(item.dataUrl, item.rotation, item.type)
        : item.dataUrl;
      const dataUrl = await processImage(rotatedUrl, maxDim, item.type, quality);
      const bytes = await dataUrlToBytes(dataUrl);
      const embed = item.type === "image/png"
        ? await pdfDoc.embedPng(bytes)
        : await pdfDoc.embedJpg(bytes);

      const { width, height } = embed.size();
      const pageSize = getPageSize(pageSizeSelect.value, width, height, margin);
      const page = pdfDoc.addPage([pageSize.width, pageSize.height]);
      const bgColor = hexToRgb(pageBg);
      if (bgColor) {
        page.drawRectangle({
          x: 0,
          y: 0,
          width: pageSize.width,
          height: pageSize.height,
          color: PDFLib.rgb(bgColor.r, bgColor.g, bgColor.b),
        });
      }

      const placement = getPlacement(
        pageSize.width - margin * 2,
        pageSize.height - margin * 2,
        width,
        height,
        fitModeSelect.value
      );

      page.drawImage(embed, {
        x: placement.x + margin,
        y: placement.y + margin,
        width: placement.width,
        height: placement.height,
      });
      statusLabel.textContent = `Added ${i + 1} / ${items.length}`;
      progress.value = i + 1;
      await new Promise((r) => setTimeout(r, 0));
    }

    const pdfBytes = await pdfDoc.save();
    downloadBlob(new Blob([pdfBytes], { type: "application/pdf" }), "pic2pdf.pdf");
    statusLabel.textContent = "Done! PDF downloaded.";
    dismissStatusBtn.hidden = false;
  } catch (error) {
    console.error(error);
    statusLabel.textContent = "Failed to export.";
    dismissStatusBtn.hidden = false;
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
  progress.hidden = false;
  progress.max = files.length;
  progress.value = 0;
  dismissStatusBtn.hidden = true;

  let loaded = 0;
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
      rotation: 0,
    });
    loaded += 1;
    progress.value = loaded;
  }

  renderList();
  statusLabel.textContent = `Loaded ${files.length} image${files.length === 1 ? "" : "s"}.`;
  dismissStatusBtn.hidden = false;
  scheduleEstimate();
}

function renderList() {
  list.innerHTML = "";
  const svgNs = "http://www.w3.org/2000/svg";

  items.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "item";
    li.setAttribute("draggable", "true");
    li.dataset.id = item.id;

    const img = document.createElement("img");
    img.src = item.dataUrl;
    img.alt = item.name;
    img.className = "thumb";
    if (item.rotation) {
      img.style.transform = `rotate(${item.rotation}deg)`;
    } else {
      img.style.transform = "";
    }

    const meta = document.createElement("div");
    meta.className = "meta";
    const dims = getRotatedDims(item);
    const sizes = `${dims.width}×${dims.height}px`;
    const sizeMarkup = showSizesToggle.checked ? `<small>${sizes}</small>` : "";
    meta.innerHTML = `<strong title=\"${sizes}\">${index + 1}. ${item.name}</strong>${sizeMarkup}`;

    const actions = document.createElement("div");
    actions.className = "actions";

    const dragHandle = document.createElement("span");
    dragHandle.className = "drag-handle";
    dragHandle.textContent = "Drag";
    dragHandle.title = "Drag to reorder";

    const rotateBtn = document.createElement("button");
    rotateBtn.className = "ghost small icon-btn";
    rotateBtn.innerHTML = `
      <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <path d="M10 3a7 7 0 1 1-6.2 10.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        <path d="M2.8 8.8 3.1 13l3.9-1.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span>Rotate 90°</span>
    `;
    rotateBtn.title = "Rotate 90 degrees";
    rotateBtn.addEventListener("click", () => {
      item.rotation = (item.rotation + 90) % 360;
      renderList();
    });

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

    actions.append(dragHandle, rotateBtn, removeBtn);
    li.append(img, meta, actions);

    const edgeOrbit = document.createElementNS(svgNs, "svg");
    edgeOrbit.setAttribute("class", "edge-orbit");
    edgeOrbit.setAttribute("viewBox", "0 0 100 60");
    edgeOrbit.setAttribute("aria-hidden", "true");

    const edgePath = document.createElementNS(svgNs, "rect");
    edgePath.setAttribute("x", "1");
    edgePath.setAttribute("y", "1");
    edgePath.setAttribute("width", "98");
    edgePath.setAttribute("height", "58");
    edgePath.setAttribute("rx", "10");
    edgePath.setAttribute("ry", "10");
    edgePath.setAttribute("pathLength", "100");

    edgeOrbit.append(edgePath);
    li.append(edgeOrbit);

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
  scheduleEstimate();
}

function updateUI() {
  countLabel.textContent = `${items.length} image${items.length === 1 ? "" : "s"}`;
  exportBtn.disabled = items.length === 0;
  clearBtn.disabled = items.length === 0;
  emptyState.hidden = items.length > 0;
}

function getRotatedDims(item) {
  if (item.rotation % 180 === 0) {
    return { width: item.width, height: item.height };
  }
  return { width: item.height, height: item.width };
}

function clearStatus() {
  statusLabel.textContent = "";
  progress.value = 0;
  progress.hidden = true;
  dismissStatusBtn.hidden = true;
}

function scheduleEstimate() {
  estimateToken += 1;
  const token = estimateToken;
  estimateLabel.textContent = "Estimated: …";
  setTimeout(() => {
    if (token !== estimateToken) return;
    estimateTotalBytes(token);
  }, 120);
}

async function estimateTotalBytes(token) {
  if (!items.length) {
    estimateLabel.textContent = "Estimated: --";
    return;
  }

  const maxDim = Number(downscaleSelect.value);
  const quality = Number(qualityRange.value);
  let total = 0;

  for (const item of items) {
    if (token !== estimateToken) return;
    const rotatedUrl = item.rotation
      ? await rotateImage(item.dataUrl, item.rotation, item.type)
      : item.dataUrl;
    const processed = await processImage(rotatedUrl, maxDim, item.type, quality);
    total += dataUrlSizeBytes(processed);
    await new Promise((r) => setTimeout(r, 0));
  }

  estimateLabel.textContent = `Estimated: ${formatBytes(total)}`;
}

function getPageSize(mode, imgWidth, imgHeight, margin) {
  if (mode === "a4") {
    return { width: 595.28, height: 841.89 };
  }
  if (mode === "letter") {
    return { width: 612, height: 792 };
  }
  return { width: imgWidth + margin * 2, height: imgHeight + margin * 2 };
}

function getPlacement(pageWidth, pageHeight, imgWidth, imgHeight, fitMode) {
  if (pageWidth === imgWidth && pageHeight === imgHeight) {
    return { x: 0, y: 0, width: imgWidth, height: imgHeight };
  }

  const scaleX = pageWidth / imgWidth;
  const scaleY = pageHeight / imgHeight;
  const scale = fitMode === "cover" ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
  const width = imgWidth * scale;
  const height = imgHeight * scale;
  const x = (pageWidth - width) / 2;
  const y = (pageHeight - height) / 2;

  return { x, y, width, height };
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

  return canvasToDataUrl(canvas, type, 0.92);
}

async function processImage(dataUrl, maxDim, type, quality) {
  if (!maxDim && (quality >= 0.99 || type === "image/png")) {
    return dataUrl;
  }

  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });

  const scale = maxDim
    ? Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
    : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);

  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return canvasToDataUrl(canvas, type, quality);
}

async function rotateImage(dataUrl, degrees, type) {
  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });

  const radians = (degrees * Math.PI) / 180;
  const isRightAngle = Math.abs(degrees) % 180 !== 0;
  const canvas = document.createElement("canvas");
  canvas.width = isRightAngle ? img.naturalHeight : img.naturalWidth;
  canvas.height = isRightAngle ? img.naturalWidth : img.naturalHeight;

  const ctx = canvas.getContext("2d");
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(radians);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

  return canvasToDataUrl(canvas, type, 0.92);
}

function canvasToDataUrl(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      },
      type,
      quality
    );
  });
}

function dataUrlSizeBytes(dataUrl) {
  if (typeof dataUrl !== "string") return 0;
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) return 0;
  const base64Length = dataUrl.length - commaIndex - 1;
  const padding = dataUrl.endsWith("==") ? 2 : dataUrl.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64Length * 3) / 4) - padding);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value < 10 ? 2 : 1)} ${units[unitIndex]}`;
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

function hexToRgb(hex) {
  if (typeof hex !== "string") return null;
  const value = hex.replace("#", "");
  if (value.length !== 6) return null;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return { r: r / 255, g: g / 255, b: b / 255 };
}
