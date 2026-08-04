'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const MAGIC = Buffer.from('PXPIPE1\0', 'ascii');
const DEFAULT_DIR = path.join(process.cwd(), 'agent_work', 'pxpipe');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}

function makePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const scan = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const src = y * width * 4;
    const dst = y * (1 + width * 4);
    scan[dst] = 0;
    rgba.copy(scan, dst + 1, src, src + width * 4);
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(scan, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function parsePng(filePath) {
  const png = fs.readFileSync(filePath);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!png.subarray(0, 8).equals(signature)) throw new Error('not a PNG file');
  let off = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (off < png.length) {
    const len = png.readUInt32BE(off);
    const type = png.toString('ascii', off + 4, off + 8);
    const data = png.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6) throw new Error('unsupported PNG format; expected 8-bit RGBA');
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    off += 12 + len;
  }
  const scan = zlib.inflateSync(Buffer.concat(idat));
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const src = y * (1 + width * 4);
    const filter = scan[src];
    if (filter !== 0) throw new Error(`unsupported PNG filter ${filter}; PXPIPE expects filter 0`);
    scan.copy(rgba, y * width * 4, src + 1, src + 1 + width * 4);
  }
  return { width, height, rgba };
}

function outputPath(outDir, label) {
  fs.mkdirSync(outDir, { recursive: true });
  const safe = String(label || 'pxpipe').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'pxpipe';
  return path.join(outDir, `${safe}-${Date.now().toString(36)}.pxpipe.png`);
}

function encodeText({ text, outPath, outDir = DEFAULT_DIR, label = 'pxpipe', compress = true }) {
  if (typeof text !== 'string') throw new Error('text must be a string');
  const raw = Buffer.from(text, 'utf8');
  const body = compress ? zlib.gzipSync(raw, { level: 9 }) : raw;
  const header = Buffer.alloc(MAGIC.length + 1 + 4 + 4);
  MAGIC.copy(header, 0);
  header[MAGIC.length] = compress ? 1 : 0;
  header.writeUInt32BE(raw.length, MAGIC.length + 1);
  header.writeUInt32BE(body.length, MAGIC.length + 5);
  const payload = Buffer.concat([header, body]);
  const pixels = Math.ceil(payload.length / 4);
  const width = Math.max(1, Math.ceil(Math.sqrt(pixels)));
  const height = Math.ceil(pixels / width);
  const rgba = Buffer.alloc(width * height * 4, 0);
  payload.copy(rgba);
  const png = makePng(width, height, rgba);
  const finalPath = outPath ? path.resolve(outPath) : outputPath(outDir, label);
  fs.mkdirSync(path.dirname(finalPath), { recursive: true });
  fs.writeFileSync(finalPath, png);
  return {
    ok: true,
    path: finalPath,
    bytes: png.length,
    rawBytes: raw.length,
    payloadBytes: body.length,
    width,
    height,
    compression: compress ? 'gzip' : 'none',
    tokenSavingUse: 'Store bulky text as a PNG artifact and pass the image path/reference instead of injecting full text into prompt context.',
  };
}

function decodeText({ imagePath }) {
  if (!imagePath) throw new Error('imagePath is required');
  const { width, height, rgba } = parsePng(path.resolve(imagePath));
  if (!rgba.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('PNG does not contain PXPIPE payload');
  const compressed = rgba[MAGIC.length] === 1;
  const rawBytes = rgba.readUInt32BE(MAGIC.length + 1);
  const payloadBytes = rgba.readUInt32BE(MAGIC.length + 5);
  const start = MAGIC.length + 9;
  const payload = rgba.subarray(start, start + payloadBytes);
  const raw = compressed ? zlib.gunzipSync(payload) : payload;
  return {
    ok: true,
    text: raw.toString('utf8'),
    rawBytes,
    payloadBytes,
    width,
    height,
    compression: compressed ? 'gzip' : 'none',
  };
}

function info({ imagePath }) {
  if (!imagePath) throw new Error('imagePath is required');
  const stat = fs.statSync(path.resolve(imagePath));
  const { width, height, rgba } = parsePng(path.resolve(imagePath));
  const isPxpipe = rgba.subarray(0, MAGIC.length).equals(MAGIC);
  return {
    ok: true,
    path: path.resolve(imagePath),
    bytes: stat.size,
    width,
    height,
    isPxpipe,
    rawBytes: isPxpipe ? rgba.readUInt32BE(MAGIC.length + 1) : null,
    payloadBytes: isPxpipe ? rgba.readUInt32BE(MAGIC.length + 5) : null,
    compression: isPxpipe && rgba[MAGIC.length] === 1 ? 'gzip' : (isPxpipe ? 'none' : null),
  };
}

module.exports = { encodeText, decodeText, info, DEFAULT_DIR };
