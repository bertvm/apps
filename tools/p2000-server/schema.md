# Shared alert contract (`schema: 1`)

All MQTT payloads and the internal store use this shape. The HTTP `/api2/find/` endpoint maps the same records into the Alarmeringdroid-compatible envelope expected by `apps/p2000` and `apps/p2000v2`.

## MQTT topic

- `p2000/alerts` — every accepted alert (JSON object, one message)
- `p2000/status` — retained broker/publisher heartbeat

## Alert object

```json
{
  "schema": 1,
  "id": "20260920T103215Z-1420054",
  "timestamp": "2026-09-20T10:32:15Z",
  "tijd": "10:32",
  "message": "P 1 Amsterdam Amstel — woningbrand",
  "tekstmelding": "P 1 Amsterdam Amstel — woningbrand",
  "priority": "P1",
  "service": "brandweer",
  "dienst": "Brandweer",
  "region_id": "1",
  "regioid": "1",
  "region": "Amsterdam-Amstelland",
  "regio": "Amsterdam-Amstelland",
  "capcodes": [{ "capcode": "1420054" }],
  "capstring": "1420054",
  "raw": "FLEX|...|original line...",
  "source": "sdr"
}
```

| Field | Notes |
| --- | --- |
| `schema` | Always `1` for this contract |
| `priority` | `P1`/`P2`/`A1`/`A2`/`B1`/`B2`/`P3`/`P4`/`TEST`/`""` |
| `service` | `brandweer` \| `politie` \| `ambulance` \| `lifeliner` \| `overige` |
| `region_id` / `regioid` | Safety region id as used by the Tronbyt apps |
| `capcodes` | List of `{ "capcode": "..." }` objects |

## HTTP API (Tronbyt-compatible)

`GET /api2/find/` →

```json
{
  "meldingen": [ { "...same fields as above plus aliases..." } ]
}
```

Also accepted by the Starlark apps as top-level `messages` or `results`.

## Extra endpoints

- `GET /health` → `{ "ok": true, "alerts": N, "mode": "mock" }`
- `GET /alerts?limit=50` → raw schema-1 list
- `GET /alerts/latest` → single latest alert or `204`
