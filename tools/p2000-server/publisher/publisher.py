"""P2000 publisher: decode/enrich → SQLite → MQTT."""

from __future__ import annotations

import json
import logging
import os
import re
import sqlite3
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import paho.mqtt.client as mqtt
import yaml

from .regions import REGION_NAMES, guess_region
from .services import detect_priority, detect_service

LOG = logging.getLogger("p2000.publisher")

CAPCODE_RE = re.compile(r"\b(\d{5,7})\b")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_z(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def tijd_str(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%H:%M")


class Store:
    def __init__(self, path: str, history_limit: int) -> None:
        self.path = path
        self.history_limit = history_limit
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS alerts (
                    id TEXT PRIMARY KEY,
                    timestamp TEXT NOT NULL,
                    payload TEXT NOT NULL
                )
                """
            )
            conn.commit()

    def insert(self, alert: dict[str, Any]) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO alerts (id, timestamp, payload) VALUES (?, ?, ?)",
                (alert["id"], alert["timestamp"], json.dumps(alert, ensure_ascii=False)),
            )
            conn.execute(
                """
                DELETE FROM alerts WHERE id NOT IN (
                    SELECT id FROM alerts ORDER BY timestamp DESC LIMIT ?
                )
                """,
                (self.history_limit,),
            )
            conn.commit()

    def count(self) -> int:
        with self._lock, self._connect() as conn:
            row = conn.execute("SELECT COUNT(*) AS c FROM alerts").fetchone()
            return int(row["c"]) if row else 0


class Filters:
    def __init__(self, path: str) -> None:
        self.path = path
        self.regions: set[str] = set()
        self.services: set[str] = set()
        self.capcodes: set[str] = set()
        self.capcode_deny: set[str] = set()
        self.text_deny: list[str] = []
        self.reload()

    def reload(self) -> None:
        raw: dict[str, Any] = {}
        p = Path(self.path)
        if p.exists():
            raw = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
        self.regions = {str(x) for x in (raw.get("regions") or [])}
        self.services = {str(x).lower() for x in (raw.get("services") or [])}
        self.capcodes = {str(x) for x in (raw.get("capcodes") or [])}
        self.capcode_deny = {str(x) for x in (raw.get("capcode_deny") or [])}
        self.text_deny = [str(x).lower() for x in (raw.get("text_deny") or [])]

    def accept(self, alert: dict[str, Any]) -> bool:
        codes = [str(c.get("capcode", "")) for c in alert.get("capcodes", [])]
        if any(c in self.capcode_deny for c in codes):
            return False
        msg = (alert.get("message") or "").lower()
        if any(t in msg for t in self.text_deny):
            return False
        if self.regions and str(alert.get("region_id", "")) not in self.regions:
            return False
        if self.services and str(alert.get("service", "")).lower() not in self.services:
            return False
        if self.capcodes and not any(c in self.capcodes for c in codes):
            return False
        return True


class MqttOut:
    def __init__(self) -> None:
        self.host = os.environ.get("P2000_MQTT_HOST", "mosquitto")
        self.port = int(os.environ.get("P2000_MQTT_PORT", "1883"))
        self.topic = os.environ.get("P2000_MQTT_TOPIC", "p2000/alerts")
        self.status_topic = os.environ.get("P2000_MQTT_STATUS_TOPIC", "p2000/status")
        self.user = os.environ.get("P2000_MQTT_USER") or None
        self.password = os.environ.get("P2000_MQTT_PASSWORD") or None
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="p2000-publisher")
        if self.user:
            self.client.username_pw_set(self.user, self.password)
        self.client.will_set(
            self.status_topic,
            json.dumps({"ok": False, "reason": "offline"}),
            retain=True,
        )

    def connect(self) -> None:
        for attempt in range(30):
            try:
                self.client.connect(self.host, self.port, keepalive=60)
                self.client.loop_start()
                self.publish_status(True, "connected")
                LOG.info("MQTT connected to %s:%s", self.host, self.port)
                return
            except Exception as exc:  # noqa: BLE001 — retry broker startup
                LOG.warning("MQTT connect failed (%s), retry %s/30", exc, attempt + 1)
                time.sleep(2)
        raise RuntimeError("Could not connect to MQTT broker")

    def publish_status(self, ok: bool, detail: str = "") -> None:
        payload = {"ok": ok, "detail": detail, "ts": iso_z(utc_now())}
        self.client.publish(self.status_topic, json.dumps(payload), retain=True)

    def publish_alert(self, alert: dict[str, Any]) -> None:
        self.client.publish(self.topic, json.dumps(alert, ensure_ascii=False), qos=1)


def extract_capcodes(text: str) -> list[dict[str, str]]:
    seen: list[str] = []
    for match in CAPCODE_RE.findall(text):
        if match not in seen:
            seen.append(match)
    return [{"capcode": c} for c in seen[:8]]


def parse_flex_line(line: str) -> dict[str, Any] | None:
    line = line.strip()
    if not line:
        return None

    # JSON mode from multimon-ng --json
    if line.startswith("{"):
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            return None
        message = str(obj.get("message") or obj.get("msg") or obj.get("data") or "").strip()
        address = str(obj.get("address") or obj.get("capcode") or "").strip()
        raw = line
        if not message and not address:
            return None
        body = message or address
        caps = extract_capcodes(f"{address} {message}")
        if address and not any(c["capcode"] == address for c in caps):
            caps.insert(0, {"capcode": address})
        return build_alert(body, caps, raw, source="sdr")

    # Classic text: FLEX|...|message
    if "FLEX" not in line.upper():
        return None
    parts = [p.strip() for p in line.split("|")]
    message = parts[-1] if parts else line
    caps = extract_capcodes(line)
    # Prefer numeric tokens that look like capcodes near the middle of FLEX rows
    if len(parts) >= 4:
        for part in parts[1:-1]:
            if re.fullmatch(r"\d{5,7}", part):
                if not any(c["capcode"] == part for c in caps):
                    caps.insert(0, {"capcode": part})
    return build_alert(message, caps, line, source="sdr")


def build_alert(
    message: str,
    capcodes: list[dict[str, str]],
    raw: str,
    source: str,
    when: datetime | None = None,
) -> dict[str, Any]:
    when = when or utc_now()
    service = detect_service(message)
    priority = detect_priority(message)
    region_id, region_name = guess_region(message)
    primary = capcodes[0]["capcode"] if capcodes else "0000000"
    alert_id = f"{when.strftime('%Y%m%dT%H%M%SZ')}-{primary}"
    return {
        "schema": 1,
        "id": alert_id,
        "timestamp": iso_z(when),
        "tijd": tijd_str(when),
        "message": message,
        "tekstmelding": message,
        "priority": priority,
        "service": service,
        "dienst": service.capitalize() if service != "lifeliner" else "Lifeliner",
        "region_id": region_id,
        "regioid": region_id,
        "region": region_name,
        "regio": region_name,
        "capcodes": capcodes or [{"capcode": primary}],
        "capstring": " ".join(c["capcode"] for c in (capcodes or [{"capcode": primary}])),
        "raw": raw,
        "source": source,
    }


MOCK_MESSAGES = [
    ("P 1 Amsterdam Amstel woningbrand", "1", "brandweer", "1420054"),
    ("A1 Rotterdam centrum reanimatie", "10", "ambulance", "1512345"),
    ("P 2 Utrecht steekincident", "18", "politie", "1811001"),
    ("Lifeliner 1 onderweg AMC", "1", "lifeliner", "0120901"),
    ("P 2 Den Haag middelbrand industrie", "25", "brandweer", "2510022"),
]


class Publisher:
    def __init__(self) -> None:
        self.mode = os.environ.get("P2000_MODE", "mock").lower()
        self.freq = os.environ.get("P2000_FREQUENCY", "169.65M")
        self.sample_rate = os.environ.get("P2000_SAMPLE_RATE", "22050")
        self.pipe_path = os.environ.get("P2000_PIPE_PATH", "/data/flex.pipe")
        self.mock_interval = float(os.environ.get("P2000_MOCK_INTERVAL_SEC", "12"))
        self.store = Store(
            os.environ.get("P2000_DB_PATH", "/data/alerts.db"),
            int(os.environ.get("P2000_HISTORY_LIMIT", "200")),
        )
        self.filters = Filters(os.environ.get("P2000_FILTERS_PATH", "/data/filters.yaml"))
        self.mqtt = MqttOut()

    def handle_line(self, line: str) -> None:
        alert = parse_flex_line(line)
        if not alert:
            return
        self.emit(alert)

    def emit(self, alert: dict[str, Any]) -> None:
        self.filters.reload()
        if not self.filters.accept(alert):
            LOG.debug("Filtered: %s", alert.get("message"))
            return
        self.store.insert(alert)
        self.mqtt.publish_alert(alert)
        LOG.info(
            "[%s] %s %s %s",
            alert.get("priority") or "-",
            alert.get("dienst"),
            alert.get("regio"),
            alert.get("message"),
        )

    def run_mock(self) -> None:
        LOG.info("Mock mode — emitting sample P2000 alerts")
        idx = 0
        while True:
            text, region_id, service, cap = MOCK_MESSAGES[idx % len(MOCK_MESSAGES)]
            idx += 1
            when = utc_now()
            alert = build_alert(
                text,
                [{"capcode": cap}],
                f"MOCK|{text}",
                source="mock",
                when=when,
            )
            alert["region_id"] = region_id
            alert["regioid"] = region_id
            alert["region"] = REGION_NAMES.get(region_id, alert["region"])
            alert["regio"] = alert["region"]
            alert["service"] = service
            alert["dienst"] = "Lifeliner" if service == "lifeliner" else service.capitalize()
            self.emit(alert)
            self.mqtt.publish_status(True, f"mock alerts={self.store.count()}")
            time.sleep(self.mock_interval)

    def run_pipe(self) -> None:
        path = Path(self.pipe_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            os.mkfifo(path)
            LOG.info("Created FIFO %s — feed with host-decoder.sh", path)
        LOG.info("Reading FLEX lines from %s", path)
        while True:
            with path.open("r", encoding="utf-8", errors="replace") as fh:
                for line in fh:
                    self.handle_line(line)
            time.sleep(0.5)

    def run_sdr(self) -> None:
        cmd = (
            f"rtl_fm -f {self.freq} -M fm -s {self.sample_rate} -g 40 -l 0 -E dc -F 0 - "
            f"| multimon-ng -t raw -a FLEX --json -"
        )
        LOG.info("Starting SDR pipeline: %s", cmd)
        proc = subprocess.Popen(
            ["bash", "-lc", cmd],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        assert proc.stdout is not None
        for line in proc.stdout:
            if line.upper().startswith("FLEX") or line.startswith("{"):
                self.handle_line(line)
            else:
                LOG.debug("sdr: %s", line.rstrip())
        code = proc.wait()
        raise RuntimeError(f"SDR pipeline exited with code {code}")

    def run(self) -> None:
        logging.basicConfig(
            level=os.environ.get("P2000_LOG_LEVEL", "INFO"),
            format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        )
        self.mqtt.connect()
        LOG.info("Publisher starting mode=%s", self.mode)
        if self.mode == "mock":
            self.run_mock()
        elif self.mode == "pipe":
            self.run_pipe()
        elif self.mode == "sdr":
            self.run_sdr()
        else:
            LOG.error("Unknown P2000_MODE=%s (use mock|pipe|sdr)", self.mode)
            sys.exit(1)


def main() -> None:
    Publisher().run()


if __name__ == "__main__":
    main()
