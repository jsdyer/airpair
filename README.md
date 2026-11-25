# Air Pair

[Open Air Pair](https://coolcode.ca/airpair/) to compare PM2.5 concentrations from two provincial monitoring stations with model estimates in µg/m³. The dashboard runs from a dated snapshot and does not call external APIs from visitors’ browsers.

<!-- coolcode:guide -->
Compare the saved Langley and Lake Major monitor readings with model estimates, then use the broader comparison to explore six pollutants at any two coordinates. Worldwide values are CAMS Global model forecasts. Alternatively, compare two hourly observation CSV files locally, retaining missing hours and calculating differences only where both values exist.
<!-- /coolcode:guide -->

[Explore the measured Lake Major peak](https://coolcode.ca/airpair/?station=lake-major&start=2023-05-27).

## Station data

| Monitor | Source and instrument | Time and coverage |
| --- | --- | --- |
| Langley Central, BC (E209178) | Metro Vancouver station in the [B.C. PM2.5 hourly feed](https://www.env.gov.bc.ca/epd/bcairquality/aqo/csv/Hourly_Raw_Air_Data/Air_Quality/PM25.csv). Uses the reported concentration, instrument and coordinates in the file. | The source labels time as PST (fixed UTC−8). The dashboard selects the last seven complete UTC dates in the rolling feed. Preliminary data can change. |
| Lake Major, NS (NAPS 030120) | [Nova Scotia’s validated annual PM2.5 file](https://data.novascotia.ca/datasets/de89-3xrj). The BAM and T640 series are preserved separately whenever they occur in a displayed window. The model request uses the station position rounded to 44.72° N, 63.48° W. | [Nova Scotia reports AST](https://novascotia.ca/nse/airdata/DataValidationTable.html) year-round (UTC−4). The most recent seven complete UTC dates in the file and May 27–June 2, 2023 are available. An end-of-day Dec 31 hour may fall on Jan 1 UTC. |

The exact provincial files and each CAMS query are linked from the dashboard. Lake Major uses the [full public SODA3 CSV export](https://data.novascotia.ca/api/v3/views/de89-3xrj/export.csv), which needs no API key and replaces the retired `rows.csv` download. The [provincial network map](https://novascotia.ca/nse/air/docs/AirMonitoringNetworkMap.pdf) identifies the Lake Major monitor. [Station coordinates are published in Table 9](https://dalspaceb.library.dal.ca/server/api/core/bitstreams/9a1b09aa-4a70-4fd0-8fdb-c23e4f89e0b6/content). Nova Scotia applied a T640 mass-alignment adjustment to data collected from January 2, 2024. The source release already includes that treatment.

## How the comparison works

UTC is the join key. Station hours use the fixed source offsets even during summer. The point estimate at the label time is compared to a measured hourly average. National monitoring data follow an [hour-ending convention](https://www.canada.ca/en/environment-climate-change/services/environmental-indicators/air-quality.html). This comparison retains source label times. A model timestamp and an averaged sample can represent different spatial and temporal scales.

At Lake Major on May 30, 2023 at 23:00 UTC, the T640 reached its highest paired concentration of 71.2 µg/m³. CAMS estimated 85.4 µg/m³ at that hour and reached 121.5 µg/m³ one hour later. The comparison levels (5, 10, 25 and 50 µg/m³) let the reader count both-above, monitor-only and model-only hours. Each series must meet or exceed the selected value to count. These are exploratory hourly cutoffs. Both providers use the same paired-hour rules and daily UTC groups.

Each 7-day window has 168 expected UTC timestamps. Missing, nonnumeric and conflicting duplicate readings remain missing. Repeated identical records are counted once within an instrument. Parallel instruments remain individually selectable. Both peaks use only paired hours, and ties select the earliest UTC hour. Mean difference is the average of model minus monitor. Mean absolute error averages the absolute differences. The station-hour count in the catalogue counts an hour once if any instrument and CAMS have a numeric value. It does not add OpenWeather hours to CAMS coverage. An observed concentration cannot identify a pollution source.

* **CAMS Global via Open-Meteo.** [Archived atmospheric composition forecast output](https://open-meteo.com/en/docs/air-quality-api) is available globally from August 2022. Native resolution is about 45 km and three hours. Open-Meteo supplies interpolated hourly concentrations. The browser shows exact input coordinates, the grid point returned, hourly values and paired errors for this provider.
* **OpenWeather.** The [historical Air Pollution API](https://openweathermap.org/api/air-pollution) returns hourly PM2.5 concentration in µg/m³. The refresh can compute daily and weekly counts, bias, mean absolute error, and paired peak times from those individual values. The snapshot stores the hourly model-minus-monitor difference where both inputs exist and derived period statistics. The chart reconstructs each paired model value from the monitor and that difference. OpenWeather has its own model selector and reports its availability for each window. Hourly CAMS data never fill a missing OpenWeather result.

## Refresh, testing and deployment

The repository includes an offline comparison edition. CI runs on pull requests and pushes. The main-branch workflow checks sources daily at 11:32 UTC and on manual dispatch. A successful refresh commits the data to preserve the last edition and deploys the checked static build. Failed station or CAMS downloads leave the previous snapshot intact. If the optional OpenWeather source fails, its period reports unavailable and the public CAMS comparison can still refresh. Earlier editions remain in Git history. The site shows its retrieval time and the newest station timestamp present in the feed. Public-repository schedules depend on GitHub Actions remaining enabled.

To activate the optional OpenWeather channel, use a newly provisioned key stored in this repository’s GitHub Actions secret named `COOLCODE_OPENWEATHER_API_KEY`. The credential is scoped to the trusted main-branch refresh step. With the secret unset, the daily refresh uses public data only. The free plan includes the air pollution endpoint. Each refresh makes three weekly OpenWeather queries and three keyless CAMS queries. Credentials are never requested by the web page or written to the snapshot.

```sh
python3 scripts/refresh.py     # optional; keyless public feeds by default
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -v
python3 scripts/build.py
python3 -m http.server --directory dist
```

The optional local browser smoke test uses Playwright and Chromium. Install `tests/browser-requirements.txt` and Chromium, then run `python3 tests/browser_smoke.py`. A preinstalled browser can be selected with `TEST_CHROMIUM`.

## Data credits

* Langley observations from Metro Vancouver, distributed by the Province of British Columbia. The [provincial station page](https://www.env.gov.bc.ca/epd/bcairquality/data/station.html?id=E209178) identifies its [Open Government Licence – British Columbia](https://www2.gov.bc.ca/gov/content/data/open-data/open-government-licence-bc). Lake Major observations contain information licensed under the [Open Government Licence – Nova Scotia](https://novascotia.ca/opendata/licence.asp).
* Contains modified Copernicus Atmosphere Monitoring Service information delivered by [Open-Meteo](https://open-meteo.com/en/docs/air-quality-api), provided under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Air Pair converts labels to UTC, aligns source series and calculates differences. The Canadian series uses [ECMWF’s CAMS Global forecast](https://www.ecmwf.int/en/forecasts/datasets/cams-global-atmospheric-composition-forecasts). Open-Meteo also credits the [CAMS ENSEMBLE providers of its European regional service](https://confluence.ecmwf.int/spaces/CKB/pages/202173092/CAMS+Regional+European+air+quality+analysis+and+forecast+data+documentation). The keyless Open-Meteo service is for [non-commercial use](https://open-meteo.com/en/terms).
* Optional OpenWeather results are powered by [OpenWeather](https://openweathermap.org/). The OpenWeather-derived database of hourly differences and period statistics in `windows[].openweather` is available under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Its published contents are available under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). See the [self-service licensing guide](https://openweathermap.org/guide) and [pricing and licence table](https://openweathermap.org/full-price). The OpenWeather logo is used for attribution under its [brand guidelines](https://openweather.co.uk/brand_guidelines). Original third-party source data retain their respective licences.


## Added browser workflow

Compare the saved Langley and Lake Major monitor readings with model estimates, then use the broader comparison to explore six pollutants at any two coordinates. Worldwide values are CAMS Global model forecasts. Alternatively, compare two hourly observation CSV files locally, retaining missing hours and calculating differences only where both values exist.

Local CSV format: `time,value`, followed by hourly ISO timestamps with an explicit UTC offset and concentrations in µg/m³. Use the same pollutant and units in both files; blanks remain missing. Maximum 10,000 readings and 2 MB per file. Global requests are opt-in, cached in the current tab and attributed to CAMS / Open-Meteo.

<!-- schedule-reliability -->
## Schedule reliability

Public GitHub repositories can have scheduled workflows disabled after 60 days of inactivity. A separate weekly [schedule guard](.github/workflows/schedule-guard.yml) calls GitHub's enable-workflow API for an explicit list of refresh workflows and itself. It can restore workflows disabled for inactivity, preserves manually disabled workflows, and runs independently of collection failures.

This is an interim mitigation, not a scheduling guarantee: GitHub does not document active-workflow renewal as a permanent exemption, and scheduled runs can be delayed or dropped. A scheduler on our own Linux server is the planned independent trigger. The guard does not collect data, create dummy commits, or change source/check timestamps; successful collection and published data freshness still need monitoring.
<!-- /schedule-reliability -->
