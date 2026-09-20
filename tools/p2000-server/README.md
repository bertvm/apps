# P2000 local server (Option A)

Headless Raspberry Pi companion for Dutch **P2000** (FLEX on **169.650 MHz**).

Inspired by the service split in [nltimv/P2000-RPi](https://github.com/nltimv/P2000-RPi), but built as a small maintainable stack:

```
RTL-SDR → rtl_fm → multimon-ng (FLEX)
                 ↓
           publisher (enrich + store + MQTT)
                 ↓
        ┌────────┴────────┐
     Mosquitto         HTTP API
        ↓                  ↓
   ESP32 displays    Tronbyt apps (p2000 / p2000v2)
```

## What you get

| Piece | Role |
| --- | --- |
| `publisher/` | Decode (or mock), enrich, SQLite history, MQTT publish |
| `api/` | HTTP API compatible with `apps/p2000` and `apps/p2000v2` |
| `mosquitto/` | MQTT broker for ESP32 / other clients |
| `esp32-client/` | PlatformIO MQTT display firmware scaffold |
| `schema.md` | Shared JSON contract (`schema: 1`) |

## Requirements (Pi 4)

- Raspberry Pi OS Lite 64-bit
- RTL-SDR dongle + VHF antenna (169 MHz)
- Docker + Docker Compose
- Host packages for the decoder path: `rtl-sdr`, `multimon-ng`

### One-time SDR setup on the Pi

```bash
# Blacklist kernel DVB drivers that claim the stick
echo -e 'blacklist dvb_usb_rtl28xxu\nblacklist rtl2832\nblacklist rtl2830' | sudo tee /etc/modprobe.d/blacklist-rtl.conf
sudo apt update && sudo apt install -y rtl-sdr multimon-ng
sudo reboot
```

Confirm RF decode (outside Docker):

```bash
rtl_fm -f 169.65M -M fm -s 22050 | multimon-ng -a FLEX -t raw -
```

## Quick start

```bash
cd tools/p2000-server
cp .env.example .env
# For first bring-up without a dongle:
#   P2000_MODE=mock
docker compose up -d --build
```

Smoke-test parsing without Docker:

```bash
cd tools/p2000-server
PYTHONPATH=. python3 scripts/test_parse.py
```

- API: `http://<pi-ip>:8080/api2/find/`
- Health: `http://<pi-ip>:8080/health`
- MQTT: `<pi-ip>:1883` topic `p2000/alerts`
- Recent alerts: `http://<pi-ip>:8080/alerts`

Point a Tronbyt **P2000** / **P2000 V2** app `api_url` at:

```text
http://<pi-ip>:8080/api2/find/
```

## Pi 4 bring-up order

1. Flash Raspberry Pi OS Lite 64-bit, enable SSH, set a static IP or note mDNS.
2. Install Docker (`curl -fsSL https://get.docker.com | sh`) and add your user to the `docker` group.
3. Blacklist DVB drivers + install `rtl-sdr` / `multimon-ng` (commands above).
4. Clone this repo (or copy `tools/p2000-server`), `cp .env.example .env`, set `P2000_MODE=mock`, `docker compose up -d --build`.
5. Verify `curl http://127.0.0.1:8080/health` and `mosquitto_sub -h 127.0.0.1 -t p2000/alerts -v`.
6. Point Tronbyt `api_url` at the Pi; flash `esp32-client` with the Pi IP.
7. Switch `.env` to `P2000_MODE=pipe`, restart compose, run `scripts/host-decoder.sh` on the host with the RTL-SDR attached.

## Modes

| `P2000_MODE` | Behaviour |
| --- | --- |
| `mock` | Synthetic alerts every few seconds (no SDR) |
| `pipe` | Reads FLEX lines from stdin / named pipe (host decoder) |
| `sdr` | Runs `rtl_fm \| multimon-ng` inside the publisher container (needs device passthrough) |

Recommended on Pi 4: run `rtl_fm | multimon-ng` on the **host** and feed the publisher with `P2000_MODE=pipe` (see `scripts/host-decoder.sh`). That keeps USB SDR quirks out of Docker.

## ESP32 client

See [`esp32-client/README.md`](esp32-client/README.md). Configure WiFi + broker IP, flash a CYD / T-Display, subscribe to `p2000/alerts`.

## Filters

Edit `data/filters.yaml` (or mount your own) to allow/deny regions, services, and capcodes before MQTT/API exposure.

## Legal / privacy

Receive-only monitoring of unencrypted public paging where allowed. Do not republish sensitive alerts to the public internet.
