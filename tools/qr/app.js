/* global QRCodeStyling */
/* Origami Docs — QR
 * Generate styled QR codes (rounded dots, custom colors, optional center logo)
 * via qr-code-styling. 100% client-side, live preview.
 */

const dataInput = document.getElementById("dataInput");
const dotStyle = document.getElementById("dotStyle");
const cornerStyle = document.getElementById("cornerStyle");
const dotColor = document.getElementById("dotColor");
const bgColor = document.getElementById("bgColor");
const bgTransparent = document.getElementById("bgTransparent");
const errorLevel = document.getElementById("errorLevel");
const marginInput = document.getElementById("marginInput");
const marginValue = document.getElementById("marginValue");
const logoInput = document.getElementById("logoInput");
const removeLogo = document.getElementById("removeLogo");
const logoSize = document.getElementById("logoSize");
const logoSizeValue = document.getElementById("logoSizeValue");
const sizeInput = document.getElementById("sizeInput");
const sizeValue = document.getElementById("sizeValue");
const fileNameInput = document.getElementById("fileNameInput");
const preview = document.getElementById("preview");
const downloadPng = document.getElementById("downloadPng");
const downloadSvg = document.getElementById("downloadSvg");
const downloadJpg = document.getElementById("downloadJpg");
const statusLabel = document.getElementById("status");

const STORAGE_KEY = "origami-qr";
const PREVIEW_SIZE = 320;
let logoDataUrl = null;
let bgIsTransparent = false;

function setStatus(msg) {
  statusLabel.textContent = msg;
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.dotStyle) dotStyle.value = s.dotStyle;
    if (s.cornerStyle) cornerStyle.value = s.cornerStyle;
    if (s.dotColor) dotColor.value = s.dotColor;
    if (s.bgColor) bgColor.value = s.bgColor;
    if (s.bgTransparent) {
      bgIsTransparent = true;
      bgTransparent.classList.add("active");
    }
    if (s.errorLevel) errorLevel.value = s.errorLevel;
    if (s.margin !== undefined) {
      marginInput.value = String(s.margin);
      marginValue.textContent = String(s.margin);
    }
    if (s.logoSize !== undefined) {
      logoSize.value = String(s.logoSize);
      logoSizeValue.textContent = Number(s.logoSize).toFixed(2);
    }
    if (s.size !== undefined) {
      sizeInput.value = String(s.size);
      sizeValue.textContent = String(s.size);
    }
  } catch (_) {}
}

function saveSettings() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        dotStyle: dotStyle.value,
        cornerStyle: cornerStyle.value,
        dotColor: dotColor.value,
        bgColor: bgColor.value,
        bgTransparent: bgIsTransparent,
        errorLevel: errorLevel.value,
        margin: Number(marginInput.value),
        logoSize: Number(logoSize.value),
        size: Number(sizeInput.value),
      })
    );
  } catch (_) {}
}

function effectiveErrorLevel() {
  // A center logo eats data; force at least H so the code still scans.
  if (logoDataUrl) return "H";
  return errorLevel.value || "M";
}

function buildOptions(forExport) {
  const size = forExport ? Number(sizeInput.value) || 512 : PREVIEW_SIZE;
  return {
    width: size,
    height: size,
    type: "canvas",
    data: dataInput.value || " ",
    image: logoDataUrl || undefined,
    margin: Number(marginInput.value) || 0,
    qrOptions: {
      errorCorrectionLevel: effectiveErrorLevel(),
    },
    imageOptions: {
      hideBackgroundDots: true,
      imageSize: Number(logoSize.value) || 0.3,
      margin: 6,
      crossOrigin: "anonymous",
    },
    dotsOptions: {
      type: dotStyle.value,
      color: dotColor.value,
    },
    backgroundOptions: bgIsTransparent
      ? { color: "transparent" }
      : { color: bgColor.value },
    cornersSquareOptions: {
      type: cornerStyle.value,
      color: dotColor.value,
    },
    cornersDotOptions: {
      type: cornerStyle.value === "dot" ? "dot" : "square",
      color: dotColor.value,
    },
  };
}

loadSettings();

const qr = new QRCodeStyling(buildOptions(false));
preview.innerHTML = "";
qr.append(preview);

function refresh() {
  qr.update(buildOptions(false));
  saveSettings();
}

dataInput.addEventListener("input", refresh);
dotStyle.addEventListener("change", refresh);
cornerStyle.addEventListener("change", refresh);
dotColor.addEventListener("input", refresh);
bgColor.addEventListener("input", () => {
  bgIsTransparent = false;
  bgTransparent.classList.remove("active");
  refresh();
});
errorLevel.addEventListener("change", refresh);
marginInput.addEventListener("input", () => {
  marginValue.textContent = marginInput.value;
  refresh();
});
logoSize.addEventListener("input", () => {
  logoSizeValue.textContent = Number(logoSize.value).toFixed(2);
  refresh();
});
sizeInput.addEventListener("input", () => {
  sizeValue.textContent = sizeInput.value;
  saveSettings();
});

bgTransparent.addEventListener("click", () => {
  bgIsTransparent = !bgIsTransparent;
  bgTransparent.classList.toggle("active", bgIsTransparent);
  refresh();
});

logoInput.addEventListener("change", async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  try {
    logoDataUrl = await fileToDataUrl(file);
    removeLogo.disabled = false;
    setStatus("Logo added — error correction bumped to High.");
    refresh();
  } catch (e) {
    setStatus("Could not read that image.");
  }
});

removeLogo.addEventListener("click", () => {
  logoDataUrl = null;
  logoInput.value = "";
  removeLogo.disabled = true;
  setStatus("");
  refresh();
});

downloadPng.addEventListener("click", () => exportAs("png"));
downloadSvg.addEventListener("click", () => exportAs("svg"));
downloadJpg.addEventListener("click", () => exportAs("jpeg"));

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "e") {
    e.preventDefault();
    exportAs("png");
  }
});

async function exportAs(ext) {
  const name = (fileNameInput.value.trim() || "qrcode").replace(/\.[a-z0-9]+$/i, "");
  setStatus(`Exporting ${ext.toUpperCase()}…`);
  try {
    const opts = buildOptions(true);
    // SVG export needs the type set up front; use a separate instance.
    if (ext === "svg") {
      const svgQr = new QRCodeStyling({ ...opts, type: "svg" });
      const blob = await svgQr.getRawData("svg");
      downloadBlob(blob, `${name}.svg`);
    } else {
      const canvasQr = new QRCodeStyling(opts);
      const blob = await canvasQr.getRawData(ext);
      downloadBlob(blob, `${name}.${ext === "jpeg" ? "jpg" : ext}`);
    }
    setStatus(`Saved ${name}.${ext === "jpeg" ? "jpg" : ext}`);
  } catch (e) {
    console.error(e);
    setStatus(`Error: ${e.message || e}`);
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

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("../../sw.js").catch(() => {});
  });
}
