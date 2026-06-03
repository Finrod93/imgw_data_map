import asyncio
from collections import defaultdict
import aiohttp
import json
import os
import pandas as pd
from tqdm.asyncio import tqdm_asyncio
from datetime import datetime, timedelta, timezone
from dateutil import parser
import requests
import ast
import zoneinfo

# 🕒 Ustawienie strefy czasowej dla Polski (wymaga tzdata w requirements.txt)
local_tz = zoneinfo.ZoneInfo("Europe/Warsaw")
now_local = datetime.now(local_tz)

year = now_local.year
month = now_local.month
day = now_local.day
hour = now_local.hour

# Klucz godzinowy w bazie, np. "2026-06-03_14"
timestamp_key = f"{year}-{month:02d}-{day:02d}_{hour:02d}"

url = "https://danepubliczne.imgw.pl/api/data/meteo"
temperature_url_base = "https://hydro-back.imgw.pl/station/meteo/data?id="

stations_df = pd.read_excel("all_stations.xlsx", dtype={"Station_id": str})

def parse_coordinates(val):
    if pd.isna(val): return None
    if isinstance(val, (list, tuple)): return list(val)
    try: return list(ast.literal_eval(val))
    except Exception:
        try:
            lon, lat = val.split(",")
            return [float(lon), float(lat)]
        except Exception: return None

stations_df["Coordinates_parsed"] = stations_df["Coordinates"].apply(parse_coordinates)

stations_map = {
    row["Station_id"]: {
        "Station_id": row["Station_id"],
        "Station_name": None if pd.isna(row["Station_name"]) else row["Station_name"],
        "coordinates": row["Coordinates_parsed"],
        "Elevation": None if pd.isna(row["Elevation"]) else row["Elevation"],
        "Status": row["Status"]
    }
    for _, row in stations_df.iterrows()
}

start_utc = datetime(year=year, month=month, day=day, hour=hour, minute=0, second=0, tzinfo=local_tz).astimezone(timezone.utc) - timedelta(hours=1)
end_utc = start_utc + timedelta(hours=2)
hours_interval = 3

async def fetch_json(session, url):
    try:
        async with session.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=5) as response:
            return await response.json() if response.status == 200 else None
    except Exception: return None

def extract_temperature_data(temperature_data):
    temp_current, temp_min_h, temp_max_h = None, None, None
    if temperature_data and isinstance(temperature_data.get("temperature"), list) and len(temperature_data.get("temperature")) > 0:
        valid_temps = []
        for t in temperature_data.get("temperature", []):
            if t.get("value") is None or t.get("date") is None: continue
            try:
                dt = parser.isoparse(t["date"])
                if start_utc <= dt <= end_utc: valid_temps.append(t)
            except Exception: continue
        if valid_temps:
            temp_min_h = min(valid_temps, key=lambda t: t["value"])["value"]
            temp_max_h = max(valid_temps, key=lambda t: t["value"])["value"]
        try:
            temp_current = temperature_data["temperature"][-1].get("value")
        except Exception: pass
    return temp_current, temp_min_h, temp_max_h

async def process_station(session, data):
    station_id = data["kod_stacji"]
    station_info = stations_map.get(station_id)
    if not station_info or not station_info["coordinates"]: return None

    temperature_url = f"{temperature_url_base}{station_id}&hoursInterval={hours_interval}"
    temperature_data = await fetch_json(session, temperature_url)
    ta, tmin_h, tmax_h = extract_temperature_data(temperature_data)

    raw_properties = {
        "Station_id": station_id, "Station_name": station_info["Station_name"], "Status": station_info["Status"], "Elevation": station_info["Elevation"],
        "Ta": ta, "Tmin_hour": tmin_h, "Tmax_hour": tmax_h,
        "Tg": float(data['temperatura_gruntu']) if data['temperatura_gruntu'] else None,
        "Wind_avg": float(data['wiatr_srednia_predkosc']) if data['wiatr_srednia_predkosc'] else None,
        "Wind_max": float(data['wiatr_predkosc_maksymalna']) if data['wiatr_predkosc_maksymalna'] else None,
        "Precip_24h": float(data['suma_opadu']) if data['suma_opadu'] else None
    }
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": station_info["coordinates"]},
        "properties": {k: v for k, v in raw_properties.items() if v is not None}
    }

async def main():
    async with aiohttp.ClientSession() as session:
        imgw_data = await fetch_json(session, url)
        if not imgw_data: return

        tasks = [process_station(session, data) for data in imgw_data]
        features = await tqdm_asyncio.gather(*tasks, desc="Pobieranie danych")
        features = [f for f in features if f is not None]

        baza_path = "imgw_baza.json"
        if os.path.exists(baza_path):
            with open(baza_path, "r", encoding="utf-8") as f:
                try: baza = json.load(f)
                except Exception: baza = {}
        else:
            baza = {}

        # Zapisujemy nową godzinę do pliku
        baza[timestamp_key] = features

        # Usuwanie wpisów starszych niż 6 tygodni (42 dni), żeby oszczędzać miejsce
        limit_retencji = now_local - timedelta(days=42)
        for k in list(baza.keys()):
            try:
                data_klucza = datetime.strptime(k.split("_")[0], "%Y-%m-%d").replace(tzinfo=local_tz)
                if data_klucza < limit_retencji: del baza[k]
            except Exception: pass

        with open(baza_path, "w", encoding="utf-8") as f:
            json.dump(baza, f, ensure_ascii=False, indent=2)
            
        print(f"Zaktualizowano godzinę {timestamp_key} w bazie danych!")

asyncio.run(main())