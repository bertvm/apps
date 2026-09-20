"""HTTP API compatible with apps/p2000 and apps/p2000v2."""

from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse, Response

DB_PATH = os.environ.get("P2000_DB_PATH", "/data/alerts.db")
HISTORY_LIMIT = int(os.environ.get("P2000_HISTORY_LIMIT", "200"))
MODE = os.environ.get("P2000_MODE", "mock")

app = FastAPI(title="P2000 local API", version="1.0.0")


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def load_alerts(limit: int) -> list[dict[str, Any]]:
    path = Path(DB_PATH)
    if not path.exists():
        return []
    with connect() as conn:
        rows = conn.execute(
            "SELECT payload FROM alerts ORDER BY timestamp DESC LIMIT ?",
            (limit,),
        ).fetchall()
    alerts: list[dict[str, Any]] = []
    for row in rows:
        try:
            alerts.append(json.loads(row["payload"]))
        except json.JSONDecodeError:
            continue
    return alerts


def to_melding(alert: dict[str, Any]) -> dict[str, Any]:
    """Map schema-1 alert → Alarmeringdroid-like fields used by Tronbyt apps."""
    return {
        **alert,
        "tekstmelding": alert.get("tekstmelding") or alert.get("message") or "",
        "melding": alert.get("message") or "",
        "message": alert.get("message") or "",
        "regioid": str(alert.get("regioid") or alert.get("region_id") or ""),
        "regio": alert.get("regio") or alert.get("region") or "",
        "dienst": alert.get("dienst") or alert.get("service") or "",
        "capstring": alert.get("capstring") or "",
        "tijd": alert.get("tijd") or "",
        "capcodes": alert.get("capcodes") or [],
    }


@app.get("/health")
def health() -> dict[str, Any]:
    alerts = load_alerts(HISTORY_LIMIT)
    return {
        "ok": True,
        "mode": MODE,
        "alerts": len(alerts),
        "db": DB_PATH,
    }


@app.get("/alerts")
def alerts(limit: int = Query(50, ge=1, le=500)) -> dict[str, Any]:
    items = load_alerts(min(limit, HISTORY_LIMIT))
    return {"schema": 1, "count": len(items), "alerts": items}


@app.get("/alerts/latest")
def latest() -> Response:
    items = load_alerts(1)
    if not items:
        return Response(status_code=204)
    return JSONResponse(items[0])


@app.get("/api2/find/")
@app.get("/api2/find")
def api2_find(limit: int = Query(50, ge=1, le=500)) -> dict[str, Any]:
    meldingen = [to_melding(a) for a in load_alerts(min(limit, HISTORY_LIMIT))]
    return {"meldingen": meldingen}
