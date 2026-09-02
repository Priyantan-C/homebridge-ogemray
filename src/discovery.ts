/**
 * Passive discovery of Ogemray devices via their UDP broadcast beacon (~1 Hz on
 * :10003). The beacon carries the device id, name, MAC and live relay/power state,
 * so it doubles as the status feed. Port of pyogemray/discovery.py.
 */
import { createSocket, type Socket } from "node:dgram";
import { EventEmitter } from "node:events";
import { type BeaconState, parseBeacon } from "./protocol";

const UDP_DISCOVERY_PORT = 10003;

export declare interface Discovery {
  on(event: "beacon", listener: (state: BeaconState) => void): this;
  on(event: "error", listener: (err: Error) => void): this;
  emit(event: "beacon", state: BeaconState): boolean;
  emit(event: "error", err: Error): boolean;
}

export class Discovery extends EventEmitter {
  private socket?: Socket;

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const sock = createSocket({ type: "udp4", reuseAddr: true });
      sock.once("error", reject);
      sock.on("message", (msg, rinfo) => {
        const state = parseBeacon(msg, rinfo.address);
        if (state) {
          this.emit("beacon", state);
        }
      });
      sock.bind(UDP_DISCOVERY_PORT, () => {
        sock.removeListener("error", reject);
        sock.on("error", (err) => this.emit("error", err));
        this.socket = sock;
        resolve();
      });
    });
  }

  stop(): void {
    this.socket?.close();
    this.socket = undefined;
  }
}
