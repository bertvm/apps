"""Service / priority heuristics (same spirit as apps/p2000*)."""

from __future__ import annotations

import re

PRIORITY_RE = re.compile(r"\b(P\s*[1-4]|A\s*[12]|B\s*[12]|PRIO\s*[1-4])\b", re.IGNORECASE)


def detect_service(message: str) -> str:
    source = message.lower()
    if any(x in source for x in ("trauma", "lifeliner", "mmt", "0120901")):
        return "lifeliner"
    if any(x in source for x in ("brandweer", "brw", "woningbrand", "middelbrand", "gebouwbrand")):
        return "brandweer"
    if "politie" in source or "steekincident" in source or "overval" in source:
        return "politie"
    if any(x in source for x in ("ambulance", "ambu", "rav", "mka", "reanimatie", "a1", "a2")):
        return "ambulance"
    return "overige"


def detect_priority(message: str) -> str:
    match = PRIORITY_RE.search(message)
    if not match:
        return ""
    token = re.sub(r"\s+", "", match.group(1).upper())
    token = token.replace("PRIO", "P")
    return token
