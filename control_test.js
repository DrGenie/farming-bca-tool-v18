'use strict';
const fs=require('fs');const src=fs.readFileSync('app.js','utf8');
const {extractFn,extractConst}=require('./_extract');
const xf=(n)=>extractFn(src,n),xc=(n)=>extractConst(src,n);
const code=[
  xc('COST_HEADERS'),xc('REQUIRED_HEADERS'),xc('NUMERIC_CHECK_HEADERS'),xc('HEADER_ALIASES'),
  xc('CONTROL_NAME_TERMS'),xc('CONTROL_LABEL_TERMS'),
  xf('normalizeHeader'),xf('boolish'),xf('n'),xf('isControlRow'),xf('findHeaderRow'),xf('standardiseRows'),xf('group'),
  'module.exports={standardiseRows,group};'
].join('\n\n');
const m={exports:{}};new Function('module','exports',code)(m,m.exports);
const {standardiseRows,group}=m.exports;

function detect(rows){
  const cleaned=standardiseRows(rows);
  const grouped=group(cleaned);
  const controls=grouped.filter(g=>g.isControl).map(g=>g.treatmentName);
  return {n:grouped.length, controls, names:grouped.map(g=>g.treatmentName)};
}
const H=['Treatment ID','Replicate ID','Amendment Name','Practice Change Label','Crop_yield_ton_per_ha','Seed cost_per_ha'];
const HF=[...H,'Is Control'];
const cases={
  'control-last-row-untreated-nonT0':[H,
    ['A1','R1','Compost','Amendment',3.0,50],['A1','R2','Compost','Amendment',3.2,50],
    ['Z9','R1','Untreated','Control',2.0,40],['Z9','R2','Untreated','Control',2.1,40]],
  'control-via-flag':[HF,
    ['X1','R1','Product Alpha','Treatment',4.0,60,'FALSE'],
    ['X2','R1','Standard','Standard',2.5,45,'TRUE']],
  'two-treatments-baseline-name':[H,
    ['C1','R1','Baseline','No change',2.2,40],
    ['T1','R1','Seaweed','Biostimulant',3.9,55]],
  'control-mid-position-nochange-label':[H,
    ['G1','R1','Gypsum','Soil amendment',3.3,55],
    ['K0','R1','Reference plot','No change',3.0,48],
    ['L1','R1','Lime','Soil amendment',3.5,60]],
  'no-control':[H,
    ['T1','R1','Alpha','Amendment',3.0,50],
    ['T2','R1','Beta','Amendment',3.4,52]],
  'multiple-controls':[H,
    ['T00','R1','Control','No change',3.0,50],
    ['B1','R1','Baseline','No change',2.9,48],
    ['T1','R1','Gypsum','Amendment',3.4,55]]
};
let fail=0;
const expect=(name,cond,msg)=>{ if(!cond){fail++;console.log('[FAIL] '+name+': '+msg);} else console.log('[PASS] '+name+': '+msg); };
let r;
r=detect(cases['control-last-row-untreated-nonT0']); expect('last-row',r.controls.length===1&&r.controls[0]==='Untreated','control = Untreated (non-T0, last rows)');
r=detect(cases['control-via-flag']); expect('flag',r.controls.length===1&&r.controls[0]==='Standard','control via Is Control flag');
r=detect(cases['two-treatments-baseline-name']); expect('two-trt',r.n===2&&r.controls[0]==='Baseline','2 treatments, control=Baseline by name');
r=detect(cases['control-mid-position-nochange-label']); expect('mid',r.controls.length===1&&r.controls[0]==='Reference plot','control mid-position via No change label');
r=detect(cases['no-control']); expect('none',r.controls.length===0,'no control detected when absent');
r=detect(cases['multiple-controls']); expect('multi',r.controls.length===2,'two controls flagged (Control + Baseline)');
console.log(`\nControl detection: ${fail} failures`);
process.exit(fail?1:0);
