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

/** Template bar-chart icon for macOS menu bar. levels: 0..7 */
function sparklineIcon(levels, size = 18) {
  const n = levels.length || 12;
  const scale = 2;
  const W = size * scale;
  const H = size * scale;
  const rgba = Buffer.alloc(W * H * 4, 0);

  const pad = 2 * scale;
  const gap = Math.max(1, scale);
  const barW = Math.max(scale, Math.floor((W - pad * 2 - gap * (n - 1)) / n));
  const maxH = H - pad * 2;

  for (let i = 0; i < n; i++) {
    const lv = Math.max(0, Math.min(7, levels[i] || 0));
    const h = lv === 0 ? 0 : Math.max(scale, Math.round((lv / 7) * maxH));
    const x0 = pad + i * (barW + gap);
    const y0 = H - pad - h;
    for (let y = y0; y < H - pad; y++) {
      for (let x = x0; x < x0 + barW && x < W; x++) {
        if (x < 0 || y < 0) continue;
        const o = (y * W + x) * 4;
        rgba[o] = 0;
        rgba[o + 1] = 0;
        rgba[o + 2] = 0;
        rgba[o + 3] = 230;
      }
    }
  }

  const png = encodePng(rgba, W, H);
  const img = nativeImage.createFromBuffer(png, { scaleFactor: scale });
  try {
    img.setTemplateImage(true);
  } catch {
    /* ignore */
  }
  return img;
}

const SPARK_CHARS = [" ", "▁", "▂", "▃", "▄", "▅", "▆", "▇"];

function sparkTitle(levels) {
  return levels.map((l) => SPARK_CHARS[Math.max(0, Math.min(7, l || 0))]).join("");
}

function fmtMin(sec) {
  const m = Math.round((sec || 0) / 60);
  if (m < 60) return `${m}м`;
  const h = Math.floor(m / 60);
  return `${h}ч${m % 60}м`;
}

module.exports = { sparklineIcon, sparkTitle, fmtMin };
