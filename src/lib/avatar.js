// ---------------------------------------------------------------------------
// Cute AI avatar — a real stylization of the driver's license photo.
//
// The pipeline runs entirely client-side on a canvas (the same "cartoonify"
// recipe photo-to-photo apps use): the photo region is cropped (biased to the
// left third, where the portrait sits on an LTO license card), heavily
// smoothed to remove texture, posterized to a cartoon palette, saturated and
// warmed to feel friendly, then re-outlined with Sobel edges in theme cocoa.
// Every avatar is genuinely derived from that driver's own photo.
// ---------------------------------------------------------------------------

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function boxBlur(data, w, h, radius, passes = 2) {
  for (let p = 0; p < passes; p++) {
    // horizontal pass
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0, n = 0;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = Math.min(w - 1, Math.max(0, x + dx));
          const i = (y * w + xx) * 4;
          r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
        }
        const i = (y * w + x) * 4;
        data[i] = r / n; data[i + 1] = g / n; data[i + 2] = b / n;
      }
    }
    // vertical pass
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        let r = 0, g = 0, b = 0, n = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          const yy = Math.min(h - 1, Math.max(0, y + dy));
          const i = (yy * w + x) * 4;
          r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
        }
        const i = (y * w + x) * 4;
        data[i] = r / n; data[i + 1] = g / n; data[i + 2] = b / n;
      }
    }
  }
  return data;
}

/**
 * @param {string} srcUrl  photo (data URL or object URL)
 * @param {object} opts    { size = 224 }
 * @returns {Promise<string>} JPEG data URL of the stylized square avatar
 */
export async function generateCuteAvatar(srcUrl, { size = 224 } = {}) {
  const img = await loadImage(srcUrl);

  // Crop square, biased left (LTO license portraits sit on the left third)
  const cropH = img.naturalHeight;
  const cropW = Math.min(img.naturalWidth, Math.round(cropH * 0.9));
  const cropX = Math.min(
    Math.max(0, Math.round(img.naturalWidth * 0.04)),
    img.naturalWidth - cropW
  );

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, cropX, 0, cropW, cropH, 0, 0, size, size);

  const imageData = ctx.getImageData(0, 0, size, size);
  const px = imageData.data;
  const w = size, h = size;

  // Keep the original for edge detection before smoothing colors
  const orig = new Uint8ClampedArray(px);

  // 1) Smooth: kill texture (skin, background noise) → flat color regions
  boxBlur(px, w, h, 3, 2);

  // 2) Posterize to 6 levels per channel + 3) saturate & warm for friendliness
  const LEVELS = 6;
  for (let i = 0; i < px.length; i += 4) {
    let r = px[i], g = px[i + 1], b = px[i + 2];

    // posterize
    r = Math.round((r / 255) * (LEVELS - 1)) * (255 / (LEVELS - 1));
    g = Math.round((g / 255) * (LEVELS - 1)) * (255 / (LEVELS - 1));
    b = Math.round((b / 255) * (LEVELS - 1)) * (255 / (LEVELS - 1));

    // saturate 1.3x around mid-gray, then warm lift (cute & sunny)
    const avg = (r + g + b) / 3;
    r = avg + (r - avg) * 1.3;
    g = avg + (g - avg) * 1.3;
    b = avg + (b - avg) * 1.3;
    r *= 1.05; b *= 0.94;

    px[i] = r; px[i + 1] = g; px[i + 2] = b;
  }

  // 4) Sobel edges from the ORIGINAL image → cocoa cartoon outlines
  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < orig.length; i += 4, p++) {
    gray[p] = 0.299 * orig[i] + 0.587 * orig[i + 1] + 0.114 * orig[i + 2];
  }
  const edge = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      const gx =
        -gray[p - w - 1] - 2 * gray[p - 1] - gray[p + w - 1] +
        gray[p - w + 1] + 2 * gray[p + 1] + gray[p + w + 1];
      const gy =
        -gray[p - w - 1] - 2 * gray[p - w] - gray[p - w + 1] +
        gray[p + w - 1] + 2 * gray[p + w] + gray[p + w + 1];
      edge[p] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  for (let p = 0, i = 0; p < edge.length; p++, i += 4) {
    const t = Math.min(1, Math.max(0, (edge[p] - 60) / 90)); // soft threshold
    if (t > 0) {
      // blend toward theme cocoa #2E2218
      px[i] = px[i] * (1 - t) + 46 * t;
      px[i + 1] = px[i + 1] * (1 - t) + 34 * t;
      px[i + 2] = px[i + 2] * (1 - t) + 24 * t;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.85);
}

export function initials(name = "") {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}
