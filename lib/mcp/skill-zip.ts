/**
 * Builds an uncompressed (store-only) ZIP from path → UTF-8 text entries.
 * No external zip dependency — used for the MCP skill download in Settings.
 */

const encoder = new TextEncoder();

/** CRC-32 (ISO 3309 / ITU-T V.42), as required by the ZIP format. */
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]!;
    for (let bit = 0; bit < 8; bit++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number) {
  const buf = new Uint8Array(2);
  new DataView(buf.buffer).setUint16(0, value, true);
  return buf;
}

function u32(value: number) {
  const buf = new Uint8Array(4);
  new DataView(buf.buffer).setUint32(0, value, true);
  return buf;
}

function concat(chunks: Uint8Array[]) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

type ZipEntry = {
  path: string;
  data: Uint8Array;
  crc: number;
  localHeaderOffset: number;
};

/**
 * Creates a .zip archive with the given UTF-8 file entries (store method).
 * Paths should use forward slashes (e.g. `folder/file.md`).
 */
export function buildStoreZip(files: Record<string, string>): Uint8Array {
  const entries: ZipEntry[] = [];
  const localParts: Uint8Array[] = [];
  let offset = 0;

  for (const [filePath, text] of Object.entries(files)) {
    const nameBytes = encoder.encode(filePath);
    const data = encoder.encode(text);
    const crc = crc32(data);

    const localHeader = concat([
      u32(0x04034b50), // local file header signature
      u16(20), // version needed
      u16(0), // general purpose bit flag
      u16(0), // compression method: store
      u16(0), // last mod file time
      u16(0), // last mod file date
      u32(crc),
      u32(data.length), // compressed size
      u32(data.length), // uncompressed size
      u16(nameBytes.length),
      u16(0), // extra field length
      nameBytes,
    ]);

    entries.push({
      path: filePath,
      data,
      crc,
      localHeaderOffset: offset,
    });
    localParts.push(localHeader, data);
    offset += localHeader.length + data.length;
  }

  const centralParts: Uint8Array[] = [];
  let centralSize = 0;
  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path);
    const centralHeader = concat([
      u32(0x02014b50), // central file header signature
      u16(20), // version made by
      u16(20), // version needed
      u16(0), // flags
      u16(0), // method: store
      u16(0), // time
      u16(0), // date
      u32(entry.crc),
      u32(entry.data.length),
      u32(entry.data.length),
      u16(nameBytes.length),
      u16(0), // extra length
      u16(0), // comment length
      u16(0), // disk number start
      u16(0), // internal file attrs
      u32(0), // external file attrs
      u32(entry.localHeaderOffset),
      nameBytes,
    ]);
    centralParts.push(centralHeader);
    centralSize += centralHeader.length;
  }

  const endOfCentral = concat([
    u32(0x06054b50),
    u16(0), // disk number
    u16(0), // disk with central directory
    u16(entries.length),
    u16(entries.length),
    u32(centralSize),
    u32(offset), // offset of start of central directory
    u16(0), // zip comment length
  ]);

  return concat([...localParts, ...centralParts, endOfCentral]);
}
