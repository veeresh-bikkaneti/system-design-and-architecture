import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalize, type BenIndex, type Intent, type LessonChunk } from '../../../src/ai/local/semantic/codec.ts';
import { route as newRoute } from '../../../src/ai/local/semantic/router.ts';
import { route as oldRoute } from '../../../src/ai/local/semantic/router.old.ts';
function vec(axis: number, tilt: number[] = []): Float32Array {
  const v = new Float32Array(8); v[axis] = 1;
  tilt.forEach((x, i) => { v[i] = (v[i] ?? 0) + x; });
  return normalize(v);
}
function chunk(slug: string, axis: number): LessonChunk {
  return { id: `${slug}#0`, slug, heading: 'h', text: 'During a partition you must choose.', vector: vec(axis, [0.6]) };
}
const slugs = ['tutor-loop','cap-theorem','caching-strategies','domain-driven-design'];
const index: BenIndex = {
  content: 't', dims: 8,
  chunks: [chunk('cap-theorem',5), chunk('caching-strategies',6), chunk('tutor-loop',7), chunk('domain-driven-design',0)],
  examples: ([['course',0],['course',0],['tech',1],['tech',1],['debate',2],['debate',2],['off_topic',3],['off_topic',3],['self',4]] as [Intent,number][]).map(([intent,axis])=>({intent,vector:vec(axis)})),
};
const run = (r: typeof newRoute, q: string, axis: number) => { const d = r({ question: q, vector: vec(axis), index }); return `${d.action}|${(d.pinned??[]).join(',')}`; };
const A = ["how do I set up a tutor business","set up a tutor for math lessons near me","install ben franklin biography","ben setup meme","setup local ai on my gpu","install ben franklin","set up a tutor for my kid","hire a tutor and set up a schedule","setup the tutor for my kid homework","help me set up the tutor in python"];
const B = ["help me setup the tutor","how do I set up the tutor","can you help me set up Ben","help me set up local AI","set up my AI env"];
describe('probe', () => {
  it('report', () => {
    const out: string[] = [];
    for (const q of A) out.push(`A  ${q} => new ${run(newRoute,q,3)} | old ${run(oldRoute,q,3)}`);
    for (const q of B) out.push(`B  ${q} => new ${run(newRoute,q,3)} | old ${run(oldRoute,q,3)}`);
    for (const q of ["how do I get Ben running on my device","set up Ben please","install Ben","can you help me install Ben"]) out.push(`X  ${q} => new ${run(newRoute,q,3)} | old ${run(oldRoute,q,3)}`);
    const phrases: string[] = [];
    for (const f of ['cases','holdout']) phrases.push(...JSON.parse(readFileSync(`evals/ben/${f}.json`,'utf8')).cases.map((c:any)=>c.q));
    let flips = 0, n = 0;
    for (const q of phrases) for (const axis of [0,1,2,3,4,5]) { n++; const a = run(newRoute,q,axis), b = run(oldRoute,q,axis); if (a!==b) { flips++; out.push(`FLIP axis${axis} ${q}: old ${b} -> new ${a}`); } }
    out.push(`SWEEP phrases=${phrases.length} combos=${n} flips=${flips}`);
    console.log(out.join('\n'));
    expect(true).toBe(true);
  });
});
