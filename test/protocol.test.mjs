// Protocol tests using SYNTHETIC values only — no real device data.
//
// The frame builder + CRC + password crypto were validated byte-for-byte against a real
// captured command during development (in the reference implementation). These tests keep
// that framing honest going forward: they assert internal consistency (CRC verifies, the
// AES password field round-trips, field offsets are stable) and that beacon parsing reads
// back every field it writes.
import assert from "node:assert/strict";
import { createDecipheriv } from "node:crypto";
import { test } from "node:test";

import { verify } from "../dist/crc.js";
import { buildSetRelay, encryptPassword, parseBeacon } from "../dist/protocol.js";

const DEVICE_ID = 0x01020304;
const UID = Buffer.from("aabbccdd", "hex");
const PASSWORD = "demoPW";
// Static AES-192 key baked into the vendor app (a protocol constant, not a secret).
const STATIC_KEY = Buffer.from("OGE201600000000000000000", "ascii");

function makeBeacon({ deviceId, name, mac, internal, relay, power }) {
  const b = Buffer.alloc(159);
  b[0] = 0xfe;
  b[1] = 0xf0;
  b.writeUInt32LE(deviceId, 18);
  b.write(name, 42, "ascii");
  Buffer.from(mac.split(":").map((h) => parseInt(h, 16))).copy(b, 81);
  b.write(internal, 96, "ascii");
  b[135] = relay ? 1 : 0;
  b[145] = power;
  return b;
}

test("password field round-trips through the static AES-192-ECB key", () => {
  const enc = encryptPassword(PASSWORD);
  assert.equal(enc.length, 32);
  const d = createDecipheriv("aes-192-ecb", STATIC_KEY, null);
  d.setAutoPadding(false);
  const dec = Buffer.concat([d.update(enc), d.final()]);
  assert.equal(dec.subarray(0, PASSWORD.length).toString("ascii"), PASSWORD);
});

test("set-relay frame is well-formed: markers, length, CRC, field offsets", () => {
  const frame = buildSetRelay(DEVICE_ID, true, {
    uid: UID,
    password: PASSWORD,
    serialId: 0x0011,
    timestamp: 0x12345678,
  });
  assert.equal(frame.length, 89); // 40 header + 45 content + 2 crc + 2 trailer
  assert.equal(frame.readUInt16BE(0), 0xfef0); // start marker
  assert.equal(frame.readUInt16LE(2), frame.length); // length field
  assert.equal(frame.readUInt16BE(38), 0xf0fe); // header/content separator
  assert.equal(verify(frame), true); // primary CRC over frame[:-4]
  assert.equal(frame.readUInt32LE(40), DEVICE_ID); // content: device id
  assert.equal(frame.subarray(44, 48).toString("hex"), "aabbccdd"); // content: uid
  assert.equal(frame[83], 0x00); // channel
  assert.equal(frame[84], 0x01); // relay state = ON
});

test("relay OFF sets the state byte to 0x00", () => {
  const frame = buildSetRelay(DEVICE_ID, false, { uid: UID, password: PASSWORD });
  assert.equal(frame[84], 0x00);
  assert.equal(verify(frame), true);
});

test("credential-free default build stays well-formed", () => {
  const frame = buildSetRelay(DEVICE_ID, true);
  assert.equal(verify(frame), true);
  assert.equal(frame.readUInt32LE(40), DEVICE_ID);
});

test("beacon parses identity and state it was built with", () => {
  const b = makeBeacon({
    deviceId: DEVICE_ID,
    name: "Demo Switch",
    mac: "00:11:22:33:44:55",
    internal: "DEMO_0304",
    relay: true,
    power: 42,
  });
  const s = parseBeacon(b, "10.0.0.5");
  assert.ok(s);
  assert.equal(s.sourceIp, "10.0.0.5");
  assert.equal(s.deviceId, DEVICE_ID);
  assert.equal(s.name, "Demo Switch");
  assert.equal(s.internalName, "DEMO_0304");
  assert.equal(s.mac, "00:11:22:33:44:55");
  assert.equal(s.relay, true);
  assert.equal(s.power, 42);
});

test("beacon rejects short / unmarked payloads", () => {
  assert.equal(parseBeacon(Buffer.from("fef0short"), "10.0.0.5"), null);
  assert.equal(parseBeacon(Buffer.concat([Buffer.from([0, 0]), Buffer.alloc(200)]), "10.0.0.5"), null);
});
