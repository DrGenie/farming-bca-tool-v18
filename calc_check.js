'use strict';
// Extracts the live calc pipeline from app.js and computes rankings for datasets.
// Used to prove calculation parity before/after edits.
const fs = require('fs');
const src = fs.readFileSync('app.js', 'utf8');
function extractFn(name){
  const m = src.match(new RegExp('function\\s+'+name.replace(/[$]/g,'\\$')+'\\s*\\([^)]*\\)\\s*\\{'));
  if(!m) throw new Error('fn not found: '+name);
  let i = m.index + m[0].length - 1, depth=0;
  for(let j=i;j<src.length;j++){ if(src[j]==='{')depth++; else if(src[j]==='}'){depth--; if(depth===0) return src.slice(m.index, j+1);} }
  throw new Error('unbalanced '+name);
}
function extractConst(name){
  const re = new RegExp('const\\s+'+name+'\\s*=\\s*');
  const m = src.match(re); if(!m) throw new Error('const not found '+name);
  let i = m.index + m[0].length;
  // array or object literal
  const open = src[i]; const close = open==='[' ? ']' : '}';
  let depth=0;
  for(let j=i;j<src.length;j++){ if(src[j]===open)depth++; else if(src[j]===close){depth--; if(depth===0){ return 'const '+name+' = '+src.slice(i,j+1)+';'; }}}
  throw new Error('unbalanced const '+name);
}
const code = [
  extractConst('HEADER_ALIASES'),
  extractConst('COST_HEADERS'),
  extractConst('REQUIRED_HEADERS'),
  extractConst('NUMERIC_CHECK_HEADERS'),
  extractConst('CONTROL_NAME_TERMS'),
  extractConst('CONTROL_LABEL_TERMS'),
  extractFn('normalizeHeader'),
  extractFn('boolish'),
  extractFn('isControlRow'),
  extractFn('n'),
  extractFn('findHeaderRow'),
  extractFn('standardiseRows'),
  extractFn('group'),
  extractFn('pvFactor'),
  extractFn('computeMetrics'),
  'module.exports={normalizeHeader,n,findHeaderRow,standardiseRows,group,pvFactor,computeMetrics};'
].join('\n');
const m = {exports:{}};
new Function('module','exports', code)(m, m.exports);
const API = m.exports;

function buildSched(years, mode, initialPct, laterPct, switchYear){
  const rates=[]; for(let y=1;y<=years;y++){ if(mode==='constant') rates.push(initialPct/100); else rates.push(y<=switchYear?initialPct/100:laterPct/100);} 
  return {years,mode,initial:initialPct/100,later:laterPct/100,switchYear,rates};
}
function rank(rows, sched, price){
  const cleaned = API.standardiseRows(rows);
  const grouped = API.group(cleaned);
  const calc = grouped.map(g=>({...g, metrics:API.computeMetrics(g.avgYield,g.avgCost,sched,price)}));
  const control = calc.find(g=>g.isControl);
  const ranking = calc.filter(g=>g.metrics).map(g=>({...g, deltaVsControl: control&&control.metrics? g.metrics.npv-control.metrics.npv : null}))
    .sort((a,b)=>b.metrics.npv-a.metrics.npv).map((g,i)=>({...g,rank:i+1}));
  return {controlName: control?control.treatmentName:null, ranking: ranking.map(r=>({
    rank:r.rank, name:r.treatmentName, id:r.treatmentId, isControl:r.isControl,
    avgYield:r.avgYield, avgCost:r.avgCost,
    pvB:r.metrics.pvBenefits, pvC:r.metrics.pvCosts, npv:r.metrics.npv, bcr:r.metrics.bcr, gpm:r.metrics.gpm, roi:r.metrics.roi, delta:r.deltaVsControl
  }))};
}
const sample = JSON.parse(fs.readFileSync('_sample.json','utf8'));
const test2  = JSON.parse(fs.readFileSync('_test2.json','utf8'));
const sched = buildSched(10,'constant',5,3,5);
const out = {
  trial_default: rank(sample.rows, sched, 500),
  test2_default: rank(test2.rows, sched, 500),
  trial_increasing: rank(sample.rows, buildSched(10,'increasing',5,3,5), 600),
  test2_p400_y8: rank(test2.rows, buildSched(8,'declining',7,4,3), 400),
};
console.log(JSON.stringify(out, null, 1));
