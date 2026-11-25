import csv
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from refresh import UTC, SNAPSHOT, catalogue, metrics, model_values, parse_station

class PairsTests(unittest.TestCase):
    def test_soda3_export_keeps_ast_hours_missing_values_and_instruments(self):
        fixture = Path(__file__).parent / 'fixtures/lake-major-soda3.csv'
        with fixture.open(encoding='utf-8-sig', newline='') as source:
            series = parse_station('lake-major', csv.DictReader(source), datetime(2026, 1, 2, tzinfo=UTC))
        self.assertEqual(set(series), {'T640', 'BAM 1020'})
        expected = {
            datetime(2025, 12, 31, 4, tzinfo=UTC): 0.0,
            datetime(2025, 12, 31, 16, tzinfo=UTC): None,
            datetime(2026, 1, 1, 3, tzinfo=UTC): None,
            datetime(2026, 1, 1, 4, tzinfo=UTC): 5.7,
        }
        self.assertEqual(series['T640'], expected)
        self.assertEqual(series['BAM 1020'][datetime(2025, 12, 31, 4, tzinfo=UTC)], 2.1)

    def test_offsets_in_summer_and_duplicate_sensor_handling(self):
        local = '2023/05/29 12:00:00 AM'
        entry = {'Station':'Lake Major', 'Pollutant':'PM2.5', 'Unit':'µg/m3', 'Instrument':'T640',
                 'Date & Time':local, 'Average':'5.2'}
        stamp = datetime(2023, 5, 29, 4, tzinfo=UTC)
        entries = [entry, entry, {**entry,'Instrument':'BAM','Average':'0'}]
        series = parse_station('lake-major',entries,stamp)
        self.assertEqual(series['T640'][stamp],5.2); self.assertEqual(series['BAM'][stamp],0)
        series = parse_station('lake-major',entries+[{**entry,'Average':'4'}],stamp)
        self.assertIsNone(series['T640'][stamp])
        bc = {'EMS_ID':'E209178','STATION_NAME':'Langley Central','PARAMETER':'PM25','LATITUDE':'49.0956',
              'LONGITUDE':'-122.5671','DATE_PST':'2023-05-28 20:00','UNITS':'ug/m3',
              'INSTRUMENT':'PM25_T640','REPORTED_VALUE':'5.2'}
        self.assertEqual(parse_station('langley',[bc],stamp)['PM25_T640'][stamp],5.2)

    def test_openweather_alignment_and_aggregate(self):
        start = datetime(2025,12,25,tzinfo=UTC); times=[start+timedelta(hours=i) for i in range(3)]
        fixture = {'list':[{'dt':int(t.timestamp()),'components':{'pm2_5':v}} for t,v in zip(times,[0,4,2])]}
        values=model_values(fixture,'openweather',start,times[-1])
        self.assertEqual(values,{times[0]:0,times[1]:4})
        self.assertEqual(metrics(times,[0,4,None],[2,3,20]),{'count':2,'bias':-0.5,'mae':1.5,
                         'modelPeakUtc':'2025-12-25T01:00Z','monitorPeakUtc':'2025-12-25T01:00Z'})

    def test_checked_snapshot(self):
        data=json.loads(SNAPSHOT.read_text()); self.assertEqual(data['catalog'],catalogue(data))
        self.assertGreater(data['catalog']['pairedHours'],0)
        for st in data['stations'].values():
            for w in st['windows']:
                self.assertEqual(len(w['cams']),168)
                self.assertTrue(all(len(values)==168 for values in w['monitor'].values()))
                self.assertEqual(w['endUtcExclusive'][11:],'00:00Z')
                self.assertIn(w['openweather']['status'],('available','inactive','unavailable'))
                self.assertNotIn('appid',str(w))
