const fs=require('fs');const L=f=>JSON.parse(fs.readFileSync(f+'.json'));
const base=L('main-b32');const bm=new Map(base.diag.map(d=>[d.id,d]));
const S=(ds,set)=>{const o=ds.filter(d=>set==='all'||d.set===set);const off=o.filter(d=>d.expected==='redirect'||d.expected==='self');const crs=o.filter(d=>d.expected==='lesson');
return `acc ${o.filter(d=>d.correct).length}/${o.length} drift ${o.filter(d=>d.drift).length}/${off.length} offered ${o.filter(d=>d.offered).length}/${off.length} refused ${o.filter(d=>d.refused).length}/${crs.length}`};
for(const t of ['main-b32','main-b1','c1-b1','c1-b32','c2-b1','c2-b32','both-b1','both-b32']){const r=L(t);
console.log(`## ${t} top1 ${r.top1}/${r.ranked} top3 ${r.top3}/${r.ranked}`);for(const s of ['cases','holdout','all'])console.log('  ',s,S(r.diag,s));
for(const d of r.diag){const b=bm.get(d.id);if(b.got!==d.got||b.lesson!==d.lesson&&d.got==='lesson')console.log(`   FLIP ${d.set} ${d.id} exp ${d.expected}: ${b.got}->${d.got}${d.correct?' ok':' MISS'}${d.drift?' DRIFT':''} | vote ${d.vote} ${d.conf.toFixed(3)} (base ${b.vote} ${b.conf.toFixed(3)}) best ${(d.best??0).toFixed(4)} (base ${(b.best??0).toFixed(4)}) | ${d.reason}`)}
console.log('   drifts:',r.diag.filter(d=>d.drift).map(d=>`${d.id}(${d.got},${d.vote} ${d.conf.toFixed(3)},best ${(d.best??0).toFixed(4)})`).join('; '))}
