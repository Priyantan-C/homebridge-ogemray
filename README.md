# homebridge-ogemray

[Homebridge](https://homebridge.io) plugin bringing **Ogemray**-based Wi-Fi switches —
including **Tata Power EZ Home** switches (rebranded Ogemray modules) and other rebrands
sharing the same protocol — into **Apple HomeKit**, controlled entirely on your **local
network**. No cloud, no account, no credentials.

> Companion to [ha-ogemray](https://github.com/Priyantan-C/ha-ogemray) (the Home Assistant
> integration + protocol spec). Same reverse-engineered local protocol, ported to Node.

## Why this exists

These switches ship with no local API and no HomeKit support — control normally goes through
the vendor cloud (Alexa/Google only). This plugin talks to them **directly**: discovery via
their UDP broadcast beacon, control via TCP port 10000.

## How it works

Each device broadcasts a plaintext UDP beacon (~1 Hz) carrying its id, name, MAC and live
relay/power state, and it enforces **no authentication** on control commands (verified live:
a wrong password, wrong uid, and even a wrong device id are all accepted). So the plugin is a
**zero-config dynamic platform**: it discovers your switches automatically and exposes one
HomeKit switch each. Nothing to enter.

```
   device ──UDP :10003 beacon (discovery + state)──▶ Homebridge ──▶ HomeKit / Home app
   device ◀──────── TCP :10000 (set relay) ───────── plugin
```

Because discovery is a UDP broadcast, **Homebridge must be on the same LAN segment** as the
switches (host networking or a macvlan, not an isolated bridge).

## Install

**Via the Homebridge UI** (once published to npm): open the **Plugins** tab, search
**Ogemray**, click **Install**, then restart Homebridge.

**Via npm:**

```bash
npm install -g homebridge-ogemray
```

**From source** (until the npm release is available):

```bash
git clone https://github.com/Priyantan-C/homebridge-ogemray.git
cd homebridge-ogemray
npm install && npm run build
npm install -g .        # or: npm link
```

Then add the platform to `config.json` (the UI does this for you):

```json
{
  "platforms": [
    { "platform": "Ogemray", "name": "Ogemray" }
  ]
}
```

Your switches appear in the Home app within a few seconds of Homebridge starting. Each maps to
one switch (the module reports two relay bytes but they drive the same physical output).

## What's validated

- **Protocol port** — CRC16, the set-relay frame, and password crypto reproduce a real captured
  command **byte-for-byte** (`npm test`, same vector as the Python reference lib).
- **Beacon parsing** — device id, name, MAC, relay and power, checked against a real beacon.
- **End-to-end** — discovery + TCP control run from the compiled plugin against real hardware,
  including a device that was never packet-captured.

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # protocol vectors must match the real capture
```

## Security note

These devices enforce **no access control** — anything on your LAN can toggle a relay by opening
a TCP connection to port 10000. Put them on a trusted/isolated VLAN if that matters for what they
switch.

## License

MIT — see [LICENSE](LICENSE).
