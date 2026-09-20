# ESP32 P2000 MQTT display client

Minimal PlatformIO firmware that subscribes to the Pi broker and prints/renders alerts.

## Hardware

Works as a scaffold for:

- Cheap Yellow Display (ESP32-2432S024 / CYD)
- LilyGO T-Display
- Any ESP32 with Serial-only bring-up first

Default `platformio.ini` targets a generic `esp32dev`. Adjust board + TFT pins for your panel.

## Configure

Edit `include/secrets.h` (copy from `secrets.h.example`):

```cpp
#define WIFI_SSID "your-ssid"
#define WIFI_PASS "your-pass"
#define MQTT_HOST "192.168.1.50"   // Pi IP
#define MQTT_PORT 1883
#define MQTT_TOPIC "p2000/alerts"
```

## Build / flash

```bash
cd p2000-server/esp32-client
pio run -t upload
pio device monitor
```

## Behaviour

1. Connect WiFi
2. Connect MQTT, subscribe to `p2000/alerts`
3. Parse schema-1 JSON
4. Log to Serial; if `BOARD_HAS_TFT` is set, show latest alert on screen

Filter locally by setting `FILTER_REGION` / `FILTER_SERVICE` in `src/config.h`.
