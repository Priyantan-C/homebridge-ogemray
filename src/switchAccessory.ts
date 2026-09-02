/** One HomeKit switch backed by an Ogemray device (state from beacon, control via TCP). */
import type { CharacteristicValue, PlatformAccessory, Service } from "homebridge";

import { setRelay } from "./local";
import type { OgemrayPlatform } from "./platform";
import type { BeaconState } from "./protocol";

/** A device is considered unreachable after this long without a beacon. */
const STALE_MS = 30_000;

export class OgemraySwitch {
  private readonly service: Service;
  private readonly deviceId: number;
  private host: string;
  private on = false;
  private lastSeen = 0;

  constructor(
    private readonly platform: OgemrayPlatform,
    private readonly accessory: PlatformAccessory,
    state: BeaconState,
  ) {
    this.deviceId = state.deviceId;
    this.host = state.sourceIp;

    const { Service, Characteristic } = platform;
    accessory
      .getService(Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, "Ogemray")
      .setCharacteristic(Characteristic.Model, state.internalName || "Wi-Fi Switch")
      .setCharacteristic(Characteristic.SerialNumber, state.mac || String(state.deviceId));

    this.service =
      accessory.getService(Service.Switch) || accessory.addService(Service.Switch, state.name);

    this.service
      .getCharacteristic(Characteristic.On)
      .onGet(() => this.getOn())
      .onSet((v) => this.setOn(v));

    this.updateFromBeacon(state);
  }

  updateFromBeacon(state: BeaconState): void {
    this.host = state.sourceIp;
    this.lastSeen = Date.now();
    if (state.relay !== this.on) {
      this.on = state.relay;
      this.service.updateCharacteristic(this.platform.Characteristic.On, this.on);
    }
  }

  private getOn(): CharacteristicValue {
    if (Date.now() - this.lastSeen > STALE_MS) {
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
    return this.on;
  }

  private async setOn(value: CharacteristicValue): Promise<void> {
    const target = value as boolean;
    try {
      await setRelay(this.host, this.deviceId, target);
      this.on = target;
    } catch (e) {
      this.platform.log.error(
        `Failed to switch ${this.accessory.displayName}:`,
        (e as Error).message,
      );
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }
}
