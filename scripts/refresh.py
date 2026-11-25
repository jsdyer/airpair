"""Build dated model/monitor windows from public feeds. OpenWeather output contains matched differences and period summaries."""
import csv
from collections import defaultdict
from datetime import datetime, timedelta, timezone
import io
import json
import math
import os
from pathlib import Path
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

UTC = timezone.utc
HOUR = timedelta(hours=1)
WEEK = timedelta(days=7)
ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / 'web/data/pairs.json'
BC = 'https://www.env.gov.bc.ca/epd/bcairquality/aqo/csv/Hourly_Raw_Air_Data/Air_Quality/PM25.csv'
NS = 'https://data.novascotia.ca/api/v3/views/de89-3xrj/export.csv'
CAMS = 'https://air-quality-api.open-meteo.com/v1/air-quality'
OWM = 'https://api.openweathermap.org/data/2.5/air_pollution/history'
OW_LICENCE = {
    'attribution': 'Weather data provided by OpenWeather',
    'provider': 'https://openweathermap.org/',
    'database': 'https://opendatacommons.org/licenses/odbl/1-0/',
    'contents': 'https://creativecommons.org/licenses/by-sa/4.0/',
    'scope': 'OpenWeather-derived hourly differences and period summaries where provided',
}
STATIONS = {
    'langley': dict(name='Langley Central', region='British Columbia', stationId='E209178',
                   lat=49.0956, lon=-122.5671, offset=-8, zone='PST', source=BC,
                   release='Rolling provincial feed · preliminary readings'),
    'lake-major': dict(name='Lake Major', region='Nova Scotia', stationId='030120',
                       lat=44.72, lon=-63.48, offset=-4, zone='AST', source=NS,
                       release='Annual provincial release · validated readings'),
}


def fetch(url, label):
    """Exceptions retain only a public label and status; the OpenWeather URL contains a credential."""
    for attempt in range(3):
        try:
            with urlopen(Request(url, headers={'User-Agent': 'AirPair/1.0 (+https://coolcode.ca/airpair/)'}), timeout=45) as res:
                return res.read()
        except (HTTPError, URLError, TimeoutError, OSError) as exc:
            code = getattr(exc, 'code', None)
            if attempt == 2 or code in (400, 401, 403, 404):
                raise RuntimeError(f'{label} download failed ({code or "network error"})') from None
            time.sleep(2 ** attempt)


def finite(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def parse_station(slug, rows, now):
    """Keep instrument series separate. Conflicting duplicate samples become missing."""
    st = STATIONS[slug]
    fixed = timezone(timedelta(hours=st['offset']))
    series = defaultdict(dict)
    for row in rows:
        if slug == 'langley':
            if row['EMS_ID'] != st['stationId'] or row['PARAMETER'] != 'PM25':
                continue
            if row['STATION_NAME'] != st['name'] or (float(row['LATITUDE']), float(row['LONGITUDE'])) != (st['lat'], st['lon']):
                raise ValueError('Langley station identity or coordinates changed')
            local = datetime.fromisoformat(row['DATE_PST'])
            unit, instrument, raw = row['UNITS'], row['INSTRUMENT'], row['REPORTED_VALUE']
        else:
            if row['Station'] != st['name'] or row['Pollutant'] != 'PM2.5':
                continue
            local = datetime.strptime(row['Date & Time'], '%Y/%m/%d %I:%M:%S %p')
            unit, instrument, raw = row['Unit'], row['Instrument'], row['Average']
        if unit.replace('µ', 'u').replace('μ', 'u').replace('³', '3') != 'ug/m3':
            raise ValueError('Unexpected monitor concentration unit')
        if local.minute or local.second or not instrument.strip():
            raise ValueError('Unexpected monitor timestamp or instrument')
        stamp = local.replace(tzinfo=fixed).astimezone(UTC)
        if stamp > now:
            continue
        samples = series[instrument.strip()]
        val = finite(raw)
        if stamp in samples and samples[stamp] != val:
            val = None
        samples[stamp] = val
    if not series:
        raise ValueError(f'No station rows for {slug}')
    return series


def timestamp(value):
    return value.isoformat(timespec='minutes').replace('+00:00', 'Z')


def model_values(payload, provider, start, end):
    if provider == 'cams':
        unit = payload['hourly_units']['pm2_5'].replace('μ', 'u').replace('µ', 'u').replace('³', '3')
        if unit != 'ug/m3' or payload['utc_offset_seconds'] != 0:
            raise ValueError('Unexpected model unit or timezone')
        pairs = zip(payload['hourly']['time'], payload['hourly']['pm2_5'], strict=True)
    else:
        pairs = ((r['dt'], r['components']['pm2_5']) for r in payload['list'])
    values = {}
    for epoch, raw in pairs:
        key = datetime.fromtimestamp(epoch, UTC)
        if key.minute or key.second or key.microsecond:
            raise ValueError('Unexpected sub-hour model timestamp')
        if start <= key < end:
            if key in values:
                raise ValueError('Duplicate model timestamp')
            values[key] = finite(raw)
    if not any(val is not None for val in values.values()):
        raise ValueError(f'No {provider} model data in window')
    return values


def metrics(times, model, monitor):
    paired = [(i, pred, obs) for i, (pred, obs) in enumerate(zip(model, monitor, strict=True))
              if pred is not None and obs is not None]
    if not paired:
        return {'count': 0}
    pred_peak = max(paired, key=lambda r: r[1])[0]
    obs_peak = max(paired, key=lambda r: r[2])[0]
    differences = [pred - obs for _, pred, obs in paired]
    return dict(count=len(paired), bias=round(sum(differences) / len(paired), 3),
                mae=round(sum(abs(d) for d in differences) / len(paired), 3),
                modelPeakUtc=timestamp(times[pred_peak]), monitorPeakUtc=timestamp(times[obs_peak]))


def window(st, series, title, start, key):
    end = start + WEEK
    times = [start + i * HOUR for i in range(168)]
    active = {name: [data.get(t) for t in times] for name, data in series.items() if any(t in data for t in times)}
    if not any(v is not None for data in active.values() for v in data):
        raise ValueError('No usable measurements in comparison week')
    params = dict(latitude=st['lat'], longitude=st['lon'], hourly='pm2_5', domains='cams_global',
                  timezone='GMT', timeformat='unixtime', start_date=start.date(), end_date=(end - HOUR).date())
    url = CAMS + '?' + urlencode(params)
    response = json.loads(fetch(url, 'CAMS via Open-Meteo'))
    cams = model_values(response, 'cams', start, end)
    record = dict(label=title, startUtc=timestamp(start), endUtcExclusive=timestamp(end), monitor=active,
                  cams=[cams.get(t) for t in times], camsRequest=url,
                  camsGrid=[response['latitude'], response['longitude']], openweather={'status': 'inactive'})
    if key:
        query = dict(lat=st['lat'], lon=st['lon'], start=int(start.timestamp()), end=int((end-HOUR).timestamp()), appid=key)
        try:
            result = json.loads(fetch(OWM + '?' + urlencode(query), 'OpenWeather'))
            estimates = model_values(result, 'openweather', start, end)
        except (RuntimeError, ValueError, KeyError, TypeError, OverflowError):
            print('OpenWeather comparison unavailable for', st['name'], start.date())
            record['openweather'] = {'status': 'unavailable'}
            return record
        model = [estimates.get(t) for t in times]
        summary = {}
        for name, obs in active.items():
            differences = [round(predicted - measured, 6) if predicted is not None and measured is not None else None
                           for predicted, measured in zip(model, obs, strict=True)]
            summary[name] = dict(hourlyDifferences=differences, week=metrics(times, model, obs), days=[
                dict(date=times[i].date().isoformat(), **metrics(times[i:i+24], model[i:i+24], obs[i:i+24]))
                for i in range(0, 168, 24)])
        record['openweather'] = dict(status='available', byInstrument=summary)
    return record


def snapshot(now, key=None):
    result = dict(asOf=timestamp(now), unit='µg/m³', openweatherLicence=OW_LICENCE, stations={})
    for slug, st in STATIONS.items():
        csv_text = fetch(st['source'], st['name']).decode('utf-8-sig')
        series = parse_station(slug, csv.DictReader(io.StringIO(csv_text)), now)
        latest = max(t for samples in series.values() for t, value in samples.items() if value is not None)
        through = min(now, latest + HOUR).replace(hour=0, minute=0, second=0, microsecond=0)
        windows = [window(st, series, 'Latest published week', through - WEEK, key)]
        if slug == 'lake-major':
            windows.append(window(st, series, 'May–June 2023', datetime(2023,5,27,tzinfo=UTC), key))
        result['stations'][slug] = dict(**st, lastSourceHour=timestamp(latest), windows=windows)
    result['catalog'] = catalogue(result)
    return result


def catalogue(data):
    """Count each CAMS station-hour once across overlapping instrument series."""
    hours = set()
    for slug, station in data['stations'].items():
        for w in station['windows']:
            start = datetime.fromisoformat(w['startUtc'].replace('Z', '+00:00'))
            for index, model in enumerate(w['cams']):
                if model is not None and any(s[index] is not None for s in w['monitor'].values()):
                    hours.add((slug, start + index * HOUR))
    return dict(retrieved=data['asOf'][:10], pairedHours=len(hours),
                langleyLatest=data['stations']['langley']['lastSourceHour'][:10],
                lakeMajorLatest=data['stations']['lake-major']['lastSourceHour'][:10])


if __name__ == '__main__':
    key = os.environ.get('COOLCODE_OPENWEATHER_API_KEY')
    data = snapshot(datetime.now(UTC), key)
    temporary = SNAPSHOT.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n')
    temporary.replace(SNAPSHOT)
    for site in data['stations'].values():
        for w in site['windows']:
            print(site['name'], w['startUtc'], w['endUtcExclusive'], 'OpenWeather', w['openweather']['status'])
