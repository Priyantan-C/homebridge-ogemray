/**
 * Ogemray frame construction + beacon parsing — a TypeScript port of
 * pyogemray/protocol.py and discovery.py. See docs in the ha-ogemray repo.
 *
 * The device validates neither the uid nor the password nor the device id in a
 * command (confirmed live on two units), so the auth block is filled with ignored
 * placeholders. The builder still reproduces a real captured command byte-for-byte
 * (checked in the tests) to guarantee the framing is exactly what the device expects.
 */
import { createCipheriv } from "node:crypto";
import { crc16 } from "./crc";

const START_MARKER = Buffer.from([0xfe, 0xf0]);
const HEADER_SEP = Buffer.from([0xf0, 0xfe]);
const CMD_SET_RELAY = 0x0201;
const HEADER_LEN = 40;

/** Static AES-192 key baked into the app's native lib (device-name field crypto). */
const STATIC_NAME_KEY = Buffer.from("OGE201600000000000000000", "ascii");

/** Ignored auth-block placeholders — the device checks none of it. */
export const IGNORED_UID = Buffer.from([0x00, 0x00, 0x00, 0x00]);
export const IGNORED_PASSWORD = "OGEMRAY";

/** Beacon field offsets (0-based from start of UDP payload). Validated on both units. */
export const BEACON_MIN_LEN = 159;
const OFF_DEVICE_ID = 18;
const OFF_NAME = 42;
const OFF_MAC = 81;
const OFF_INTERNAL = 96;
const OFF_RELAY1 = 135;
const OFF_POWER = 145;

export interface BeaconState {
  sourceIp: string;
  deviceId: number;
  name: string;
  mac: string;
  internalName: string;
  relay: boolean;
  power: number;
}

function u16le(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n & 0xffff, 0);
  return b;
}

function u32le(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}

/** Encrypt a password into the 32-byte auth field (app's `t5.a.c`). */
export function encryptPassword(password: string): Buffer {
  const buf = Buffer.alloc(32);
  const written = buf.write(password, "ascii");
  if (written > 32) {
    throw new Error("password too long");
  }
  const cipher = createCipheriv("aes-192-ecb", STATIC_NAME_KEY, null);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(buf), cipher.final()]);
}

function cstr(payload: Buffer, offset: number, length = 32): string {
  const slice = payload.subarray(offset, offset + length);
  const end = slice.indexOf(0);
  return slice.subarray(0, end === -1 ? slice.length : end).toString("ascii");
}

/** Parse a raw UDP beacon into a BeaconState; null if malformed. */
export function parseBeacon(payload: Buffer, sourceIp: string): BeaconState | null {
  if (payload.length < BEACON_MIN_LEN || payload[0] !== 0xfe || payload[1] !== 0xf0) {
    return null;
  }
  const mac = Array.from(payload.subarray(OFF_MAC, OFF_MAC + 6))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(":");
  return {
    sourceIp,
    deviceId: payload.readUInt32LE(OFF_DEVICE_ID),
    name: cstr(payload, OFF_NAME) || sourceIp,
    mac,
    internalName: cstr(payload, OFF_INTERNAL),
    relay: payload[OFF_RELAY1] !== 0,
    power: payload[OFF_POWER],
  };
}

export interface BuildOptions {
  uid?: Buffer;
  password?: string;
  channel?: number;
  serialId?: number;
  timestamp?: number;
  trailer?: Buffer;
}

/** Build the 45-byte set-relay content (validated byte-exact vs capture). */
export function buildSetRelayContent(deviceId: number, on: boolean, opts: BuildOptions = {}): Buffer {
  const uid = opts.uid ?? IGNORED_UID;
  const password = opts.password ?? IGNORED_PASSWORD;
  const channel = opts.channel ?? 0;
  if (uid.length !== 4) {
    throw new Error("uid must be 4 bytes");
  }
  return Buffer.concat([
    u32le(deviceId),
    uid,
    encryptPassword(password),
    Buffer.from([0x01]),
    u16le(0x0002),
    Buffer.from([channel & 0xff, on ? 0x01 : 0x00]),
  ]);
}

/** Build a full set-relay (0x0201) command frame. */
export function buildSetRelay(deviceId: number, on: boolean, opts: BuildOptions = {}): Buffer {
  const content = buildSetRelayContent(deviceId, on, opts);
  const serialId = opts.serialId ?? 0;
  const timestamp = opts.timestamp ?? 0;
  const trailer = opts.trailer ?? Buffer.from([0x00, 0x00]);
  const total = HEADER_LEN + content.length + 4;
  const header = Buffer.concat([
    START_MARKER,
    u16le(total),
    Buffer.from([0x03, 0x05]),
    u16le(CMD_SET_RELAY),
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
    u16le(serialId),
    u16le(0x0001),
    Buffer.from([0x00, 0x00]),
    u32le(deviceId),
    Buffer.from([0x00, 0x00]),
    u32le(timestamp),
    Buffer.alloc(8),
    Buffer.from([0x00, 0x00]),
    HEADER_SEP,
  ]);
  const body = Buffer.concat([header, content]);
  return Buffer.concat([body, u16le(crc16(body)), trailer]);
}
