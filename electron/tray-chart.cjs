const { nativeImage } = require("electron");
const zlib = require("zlib");

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeB = Buffer.from(type);
  const crcB = Buffer.alloc(4);
  crcB.writeUInt32BE(crc32(Buffer.concat([typeB, data])));
  return Buffer.concat([len, typeB, data, crcB]);
}

/** Encode RGBA raw pixels to PNG Buffer */
function encodePng(rgba, width, height) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function fillRect(rgba, W, x0, y0, x1, y1, a = 230) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (x < 0 || y < 0 || x >= W) continue;
      const o = (y * W + x) * 4;
      rgba[o] = 0;
      rgba[o + 1] = 0;
      rgba[o + 2] = 0;
      rgba[o + 3] = a;
    }
  }
}

/** Template monitor icon for macOS menu bar */
function monitorIcon(size = 18) {
  const scale = 2;
  const W = size * scale;
  const H = size * scale;
  const rgba = Buffer.alloc(W * H * 4, 0);
  const s = scale;

  // screen frame
  const sx = 3 * s;
  const sy = 2 * s;
  const sw = 12 * s;
  const sh = 9 * s;
  const t = Math.max(2, s); // stroke thickness
  fillRect(rgba, W, sx, sy, sx + sw, sy + t); // top
  fillRect(rgba, W, sx, sy + sh - t, sx + sw, sy + sh); // bottom
  fillRect(rgba, W, sx, sy, sx + t, sy + sh); // left
  fillRect(rgba, W, sx + sw - t, sy, sx + sw, sy + sh); // right

  // stand neck
  const neckW = 2 * s;
  const neckX = Math.floor(W / 2 - neckW / 2);
  fillRect(rgba, W, neckX, sy + sh, neckX + neckW, sy + sh + 2 * s);

  // stand base
  const baseW = 6 * s;
  const baseX = Math.floor(W / 2 - baseW / 2);
  fillRect(rgba, W, baseX, sy + sh + 2 * s, baseX + baseW, sy + sh + 2 * s + t);

  const png = encodePng(rgba, W, H);
  const img = nativeImage.createFromBuffer(png, { scaleFactor: scale });
  try {
    img.setTemplateImage(true);
  } catch {
    /* ignore */
  }
  return img;
}

function fmtMin(sec) {
  const m = Math.round((sec || 0) / 60);
  if (m < 60) return `${m}м`;
  const h = Math.floor(m / 60);
  return `${h}ч${m % 60}м`;
}

module.exports = { monitorIcon, fmtMin };
