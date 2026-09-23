# Ulanzi TC002 for Homey (MQTT)

Homey app that controls a **Ulanzi TC002** running [Awtrix 3](https://blueforcer.github.io/awtrix3/) over **MQTT**. Send notifications, custom apps, icons, sounds, indicators, and more from Homey Flows.

> This app lives in `homey-ulanzi-tc002/` inside the [bertvm/apps](https://github.com/bertvm/apps) repository.

## Features

| Area | What you get |
| --- | --- |
| Notifications | Text, color, rainbow, hold, wake screen, duration |
| Icons | Bundled 8×8 icons (`homey`, `message`, `warning`, `alert`, `info`, `check`, `bell`, `heart`) or any icon name on the clock |
| Sounds | Built-in RTTTL (`beep`, `chime`, `notify`, `alarm`, `success`, `error`, `doorbell`), device melodies, or raw RTTTL |
| Custom apps | Create / update / remove persistent loop apps via `PREFIX/custom/<name>` |
| Indicators | Set / clear the 3 corner LEDs with color, blink, fade |
| Mood light | Full-matrix color / kelvin mood lighting |
| Power | Matrix on/off, brightness (dim), deep sleep, reboot |
| Sensors | Battery, temperature, humidity, luminance from `PREFIX/stats` |
| Buttons | Flow triggers for left / middle / right button presses |

## Requirements

- Homey Pro (SDK v3, Homey ≥ 5.0)
- MQTT broker (Mosquitto, Homey MQTT Server, EMQX, …)
- Ulanzi TC002 with **Awtrix 3** and MQTT enabled

## Setup

1. In Awtrix on the TC002, open **MQTT** settings and enable MQTT.
2. Point the clock at your broker and copy the **MQTT prefix** (e.g. `awtrix_A1B2C3`).
3. On Homey: install this app → **Add device** → **Ulanzi TC002**.
4. Enter broker host, port, optional credentials/TLS, and the MQTT prefix.

The app publishes to topics such as:

- `{prefix}/notify` — notifications  
- `{prefix}/custom/{name}` — custom apps  
- `{prefix}/sound` / `{prefix}/rtttl` — sounds  
- `{prefix}/indicator1..3` — LEDs  
- `{prefix}/power`, `{prefix}/settings`, …

and subscribes to `{prefix}/stats` and `{prefix}/button`.

## Example Flow

**When** doorbell rings → **Then** Send notification  
`Someone at the door` · icon `bell` · sound `doorbell` · color `#00DCB4`

## Develop

```bash
cd homey-ulanzi-tc002
npm install
# with Homey CLI:
homey app run
# or publish:
homey app publish
```

Homey Compose sources live under `.homeycompose/` and `drivers/ulanzi_tc002/*.compose.json`. `app.json` is the merged manifest used at runtime.

## Notes

- There is already a popular HTTP-based Homey Awtrix app (`de.blueforcer.awtrixlight`). This app is **MQTT-first** and self-contained for TC002 setups that already use a broker.
- Built-in icons are sent as base64 8×8 JPEG so they work without uploading files to the clock.
- Built-in sounds are sent as RTTTL strings (no `MELODIES/` files required).
