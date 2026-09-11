load("http.star", "http")
load("render.star", "canvas", "render")
load("schema.star", "schema")

DEFAULT_API = "https://beta.alarmeringdroid.nl/api2/find/"
REGION_NAMES = {
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

def csv(value):
    values = []
    for part in value.split(","):
        part = part.strip()
        if part:
            values.append(part)
    return values

def selected_regions(config):
    regions = []
    for field in ["region_1", "region_2", "region_3"]:
        value = config.str(field, "")
        if value and value != "0" and value not in regions:
            regions.append(value)
    return regions

def capcodes_for(message):
    codes = []
    for cap in message.get("capcodes", []):
        code = str(cap.get("capcode", ""))
        if code:
            codes.append(code)
    return codes

def matches(message, regions, wanted_caps):
    if not regions or str(message.get("regioid", "")) not in regions:
        return False
    if not wanted_caps:
        return True
    for code in capcodes_for(message):
        if code in wanted_caps:
            return True
    return False

def service_kind(message):
    source = (message.get("dienst", "") + " " + message.get("capstring", "") + " " + text_for(message)).lower()
    if "trauma" in source or "lifeliner" in source or "mmt" in source or "0120901" in source:
        return "lifeliner"
    if "brandweer" in source or "brw" in source:
        return "brandweer"
    if "politie" in source:
        return "politie"
    if "ambulance" in source or "ambu" in source or "rav" in source or "mka" in source:
        return "ambulance"
    return "overige"

def service_enabled(message, config):
    return config.bool("service_" + service_kind(message), True)

def latest_message(config):
    response = http.get(config.str("api_url", DEFAULT_API), ttl_seconds = 15)
    if response.status_code != 200:
        return None, "API %d" % response.status_code
    data = response.json()
    messages = data.get("meldingen", data.get("messages", data.get("results", [])))
    regions = selected_regions(config)
    wanted_caps = csv(config.str("capcodes", ""))
    for message in messages:
        if matches(message, regions, wanted_caps) and service_enabled(message, config):
            return message, ""
    return None, "GEEN MELDING"

def text_for(message):
    return message.get("tekstmelding", message.get("melding", message.get("message", "")))

def service_info(message):
    kind = service_kind(message)
    if kind == "lifeliner":
        return "HELI", "#ffd21f", "#231d00"
    if kind == "brandweer":
        return "BRAND", "#ff3b30", "#240504"
    if kind == "politie":
        return "POLITIE", "#3987ff", "#03152d"
    if kind == "ambulance":
        return "AMBU", "#30d979", "#032312"
    return "P2000", "#17d9e6", "#032326"

def priority_for(message):
    source = text_for(message).upper()
    for priority in ["P1", "P2", "A1", "A2", "B1", "B2"]:
        if priority in source:
            return priority
    return ""

def short_time(message):
    value = str(message.get("tijd", ""))
    if len(value) >= 5:
        return value[:5]
    return value

def region_name(message):
    name = message.get("regio", "")
    if name:
        return name
    return REGION_NAMES.get(str(message.get("regioid", "")), "Onbekende regio")

def badge(text, background, foreground):
    return render.Box(
        height = 7,
        color = background,
        child = render.Padding(
            pad = (2, 1, 2, 0),
            child = render.Text(content = text, font = "CG-pixel-3x5-mono", color = foreground),
        ),
    )

def icon_pattern(kind):
    if kind == "brandweer":
        # Dutch fire brigade: a compact firefighter helmet.
        return ["...XX...", "..XXXX..", ".XXXXXX.", ".XXXXXX.", "XXXXXXXX", "X......X", ".XXXXXX.", "........"]
    if kind == "politie":
        # Dutch police flame/torch emblem.
        return ["...X....", "..XX....", ".XXX....", "..XX....", "...XX...", "..XXX...", "...X....", "..XXX..."]
    if kind == "ambulance":
        return ["...XX...", "...XX...", "...XX...", "XXXXXXXX", "XXXXXXXX", "...XX...", "...XX...", "...XX..."]
    if kind == "lifeliner":
        return ["....X...", "XXXXXXXX", "...X....", ".XXXXXX.", "XXXXXXX.", "...XX...", "..X..X..", "........"]
    return ["...X....", "..X.X...", ".X...X..", "...X....", "..X.X...", "...X....", "........", "........"]

def service_icon(kind, accent, background):
    foreground = accent
    icon_background = background
    if kind == "ambulance":
        foreground = "#e21b23"
        icon_background = "#ffffff"
    elif kind == "brandweer":
        foreground = "#ffffff"
        icon_background = "#d71920"
    elif kind == "politie":
        foreground = "#ff9e18"
        icon_background = "#003b70"
    elif kind == "lifeliner":
        foreground = "#123a63"
        icon_background = "#ffd21f"

    layers = [render.Box(width = 10, height = 10, color = icon_background)]
    pattern = icon_pattern(kind)
    for y in range(len(pattern)):
        for x in range(len(pattern[y])):
            if pattern[y][x] == "X":
                layers.append(render.Padding(
                    pad = (x + 1, y + 1, 0, 0),
                    child = render.Box(width = 1, height = 1, color = foreground),
                ))
    return render.Stack(children = layers)

def status_screen(title):
    return render.Root(
        child = render.Box(
            width = canvas.width(),
            height = canvas.height(),
            color = "#05080d",
            child = render.Stack(children = [
                render.Box(width = 3, height = canvas.height(), color = "#17d9e6"),
                render.Padding(
                    pad = (6, 3, 1, 1),
                    child = render.Column(children = [
                        badge("P2000 V2", "#17d9e6", "#032326"),
                        render.Box(height = 3),
                        render.Text(content = title, font = "CG-pixel-3x5-mono", color = "#aab7c6"),
                    ]),
                ),
            ]),
        ),
    )

def main(config):
    message, error = latest_message(config)
    if message == None:
        return status_screen(error)

    kind = service_kind(message)
    _, accent, dark_accent = service_info(message)
    priority = priority_for(message)
    description = text_for(message)
    place = message.get("plaats", region_name(message))
    heading = place.upper()
    if priority:
        heading = heading + " " + priority
    time = render.Text(content = short_time(message), font = "CG-pixel-3x5-mono", color = "#8e9bab")

    return render.Root(
        child = render.Box(
            width = canvas.width(),
            height = canvas.height(),
            color = "#05080d",
            child = render.Padding(
                pad = 1,
                child = render.Column(children = [
                    render.Box(
                        width = canvas.width() - 2,
                        height = 10,
                        child = render.Row(
                            cross_align = "center",
                            children = [
                                service_icon(kind, accent, dark_accent),
                                render.Box(width = 1),
                                render.Box(
                                    width = 29,
                                    height = 10,
                                    child = render.Row(
                                        expanded = True,
                                        cross_align = "center",
                                        children = [render.Marquee(
                                            width = 29,
                                            child = render.Text(content = heading, font = "tb-8", color = accent),
                                            offset_start = 0,
                                            offset_end = 0,
                                            delay = 12,
                                        )],
                                    ),
                                ),
                                render.Box(width = 2),
                                render.Box(width = 20, child = time),
                            ],
                        ),
                    ),
                    render.Box(height = 1),
                    render.Box(
                        width = canvas.width() - 2,
                        height = 19,
                        color = accent,
                        child = render.Padding(
                            pad = 1,
                            child = render.Box(
                                width = canvas.width() - 4,
                                height = 17,
                                color = dark_accent,
                                child = render.Row(
                                    expanded = True,
                                    cross_align = "center",
                                    children = [render.Marquee(
                                        width = canvas.width() - 6,
                                        child = render.Text(content = description, font = "tb-8", color = "#ffffff"),
                                        offset_start = 0,
                                        offset_end = 0,
                                        delay = 12,
                                    )],
                                ),
                            ),
                        ),
                    ),
                ]),
            ),
        ),
    )

def region_options():
    return [
        schema.Option(display = "Geen", value = "0"),
        schema.Option(display = "Amsterdam-Amstelland", value = "1"),
        schema.Option(display = "Groningen", value = "2"),
        schema.Option(display = "Noord- en Oost-Gelderland", value = "3"),
        schema.Option(display = "Zaanstreek-Waterland", value = "4"),
        schema.Option(display = "Hollands Midden", value = "5"),
        schema.Option(display = "Brabant-Noord", value = "6"),
        schema.Option(display = "Fryslan", value = "7"),
        schema.Option(display = "Gelderland-Midden", value = "8"),
        schema.Option(display = "Kennemerland", value = "9"),
        schema.Option(display = "Rotterdam-Rijnmond", value = "10"),
        schema.Option(display = "Brabant-Zuidoost", value = "11"),
        schema.Option(display = "Drenthe", value = "12"),
        schema.Option(display = "Gelderland-Zuid", value = "13"),
        schema.Option(display = "Zuid-Holland-Zuid", value = "14"),
        schema.Option(display = "Limburg-Noord", value = "15"),
        schema.Option(display = "IJsselland", value = "17"),
        schema.Option(display = "Utrecht", value = "18"),
        schema.Option(display = "Gooi en Vechtstreek", value = "19"),
        schema.Option(display = "Zeeland", value = "20"),
        schema.Option(display = "Limburg-Zuid", value = "21"),
        schema.Option(display = "Twente", value = "23"),
        schema.Option(display = "Noord-Holland Noord", value = "24"),
        schema.Option(display = "Haaglanden", value = "25"),
        schema.Option(display = "Midden- en West-Brabant", value = "26"),
        schema.Option(display = "Flevoland", value = "27"),
    ]

def get_schema():
    options = region_options()
    return schema.Schema(version = "1", fields = [
        schema.Dropdown(id = "region_1", name = "Regio 1", desc = "Primaire veiligheidsregio.", icon = "mapLocationDot", default = "9", options = options),
        schema.Dropdown(id = "region_2", name = "Regio 2", desc = "Optionele tweede veiligheidsregio.", icon = "mapLocationDot", default = "0", options = options),
        schema.Dropdown(id = "region_3", name = "Regio 3", desc = "Optionele derde veiligheidsregio.", icon = "mapLocationDot", default = "0", options = options),
        schema.Toggle(id = "service_brandweer", name = "Brandweer", desc = "Toon brandweermeldingen.", icon = "fireFlameCurved", default = True),
        schema.Toggle(id = "service_politie", name = "Politie", desc = "Toon politiemeldingen.", icon = "shieldHalved", default = True),
        schema.Toggle(id = "service_ambulance", name = "Ambulance", desc = "Toon ambulance- en RAV-meldingen.", icon = "truckMedical", default = True),
        schema.Toggle(id = "service_lifeliner", name = "Lifeliner / traumaheli", desc = "Toon MMT- en traumahelimeldingen.", icon = "helicopter", default = True),
        schema.Toggle(id = "service_overige", name = "Overige diensten", desc = "Toon overige P2000-meldingen.", icon = "towerBroadcast", default = True),
        schema.Text(id = "capcodes", name = "Capcodes", desc = "Optioneel, komma-gescheiden.", icon = "towerBroadcast", default = ""),
        schema.Text(id = "api_url", name = "P2000 API URL", desc = "Standaard: Alarmeringdroid API v2.", icon = "link", default = DEFAULT_API),
    ])
