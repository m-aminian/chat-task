import { deflateSync } from "node:zlib";
import type { Rng } from "./random.js";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

export function encodePng(width: number, height: number, rgb: Uint8Array): Buffer {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const out = y * (stride + 1);
    const row = y * stride;
    raw[out] = 1;
    for (let x = 0; x < stride; x++) {
      raw[out + 1 + x] = (rgb[row + x]! - (x >= 3 ? rgb[row + x - 3]! : 0)) & 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 4 })),
    chunk("IEND", new Uint8Array()),
  ]);
}

const ASPECTS = [
  [16, 9],
  [4, 3],
  [1, 1],
  [3, 4],
  [9, 16],
  [21, 9],
  [1, 3],
  [3, 1],
] as const;

export interface GeneratedImage {
  width: number;
  height: number;
  data: Buffer;
}

export function generateImage(rng: Rng): GeneratedImage {
  const [aw, ah] = rng.pick(ASPECTS);
  const longSide = rng.int(160, 1400);
  const scale = longSide / Math.max(aw, ah);
  const width = Math.max(16, Math.round(aw * scale));
  const height = Math.max(16, Math.round(ah * scale));

  const c1 = [rng.int(0, 255), rng.int(0, 255), rng.int(0, 255)] as const;
  const c2 = [rng.int(0, 255), rng.int(0, 255), rng.int(0, 255)] as const;
  const pattern = rng.pick(["gradient", "stripes", "rings", "checks"] as const);
  const period = rng.int(8, 64);
  const angle = rng.next() * Math.PI;
  const noise = rng.chance(0.15) ? rng.int(2, 10) : 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const cx = width / 2;
  const cy = height / 2;
  const diag = Math.hypot(width, height);

  const rgb = new Uint8Array(width * height * 3);
  let noiseState = rng.int(1, 0x7fffffff);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const along = ((x - cx) * cos + (y - cy) * sin) / diag + 0.5;
      let t: number;
      switch (pattern) {
        case "gradient":
          t = along;
          break;
        case "stripes":
          t = 0.5 * along + (Math.floor((x * cos + y * sin) / period) % 2 === 0 ? 0.5 : 0);
          break;
        case "rings":
          t = 0.5 + 0.5 * Math.sin(Math.hypot(x - cx, y - cy) / period);
          break;
        case "checks":
          t = 0.6 * along + ((Math.floor(x / period) + Math.floor(y / period)) % 2 ? 0.4 : 0);
          break;
      }
      const i = (y * width + x) * 3;
      for (let ch = 0; ch < 3; ch++) {
        let v = c1[ch]! + (c2[ch]! - c1[ch]!) * t;
        if (noise) {
          noiseState = (noiseState * 1103515245 + 12345) & 0x7fffffff;
          v += ((noiseState >> 16) % (2 * noise)) - noise;
        }
        rgb[i + ch] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
  }
  return { width, height, data: encodePng(width, height, rgb) };
}
