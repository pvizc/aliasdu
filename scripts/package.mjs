import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { deflateRawSync } from "node:zlib";

const distDir = "dist";
const outFile = "extension.zip";

const crcTable = new Uint32Array(256);
for (let i = 0; i < crcTable.length; i += 1) {
  let c = i;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[i] = c >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTime(date) {
  return (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
}

function dosDate(date) {
  return ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
}

function u16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }

  return files;
}

async function createZip(files) {
  const localRecords = [];
  const centralRecords = [];
  let offset = 0;

  for (const file of files) {
    const input = await readFile(file);
    const compressed = deflateRawSync(input, { level: 9 });
    const name = relative(distDir, file).split(sep).join("/");
    const nameBuffer = Buffer.from(name);
    const modified = new Date();
    const crc = crc32(input);

    const localHeader = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(8),
      u16(dosTime(modified)),
      u16(dosDate(modified)),
      u32(crc),
      u32(compressed.length),
      u32(input.length),
      u16(nameBuffer.length),
      u16(0),
      nameBuffer,
    ]);

    localRecords.push(localHeader, compressed);

    centralRecords.push(
      Buffer.concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(8),
        u16(dosTime(modified)),
        u16(dosDate(modified)),
        u32(crc),
        u32(compressed.length),
        u32(input.length),
        u16(nameBuffer.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        nameBuffer,
      ]),
    );

    offset += localHeader.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralRecords);
  const endRecord = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDirectory.length),
    u32(offset),
    u16(0),
  ]);

  return Buffer.concat([...localRecords, centralDirectory, endRecord]);
}

const files = (await listFiles(distDir)).sort();
await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, await createZip(files));

console.log(`Packaged ${files.length} files into ${outFile}`);
