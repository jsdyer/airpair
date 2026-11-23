const valid=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
export function observationCSV(text){
 const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
 if(lines.length>10001)throw new Error('Use at most 10,000 hourly records per file.');
 if(lines.shift()?.trim().toLowerCase()!=='time,value')throw new Error('Use CSV columns time,value with ISO timestamps and concentrations in µg/m³.');
 const rows=[],seen=new Set();
 for(const line of lines){if(!line.trim())continue;const [time,value,...rest]=line.split(',');
   const ms=Date.parse(time);
   if(rest.length||!/(Z|[+-]\d{2}:\d{2})$/.test(time)||!Number.isFinite(ms)||ms%3600000!==0)throw new Error('Use one hourly timestamp with an explicit UTC offset per row.');
   if(seen.has(ms))throw new Error('Duplicate hour: '+time);seen.add(ms);
   const concentration=value?.trim()?Number(value):null;
   if(concentration!==null&&!valid(concentration))throw new Error('Concentrations must be nonnegative numbers or blank for missing values.');
   rows.push({time:ms,value:concentration});
 }
 if(!rows.length)throw new Error('This CSV contains no readings.');
 return rows.sort((a,b)=>a.time-b.time);
}
export function pairSeries(a,b){
 const left=new Map(a.map(r=>[r.time,r.value])),right=new Map(b.map(r=>[r.time,r.value]));
 const rows=[...new Set([...left.keys(),...right.keys()])].sort((a,b)=>a-b).map(time=>({time,a:valid(left.get(time))?left.get(time):null,b:valid(right.get(time))?right.get(time):null}));
 const paired=rows.filter(r=>r.a!==null&&r.b!==null);
 const mean=key=>paired.length?paired.reduce((n,r)=>n+r[key],0)/paired.length:null;
 return {rows,paired:paired.length,a:mean('a'),b:mean('b'),difference:paired.length?mean('a')-mean('b'):null};
}
export function modelSeries(data,pollutant){
 if(data.hourly_units?.[pollutant]!=='μg/m³'&&data.hourly_units?.[pollutant]!=='µg/m³')throw new Error('The provider returned unexpected concentration units.');
 if(!Array.isArray(data.hourly?.time)||data.hourly.time.length!==data.hourly[pollutant]?.length)throw new Error('Incomplete model series.');
 return data.hourly.time.map((t,i)=>({time:t*1000,value:valid(data.hourly[pollutant][i])?data.hourly[pollutant][i]:null}));
}
