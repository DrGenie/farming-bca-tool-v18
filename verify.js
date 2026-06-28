'use strict';
/* =====================================================================
   SOIL CRC BCA Tool — automated verification (v13.1)
   Run: node verify.js
   1. Calculation parity: the exact app.js math reproduces the published
      v13 figures for the official sample workbook + default settings.
   2. Dataset replacement: processing a second, deliberately different
      workbook yields entirely different outputs with NO sample value or
      treatment surviving.
   3. State-contract check: the real app.js source wires the reset-first,
      version-bump, no-auto-run and currency-gating fixes.
   The math below is copied verbatim from app.js and is NOT modified.
   ===================================================================== */
const fs = require('fs');

const HEADER_ALIASES = {
  'Crop_yield_ton_per_ha': 'Crop_yield_t_ha',
  'Seed cost_per_ha': 'Seed cost_ha',
  'Marketing_total cost_per_ha': 'Marketing_total cost_ha'
};
const COST_HEADERS = [
  'Seed cost_ha','Cost of amendment_per_ha','Labour__total_per_ha','Machinery_total_per_ha','Fertiliser_total cost_per_ha',
  'Pesticides_total cost_per_ha','Fuel_total cost_per_ha','Marketing_total cost_ha','Repairs_and_maitenance_per_ha',
  'Support services_per_ha','Electricity_per_ha','Water_per_ha','Insurance services_per_ha','Overheads_per_ha',
  'Interest paid on loans_per_ha','Structure maintenance_per_ha','Other costs_per_ha'
];
const REQUIRED_HEADERS = ['Treatment ID','Replicate ID','Amendment Name','Practice Change Label','Crop_yield_t_ha'];
const normalizeHeader = (h) => HEADER_ALIASES[String(h||'').trim()] || String(h||'').trim();
function n(v){ if(v===null||v===undefined||v===''||v==='None') return null; const x=Number(String(v).replace(/,/g,'').trim()); return Number.isFinite(x)?x:null; }
function findHeaderRow(rows){ for(let i=0;i<Math.min(rows.length,25);i++){ const r=rows[i].map(normalizeHeader); if(r.includes('Treatment ID')&&r.includes('Amendment Name')&&r.includes('Crop_yield_t_ha')) return i;} return -1; }
function standardiseRows(rows){
  const hi=findHeaderRow(rows); if(hi<0) throw new Error('no header');
  const headers=rows[hi].map(normalizeHeader); const idx=Object.fromEntries(headers.map((h,i)=>[h,i]));
  const missing=REQUIRED_HEADERS.filter(h=>!(h in idx)); if(missing.length) throw new Error('missing '+missing.join(','));
  const cleaned=[];
  for(let r=hi+1;r<rows.length;r++){ const row=rows[r]||[];
    const treatmentName=String(row[idx['Amendment Name']]||'').trim();
    const treatmentId=String(row[idx['Treatment ID']]||'').trim();
    const replicateId=String(row[idx['Replicate ID']]||'').trim();
    if(!treatmentName&&!treatmentId&&!replicateId) continue;
    const avail=COST_HEADERS.filter(h=>idx[h]!==undefined);
    const costValues=avail.map(h=>n(row[idx[h]])).filter(v=>v!==null);
    const totalDirectCosts=costValues.length?costValues.reduce((s,v)=>s+v,0):null;
    const isControl=/^t0+$/i.test(treatmentId)||/^control$/i.test(treatmentName);
    cleaned.push({treatmentId,replicateId,treatmentName,isControl,cropYield:n(row[idx['Crop_yield_t_ha']]),totalDirectCosts});
  } return cleaned;
}
function group(rows){
  const map=new Map();
  rows.forEach(r=>{ const key=r.treatmentName||r.treatmentId; if(!map.has(key)) map.set(key,{treatmentName:key,treatmentId:r.treatmentId,isControl:r.isControl,rows:[]}); const g=map.get(key); g.rows.push(r); g.isControl=g.isControl||r.isControl; });
  return [...map.values()].map(g=>{ const y=g.rows.map(r=>r.cropYield).filter(v=>v!==null); const c=g.rows.map(r=>r.totalDirectCosts).filter(v=>v!==null);
    return {treatmentName:g.treatmentName,treatmentId:g.treatmentId,isControl:g.isControl,avgYield:y.length?y.reduce((a,b)=>a+b,0)/y.length:null,avgCost:c.length?c.reduce((a,b)=>a+b,0)/c.length:null,replicateCount:g.rows.length}; });
}
function pvFactor(rates){ let total=0,disc=1; for(const r of rates){ disc*=1+r; total+=1/disc; } return total; }
function computeMetrics(avgYield,avgCost,sched,price){ if(avgYield===null||avgCost===null) return null; const f=pvFactor(sched.rates); const pvB=avgYield*price*f, pvC=avgCost*f, npv=pvB-pvC; return {pvBenefits:pvB,pvCosts:pvC,npv,bcr:pvC===0?null:pvB/pvC,gpm:pvB===0?null:((pvB-pvC)/pvB)*100,roi:pvC===0?null:((pvB-pvC)/pvC)*100}; }
function schedule(years,mode,initial,later,switchYear){ const rates=[]; for(let y=1;y<=years;y++){ if(mode==='constant') rates.push(initial); else rates.push(y<=switchYear?initial:later);} return {years,mode,initial,later,switchYear,rates}; }
function analyse(json, sched, price){
  const cleaned=standardiseRows(json.rows); const grouped=group(cleaned);
  const calc=grouped.map(g=>({...g,metrics:computeMetrics(g.avgYield,g.avgCost,sched,price)}));
  const control=calc.find(g=>g.isControl);
  const ranking=calc.filter(g=>g.metrics).map(g=>({...g,delta:g.metrics.npv-(control?control.metrics.npv:0)})).sort((a,b)=>b.metrics.npv-a.metrics.npv);
  return {cleaned,grouped,ranking,control};
}
const approx=(a,b,tol)=>Math.abs(a-b)<=tol;
let pass=true; const log=(ok,name)=>{ console.log((ok?'[PASS] ':'[FAIL] ')+name); if(!ok) pass=false; };

const sched=schedule(10,'constant',0.05,0.03,5), price=500;

// -------- TEST 1: parity --------
console.log('\n=== TEST 1: Calculation parity (sample workbook, default settings) ===');
const sample=analyse(JSON.parse(fs.readFileSync('_sample.json','utf8')), sched, price);
const top=sample.ranking[0];
console.log(`Top: ${top.treatmentName} (${top.treatmentId}) NPV $${top.metrics.npv.toFixed(2)} BCR ${top.metrics.bcr.toFixed(3)}; treatments ${sample.ranking.length}`);
log(top.treatmentName==='Manure','Top treatment is Manure');
log(approx(top.metrics.npv,6639.01,0.02),'Top NPV = 6639.01');
log(approx(top.metrics.bcr,2.056,0.001),'Top BCR = 2.056');
log(approx(sample.control.metrics.npv,4094.41,0.02),'Control (T00) NPV = 4094.41');
log(approx(sample.control.metrics.bcr,1.627,0.001),'Control BCR = 1.627');
log(sample.ranking.length===12,'12 treatments ranked');

// -------- TEST 2: dataset replacement --------
console.log('\n=== TEST 2: Dataset replacement (sample -> workbook 2) ===');
const wb2=analyse(JSON.parse(fs.readFileSync('_test2.json','utf8')), sched, price);
const sampleNames=new Set(sample.grouped.map(g=>g.treatmentName));
const wb2Names=new Set(wb2.grouped.map(g=>g.treatmentName));
const overlap=[...wb2Names].filter(x=>sampleNames.has(x));
console.log(`Workbook 2 treatments: ${[...wb2Names].join(', ')} | control: ${wb2.control.treatmentName} (${wb2.control.treatmentId})`);
log(wb2.ranking.length===3,'Workbook 2 has 3 treatments (sample had 12)');
log(overlap.length===0,'No sample treatment name survives into workbook 2');
log(wb2.control.treatmentName==='Baseline practice','Control replaced (now "Baseline practice", detected via T00 ID)');
log(!approx(wb2.ranking[0].metrics.npv, top.metrics.npv, 0.01),'Top NPV differs from the sample top NPV');
log(![...wb2.ranking].some(r=>approx(r.metrics.npv, sample.control.metrics.npv,0.01)),'No workbook-2 NPV equals a sample NPV');
log(wb2.control.metrics.npv!==null && wb2.ranking.every(r=>r.metrics),'All workbook-2 treatments computed cleanly');

// -------- TEST 3: state-contract (real app.js source) --------
console.log('\n=== TEST 3: State-contract checks against app.js source ===');
const src=fs.readFileSync('app.js','utf8');
const hw=src.slice(src.indexOf('async function handleWorkbook'), src.indexOf('async function loadExample'));
log(/function resetAnalysisForNewDataset\(\)/.test(src),'resetAnalysisForNewDataset() is defined');
log(/resetAnalysisForNewDataset\(\);\s*\n\s*\/\/ STEP: every load/.test(hw) || (hw.indexOf('resetAnalysisForNewDataset()') < hw.indexOf('readWorkbook')),'reset runs BEFORE parsing in handleWorkbook');
log(/state\.datasetVersion \+= 1/.test(hw),'datasetVersion is incremented on every load');
log(!/runAnalysis\(/.test(hw),'handleWorkbook no longer auto-runs the analysis');
log(/function resultsAreCurrent\(\)/.test(src),'resultsAreCurrent() guard is defined');
log(/hasResults: resultsAreCurrent\(\) && ranking\.length > 0/.test(src),'getBcaToolState gates hasResults on currency');
log(/const ranking = \(resultsAreCurrent\(\)/.test(src),'getBcaToolState withholds ranking when stale');
log(/if \(!resultsAreCurrent\(\)\)/.test(src),'exports are stale-guarded');
log(/analysisValid: resultsAreCurrent\(\)/.test(src),'tool state exposes analysisValid');

const asst=fs.readFileSync('assistant.js','utf8');
log(/NEEDS_NEWDATA_MSG/.test(asst) && /NEEDS_SETTINGS_MSG/.test(asst),'assistant has distinct new-data and settings re-run messages');

console.log('\n'+(pass?'ALL CHECKS PASSED':'SOME CHECKS FAILED'));
process.exit(pass?0:1);
