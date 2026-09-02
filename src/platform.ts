/**
 * Dynamic platform: discovers Ogemray devices from their UDP beacon and exposes one
 * HomeKit switch per device. Zero config — no account, no credentials, no manual host
 * entry (though beacons only cross the local L2 segment).
 */
import type {
  API,
  Characteristic,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
  Service,
} from "homebridge";

import { Discovery } from "./discovery";
import type { BeaconState } from "./protocol";
import { PLATFORM_NAME, PLUGIN_NAME } from "./settings";
import { OgemraySwitch } from "./switchAccessory";

export class OgemrayPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly accessories = new Map<string, PlatformAccessory>();
  private readonly switches = new Map<number, OgemraySwitch>();
  private discovery?: Discovery;

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    api.on("didFinishLaunching", () => this.startDiscovery());
    api.on("shutdown", () => this.discovery?.stop());
  }

  /** Restore accessories cached by Homebridge across restarts. */
  configureAccessory(accessory: PlatformAccessory): void {
    this.accessories.set(accessory.UUID, accessory);
  }

  private startDiscovery(): void {
    const disc = new Discovery();
    disc.on("beacon", (state) => this.onBeacon(state));
    disc.on("error", (e) => this.log.error("discovery socket error:", e.message));
    disc
      .start()
      .then(() => this.log.info("Listening for Ogemray beacons on UDP 10003"))
      .catch((e) => this.log.error("Failed to bind discovery socket:", (e as Error).message));
    this.discovery = disc;
  }

  private onBeacon(state: BeaconState): void {
    let sw = this.switches.get(state.deviceId);
    if (!sw) {
      sw = this.addSwitch(state);
      this.switches.set(state.deviceId, sw);
    }
    sw.updateFromBeacon(state);
  }

  private addSwitch(state: BeaconState): OgemraySwitch {
    const uuid = this.api.hap.uuid.generate(`ogemray:${state.deviceId}`);
    let accessory = this.accessories.get(uuid);
    if (accessory) {
      this.log.info("Restoring Ogemray switch:", state.name);
    } else {
      this.log.info("Adding Ogemray switch:", state.name);
      accessory = new this.api.platformAccessory(state.name, uuid);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.set(uuid, accessory);
    }
    return new OgemraySwitch(this, accessory, state);
  }
}
