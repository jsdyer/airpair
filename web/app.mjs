import { rowsFor, summary, stamp } from "./model.mjs";
const el = (id) => document.getElementById(id);
const site = el("station"),
  period = el("period"),
  sensor = el("instrument"),
  provider = el("provider");
let snapshot,
  chartRows = [];
const fixed = (v) => (Number.isFinite(v) ? v.toFixed(1) : "—");
function options(select, items) {
  select.replaceChildren(
    ...items.map(([key, label]) => new Option(label, key)),
  );
}
function tableRow(values) {
  const tr = document.createElement("tr");
  for (const value of values) {
    const td = document.createElement("td");
    td.textContent = value;
    tr.append(td);
  }
  return tr;
}
function metric(name, value) {
  const item = document.createElement("div"),
    label = document.createElement("span"),
    number = document.createElement("strong");
  label.textContent = name;
  number.textContent = value;
  item.append(label, number);
  return item;
}
function link(url, title) {
  const a = document.createElement("a");
  a.href = url;
  a.textContent = title;
  return a;
}
function draw() {
  if (!chartRows.length || el("traces").hidden) return;
  const canvas = el("chart"),
    ctx = canvas.getContext("2d");
  const width = canvas.clientWidth,
    height = canvas.clientHeight,
    dpr = window.devicePixelRatio || 1;
  if (!width) return;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.scale(dpr, dpr);
  const values = chartRows
    .flatMap((r) => [r.model, r.monitor])
    .filter(Number.isFinite);
  if (!values.length) return;
  const left = 42,
    right = 10,
    top = 21,
    bottom = 28;
  const max = Math.max(5, Math.ceil(Math.max(...values) / 5) * 5),
    min = Math.min(0, Math.floor(Math.min(...values) / 5) * 5);
  const x = (i) => left + (i / (chartRows.length - 1)) * (width - left - right);
  const y = (n) => top + ((max - n) / (max - min)) * (height - top - bottom);
  ctx.font = "12px system-ui";
  ctx.fillStyle = "#405450";
  for (let i = 0; i < 5; i++) {
    const value = min + (i * (max - min)) / 4,
      h = y(value);
    ctx.strokeStyle = "#d4dfda";
    ctx.beginPath();
    ctx.moveTo(left, h);
    ctx.lineTo(width - right, h);
    ctx.stroke();
    ctx.fillText(Number(value.toFixed(1)), 2, h + 4);
  }
  for (let i = 0; i < chartRows.length; i += width < 500 ? 48 : 24) {
    ctx.fillText(stamp(chartRows[i].epoch).slice(5, 10), x(i) - 10, height - 6);
  }
  for (const [key, color, dash] of [
    ["monitor", "#08756b", []],
    ["model", "#ab5126", [6, 3]],
  ]) {
    ctx.beginPath();
    ctx.setLineDash(dash);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.25;
    let open = false;
    chartRows.forEach((r, i) => {
      if (!Number.isFinite(r[key])) {
        open = false;
        return;
      }
      if (open) ctx.lineTo(x(i), y(r[key]));
      else ctx.moveTo(x(i), y(r[key]));
      open = true;
    });
    ctx.stroke();
  }
  ctx.setLineDash([]);
}
function render() {
  const station = snapshot.stations[site.value],
    w = station.windows[Number(period.value)];
  const cams = provider.value === "cams";
  const name = cams ? "CAMS Global" : "OpenWeather";
  const hasData = cams || Boolean(w.openweather.byInstrument?.[sensor.value]);
  const rows = rowsFor(w, sensor.value, provider.value);
  const stats = hasData ? summary(rows) : null;
  const observed = rows.filter((r) => Number.isFinite(r.monitor)).length;
  el("week").textContent =
    w.startUtc.slice(0, 10) +
    " — " +
    stamp(Date.parse(w.endUtcExclusive) - 3600000).slice(0, 10) +
    " UTC";
  el("station-note").textContent =
    station.name +
    " · " +
    station.stationId +
    " · " +
    station.release +
    ". Station labels use " +
    station.zone +
    " (UTC" +
    station.offset +
    ").";
  const cards = [metric("Measured hours", observed + " / " + rows.length)];
  if (stats)
    cards.push(
      metric("Paired hours", stats.count + " / " + rows.length),
      metric("Mean model − monitor", fixed(stats.bias) + " µg/m³"),
      metric("Mean absolute error", fixed(stats.mae) + " µg/m³"),
    );
  el("metrics").replaceChildren(...cards);
  el("traces").hidden = !hasData;
  el("inactive").hidden = cams || Boolean(stats);
  el("daily").hidden = cams || !stats;
  el("results").hidden = false;
  if (hasData) {
    el("model-legend").textContent = name;
    el("model-heading").textContent = name;
    chartRows = rows;
    draw();
    el("local-heading").textContent = "Station hour (" + station.zone + ")";
    el("reading-rows").replaceChildren(
      ...rows.map((r) =>
        tableRow([
          stamp(r.epoch),
          stamp(r.epoch, station.offset),
          fixed(r.monitor),
          fixed(r.model),
          fixed(r.difference),
        ]),
      ),
    );
    el("peaks").textContent = stats.count
      ? "Highest paired monitor reading: " +
        fixed(stats.monitorPeak.monitor) +
        " µg/m³ at " +
        stamp(stats.monitorPeak.epoch) +
        " UTC. " +
        name +
        " peak: " +
        fixed(stats.modelPeak.model) +
        " µg/m³ at " +
        stamp(stats.modelPeak.epoch) +
        " UTC."
      : "The series have no overlapping numeric hours.";
  }
  if (!cams && stats) {
    el("daily-rows").replaceChildren(
      ...w.openweather.byInstrument[sensor.value].days.map((d) =>
        tableRow([
          d.date,
          d.count,
          fixed(d.bias),
          fixed(d.mae),
          d.monitorPeakUtc?.slice(11, 16) ?? "—",
          d.modelPeakUtc?.slice(11, 16) ?? "—",
        ]),
      ),
    );
  }
  el("status").textContent = cams
    ? "Showing archived CAMS Global estimates via Open-Meteo."
    : stats
      ? "Showing derived OpenWeather historical comparisons."
      : "OpenWeather comparison unavailable.";
  el("retrieved").textContent =
    "Snapshot retrieved " +
    stamp(Date.parse(snapshot.asOf)) +
    " UTC. Latest published station timestamp in this download: " +
    stamp(Date.parse(station.lastSourceHour)) +
    " UTC.";
  const sourceElements = [
    link(station.source, "Download provincial station data"),
    " · Station coordinates " + station.lat + ", " + station.lon + ". ",
  ];
  if (cams) {
    sourceElements.push(
      link(w.camsRequest, "Open-Meteo model request"),
      " · CAMS grid point " +
        w.camsGrid.map((v) => v.toFixed(2)).join(", ") +
        ".",
    );
  } else {
    sourceElements.push(
      link(
        "https://openweathermap.org/api/air-pollution",
        "OpenWeather historical Air Pollution API",
      ),
    );
  }
  el("sources").replaceChildren(...sourceElements);
}
function setInstrument() {
  const w = snapshot.stations[site.value].windows[Number(period.value)];
  options(
    sensor,
    Object.keys(w.monitor).map((k) => [k, k]),
  );
  render();
}
function setStation() {
  const windows = snapshot.stations[site.value].windows;
  options(
    period,
    windows.map((w, i) => [i, w.label]),
  );
  setInstrument();
}
try {
  const res = await fetch("./data/pairs.json");
  if (!res.ok) throw Error();
  snapshot = await res.json();
  setStation();
  site.addEventListener("change", setStation);
  period.addEventListener("change", setInstrument);
  provider.addEventListener("change", render);
  sensor.addEventListener("change", render);
  new ResizeObserver(draw).observe(el("chart"));
} catch {
  el("status").textContent =
    "Could not load the published comparison. Reload or download the snapshot below.";
}
