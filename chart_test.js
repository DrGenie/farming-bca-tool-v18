'use strict';
const fs=require('fs');
const src=fs.readFileSync('app.js','utf8');
const {extractFn,extractConst}=require('./_extract');
const xf=(n)=>extractFn(src,n), xc=(n)=>extractConst(src,n);

const elements={}; ['chartBcr','chartNpv','chartDelta','chartGpm','chartRoi'].forEach(baseId=>{ ['',''].forEach(()=>{}); }); ['chartBcr','chartNpv','chartDelta','chartGpm','chartRoi','cap_chartBcr','cap_chartNpv','cap_chartDelta','cap_chartGpm','cap_chartRoi'].forEach(id=>{
  elements[id]={innerHTML:'',_t:'',set textContent(v){this._t=v;},get textContent(){return this._t;}};
});
const documentShim={getElementById:(id)=>elements[id]||null, createElement:()=>({getContext:()=>({}),toDataURL:()=>''})};

const code=[
  xf('escapeHtml'),xf('n'),xf('fmtMoney'),xf('fmtNum'),xf('fmtPct'),
  xc('CHART_FONT'),xc('CHART_COLOR'),xc('FIGURES'),
  'const FIGURE_BY_ID=Object.fromEntries(FIGURES.map(f=>[f.id,f]));','const FIGURE_IDS=FIGURES.map(f=>f.id);',
  xf('chartTitle'),xf('chartCaption'),xf('chartSeriesForId'),xf('estTextWidth'),xf('wrapName'),xf('renderBarChart'),
  'module.exports={renderBarChart,chartSeriesForId,FIGURE_IDS,state};'
].join('\n\n');
const wrapped='const state={ranking:[]};\nconst $=(id)=>document.getElementById(id);\n'+code;
const m={exports:{}};
new Function('module','exports','document','window',wrapped)(m,m.exports,documentShim,{});
const API=m.exports;

const mk=(name,npv,bcr,gpm,roi,delta)=>({treatmentName:name,treatmentId:'',isControl:false,metrics:{npv,bcr,gpm,roi,pvBenefits:0,pvCosts:0},deltaVsControl:delta});
function parse(svg){
  const texts=[...svg.matchAll(/<text x="([-\d.]+)" y="([-\d.]+)" text-anchor="(\w+)"[^>]*font-size="(\d+)"[^>]*>([^<]*)<\/text>/g)].map(z=>({x:+z[1],y:+z[2],anchor:z[3],fs:+z[4],txt:z[5]}));
  const wm=svg.match(/width="(\d+)" height="(\d+)" viewBox/);
  return {texts,W:+wm[1],H:+wm[2]};
}
const estW=(t,fs)=>t.length*fs*0.6;
function bbox(t){const w=estW(t.txt,t.fs);let x0,x1;if(t.anchor==='end'){x1=t.x;x0=t.x-w;}else if(t.anchor==='middle'){x0=t.x-w/2;x1=t.x+w/2;}else{x0=t.x;x1=t.x+w;}return{x0,x1,y0:t.y-t.fs/2-1,y1:t.y+t.fs/2+1};}
const ov=(a,b)=>!(a.x1<=b.x0||b.x1<=a.x0||a.y1<=b.y0||b.y1<=a.y0);

const datasets={
  'all-positive':[mk('Manure',6639,2.05,51,105,2544),mk('Gypsum',5000,1.8,44,80,900),mk('Lime',4200,1.6,37,60,100)],
  'mixed-neg':[mk('Biochar high rate amendment',3000,1.4,28,40,500),mk('Control baseline',0,1.0,0,0,0),mk('Poor treatment',-2500,0.6,-66,-40,-5500),mk('Worst very long treatment name here',-8000,0.3,-233,-70,-12000)],
  'near-zero':[mk('A',5,1.001,0.1,0.1,2),mk('B',-3,0.999,-0.1,-0.1,-2),mk('C',0,1.0,0,0,0)],
  'huge':[mk('Bignum',1234567.89,12.5,95,1150,1200000),mk('Loss',-987654.32,0.1,-900,-90,-2000000)],
  'many':Array.from({length:14},(_,i)=>mk('Treatment number '+(i+1),(7-i)*1000,2-i*0.1,50-i*5,100-i*8,(7-i)*500-2000)),
  'long-names':[mk('Application of composted poultry manure at high rate',9000,2.2,55,120,4000),mk('Nil',0,1,0,0,0)]
};
let checks=0,failures=0;
for(const [ds,ranking] of Object.entries(datasets)){
  API.state.ranking=ranking;
  for(const id of API.FIGURE_IDS){
    API.renderBarChart(id, API.chartSeriesForId(id), null);
    const P=parse(elements[id].innerHTML);
    for(const t of P.texts){const b=bbox(t);checks++;
      if(b.x0<-1||b.x1>P.W+1){failures++;console.log(`[${ds}/${id}] OOB "${t.txt}" x0=${b.x0.toFixed(0)} x1=${b.x1.toFixed(0)} W=${P.W}`);}}
    const names=P.texts.filter(t=>t.fs===15), vals=P.texts.filter(t=>t.fs===14);
    for(const v of vals)for(const nm of names){checks++; if(ov(bbox(v),bbox(nm))){failures++;console.log(`[${ds}/${id}] LABEL/NAME overlap "${v.txt}" vs "${nm.txt}"`);}}
    // value labels in adjacent rows shouldn't overlap (different y handled); check caption set
    checks++; if(!elements['cap_'+id]||!elements['cap_'+id].textContent){failures++;console.log(`[${ds}/${id}] caption missing`);}
  }
}
console.log(`\nChart geometry: ${checks} checks, ${failures} failures`);
process.exit(failures?1:0);
