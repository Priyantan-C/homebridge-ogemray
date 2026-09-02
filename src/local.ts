/**
 * Local control: connect to a device's TCP :10000, send one set-relay frame, done.
 * The device is stateless per-command — no handshake, no session, no auth. Port of
 * pyogemray/local.py.
 */
import { connect } from "node:net";
import { buildSetRelay } from "./protocol";

const TCP_CONTROL_PORT = 10000;

/**
 * Turn a device's relay on/off. Resolves once the frame is sent and the device
 * either replies or a short grace period elapses (the command is confirmed
 * out-of-band by the next discovery beacon). Rejects on connect/socket errors.
 */
export function setRelay(host: string, deviceId: number, on: boolean, timeoutMs = 4000): Promise<void> {
  return new Promise((resolve, reject) => {
    const now = Math.floor(Date.now() / 1000);
    const frame = buildSetRelay(deviceId, on, { serialId: now & 0xffff, timestamp: now });
    const sock = connect({ host, port: TCP_CONTROL_PORT });
    let settled = false;
    let graceTimer: NodeJS.Timeout | undefined;

    const finish = (err?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      if (graceTimer) {
        clearTimeout(graceTimer);
      }
      sock.destroy();
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    };

    sock.setTimeout(timeoutMs);
    sock.on("connect", () => {
      sock.write(frame);
      // Resolve shortly after sending even if the reply is missed.
      graceTimer = setTimeout(() => finish(), 800);
    });
    sock.on("data", () => finish());
    sock.on("timeout", () => finish(new Error(`timeout connecting to ${host}:${TCP_CONTROL_PORT}`)));
    sock.on("error", (e) => finish(e));
  });
}
