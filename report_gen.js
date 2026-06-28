'use strict';
const fs=require('fs');const src=fs.readFileSync('app.js','utf8');
const {extractFn,extractConst}=require('./_extract');
const xf=(n)=>extractFn(src,n),xc=(n)=>extractConst(src,n);

// ---- DOM shim --------------------------------------------------------------
const store={}; // id -> {value, innerHTML, textContent}
function el(id){ if(!store[id]) store[id]={value:'',innerHTML:'',_t:'',get textContent(){return this._t;},set textContent(v){this._t=v;}}; return store[id]; }
const document={
  getElementById:(id)=>store[id]||null,
  createElement:()=>({getContext:()=>({clearRect(){},fillRect(){},drawImage(){},set fillStyle(v){},set imageSmoothingEnabled(v){},set imageSmoothingQuality(v){}}),toDataURL:()=>'',style:{},set width(v){},set height(v){}}),
  querySelector:(sel)=>({value:'control', textContent:''}),
  querySelectorAll:()=>[]
};
const window={};
const Image=function(){this.onload=null;this.onerror=null;Object.defineProperty(this,'src',{set(){ if(this.onerror) setTimeout(()=>this.onerror(),0);}});};

const consts=['EMBEDDED_WORD_LOGOS','REPORT_LOGO_UON','REPORT_LOGO_SOIL','COST_HEADERS','REQUIRED_HEADERS','NUMERIC_CHECK_HEADERS','HEADER_ALIASES','CONTROL_NAME_TERMS','CONTROL_LABEL_TERMS','CHART_FONT','CHART_COLOR','FIGURES']
  .map(xc).join('\n');
const fns=['escapeHtml','n','fmtMoney','fmtNum','fmtPct','ensureTerminalFullStop','normaliseReportHeading','tidySentence','reportStamp','formatGeneratedAt','normalizeHeader','boolish','isControlRow','findHeaderRow','standardiseRows','group','discountSchedule','describeSchedule','pvFactor','computeMetrics','chartTitle','chartCaption','chartSeriesForId','estTextWidth','wrapName','renderBarChart','renderCharts','currentMode','getProjectInfo','updateProjectSummaryBox','generateLocalSummary','narrativeToHtml','rankingColGroupHtml','sensitivityColGroupHtml','rankingTableHtml','sensitivityTableHtml','buildEditableWordChartHtml','svgToPngDataUrl','buildChartPanelsHtml','buildReportHtml']
  .map(xf).join('\n\n');
const code=[
  consts,
  'const FIGURE_BY_ID=Object.fromEntries(FIGURES.map(f=>[f.id,f]));',
  'const FIGURE_IDS=FIGURES.map(f=>f.id);',
  'const $=(id)=>document.getElementById(id);',
  'const setText=(id,v)=>{const e=$(id);if(e)e.textContent=v;};',
  'const setHtml=(id,v)=>{const e=$(id);if(e)e.innerHTML=v;};',
  fns,
  'module.exports={buildReportHtml,renderCharts,standardiseRows,group,discountSchedule,computeMetrics,pvFactor,state};'
].join('\n\n');
const wrapped='const state={ranking:[],sensitivity:[],grouped:[],cleanedRows:[],lastRun:null,workbookName:"-",sheetName:"-",selectedControl:null,selectedTreatment:null,sideA:null,sideB:null,dataSource:"upload"};\n'+code;
const m={exports:{}};
new Function('module','exports','document','window','Image',wrapped)(m,m.exports,document,window,Image);
const API=m.exports;

// ---- helpers to populate state from a dataset ------------------------------
function buildSched(years,mode,ip,lp,sy){const rates=[];for(let y=1;y<=years;y++){rates.push(mode==='constant'?ip/100:(y<=sy?ip/100:lp/100));}return{years,mode,initial:ip/100,later:lp/100,switchYear:sy,rates};}

function prepare(rows, settings, project, fileName, sheetName, sens){
  const st=API.state;
  st.cleanedRows=API.standardiseRows(rows);
  st.grouped=API.group(st.cleanedRows);
  st.workbookName=fileName; st.sheetName=sheetName;
  const sched=buildSched(settings.years,settings.mode,settings.initial,settings.later,settings.switchYear);
  const price=settings.price;
  const calc=st.grouped.map(g=>({...g,metrics:API.computeMetrics(g.avgYield,g.avgCost,sched,price)}));
  const control=calc.find(g=>g.isControl);
  st.selectedControl=control?control.treatmentName:null;
  st.ranking=calc.filter(g=>g.metrics).map(g=>({...g,deltaVsControl:control&&control.metrics?g.metrics.npv-control.metrics.npv:null})).sort((a,b)=>b.metrics.npv-a.metrics.npv).map((g,i)=>({...g,rank:i+1}));
  // selected treatment = top non-control
  const sel=st.ranking.find(r=>!r.isControl)||st.ranking[0];
  st.selectedTreatment=sel.treatmentName;
  st.sideA=st.ranking[0].treatmentName; st.sideB=(st.ranking[1]||st.ranking[0]).treatmentName;
  st.lastRun={sched,price};
  // sensitivity for selected treatment
  st.sensitivity=sens.map(s=>{
    const ssched=buildSched(settings.years,'constant',s.rate,s.rate,settings.years);
    return {...s, metrics:API.computeMetrics(sel.avgYield,sel.avgCost,ssched,s.price,s.benefit,s.cost)};
  });
  // populate DOM inputs
  el('grainPrice').value=String(price);
  el('analysisYears').value=String(settings.years);
  el('discountMode').value=settings.mode;
  el('discountInitial').value=String(settings.initial);
  el('discountLater').value=String(settings.later);
  el('discountSwitchYear').value=String(settings.switchYear);
  el('projectName').value=project.projectName||'';
  el('collaborators').value=project.collaborators||'';
  el('fundingAgency').value=project.fundingAgency||'';
  el('projectSummary').value=project.projectSummary||'';
  el('projectMethodology').value=project.methodology||'';
  el('reportNarrative').value='';
  el('includeReportLogos').value='yes';
  el('reportProjectSummary');
  // headline (selected vs control)
  const ctrl=control; const delta=sel.metrics.npv-(ctrl?ctrl.metrics.npv:0);
  el('headlineSummary').textContent=`${sel.treatmentName} is being compared with ${ctrl?ctrl.treatmentName:'the control'}. Under the current assumptions, the estimated net present value is ${money(sel.metrics.npv)} per hectare and the difference relative to the control is ${money(delta)} per hectare.`;
  // chart containers
  API.FIGURE_IDS=API.FIGURE_IDS; ['chartBcr','chartNpv','chartDelta','chartGpm','chartRoi','cap_chartBcr','cap_chartNpv','cap_chartDelta','cap_chartGpm','cap_chartRoi'].forEach(id=>el(id));
  API.renderCharts();
}
function money(v){return v==null||isNaN(v)?'-':new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:2}).format(v);}

(async()=>{
  const sample=JSON.parse(fs.readFileSync('_sample.json','utf8'));
  const test2=JSON.parse(fs.readFileSync('_test2.json','utf8'));
  const sens=[{name:'Conservative',rate:3,price:500,benefit:0,cost:0},{name:'Alternative',rate:5,price:550,benefit:10,cost:10},{name:'Optimistic',rate:7,price:450,benefit:-10,cost:15}];

  // Report 1: original trial data
  prepare(sample.rows,{years:10,mode:'constant',initial:5,later:3,switchYear:5,price:500},
    {projectName:'Soil amendment field trial (sample dataset)',collaborators:'Soil CRC project team',fundingAgency:'Cooperative Research Centre for High Performance Soils',
     projectSummary:'A replicated field trial evaluating the benefit and cost of a range of soil amendments and management practices relative to an unchanged control practice.',
     methodology:'Each treatment was applied across replicate plots. Yields and direct cost components were recorded per hectare and analysed using discounted benefit-cost analysis over a ten-year horizon.'},
    'BCA_Trial_data.xlsx', sample.sheet, sens);
  const html1=await API.buildReportHtml({rasteriseCharts:false,chartColumns:2});
  fs.writeFileSync('sample_report_trial.html',html1);
  console.log('Wrote sample_report_trial.html ('+html1.length+' bytes); control='+API.state.selectedControl+'; top='+API.state.ranking[0].treatmentName);

  // Report 2: alternative dataset (different treatments, different control name)
  prepare(test2.rows,{years:8,mode:'declining',initial:7,later:4,switchYear:3,price:420},
    {projectName:'Biostimulant and remineralisation trial (alternative dataset)',collaborators:'Regional grower group',fundingAgency:'Regional research fund',
     projectSummary:'An alternative trial comparing a seaweed-extract biostimulant and a rock-dust remineralisation treatment against a baseline practice.',
     methodology:'Two replicates per treatment were assessed. Direct cost components and yields were recorded per hectare and analysed with declining-rate discounting over an eight-year horizon.'},
    'BCA_test_data_2.xlsx', test2.sheet, sens);
  const html2=await API.buildReportHtml({rasteriseCharts:false,chartColumns:2});
  fs.writeFileSync('sample_report_alternative.html',html2);
  console.log('Wrote sample_report_alternative.html ('+html2.length+' bytes); control='+API.state.selectedControl+'; top='+API.state.ranking[0].treatmentName);
})().catch(e=>{console.error('GEN ERROR',e);process.exit(1);});
