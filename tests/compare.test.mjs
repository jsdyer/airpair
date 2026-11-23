import test from 'node:test';import assert from 'node:assert/strict';import {observationCSV,pairSeries,modelSeries} from '../web/compare.mjs';
test('observations align UTC offsets, preserve zeros and exclude missing pairs',()=>{
 const a=observationCSV('time,value\n2026-11-01T01:00:00-07:00,0\n2026-11-01T02:00:00-07:00,\n');
 const b=observationCSV('time,value\n2026-11-01T08:00:00Z,10\n2026-11-01T09:00:00Z,5');
 const paired=pairSeries(a,b);assert.equal(paired.paired,1);assert.equal(paired.a,0);assert.equal(paired.difference,-10);assert.equal(paired.rows[1].a,null);
});
test('ambiguous time, duplicates, different units and incomplete forecasts are rejected',()=>{
 assert.throws(()=>observationCSV('time,value\n2026-11-01T08:00:00,10'));
 assert.throws(()=>observationCSV('time,value\n2026-11-01T08:00:00Z,10\n2026-11-01T08:00:00Z,20'));
 assert.throws(()=>modelSeries({hourly_units:{pm10:'ppm'},hourly:{time:[0],pm10:[1]}},'pm10'));
 const series=modelSeries({hourly_units:{pm10:'μg/m³'},hourly:{time:[0,3600],pm10:[0,null]}},'pm10');assert.equal(series[0].value,0);assert.equal(series[1].value,null);
});
