export function rowsFor(window, instrument) {
  const start = Date.parse(window.startUtc);
  return window.monitor[instrument].map((monitor, i) => {
    const model = window.cams[i];
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
