const f=process.argv[2];const d=require(f);
const rows=d.map(c=>({id:c.id,set:c.set,exp:c.expected,got:c.got,vote:c.vote,conf:c.conf,tech:c.scores.tech,self:c.scores.self,best:c.top[0]?.best,reason:c.reason}));
console.log('== vote=tech, sorted by conf');
rows.filter(r=>r.vote==='tech').sort((a,b)=>a.conf-b.conf).slice(0,14).forEach(r=>console.log(r.set,r.id,r.exp,r.got,r.conf,(r.best||0).toFixed(3),r.reason));
console.log('== vote=self');
rows.filter(r=>r.vote==='self').forEach(r=>console.log(r.set,r.id,r.exp,r.got,r.conf,(r.best||0).toFixed(3),r.reason));
console.log('== exp self');
rows.filter(r=>r.exp==='self').forEach(r=>console.log(r.set,r.id,r.got,r.vote,r.conf,(r.best||0).toFixed(3),r.reason));
