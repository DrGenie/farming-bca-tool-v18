// String/template/regex-aware brace extractor for test harnesses.
function scanFrom(src, openIdx){
  let d=0, i=openIdx; const N=src.length; let prev='';
  const isRegexCtx = (p)=> p==='' || '([{,;=:!&|?+-*%^~<>'.includes(p) || /[\s]/.test(p);
  while(i<N){
    const c=src[i];
    if(c==='/'&&src[i+1]==='/'){ while(i<N&&src[i]!=='\n')i++; continue; }
    if(c==='/'&&src[i+1]==='*'){ i+=2; while(i<N&&!(src[i]==='*'&&src[i+1]==='/'))i++; i+=2; continue; }
    if(c==='/' && isRegexCtx(prev)){ // regex literal
      i++; let inClass=false;
      while(i<N){ const r=src[i]; if(r==='\\'){i+=2;continue;} if(r==='[')inClass=true; else if(r===']')inClass=false; else if(r==='/'&&!inClass){i++;break;} else if(r==='\n')break; i++; }
      while(i<N && /[a-z]/i.test(src[i])) i++; // flags
      prev='/'; continue;
    }
    if(c==="'"||c==='"'){ const q=c; i++; while(i<N){ if(src[i]==='\\'){i+=2;continue;} if(src[i]===q){i++;break;} i++; } prev=q; continue; }
    if(c==='`'){ i++; let dep=0; while(i<N){ if(src[i]==='\\'){i+=2;continue;} if(src[i]==='`'&&dep===0){i++;break;} if(src[i]==='$'&&src[i+1]==='{'){dep++;i+=2;continue;} if(src[i]==='}'&&dep>0){dep--;i++;continue;} i++; } prev='`'; continue; }
    if(c==='{'){ d++; i++; prev='{'; continue; }
    if(c==='}'){ d--; i++; prev='}'; if(d===0) return i; continue; }
    if(!/\s/.test(c)) prev=c;
    i++;
  }
  throw new Error('unbalanced from '+openIdx);
}
function extractFn(src,name){
  const m=src.match(new RegExp('(async\\s+)?function\\s+'+name.replace(/[$]/g,'\\$')+'\\s*\\('));
  if(!m) throw new Error('fn not found '+name);
  // Balance the parameter list (which may contain nested parens/braces, e.g. defaults).
  let i=m.index+m[0].length-1; // at '('
  let pd=0;
  for(; i<src.length; i++){ const c=src[i]; if(c==='(')pd++; else if(c===')'){pd--; if(pd===0){i++;break;}} }
  while(i<src.length && src[i]!=='{') i++; // first body brace
  const end=scanFrom(src,i);
  return src.slice(m.index, end);
}
function extractConst(src,name){
  const m=src.match(new RegExp('const\\s+'+name+'\\s*=\\s*'));
  if(!m) throw new Error('const not found '+name);
  let i=m.index+m[0].length; const openCh=src[i];
  if(openCh==='{'){ return 'const '+name+' = '+src.slice(i, scanFrom(src,i))+';'; }
  if(openCh==='['){ // bracket balance with same scanner style
    let d=0,j=i,N=src.length,prev='';
    while(j<N){const c=src[j];
      if(c==="'"||c==='"'){const q=c;j++;while(j<N){if(src[j]==='\\'){j+=2;continue;}if(src[j]===q){j++;break;}j++;}continue;}
      if(c==='`'){j++;let dep=0;while(j<N){if(src[j]==='\\'){j+=2;continue;}if(src[j]==='`'&&dep===0){j++;break;}if(src[j]==='$'&&src[j+1]==='{'){dep++;j+=2;continue;}if(src[j]==='}'&&dep>0){dep--;j++;continue;}j++;}continue;}
      if(c==='['){d++;j++;continue;} if(c===']'){d--;j++;if(d===0)return 'const '+name+' = '+src.slice(i,j)+';';continue;}
      j++;
    }
  }
  if(openCh==="'"||openCh==='"'||openCh==='`'){
    const q=openCh; let j=i+1;
    if(q==='`'){ let dep=0; while(j<src.length){ if(src[j]==='\\'){j+=2;continue;} if(src[j]==='`'&&dep===0){j++;break;} if(src[j]==='$'&&src[j+1]==='{'){dep++;j+=2;continue;} if(src[j]==='}'&&dep>0){dep--;j++;continue;} j++; } }
    else { while(j<src.length){ if(src[j]==='\\'){j+=2;continue;} if(src[j]===q){j++;break;} j++; } }
    return 'const '+name+' = '+src.slice(i,j)+';';
  }
  const semi=src.indexOf(';',i); return 'const '+name+' = '+src.slice(i,semi)+';';
}
module.exports={extractFn,extractConst};
