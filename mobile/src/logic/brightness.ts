import { unzlibSync } from "fflate";

// Cheap "is this frame black?" check for auto capture (tested in brightness.test.ts). The caller
// shrinks the frame to a tiny PNG; we inflate it and average the luma. Pure JS, works in Expo Go.

export const DARK_LUMA = 18; // 0-255; a frame darker than this is not worth sending

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function fromBase64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let acc = 0;
  let o = 0;
  for (let i = 0; i < clean.length; i++) {
    acc = (acc << 6) | B64.indexOf(clean[i]);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  return out.subarray(0, o);
}

const u32 = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;

/** Average luma (0-255) of an 8-bit PNG given as base64, or NaN if it can't be read. */
export function averageLuma(pngBase64: string): number {
  try {
    const b = fromBase64(pngBase64);
    if (b.length < 33 || b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) return NaN;
    let p = 8;
    let width = 0;
    let height = 0;
    let colorType = -1;
    const idat: Uint8Array[] = [];
    while (p + 8 <= b.length) {
      const len = u32(b, p);
      const type = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]);
      const data = b.subarray(p + 8, p + 8 + len);
      if (type === "IHDR") {
        width = u32(data, 0);
        height = u32(data, 4);
        if (data[8] !== 8 || data[12] !== 0) return NaN; // 8-bit, non-interlaced only
        colorType = data[9];
      } else if (type === "IDAT") idat.push(data);
      else if (type === "IEND") break;
      p += 12 + len;
    }
    const channels = ({ 0: 1, 2: 3, 4: 2, 6: 4 } as Record<number, number>)[colorType];
    if (!channels || !width || !height || !idat.length) return NaN;
    const joined = new Uint8Array(idat.reduce((n, c) => n + c.length, 0));
    let o = 0;
    for (const c of idat) {
      joined.set(c, o);
      o += c.length;
    }
    const raw = unzlibSync(joined);
    const stride = width * channels;
    let prev = new Uint8Array(stride);
    let sum = 0;
    for (let y = 0; y < height; y++) {
      const start = y * (stride + 1);
      const filter = raw[start];
      const row = new Uint8Array(stride);
      for (let x = 0; x < stride; x++) {
        const v = raw[start + 1 + x];
        const a = x >= channels ? row[x - channels] : 0;
        const up = prev[x];
        const c = x >= channels ? prev[x - channels] : 0;
        let pred = 0;
        if (filter === 1) pred = a;
        else if (filter === 2) pred = up;
        else if (filter === 3) pred = (a + up) >> 1;
        else if (filter === 4) {
          const q = a + up - c;
          const pa = Math.abs(q - a);
          const pb = Math.abs(q - up);
          const pc = Math.abs(q - c);
          pred = pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
        }
        row[x] = (v + pred) & 0xff;
      }
      for (let x = 0; x < width; x++) {
        const i = x * channels;
        sum += channels >= 3 ? 0.299 * row[i] + 0.587 * row[i + 1] + 0.114 * row[i + 2] : row[i];
      }
      prev = row;
    }
    return sum / (width * height);
  } catch {
    return NaN;
  }
}

/** True when the frame is too dark to be worth a frame-check. Unmeasurable frames pass. */
export function isTooDark(luma: number): boolean {
  return Number.isFinite(luma) && luma < DARK_LUMA;
}
