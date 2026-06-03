import asyncio
from collections import defaultdict
import aiohttp
import json
import pandas as pd
import math
from tqdm.asyncio import tqdm_asyncio
from datetime import datetime, timedelta, timezone
from dateutil import parser
import requests
import ast
import zoneinfo
import os

# 🕒 Automatyczne pobieranie aktualnej daty w Polsce
local_tz = zoneinfo.ZoneInfo("Europe/Warsaw")
now_local = datetime.now(local_tz)

year = now_local.year
month = now_local.month
day = now_local.day

url = "https://danepubliczne.imgw.pl/api/data/meteo"
temperature_url_base = "https://hydro-back.imgw.pl/station/meteo/data?id="
przymrozki_url_base =  "https://agrometeo.imgw.pl/przymrozki/api?d="

def addZero(dataNumber):
    if dataNumber >= 10:
        return str(dataNumber)
    else:
        return "0" + str(dataNumber)

przymrozki_url = f"{przymrozki_url_base}{year}-{addZero(month)}-{addZero(day)}"

stations_df = pd.read_excel(
    "all_stations.xlsx",
    dtype={"Station_id": str}
)

def parse_coordinates(val):
    if pd.isna(val):
        return None
    try:
        if isinstance(val, str):
            coords = ast.literal_eval(val)
            if isinstance(coords, list) and len(coords) == 2:
                return [float(coords[0]), float(coords[1])]
        elif isinstance(val, list) and len(val) == 2:
            return [float(val[0]), float(val[1])]
    except Exception:
        pass
    return None

stations_map = {}
for _, row in stations_df.iterrows():
    sid = str(row["Station_id"]).strip()
    coords = parse_coordinates(row["Coordinates"])
    try:
        elev = float(row["Elevation"]) if not pd.isna(row["Elevation"]) else None
    except ValueError:
        elev = None
        
    stations_map[sid] = {
        "Station_id": sid,
        "Station_name": str(row["Station_name"]).strip(),
        "coordinates": coords,
        "Elevation": elev,
        "Status": str(row["Status"]).strip().upper()
    }

async def fetch_station_extra(session, station_id):
    req_url = f"{temperature_url_base}{station_id}"
    try:
        async with session.get(req_url, timeout=10) as response:
            if response.status == 200:
                text = await response.text()
                if text.strip():
                    return json.loads(text)
    except Exception:
        pass
    return None

async def process_station(session, data, przymrozki_data):
    station_id = data.get("kod_stacji")
    if not station_id:
        return None
        
    station_id = str(station_id).strip()
    station_info = stations_map.get(station_id)
    
    if not station_info or not station_info.get("coordinates"):
        return None

    try:
        ta = float(data.get("temperatura")) if data.get("temperatura") is not None else None
    except ValueError:
        ta = None

    try:
        p24 = float(data.get("suma_opadu")) if data.get("suma_opadu") is not None else None
    except ValueError:
        p24 = None

    extra = await fetch_station_extra(session, station_id)
    
    tmin, tmax, tmin_hour, tmax_hour, p10 = None, None, None, None, None
    w_avg, w_max = None, None

    if extra and isinstance(extra, list) and len(extra) > 0:
        latest = extra[0]
        
        if latest.get("temperatureMin24h") is not None:
            try: tmin = float(latest["temperatureMin24h"])
            except ValueError: pass
        if latest.get("temperatureMax24h") is not None:
            try: tmax = float(latest["temperatureMax24h"])
            except ValueError: pass
        if latest.get("temperatureMin24hTime") is not None:
            tmin_hour = latest["temperatureMin24hTime"]
        if latest.get("temperatureMax24hTime") is not None:
            tmax_hour = latest["temperatureMax24hTime"]
            
        if latest.get("precipitation10m") is not None:
            try: p10 = float(latest["precipitation10m"])
            except ValueError: pass
            
        if latest.get("windSpeedAverage") is not None:
            try: w_avg = float(latest["windSpeedAverage"])
            except ValueError: pass
        if latest.get("windSpeedMax") is not None:
            try: w_max = float(latest["windSpeedMax"])
            except ValueError: pass

    tg = None
    if przymrozki_data and isinstance(przymrozki_data, list):
        for p_row in przymrozki_data:
            if str(p_row.get("kod")).strip() == station_id:
                if p_row.get("t5") is not None:
                    try:
                        tg = float(p_row["t5"])
                    except ValueError:
                        pass
                break

    properties = {
        "Station_id": station_id,
        "Station_name": station_info["Station_name"],
        "Status": "ACTIVE",
        "Elevation": station_info["Elevation"],
        "Ta": ta,
        "Tmin": tmin,
        "Tmax": tmax,
        "Tmin_hour": tmin_hour,
        "Tmax_hour": tmax_hour,
        "Tg": tg,
        "Precip_24h": p24,
        "Precip_10min": p10,
        "Wind_avg": w_avg,
        "Wind_max": w_max
    }

    return {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": station_info["coordinates"]
        },
        "properties": properties
    }

async def process_missing_station(session, station_info, przymrozki_data):
    station_id = station_info["Station_id"]
    extra = await fetch_station_extra(session, station_id)
    
    tmin, tmax, tmin_hour, tmax_hour, p10 = None, None, None, None, None
    w_avg, w_max = None, None

    if extra and isinstance(extra, list) and len(extra) > 0:
        latest = extra[0]
        if latest.get("temperatureMin24h") is not None:
            try: tmin = float(latest["temperatureMin24h"])
            except ValueError: pass
        if latest.get("temperatureMax24h") is not None:
            try: tmax = float(latest["temperatureMax24h"])
            except ValueError: pass
        if latest.get("temperatureMin24hTime") is not None:
            tmin_hour = latest["temperatureMin24hTime"]
        if latest.get("temperatureMax24hTime") is not None:
            tmax_hour = latest["temperatureMax24hTime"]
        if latest.get("precipitation10m") is not None:
            try: p10 = float(latest["precipitation10m"])
            except ValueError: pass
        if latest.get("windSpeedAverage") is not None:
            try: w_avg = float(latest["windSpeedAverage"])
            except ValueError: pass
        if latest.get("windSpeedMax") is not None:
            try: w_max = float(latest["windSpeedMax"])
            except ValueError: pass

    tg = None
    if przymrozki_data and isinstance(przymrozki_data, list):
        for p_row in przymrozki_data:
            if str(p_row.get("kod")).strip() == station_id:
                if p_row.get("t5") is not None:
                    try: tg = float(p_row["t5"])
                    except ValueError: pass
                break

    properties = {
        "Station_id": station_id,
        "Station_name": station_info["Station_name"],
        "Status": "ACTIVE",
        "Elevation": station_info["Elevation"],
        "Ta": None,
        "Tmin": tmin,
        "Tmax": tmax,
        "Tmin_hour": tmin_hour,
        "Tmax_hour": tmax_hour,
        "Tg": tg,
        "Precip_24h": None,
        "Precip_10min": p10,
        "Wind_avg": w_avg,
        "Wind_max": w_max
    }

    return {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": station_info["coordinates"]
        },
        "properties": properties
    }

def process_closed_station(station_info):
    return {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": station_info["coordinates"]
        },
        "properties": {
            "Station_id": station_info["Station_id"],
            "Station_name": station_info["Station_name"],
            "Status": "CLOSED",
            "Elevation": station_info["Elevation"]
        }
    }

async def main():
    try:
        response_przymrozki = requests.get(przymrozki_url, timeout=15)
        if response_przymrozki.status_code == 200:
            przymrozki_data = response_przymrozki.json()
        else:
            przymrozki_data = None
    except Exception:
        przymrozki_data = None

    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(url, timeout=15) as response:
                if response.status == 200:
                    imgw_data = await response.json()
                else:
                    print("Błąd pobierania głównego API IMGW")
                    return
        except Exception as e:
            print(f"Błąd połączenia z API IMGW: {e}")
            return

        # 1. Definiujemy folder bazy danych i ścieżkę pliku dziennego
        output_dir = "imgw_baza"
        os.makedirs(output_dir, exist_ok=True)
        
        date_str = f"{year}-{addZero(month)}-{addZero(day)}"
        daily_file_path = os.path.join(output_dir, f"{date_str}.json")

        # Określamy klucz aktualnej godziny pomiarowej (np. "2026-06-03 22:00")
        current_hour_str = f"{now_local.hour:02d}:00"
        timestamp_key = f"{date_str} {current_hour_str}"

        # 2. Budujemy świeżą listę featurów z obecnego pobrania
        new_features = []
        
        active_tasks = [process_station(session, data, przymrozki_data) for data in imgw_data]
        features_fetched = await tqdm_asyncio.gather(*active_tasks, desc="Pobieranie danych stacji")
        features_fetched = [f for f in features_fetched if f is not None]
        new_features.extend(features_fetched)

        active_station_ids = {sid for sid, info in stations_map.items() if info["Status"] == "ACTIVE"}
        imgw_station_ids = {obj["kod_stacji"] for obj in imgw_data}
        missing_station_ids = active_station_ids - imgw_station_ids
        missing_stations = [stations_map[sid] for sid in missing_station_ids if stations_map[sid]["coordinates"]]

        if missing_stations:
            missing_tasks = [process_missing_station(session, station, przymrozki_data) for station in missing_stations]
            missing_features = await tqdm_asyncio.gather(*missing_tasks, desc="Pobieranie brakujących stacji")
            new_features.extend(missing_features)

        closed_stations = [station_info for station_info in stations_map.values() if station_info["Status"] == "CLOSED" and station_info.get("coordinates")]
        if closed_stations:
            closed_features = [process_closed_station(station_info) for station_info in closed_stations]
            new_features.extend(closed_features)

        # 3. Wczytujemy istniejący plik dzienny lub tworzymy nową strukturę od zera
        existing_data = None
        if os.path.exists(daily_file_path):
            try:
                with open(daily_file_path, "r", encoding="utf-8") as f:
                    existing_data = json.load(f)
            except Exception:
                existing_data = None

        if not existing_data:
            existing_data = {
                "type": "FeatureCollection",
                "features": []
            }
            for nf in new_features:
                base_f = {
                    "type": "Feature",
                    "geometry": nf["geometry"],
                    "properties": {
                        "Station_id": nf["properties"]["Station_id"],
                        "Station_name": nf["properties"]["Station_name"],
                        "Status": nf["properties"]["Status"],
                        "Elevation": nf["properties"].get("Elevation"),
                        "Measurements": {}
                    }
                }
                existing_data["features"].append(base_f)

        # 4. Mapujemy stacje w celu szybkiej aktualizacji słownika 'Measurements'
        existing_stations_map = {f["properties"]["Station_id"]: f for f in existing_data["features"]}

        for nf in new_features:
            sid = nf["properties"]["Station_id"]
            if nf["properties"]["Status"] == "ACTIVE" and sid in existing_stations_map:
                props = nf["properties"]
                
                hourly_measurement = {
                    "Ta": props.get("Ta"),
                    "Tmin": props.get("Tmin"),
                    "Tmax": props.get("Tmax"),
                    "Tmin_hour": props.get("Tmin_hour"),
                    "Tmax_hour": props.get("Tmax_hour"),
                    "Tg": props.get("Tg"),
                    "Precip_24h": props.get("Precip_24h"),
                    "Precip_10min": props.get("Precip_10min"),
                    "Wind_avg": props.get("Wind_avg"),
                    "Wind_max": props.get("Wind_max")
                }
                
                if "Measurements" not in existing_stations_map[sid]["properties"]:
                    existing_stations_map[sid]["properties"]["Measurements"] = {}
                
                existing_stations_map[sid]["properties"]["Measurements"][timestamp_key] = hourly_measurement

        # 5. Zapisujemy zaktualizowany plik dzienny do katalogu bazy danych
        with open(daily_file_path, "w", encoding="utf-8") as f:
            json.dump(existing_data, f, ensure_ascii=False, indent=4)

        print(f"Pomyślnie zaktualizowano bazę dzienną: {daily_file_path} dla klucza {timestamp_key}")

if __name__ == "__main__":
    asyncio.run(main())