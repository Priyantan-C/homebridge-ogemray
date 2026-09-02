/**
 * CRC16 for the Ogemray local protocol — a TypeScript port of pyogemray/crc.py.
 *
 * CRC16/CCITT polynomial 0x1021 with a non-standard initial value of 0x1021,
 * MSB-first (table driven), stored little-endian. Validated against 399 captured
 * frames on the Python side; this port is checked byte-for-byte in the tests.
 */
const POLY = 0x1021;
export const INIT = 0x1021;

const TABLE = new Uint16Array(256);
for (let i = 0; i < 256; i++) {
  let c = i << 8;
  for (let k = 0; k < 8; k++) {
    c = c & 0x8000 ? ((c << 1) ^ POLY) & 0xffff : (c << 1) & 0xffff;
  }
  TABLE[i] = c;
}

/** Return the Ogemray CRC16 over `data`. */
export function crc16(data: Buffer, init: number = INIT): number {
  let crc = init;
  for (const b of data) {
    crc = ((crc << 8) ^ TABLE[((crc >> 8) ^ b) & 0xff]) & 0xffff;
  }
  return crc;
}

/**
 * Verify a full captured frame. The CRC covers `frame[:-4]` and is stored
 * little-endian at `frame[-4:-2]` (the final two bytes are outside the CRC input).
 */
export function verify(frame: Buffer): boolean {
  if (frame.length < 4) {
    return false;
  }
  return crc16(frame.subarray(0, -4)) === frame.readUInt16LE(frame.length - 4);
}
