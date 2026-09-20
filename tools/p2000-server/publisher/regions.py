"""Safety region ids aligned with apps/p2000 and apps/p2000v2."""

from __future__ import annotations

REGION_NAMES: dict[str, str] = {
    "1": "Amsterdam-Amstelland",
    "2": "Groningen",
    "3": "Noord- en Oost-Gelderland",
    "4": "Zaanstreek-Waterland",
    "5": "Hollands Midden",
    "6": "Brabant-Noord",
    "7": "Fryslan",
    "8": "Gelderland-Midden",
    "9": "Kennemerland",
    "10": "Rotterdam-Rijnmond",
    "11": "Brabant-Zuidoost",
    "12": "Drenthe",
    "13": "Gelderland-Zuid",
    "14": "Zuid-Holland-Zuid",
    "15": "Limburg-Noord",
    "17": "IJsselland",
    "18": "Utrecht",
    "19": "Gooi en Vechtstreek",
    "20": "Zeeland",
    "21": "Limburg-Zuid",
    "23": "Twente",
    "24": "Noord-Holland Noord",
    "25": "Haaglanden",
    "26": "Midden- en West-Brabant",
    "27": "Flevoland",
}

# Common place-name fragments → region id (best-effort for local SDR text).
_PLACE_HINTS: list[tuple[str, str]] = [
    ("amsterdam", "1"),
    ("amstelland", "1"),
    ("amstelveen", "1"),
    ("groningen", "2"),
    ("apeldoorn", "3"),
    ("zutphen", "3"),
    ("zaandam", "4"),
    ("purmerend", "4"),
    ("leiden", "5"),
    ("gouda", "5"),
    ("den bosch", "6"),
    ("'s-hertogenbosch", "6"),
    ("leeuwarden", "7"),
    ("fryslan", "7"),
    ("friesland", "7"),
    ("arnhem", "8"),
    ("haarlem", "9"),
    ("rotterdam", "10"),
    ("schiedam", "10"),
    ("eindhoven", "11"),
    ("helmond", "11"),
    ("assen", "12"),
    ("emmen", "12"),
    ("nijmegen", "13"),
    ("dordrecht", "14"),
    ("venlo", "15"),
    ("zwolle", "17"),
    ("utrecht", "18"),
    ("amersfoort", "18"),
    ("hilversum", "19"),
    ("middelburg", "20"),
    ("vlissingen", "20"),
    ("maastricht", "21"),
    ("heerlen", "21"),
    ("enschede", "23"),
    ("hengelo", "23"),
    ("alkmaar", "24"),
    ("den helder", "24"),
    ("den haag", "25"),
    ("haaglanden", "25"),
    ("delft", "25"),
    ("tilburg", "26"),
    ("breda", "26"),
    ("almere", "27"),
    ("lelystad", "27"),
]


def guess_region(message: str) -> tuple[str, str]:
    lower = message.lower()
    for hint, region_id in _PLACE_HINTS:
        if hint in lower:
            return region_id, REGION_NAMES.get(region_id, "Onbekende regio")
    return "", "Onbekende regio"
