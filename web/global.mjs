import {observationCSV,pairSeries,modelSeries} from './compare.mjs';
const $=id=>document.getElementById(id),node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const locations={langley:[49.104,-122.658],halifax:[44.6488,-63.5752],london:[51.5074,-0.1278],tokyo:[35.6762,139.6503],delhi:[28.6139,77.209]};
const pollutants={pm2_5:'PM2.5',pm10:'PM10',ozone:'Ozone',nitrogen_dioxide:'Nitrogen dioxide',sulphur_dioxide:'Sulphur dioxide',carbon_monoxide:'Carbon monoxide'};
let last=null,ticket=0;const cache=new Map();
for(const side of ['a','b'])$('place-'+side).addEventListener('change',()=>{const coords=locations[$('place-'+side).value];if(coords){$('lat-'+side).value=coords[0];$('lon-'+side).value=coords[1];$('name-'+side).value=$('place-'+side).selectedOptions[0].textContent;}});
const number=n=>n===null?'Missing':n.toFixed(2);
function chart(rows,names){
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 900 230');svg.setAttribute('role','img');svg.setAttribute('aria-label',names.join(' and ')+' concentrations in µg/m³. Exact values follow in the table.');
 const finite=rows.flatMap(r=>[r.a,r.b]).filter(x=>x!==null),max=Math.max(1,...finite),start=rows[0].time,span=Math.max(1,rows.at(-1).time-start);
 const add=(tag,attrs,text)=>{const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text)n.textContent=text;svg.append(n);};
 for(let i=0;i<5;i++){const y=190-i*40;add('line',{x1:70,x2:885,y1:y,y2:y,stroke:'#d8deda'});add('text',{x:4,y:y+4,'font-size':12},(max*i/4).toFixed(1));}
 for(const [key,color]of [['a','#17614b'],['b','#a3431c']]){let path=[],previous=null;
  const flush=()=>{if(path.length)add('polyline',{points:path.join(' '),fill:'none',stroke:color,'stroke-width':2});path=[];};
  for(const r of rows){if(r[key]===null||previous!==null&&r.time-previous>3600000)flush();if(r[key]!==null)path.push((70+815*(r.time-start)/span)+','+(190-160*r[key]/max));previous=r.time;}flush();
 }
 add('text',{x:70,y:218,'font-size':12},new Date(start).toISOString().slice(0,16)+' UTC');add('text',{x:885,y:218,'font-size':12,'text-anchor':'end'},new Date(rows.at(-1).time).toISOString().slice(0,16)+' UTC');return svg;
}
function render(a,b,names,pollutant,source){
 const result=pairSeries(a,b),box=$('broader-result');if(!result.rows.length)throw new Error('No hourly values were returned.');last={...result,names,pollutant,source};box.replaceChildren();
 box.append(node('h3',pollutants[pollutant]+' · '+names.join(' / ')),node('p',source),node('p',result.paired+' matched hours · matched-hour averages: '+names[0]+' '+number(result.a)+'; '+names[1]+' '+number(result.b)+' µg/m³ · mean A − B '+number(result.difference)+' µg/m³.'),node('p','Green: '+names[0]+' · Orange: '+names[1]+'. Gaps are excluded. A difference between places is not a model-error score.'),chart(result.rows,names));
 const details=node('details'),wrap=node('div');wrap.className='table-scroll';details.append(node('summary','Hourly values · first 168 hours (download includes all)'));const table=node('table'),head=node('tr');for(const title of ['UTC hour',names[0],names[1],'A − B'])head.append(node('th',title));table.append(head);
 for(const r of result.rows.slice(0,168)){const tr=node('tr');for(const value of [new Date(r.time).toISOString(),number(r.a),number(r.b),number(r.a===null||r.b===null?null:r.a-r.b)])tr.append(node('td',value));table.append(tr);}wrap.append(table);details.append(wrap);box.append(details);$('broader-download').disabled=false;
}
$('global-form').addEventListener('submit',async event=>{
 event.preventDefault();const id=++ticket;$('broader-status').textContent='Loading two locations from CAMS Global through Open-Meteo…';$('broader-download').disabled=true;
 try{const coordinates=['a','b'].map(side=>[Number($('lat-'+side).value),Number($('lon-'+side).value)]);if(coordinates.some(([lat,lon])=>!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180))throw new Error('Enter valid latitude and longitude.');
 const key=JSON.stringify(coordinates);let data=cache.get(key);
 if(!data){const url=new URL('https://air-quality-api.open-meteo.com/v1/air-quality');url.search=new URLSearchParams({latitude:coordinates.map(c=>c[0]).join(','),longitude:coordinates.map(c=>c[1]).join(','),hourly:Object.keys(pollutants).join(','),domains:'cams_global',forecast_days:'5',timezone:'GMT',timeformat:'unixtime'});const r=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(25000)});if(!r.ok)throw new Error('Air-quality provider returned HTTP '+r.status);const body=await r.json();if(!Array.isArray(body)||body.length!==2)throw new Error('Expected two location series.');data={body,retrieved:new Date().toISOString()};if(cache.size>10)cache.clear();cache.set(key,data);}
 if(id!==ticket)return;const pollutant=$('global-pollutant').value;
 render(modelSeries(data.body[0],pollutant),modelSeries(data.body[1],pollutant),['a','b'].map(s=>$('name-'+s).value.trim()||'Location '+s.toUpperCase()),pollutant,'MODEL FORECASTS · CAMS Global, roughly 45 km cells, hourly interpolation via Open-Meteo. Retrieved '+data.retrieved+'. Returned grid coordinates: '+data.body.map(b=>b.latitude+', '+b.longitude).join(' / ')+'.');
 $('broader-status').textContent='Five days of model estimates. These are not ground-monitor readings or health advice.';
 }catch(error){if(id===ticket)$('broader-status').textContent=error.message;}
});
$('observation-form').addEventListener('submit',async event=>{
 event.preventDefault();const id=++ticket;$('broader-download').disabled=true;
 try{const files=['a','b'].map(s=>$('observation-'+s).files[0]);if(files.some(f=>!f))throw new Error('Choose two hourly CSV files.');if(files.some(f=>f.size>2000000))throw new Error('Each file must be under 2 MB.');const texts=await Promise.all(files.map(f=>f.text()));if(id!==ticket)return;
 render(...texts.map(observationCSV),files.map(f=>f.name),$('local-pollutant').value,'LOCAL OBSERVATION FILES · Values and provenance are supplied by you. Both files must use the same pollutant and µg/m³; this tool does not convert or validate instrument units.');$('broader-status').textContent='Compared locally. Neither file was uploaded.';
 }catch(error){if(id===ticket)$('broader-status').textContent=error.message;}
});
$('broader-download').addEventListener('click',()=>{if(!last)return;const blob=new Blob([JSON.stringify(last,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download='airpair-comparison.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);});
