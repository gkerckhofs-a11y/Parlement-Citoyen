// Encoder: qrcode-generator 2.0.4 (MIT). Software decoder: jsQR 1.4.0
// (Apache-2.0), loaded only when needed. Both are served from this application.
import qrcode from "./vendor/qrcode-generator.js";

qrcode.stringToBytes = (text) => new TextEncoder().encode(text);

export function qrSvg(value) {
  const code = qrcode(0, "M");
  code.addData(value, "Byte");
  code.make();
  const count = code.getModuleCount();
  const size = count + 8; // Four white modules on each side.
  const runs = [];
  for (let row = 0; row < count; row++) {
    let start = -1;
    for (let column = 0; column <= count; column++) {
      if (column < count && code.isDark(row, column)) {
        if (start === -1) start = column;
      } else if (start !== -1) {
        const length = column - start;
        runs.push(`M${start + 4} ${row + 4}h${length}v1h-${length}z`);
        start = -1;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Code QR" width="240" height="240" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path fill="black" d="${runs.join("")}"/></svg>`;
}

function createReader(maxSide) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let detector;
  try {
    if (globalThis.BarcodeDetector)
      detector = new BarcodeDetector({ formats: ["qr_code"] });
  } catch {
    // Some browsers expose the API without a QR implementation.
  }
  return async (image) => {
    const width = image.videoWidth || image.naturalWidth;
    const height = image.videoHeight || image.naturalHeight;
    if (!width || !height) return "";
    const scale = Math.min(1, maxSide / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    if (detector) {
      try {
        const [code] = await detector.detect(canvas);
        if (code?.rawValue) return code.rawValue;
      } catch {
        detector = null;
      }
    }
    await import("./vendor/jsQR.js");
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return globalThis.jsQR(pixels.data, pixels.width, pixels.height)?.data || "";
  };
}

export async function readCardImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("Impossible de lire cette image."));
      image.src = url;
    });
    const value = await createReader(1800)(image);
    if (!value)
      throw new Error("Aucun QR code lisible. Cadrez la carte et reprenez la photo.");
    return value;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Returns synchronously so a caller can cancel while camera permission is pending.
export function startCardCamera(video, onValue, onError) {
  let stopped = false;
  let stream;
  let timer;
  const reader = createReader(720);
  function stop() {
    stopped = true;
    clearTimeout(timer);
    window.removeEventListener("pagehide", stop);
    document.removeEventListener("visibilitychange", visibility);
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      if (video.srcObject === stream) video.srcObject = null;
    }
  }
  function visibility() {
    if (document.hidden) stop();
  }
  function fail(error) {
    if (stopped) return;
    stop();
    const message = {
      NotAllowedError: "L’accès à la caméra a été refusé. Choisissez une image ou autorisez la caméra dans votre navigateur.",
      NotFoundError: "Aucune caméra disponible. Choisissez une image du QR code.",
      NotReadableError: "La caméra est occupée ou indisponible. Choisissez une image du QR code.",
    }[error?.name];
    onError(message ? new Error(message) : error);
  }
  async function readFrame() {
    if (stopped) return;
    if (!video.isConnected) return stop();
    try {
      const value = video.readyState >= 2 && await reader(video);
      if (stopped) return;
      if (value) {
        stop();
        onValue(value);
      } else {
        timer = setTimeout(readFrame, 160);
      }
    } catch (error) {
      fail(error);
    }
  }
  async function open() {
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error("La caméra est indisponible. Choisissez une photo du QR code.");
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
    });
    if (stopped || !video.isConnected) return stop();
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    if (!stopped) readFrame();
  }
  window.addEventListener("pagehide", stop);
  document.addEventListener("visibilitychange", visibility);
  open().catch(fail);
  return stop;
}
