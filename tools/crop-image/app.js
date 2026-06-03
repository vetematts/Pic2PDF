/* Origami Docs — Crop Image
 * Drag a selection over an image and export the crop. 100% client-side canvas.
 */

const fileInput = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");
const emptyState = document.getElementById("emptyState");
const stage = document.getElementById("stage");
const cropImg = document.getElementById("cropImg");
const cropBox = document.getElementById("cropBox");
const ratioSelect = document.getElementById("ratioSelect");
const formatSelect = document.getElementById("formatSelect");
const qualityRange = document.getElementById("qualityRange");
const qualityValue = document.getElementById("qualityValue");
const qualityWrap = document.getElementById("qualityWrap");
const fileNameInput = document.getElementById("fileNameInput");
const resetBtn = document.getElementById("resetBtn");
const exportBtn = document.getElementById("exportBtn");
const clearBtn = document.getElementById("clearBtn");
const countLabel = document.getElementById("count");
const statusLabel = document.getElementById("status");

const MIN = 16; // min crop size in natural px
let img = null;
let srcType = "image/png";
let sourceName = "cropped";
let natW = 0;
let natH = 0;
let scale = 1; // display px per natural px
let crop = { x: 0, y: 0, w: 0, h: 0 };
let drag = null;

function setStatus(msg) {
  statusLabel.textContent = msg;
}

function syncQualityVisibility() {
  const f = formatSelect.value;
  const isPng = f === "png" || (f === "auto" && srcType === "image/png");
  qualityWrap.style.display = isPng ? "none" : "";
}

formatSelect.addEventListener("change", syncQualityVisibility);
qualityRange.addEventListener("input", () => {
  qualityValue.textContent = Number(qualityRange.value).toFixed(2);
});

ratioSelect.addEventListener("change", () => {
  if (img) applyRatioToCrop();
});

fileInput.addEventListener("change", (e) => {
  const f = e.target.files && e.target.files[0];
  if (f) loadImage(f);
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
  if (f) loadImage(f);
});

resetBtn.addEventListener("click", () => {
  if (img) {
    resetCrop();
    layout();
  }
});

clearBtn.addEventListener("click", () => {
  img = null;
  stage.hidden = true;
  emptyState.style.display = "";
  countLabel.textContent = "No image loaded";
  setStatus("");
  exportBtn.disabled = true;
  resetBtn.disabled = true;
  clearBtn.disabled = true;
});

exportBtn.addEventListener("click", exportCrop);

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "e") {
    e.preventDefault();
    if (!exportBtn.disabled) exportCrop();
  }
});

window.addEventListener("resize", () => {
  if (img) {
    measureScale();
    layout();
  }
});

function loadImage(file) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
    setStatus("Pick a JPG, PNG, or WebP image.");
    return;
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    img = image;
    srcType = file.type;
    sourceName = file.name.replace(/\.[^.]+$/, "") || "cropped";
    natW = image.naturalWidth;
    natH = image.naturalHeight;
    cropImg.src = url;
    stage.hidden = false;
    emptyState.style.display = "none";
    exportBtn.disabled = false;
    resetBtn.disabled = false;
    clearBtn.disabled = false;
    syncQualityVisibility();
    // Wait a frame so the <img> has layout dimensions
    requestAnimationFrame(() => {
      measureScale();
      resetCrop();
      layout();
      setStatus("");
    });
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    setStatus("Could not load that image.");
  };
  image.src = url;
}

function measureScale() {
  const dispW = cropImg.clientWidth || natW;
  scale = dispW / natW;
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
      x: Math.round(natW * 0.1),
      y: Math.round(natH * 0.1),
      w: Math.round(natW * 0.8),
      h: Math.round(natH * 0.8),
    };
  } else {
    let w = natW;
    let h = w / ratio;
    if (h > natH) {
      h = natH;
      w = h * ratio;
    }
    crop = {
      x: Math.round((natW - w) / 2),
      y: Math.round((natH - h) / 2),
      w: Math.round(w),
      h: Math.round(h),
    };
  }
}

function applyRatioToCrop() {
  const ratio = ratioValue();
  if (ratio == null) {
    layout();
    return;
  }
  // Keep center, fit ratio inside current crop bounds & image
  const cx = crop.x + crop.w / 2;
  const cy = crop.y + crop.h / 2;
  let w = crop.w;
  let h = w / ratio;
  if (h > crop.h) {
    h = crop.h;
    w = h * ratio;
  }
  crop.w = Math.round(w);
  crop.h = Math.round(h);
  crop.x = Math.round(cx - crop.w / 2);
  crop.y = Math.round(cy - crop.h / 2);
  clampCrop();
  layout();
}

function clampCrop() {
  crop.w = Math.max(MIN, Math.min(crop.w, natW));
  crop.h = Math.max(MIN, Math.min(crop.h, natH));
  crop.x = Math.max(0, Math.min(crop.x, natW - crop.w));
  crop.y = Math.max(0, Math.min(crop.y, natH - crop.h));
}

function layout() {
  cropBox.style.left = `${crop.x * scale}px`;
  cropBox.style.top = `${crop.y * scale}px`;
  cropBox.style.width = `${crop.w * scale}px`;
  cropBox.style.height = `${crop.h * scale}px`;
  countLabel.textContent = `${Math.round(crop.w)} × ${Math.round(crop.h)} px`;
}

function pointerNatural(e) {
  const rect = cropImg.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / scale,
    y: (e.clientY - rect.top) / scale,
  };
}

cropBox.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  const handle = e.target.classList.contains("handle")
    ? [...e.target.classList].find((c) => c !== "handle")
    : null;
  drag = {
    mode: handle ? "resize" : "move",
    handle,
    start: pointerNatural(e),
    orig: { ...crop },
  };
  cropBox.setPointerCapture(e.pointerId);
});

cropBox.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const p = pointerNatural(e);
  const dx = p.x - drag.start.x;
  const dy = p.y - drag.start.y;
  const o = drag.orig;
  const ratio = ratioValue();

  if (drag.mode === "move") {
    crop.x = o.x + dx;
    crop.y = o.y + dy;
    clampCrop();
    layout();
    return;
  }

  let { x, y, w, h } = o;
  const h_ = drag.handle;
  if (h_.includes("e")) w = o.w + dx;
  if (h_.includes("s")) h = o.h + dy;
  if (h_.includes("w")) {
    w = o.w - dx;
    x = o.x + dx;
  }
  if (h_.includes("n")) {
    h = o.h - dy;
    y = o.y + dy;
  }

  if (ratio != null) {
    // Drive height from width for corner/side handles
    if (h_ === "e" || h_ === "w" || h_ === "ne" || h_ === "nw" || h_ === "se" || h_ === "sw") {
      h = w / ratio;
      if (h_.includes("n")) y = o.y + (o.h - h);
    } else {
      w = h * ratio;
      if (h_.includes("w")) x = o.x + (o.w - w);
    }
  }

  if (w >= MIN) {
    crop.w = w;
    crop.x = x;
  }
  if (h >= MIN) {
    crop.h = h;
    crop.y = y;
  }
  clampCrop();
  layout();
});

cropBox.addEventListener("pointerup", () => {
  drag = null;
});
cropBox.addEventListener("pointercancel", () => {
  drag = null;
});

function outputMime() {
  const f = formatSelect.value;
  if (f === "jpeg") return "image/jpeg";
  if (f === "png") return "image/png";
  if (f === "webp") return "image/webp";
  return srcType; // auto
}

function outputExt(mime) {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  return "png";
}

function exportCrop() {
  if (!img) {
    setStatus("Add an image first.");
    return;
  }
  const cw = Math.round(crop.w);
  const ch = Math.round(crop.h);
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  const mime = outputMime();
  if (mime === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cw, ch);
  }
  ctx.drawImage(img, Math.round(crop.x), Math.round(crop.y), cw, ch, 0, 0, cw, ch);
  const quality = Number(qualityRange.value);
  canvas.toBlob(
    (blob) => {
      if (!blob) {
        setStatus("Export failed.");
        return;
      }
      const ext = outputExt(mime);
      let name = fileNameInput.value.trim() || `${sourceName}-cropped`;
      name = name.replace(/\.[a-z0-9]+$/i, "");
      downloadBlob(blob, `${name}.${ext}`);
      setStatus(`Exported ${cw}×${ch}.`);
    },
    mime,
    mime === "image/png" ? undefined : quality
  );
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
