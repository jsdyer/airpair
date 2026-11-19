export function rowsFor(window, instrument, provider = "cams") {
  const start = Date.parse(window.startUtc);
  return window.monitor[instrument].map((monitor, i) => {
    let model;
    if (provider === "cams") {
      model = window.cams[i];
    } else {
      const difference =
        window.openweather.byInstrument?.[instrument]?.hourlyDifferences?.[i];
      model =
        Number.isFinite(difference) && Number.isFinite(monitor)
          ? Number((monitor + difference).toFixed(6))
          : null;
    }
    return {
      epoch: start + i * 3600000,
      monitor,
      model,
      difference:
        Number.isFinite(model) && Number.isFinite(monitor)
          ? model - monitor
          : null,
    };
  });
}

export function summary(rows) {
  const paired = rows.filter((r) => Number.isFinite(r.difference));
  const count = paired.length;
  if (!count) return { count };
  const peak = (key) =>
    paired.reduce((best, r) => (r[key] > best[key] ? r : best));
  return {
    count,
    bias: paired.reduce((s, r) => s + r.difference, 0) / count,
    mae: paired.reduce((s, r) => s + Math.abs(r.difference), 0) / count,
    monitorPeak: peak("monitor"),
    modelPeak: peak("model"),
  };
}

export function stamp(epoch, offset = 0) {
  return new Date(epoch + offset * 3600000)
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");
}

export function thresholdAgreement(rows, cutoff) {
  const counts = { both: 0, monitorOnly: 0, modelOnly: 0, neither: 0 };
  for (const row of rows) {
    if (!Number.isFinite(row.difference)) continue;
    const observed = row.monitor >= cutoff;
    const estimated = row.model >= cutoff;
    if (observed && estimated) counts.both++;
    else if (observed) counts.monitorOnly++;
    else if (estimated) counts.modelOnly++;
    else counts.neither++;
  }
  return counts;
}

export function dailyComparisons(rows) {
  const byDay = new Map();
  for (const row of rows) {
    const day = stamp(row.epoch).slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(row);
  }
  return [...byDay].map(([day, values]) => ({ day, ...summary(values) }));
}
