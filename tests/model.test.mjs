import test from "node:test";
import assert from "node:assert/strict";
import { rowsFor, summary, stamp, dailyComparisons, thresholdAgreement } from "../web/model.mjs";
const w = {
  startUtc: "2025-12-25T00:00Z",
  monitor: { T640: [0, 4, 2, null] },
  cams: [1, null, 3, 9],
};
test("aligns hourly values and retains zeros and gaps", () => {
  const rows = rowsFor(w, "T640");
  assert.deepEqual(
    rows.map((r) => r.difference),
    [1, null, 1, null],
  );
  assert.equal(stamp(rows[0].epoch, -4), "2025-12-24 20:00");
  assert.equal(stamp(rows[1].epoch), "2025-12-25 01:00");
});
test("summarizes only matched values and identifies both peaks", () => {
  const s = summary(rowsFor(w, "T640"));
  assert.equal(s.count, 2);
  assert.equal(s.bias, 1);
  assert.equal(s.mae, 1);
  assert.equal(s.modelPeak.model, 3);
  assert.equal(s.monitorPeak.monitor, 2);
  assert.deepEqual(summary([]), { count: 0 });
});
test("reads only the selected provider, reconstructing matched OpenWeather values", () => {
  const data = {
    ...w,
    openweather: {
      byInstrument: { T640: { hourlyDifferences: [0, -2, null, 7] } },
    },
  };
  const rows = rowsFor(data, "T640", "openweather");
  assert.deepEqual(
    rows.map((x) => x.model),
    [0, 2, null, null],
  );
  assert.deepEqual(
    rowsFor(
      { ...w, openweather: { status: "inactive" } },
      "T640",
      "openweather",
    ).map((x) => x.model),
    [null, null, null, null],
  );
});

test("counts inclusive level crossings only for paired hours and groups by UTC day", () => {
  const w = {
    startUtc: "2025-12-25T23:00Z",
    monitor: { T640: [10, 11, 0, null, 1] },
    cams: [10, 9, 15, 25, 2],
  };
  const rows = rowsFor(w, "T640");
  assert.deepEqual(thresholdAgreement(rows, 10), { both: 1, monitorOnly: 1, modelOnly: 1, neither: 1 });
  assert.deepEqual(dailyComparisons(rows).map(({day, count}) => [day, count]), [["2025-12-25", 1], ["2025-12-26", 3]]);
});
