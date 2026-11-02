// Council-3 scratch: replays the m3 red tests against origin/main's router (router_main.ts == origin/main, diff-verified).
const M = process.argv[2] ?? 'router_main';
const { route, THRESHOLDS } = await import(`../m3/src/ai/local/semantic/${M}.ts`);
const { normalize } = await import('../m3/src/ai/local/semantic/codec.ts');
function vec(axis: number, tilt: number[] = []) { const v = new Float32Array(8); v[axis] = 1; tilt.forEach((x, i) => { v[i] = (v[i] ?? 0) + x; }); return normalize(v); }
const chunk = (slug: string, axis: number) => ({ id: `${slug}#0`, slug, heading: 'Why this matters', text: 'During a partition you must choose. Consistency means refusing some requests. Availability means answering with what you have.', vector: vec(axis, [0.6]) });
const ex = [['course',0],['course',0],['tech',1],['tech',1],['debate',2],['debate',2],['off_topic',3],['off_topic',3],['self',4]] as const;
const index = { content: 'test', dims: 8, chunks: [chunk('cap-theorem', 5), chunk('caching-strategies', 6)], examples: ex.map(([intent, a]) => ({ intent, vector: vec(a) })) };
const show = (label: string, d: any) => console.log(label, '| intent', d.intent, (d.intentConfidence ?? 0).toFixed(3), '| best', (d.lessons[0]?.best ?? 0).toFixed(3), d.lessons[0]?.slug, '| action', d.action, d.pinned ?? '');
console.log('router =', M, 'lesson', THRESHOLDS.lesson, 'override', THRESHOLDS.override);
show('Keaton self-axis + lesson 0.45-0.62:', route({ question: 'Who is Michael Keaton', vector: vec(4, [0,0,0,0,0,1]), index }));
show('Keaton pure self axis (main test L109):', route({ question: 'Who is Michael Keaton', vector: vec(4), index }));
show('split tech mutex:', route({ question: 'what is a mutex', vector: vec(1, [0.8,0,0,0.8]), index }));
const comp = { ...index, chunks: [chunk('designing-ai-systems', 5)] };
for (const q of ['can you help me set up Ben', 'how do I set up Ben on my laptop', 'can you help me set up local AI']) show(`self-vote pin "${q}":`, route({ question: q, vector: vec(4, [0,0,0,0,0,0.6]), index: comp }));
